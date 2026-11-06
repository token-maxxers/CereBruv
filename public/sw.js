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

const CACHE_NAME = 'cerebruv-cache-v4';
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

// Background Scheduled Alarm timers inside Service Worker (fires OS Notification even when tab is minimized/backgrounded)
const swAlarmTimers = new Map();

self.addEventListener('message', (event) => {
  if (!event.data || event.data.type !== 'SYNC_TASK_ALARMS') return;
  const alarms = Array.isArray(event.data.alarms) ? event.data.alarms : [];

  // Clear previously scheduled SW timers
  swAlarmTimers.forEach((timerId) => clearTimeout(timerId));
  swAlarmTimers.clear();

  const now = Date.now();
  alarms.forEach((alarm) => {
    const delay = alarm.triggerAt - now;
    if (delay > 0 && delay <= 24 * 60 * 60 * 1000) {
      const timerId = setTimeout(() => {
        swAlarmTimers.delete(alarm.id);
        const options = {
          body: alarm.body,
          icon: '/mascot.png',
          badge: '/mascot.png',
          tag: alarm.id,
          renotify: true,
          requireInteraction: alarm.requireInteraction !== false,
          vibrate: alarm.vibrate ? [220, 100, 220, 100, 350] : undefined,
          data: { taskId: alarm.taskId, stage: alarm.stage },
        };
        if (typeof Notification !== 'undefined' && 'showTrigger' in Notification.prototype && window?.TimestampTrigger) {
          // Experimental TimestampTrigger support if enabled in browser
        }
        self.registration.showNotification(alarm.title, options);
      }, delay);
      swAlarmTimers.set(alarm.id, timerId);
    }
  });
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
