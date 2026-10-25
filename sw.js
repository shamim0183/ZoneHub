const CACHE_NAME = 'media-hub-shell-v12';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/js/media.js',
  '/js/chat.js',
  '/favicon.svg',
  '/favicon.ico',
  '/favicon.png',
  '/manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(e => console.warn('PWA caching note:', e));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Dynamic API, file uploads, and heavy media streams MUST bypass cache directly to network
  if (url.pathname.startsWith('/api/') || 
      url.pathname === '/upload' || 
      url.pathname.startsWith('/Videos/') ||
      url.pathname.startsWith('/Pictures/') ||
      url.pathname.startsWith('/Chat_Media/') ||
      url.pathname.startsWith('/Documents/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // App shell assets (CSS, JS, favicons, HTML) use Network-First with Cache Fallback for instant responsiveness
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
