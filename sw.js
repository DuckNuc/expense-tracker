// Caches the app shell so it opens offline. Bump VERSION (and ?v= in index.html) after changing files.
const VERSION = 'v5';
const FILES = ['./', 'index.html', 'app.js', 'manifest.webmanifest', 'icon.svg'];

self.addEventListener('install', e => {
  // cache: 'reload' skips the browser's HTTP cache, so a new page never gets paired with an old script
  e.waitUntil(caches.open(VERSION)
    .then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first (revalidating with the server), fall back to cache when offline
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const sameOrigin = new URL(e.request.url).origin === location.origin;
  e.respondWith(
    fetch(sameOrigin ? new Request(e.request.url, { cache: 'no-cache' }) : e.request)
      .then(res => {
        if (res.ok && sameOrigin) {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
