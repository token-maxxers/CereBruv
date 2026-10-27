/**
 * CereBruv Service Worker (PWA Offline Cache & FCM Push Receiver)
 */

// Import official Firebase Messaging service worker scripts
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyBQ_YTHADnFFxRe3D1_zNuFLczHExW4zB4",
  authDomain: "cere-bruv.firebaseapp.com",
  projectId: "cere-bruv",
  storageBucket: "cere-bruv.firebasestorage.app",
  messagingSenderId: "106248948674",
  appId: "1:106248948674:web:84468c63706ca95a68e45b"
};

try {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  // Background message handler for FCM
  messaging.onBackgroundMessage((payload) => {
    const notificationTitle = payload.notification?.title || payload.data?.title || 'CereBruv Task Alert';
    const notificationOptions = {
      body: payload.notification?.body || payload.data?.body || 'Focus Orbit update from CereBruv.',
      icon: '/mascot.png',
      badge: '/mascot.png',
      data: payload.data || {}
    };

    return self.registration.showNotification(notificationTitle, notificationOptions);
  });
} catch (err) {
  console.warn('Firebase Messaging SW init skipped or failed:', err);
}

const CACHE_NAME = 'cerebruv-cache-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
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

// Fallback generic push listener in case of raw web-push
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
    icon: '/mascot.png',
    badge: '/mascot.png',
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
