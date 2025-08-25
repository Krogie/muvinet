(function(){
  const SOURCE_BASE_ORIGIN = 'https://flixtake.de';
  const SOURCE_BASE_PATH = '/muvi';
  const iframe = document.getElementById('appframe');
  const statusEl = document.getElementById('status');

  function sanitizeTail(p){
    try {
      const u = new URL(p, 'https://dummy');
      p = u.pathname;
    } catch(e) {}
    p = p.replace(/\/+/g,'/');
    return p;
  }

  function buildWixPath(){
    let tail = sanitizeTail(window.location.pathname);
    if (tail === '/') tail = '';
    return SOURCE_BASE_PATH + tail;
  }

  async function fetchToken(path){
    const res = await fetch('/gate/token?path=' + encodeURIComponent(path), { cache: 'no-store' });
    if (!res.ok) throw new Error('token fetch failed');
    const data = await res.json();
    if (!data.token) throw new Error('missing token');
    return data.token;
  }

  async function loadFrameFromLocation(){
    const path = buildWixPath();
    try {
      const token = await fetchToken(path);
      const url = new URL(SOURCE_BASE_ORIGIN + path);
      if (window.location.search) url.search = window.location.search.substring(1);
      url.searchParams.set('token', token);
      if (window.location.hash) url.hash = window.location.hash;
      iframe.src = url.toString();
      statusEl.textContent = 'Verbunden';
    } catch(err) {
      console.error(err);
      statusEl.textContent = 'Token Fehler – versuche erneut';
      setTimeout(loadFrameFromLocation, 3000);
    }
  }

  window.addEventListener('popstate', () => {
    const wixPath = buildWixPath();
    const url = SOURCE_BASE_ORIGIN + wixPath + window.location.search + window.location.hash;
    if (iframe.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'PARENT_NAVIGATE', url }, SOURCE_BASE_ORIGIN);
    }
    loadFrameFromLocation();
  });

  window.addEventListener('message', (event) => {
    if (event.origin !== SOURCE_BASE_ORIGIN) return;
    const data = event.data || {};
    if (data.type === 'ROUTE_CHANGE') {
      const path = (data.path || '');
      if (!path.toLowerCase().startsWith(SOURCE_BASE_PATH)) {
        statusEl.textContent = 'Blockiert';
        return;
      }
      const tail = path.slice(SOURCE_BASE_PATH.length) || '/';
      const newUrl = tail + (data.search || '') + (data.hash || '');
      const current = window.location.pathname + window.location.search + window.location.hash;
      if (newUrl !== current) {
        history.pushState({}, '', newUrl);
      }
      statusEl.textContent = 'Navigiert';
    }
  });

  iframe.addEventListener('load', () => {
    try {
      iframe.contentWindow.postMessage({ type: 'PARENT_READY' }, SOURCE_BASE_ORIGIN);
    } catch(e) {}
  });

  document.addEventListener('DOMContentLoaded', loadFrameFromLocation);
})();
