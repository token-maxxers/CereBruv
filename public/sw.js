/**
 * CereBruv Service Worker (PWA & FCM Push Receiver)
 */

const CACHE_NAME = 'cerebruv-cache-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/mascot.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Network first, fallback to cache
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// Background Push Notifications (Ready for Firebase Cloud Messaging)
self.addEventListener('push', (event) => {
  let title = 'CereBruv Reminder';
  let body = 'You have an upcoming task on your Focus Orbit!';
  let data = {};

  if (event.data) {
    try {
      const payload = event.data.json();
      title = payload.notification?.title || payload.title || title;
      body = payload.notification?.body || payload.body || body;
      data = payload.data || {};
    } catch {
      body = event.data.text();
    }
  }

  const options = {
    body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [100, 50, 100],
    data,
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Handle notification tap
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('/') && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    })
  );
});
