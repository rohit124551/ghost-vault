const CACHE_NAME = 'ghostvault-v1'

// Assets to cache on install (app shell)
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/offline.html'
]

// Install — cache app shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  )
})

// Activate — clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  )
})

// Fetch strategy:
// - API calls (/api/*) → Network only
// - Socket.IO requests → Network only
// - Navigation (HTML pages) → Network first, fallback to offline.html
// - Static assets → Cache first, fallback to network
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. API & Socket - Network Only
  if (url.pathname.startsWith('/api/') || url.pathname.includes('socket.io')) {
    event.respondWith(fetch(request));
    return;
  }

  // 2. Navigation - Network First, then Offline Page
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => {
        return caches.match('/offline.html') || caches.match('/index.html');
      })
    );
    return;
  }

  // 3. Static Assets - Cache First, then Network
  event.respondWith(
    caches.match(request).then(response => {
      return response || fetch(request).then(networkResponse => {
        // Cache new static assets on the fly
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return networkResponse;
      }).catch(() => {
        // Fallback for failed asset fetches (e.g. images)
        if (request.destination === 'image') {
          return caches.match('/icons/icon-192x192.png');
        }
      });
    })
  );
});
