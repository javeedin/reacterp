// ReactERP Service Worker - v3 (self-clearing for dev mode)
const CACHE_NAME = 'reacterp-cache-v3';

// Immediately clear ALL caches and unregister on install
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          console.log('[SW] Clearing cache:', name);
          return caches.delete(name);
        })
      );
    })
  );
  self.skipWaiting();
});

// On activate, unregister self and reload all clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    self.registration.unregister().then(() => {
      return self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          console.log('[SW] Reloading client to clear stale cache');
          client.navigate(client.url);
        });
      });
    })
  );
});

// No fetch interception - let everything go to network
