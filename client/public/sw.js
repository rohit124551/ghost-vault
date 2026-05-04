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
  
  // 0. Share Target Interception (POST /share-target)
  if (request.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith(
      (async () => {
        const formData = await request.formData();
        const mediaFiles = formData.getAll('media');
        const title = formData.get('title') || '';
        const text = formData.get('text') || '';
        const shareUrl = formData.get('url') || '';

        // Store files in IndexedDB (Blobs/Files are reliably persisted here)
        const db = await new Promise((resolve, reject) => {
          const req = indexedDB.open('shared_data_db', 1);
          req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains('shared_files')) {
              db.createObjectStore('shared_files');
            }
          };
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });

        const tx = db.transaction('shared_files', 'readwrite');
        const store = tx.objectStore('shared_files');
        await store.put({
          title,
          text,
          url: shareUrl,
          files: mediaFiles,
          timestamp: Date.now()
        }, 'latest');

        return Response.redirect('/share-target?shared=1', 303);
      })()
    );
    return;
  }

  // Intercept the app's internal request to get the shared data
  if (url.pathname === '/api/get-shared-data') {
    event.respondWith(
      (async () => {
        try {
          const db = await new Promise((resolve, reject) => {
            const req = indexedDB.open('shared_data_db', 1);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
          });
          const tx = db.transaction('shared_files', 'readonly');
          const store = tx.objectStore('shared_files');
          const data = await new Promise((resolve) => {
            const getReq = store.get('latest');
            getReq.onsuccess = () => resolve(getReq.result);
            getReq.onerror = () => resolve(null);
          });
          
          // Note: We can't JSON.stringify Files directly, but we can return them as a response if we wanted.
          // However, it's better for the page to read directly from IDB.
          // We return a simple 'ok' or the non-file metadata.
          return new Response(JSON.stringify({ hasData: !!data, metadata: data ? { title: data.title, text: data.text, url: data.url } : null }), {
            headers: { 'Content-Type': 'application/json' }
          });
        } catch (e) {
          return new Response(JSON.stringify({ error: e.message }), { status: 500 });
        }
      })()
    );
    return;
  }

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
