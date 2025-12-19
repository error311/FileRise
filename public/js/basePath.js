// public/js/basePath.js
// Lightweight "base path" helper so FileRise can run under a subpath (e.g. /fr)
// behind a reverse proxy that strips the prefix, without impacting root installs.

function normalizeBasePath(base) {
    const b = String(base || '').trim();
    if (!b || b === '/') return '';
    const withSlash = b.startsWith('/') ? b : '/' + b;
    return withSlash.replace(/\/+$/, '');
  }
  
  // Best-effort auto-detect from the *current URL* (works for /fr/, /fr/index.html, etc.).
  export function getBasePath() {
    try {
      let p = String(window.location.pathname || '');
  
      // Pretty portal URL: /portal/<slug> (or /fr/portal/<slug>)
      p = p.replace(/\/portal\/[^/]+\/?$/i, '');
  
      // Common "file" entrypoints
      p = p.replace(/\/index\.html$/i, '');
      p = p.replace(/\/portal-login\.html$/i, '');
      p = p.replace(/\/portal\.html$/i, '');
      p = p.replace(/\/api\.php$/i, '');
  
      // Directory root -> base without trailing slash
      p = p.replace(/\/+$/, '');
  
      return normalizeBasePath(p);
    } catch (e) {
      return '';
    }
  }
  
  export function withBase(urlOrPath) {
    const base = getBasePath();
    const s = String(urlOrPath || '');
    if (!base) return s;
    if (!s.startsWith('/')) return s;
    if (s === base || s.startsWith(base + '/')) return s;
    return base + s;
  }
  
  export function stripBase(pathname) {
    const base = getBasePath();
    const p = String(pathname || '');
    if (!base) return p;
    if (p === base) return '/';
    if (p.startsWith(base + '/')) return p.slice(base.length) || '/';
    return p;
  }
  
  export function patchFetchForBasePath() {
    if (window.__FR_FETCH_BASEPATCH__) return;
    window.__FR_FETCH_BASEPATCH__ = true;
  
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      try {
        const base = getBasePath();
        if (base) {
          if (typeof input === 'string') {
            if (input.startsWith('/api/') && !input.startsWith(base + '/api/')) {
              return nativeFetch(base + input, init);
            }
          } else if (input && typeof input.url === 'string') {
            const u = new URL(input.url, window.location.origin);
            if (u.origin === window.location.origin && u.pathname.startsWith('/api/') && !u.pathname.startsWith(base + '/api/')) {
              const rewritten = new URL(base + u.pathname + u.search + u.hash, window.location.origin);
              const req = new Request(rewritten.toString(), input);
              return nativeFetch(req, init);
            }
          }
        }
      } catch (e) {
        // fall through
      }
      return nativeFetch(input, init);
    };
  }
  
  