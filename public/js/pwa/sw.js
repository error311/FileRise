// FileRise Service Worker (scoped to the directory that served /sw.js).
// IMPORTANT: This file runs in the Service Worker global scope (no `window`/`document`).
// Base-path/subpath installs (e.g. /fr) are supported by deriving paths from registration scope.

const SW_VERSION = '{{APP_QVER}}';
const STATIC_CACHE = `fr-static-${SW_VERSION}`;

const SCOPE_PATH = (() => {
  try {
    const p = new URL(self.registration.scope).pathname || '/';
    return p.replace(/\/+$/, '');
  } catch (e) {
    return '';
  }
})();

function withScope(p) {
  const s = String(p || '');
  if (!s.startsWith('/')) return s;
  if (!SCOPE_PATH) return s;
  if (s === SCOPE_PATH || s.startsWith(SCOPE_PATH + '/')) return s;
  return SCOPE_PATH + s;
}

const STATIC_ASSETS = [
  withScope('/'),
  withScope('/index.html'),
  withScope('/css/styles.css?v={{APP_QVER}}'),
  withScope('/js/main.js?v={{APP_QVER}}'),
  withScope('/assets/logo.svg?v={{APP_QVER}}'),
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(STATIC_CACHE);
      await cache.addAll(STATIC_ASSETS);
    } catch (e) {
      // Best effort: SW should still install even if pre-cache fails.
    }
    try { await self.skipWaiting(); } catch (e) {}
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => {
        if (k.startsWith('fr-static-') && k !== STATIC_CACHE) {
          return caches.delete(k);
        }
        return Promise.resolve(false);
      }));
    } catch (e) {}
    try { await self.clients.claim(); } catch (e) {}
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (!req || req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigation requests: network-first, cache fallback (works for offline).
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        return fresh;
      } catch (e) {
        return (await caches.match(withScope('/index.html'))) ||
          (await caches.match(withScope('/'))) ||
          new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }
    })());
    return;
  }

  // Static assets: cache-first, network fallback.
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const fresh = await fetch(req);
      return fresh;
    } catch (e) {
      return cached || new Response('', { status: 504 });
    }
  })());
});
