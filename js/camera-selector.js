(() => {
  const tabs = [...document.querySelectorAll('.camera-tab')];
  const frame = document.getElementById('live-camera-frame');
  const offline = document.getElementById('camera-offline');
  const offlineName = document.getElementById('camera-offline-name');
  const title = document.getElementById('camera-title');
  if (!tabs.length || !frame || !offline || !title) return;

  function selectCamera(button) {
    const name = button.dataset.cameraName || button.textContent.trim();
    const videoId = (button.dataset.videoId || '').trim();
    const channelId = (button.dataset.channelId || '').trim();

    tabs.forEach(tab => {
      const selected = tab === button;
      tab.classList.toggle('active', selected);
      tab.setAttribute('aria-selected', selected ? 'true' : 'false');
    });

    title.textContent = name;
    frame.title = `${name} Live Camera`;

    if (channelId || videoId) {
      const base = "https:" + "//" + "www.youtube.com";
      const wanted = channelId
        ? base + "/embed/live_stream?channel=" + encodeURIComponent(channelId) + "&autoplay=1&mute=1"
        : base + "/embed/" + videoId + "?autoplay=1&mute=1";
      if (frame.src !== wanted) frame.src = wanted;
      frame.hidden = false;
      offline.hidden = true;
    } else {
      frame.src = 'about:blank';
      frame.hidden = true;
      offlineName.textContent = name;
      offline.hidden = false;
    }
  }

  tabs.forEach(tab => tab.addEventListener('click', () => selectCamera(tab)));
})();
