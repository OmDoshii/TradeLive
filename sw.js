const CACHE = 'tradelive-v2';

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll([
      '/',
      '/index.html',
      '/style.css',
      '/app.js',
      '/manifest.json',
      '/icon.svg',
      '/icons/icon-192.png',
      '/icons/icon-512.png',
    ]))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Skip external requests — let browser handle fonts/CDN normally.
  if (url.origin !== self.location.origin) return;

  // News API: network-first so data is always fresh; fall back to cache when offline.
  // Use the URL string (not e.request) so hard-refresh Cache-Control: no-cache headers
  // are not forwarded — that would bypass the CDN cache and force a raw ForexFactory
  // fetch every time, which times out and returns an empty calendar.
  if (url.pathname === '/api/news') {
    const apiUrl = e.request.url;
    e.respondWith(
      fetch(apiUrl)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(apiUrl, clone));
          }
          return res;
        })
        .catch(() => caches.match(apiUrl))
    );
    return;
  }

  // Everything else: cache-first (app shell, icons)
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
