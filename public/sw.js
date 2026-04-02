// ReactERP Service Worker - v4 (force clear all caches and unregister)
// This version exists only to replace any previously cached SW and clear everything

self.addEventListener('install', (event) => {
  console.log('[SW v4] Installing - clearing all caches');
  event.waitUntil(
    caches.keys().then((names) => Promise.all(names.map((n) => caches.delete(n))))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW v4] Activating - unregistering self');
  event.waitUntil(
    caches.keys().then((names) => Promise.all(names.map((n) => caches.delete(n))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll())
      .then((clients) => {
        clients.forEach((client) => client.navigate(client.url));
      })
  );
});

// No fetch interception - everything goes to network
