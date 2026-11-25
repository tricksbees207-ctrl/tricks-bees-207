(() => {
  'use strict';
  const tabs = [...document.querySelectorAll('.camera-tab')];
  let frame = document.getElementById('live-camera-frame');
  const offline = document.getElementById('camera-offline');
  const offlineName = document.getElementById('camera-offline-name');
  const title = document.getElementById('camera-title');
  if (!tabs.length || !frame || !offline || !title) return;

  // Automatic recovery is intentionally silent; no extra visitor controls.
  const retryDelays = [30000, 60000, 120000];
  const embedBase = 'https://www.youtube-nocookie.com';
  let selected = tabs.find(tab => tab.classList.contains('active')) || tabs[0];
  let generation = 0, player = null, attempts = 0;
  let retryTimer = null, bufferTimer = null, stableTimer = null;
  function clearTimers() {
    clearTimeout(retryTimer); clearTimeout(bufferTimer);
    clearTimeout(stableTimer);
    retryTimer = bufferTimer = stableTimer = null;
  }
  function cameraName() { return selected.dataset.cameraName || selected.textContent.trim(); }
  function videoId() { return (selected.dataset.videoId || '').trim(); }
  function channelId() { return (selected.dataset.channelId || '').trim(); }
  function embedUrl() {
    const path = channelId()
      ? '/embed/live_stream?channel=' + encodeURIComponent(channelId()) + '&'
      : '/embed/' + encodeURIComponent(videoId()) + '?';
    return embedBase + path + 'autoplay=1&mute=1&enablejsapi=1&origin=' + encodeURIComponent(location.origin);
  }
  function queueRetry() {
    clearTimeout(bufferTimer); clearTimeout(stableTimer);
    if (retryTimer !== null) return;
    if (attempts >= retryDelays.length) return;
    const delay = retryDelays[attempts];
    const current = generation;
    function run() {
      if (current !== generation) return;
      if (document.hidden || navigator.onLine === false) {
        retryTimer = setTimeout(run, 10000);
        return;
      }
      retryTimer = null;
      attempts++;
      startCamera(false);
    }
    retryTimer = setTimeout(run, delay);
  }

  function attachPlayer() {
    if (player || !window.YT || typeof window.YT.Player !== 'function' || frame.hidden) return;
    const current = generation;
    const active = () => current === generation;
    try {
      player = new window.YT.Player(frame, {events: {
        onReady(event) {
          if (!active()) return;
          try { event.target.mute(); } catch (_) {}
        },
        onStateChange(event) {
          if (!active()) return;
          clearTimeout(bufferTimer); bufferTimer = null;
          if (event.data === 1) {
            clearTimeout(retryTimer); retryTimer = null;
            clearTimeout(stableTimer);
            stableTimer = setTimeout(() => { if (active()) attempts = 0; }, 60000);
          } else if (event.data === 2 || event.data === 5) {
            clearTimers();
          } else if (event.data === 3) {
            clearTimeout(stableTimer);
            function checkBuffer() {
              if (!active()) return;
              if (document.hidden) { bufferTimer = setTimeout(checkBuffer, 15000); return; }
              try { if (event.target.getPlayerState() === 3) queueRetry(); } catch (_) {}
            }
            bufferTimer = setTimeout(checkBuffer, 45000);
          } else if (event.data === 0) {
            queueRetry();
          }
        },
        onError(event) {
          if (!active()) return;
          if ([2, 101, 150, 153].includes(event.data)) {
            clearTimers();
          } else {
            queueRetry();
          }
        },
        onAutoplayBlocked() {
          if (!active()) return;
          clearTimers();
        }
      }});
    } catch (_) { /* Leave the embedded player usable if the API is unavailable. */ }
  }

  function startCamera(reuseInitial) {
    generation++;
    clearTimers();
    const name = cameraName();
    title.textContent = name;
    const hasFeed = !!(videoId() || channelId());
    const wanted = hasFeed ? embedUrl() : 'about:blank';
    if (!reuseInitial || frame.src !== wanted) {
      // Recreate the iframe on a switch/retry so stale player events cannot
      // overwrite a newly selected camera's state.
      const next = frame.cloneNode(false);
      next.title = name + ' Live Camera';
      next.src = wanted;
      const parent = frame.parentNode;
      const oldFrame = frame;
      const oldPlayer = player;
      player = null;
      if (oldPlayer) { try { oldPlayer.destroy(); } catch (_) {} }
      if (oldFrame.parentNode) oldFrame.replaceWith(next);
      else parent.insertBefore(next, offline);
      frame = next;
    }
    frame.hidden = !hasFeed;
    offline.hidden = hasFeed;
    if (!hasFeed) {
      if (offlineName) offlineName.textContent = name;
      return;
    }
    attachPlayer();
  }

  tabs.forEach(tab => tab.addEventListener('click', () => {
    if (tab === selected) return;
    selected = tab;
    tabs.forEach(item => {
      item.classList.toggle('active', item === tab);
      item.setAttribute('aria-selected', String(item === tab));
    });
    attempts = 0;
    startCamera(false);
  }));
  startCamera(true);

  if (!window.YT || typeof window.YT.Player !== 'function') {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof previous === 'function') { try { previous(); } catch (_) {} }
      attachPlayer();
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    document.head.appendChild(script);
  }
})();
