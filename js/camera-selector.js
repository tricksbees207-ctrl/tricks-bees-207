(() => {
  'use strict';
  const tabs = [...document.querySelectorAll('.camera-tab')];
  let frame = document.getElementById('live-camera-frame');
  const offline = document.getElementById('camera-offline');
  const offlineName = document.getElementById('camera-offline-name');
  const title = document.getElementById('camera-title');
  const note = document.querySelector('.camera-note');
  if (!tabs.length || !frame || !offline || !title || !note) return;

  // Keep the embedded player usable even when the optional API is blocked.
  const status = document.createElement('p');
  status.className = 'camera-note';
  status.setAttribute('role', 'status');
  status.style.color = '#e3eae4';
  const actions = document.createElement('p');
  actions.className = 'camera-note';
  const direct = document.createElement('a');
  direct.textContent = 'Watch on YouTube';
  direct.target = '_blank';
  direct.rel = 'noopener noreferrer';
  direct.style.color = '#ffdb70';
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = 'Reconnect camera';
  retry.style.marginRight = '12px';
  actions.append(retry, direct);
  note.after(status, actions);

  const retryDelays = [30000, 60000, 120000];
  const embedBase = 'https://www.youtube-nocookie.com';
  let selected = tabs.find(tab => tab.classList.contains('active')) || tabs[0];
  let generation = 0, player = null, attempts = 0;
  let retryTimer = null, bufferTimer = null, stableTimer = null, readyTimer = null;
  let apiFailed = false;

  function say(message) { if (status.textContent !== message) status.textContent = message; }
  function clearTimers() {
    clearTimeout(retryTimer); clearTimeout(bufferTimer);
    clearTimeout(stableTimer); clearTimeout(readyTimer);
    retryTimer = bufferTimer = stableTimer = readyTimer = null;
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
  function queueRetry(message) {
    clearTimeout(bufferTimer); clearTimeout(stableTimer); clearTimeout(readyTimer);
    if (retryTimer !== null) return;
    if (attempts >= retryDelays.length) {
      say(message + ' Automatic retries finished. Reconnect manually or watch on YouTube.');
      return;
    }
    const delay = retryDelays[attempts];
    const current = generation;
    say(message + ' Retrying in ' + (delay / 1000) + ' seconds while this page is visible.');
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
          clearTimeout(readyTimer);
          say(cameraName() + ': player ready. Waiting for playback.');
          try { event.target.mute(); } catch (_) {}
        },
        onStateChange(event) {
          if (!active()) return;
          clearTimeout(readyTimer);
          clearTimeout(bufferTimer); bufferTimer = null;
          if (event.data === 1) {
            clearTimeout(retryTimer); retryTimer = null;
            say(cameraName() + ': playing.');
            clearTimeout(stableTimer);
            stableTimer = setTimeout(() => { if (active()) attempts = 0; }, 60000);
          } else if (event.data === 2 || event.data === 5) {
            clearTimers();
            say(cameraName() + ': press Play to watch.');
          } else if (event.data === 3) {
            clearTimeout(stableTimer);
            say(cameraName() + ': buffering.');
            function checkBuffer() {
              if (!active()) return;
              if (document.hidden) { bufferTimer = setTimeout(checkBuffer, 15000); return; }
              try { if (event.target.getPlayerState() === 3) queueRetry(cameraName() + ': playback is taking longer than expected.'); } catch (_) {}
            }
            bufferTimer = setTimeout(checkBuffer, 45000);
          } else if (event.data === 0) {
            queueRetry(cameraName() + ': playback ended.');
          }
        },
        onError(event) {
          if (!active()) return;
          if ([2, 101, 150, 153].includes(event.data)) {
            clearTimers();
            say(cameraName() + ': YouTube cannot play this embed. Try the direct YouTube link.');
          } else {
            queueRetry(cameraName() + ': YouTube playback unavailable.');
          }
        },
        onAutoplayBlocked() {
          if (!active()) return;
          clearTimers();
          say(cameraName() + ': autoplay blocked. Press Play to watch.');
        }
      }});
      readyTimer = setTimeout(() => {
        if (active()) say(cameraName() + ': status could not be confirmed. You can still use the player or reconnect.');
      }, 20000);
    } catch (_) {
      say(cameraName() + ': status monitoring unavailable. Use the player or reconnect.');
    }
  }

  function startCamera(reuseInitial) {
    generation++;
    clearTimers();
    const name = cameraName();
    title.textContent = name;
    const hasFeed = !!(videoId() || channelId());
    direct.hidden = !hasFeed;
    retry.hidden = !hasFeed;
    if (hasFeed) {
      direct.href = videoId()
        ? 'https://www.youtube.com/watch?v=' + encodeURIComponent(videoId())
        : 'https://www.youtube.com/channel/' + encodeURIComponent(channelId()) + '/live';
    }
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
      say(name + ': no feed configured.');
      return;
    }
    say(name + (apiFailed ? ': use the player or reconnect.' : ': connecting…'));
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
  retry.addEventListener('click', () => { attempts = 0; startCamera(false); });
  startCamera(true);

  if (!window.YT || typeof window.YT.Player !== 'function') {
    const previous = window.onYouTubeIframeAPIReady;
    const apiTimeout = setTimeout(() => {
      if (!player) {
        apiFailed = true;
        say(cameraName() + ': status monitoring unavailable. Use the player or reconnect.');
      }
    }, 20000);
    window.onYouTubeIframeAPIReady = () => {
      clearTimeout(apiTimeout);
      if (typeof previous === 'function') { try { previous(); } catch (_) {} }
      apiFailed = false;
      attachPlayer();
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => {
      clearTimeout(apiTimeout);
      apiFailed = true;
      say(cameraName() + ': status monitoring unavailable. Use the player or reconnect.');
    };
    document.head.appendChild(script);
  }
})();
