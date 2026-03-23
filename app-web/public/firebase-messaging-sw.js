/**
 * Firebase Messaging Service Worker — FIX 56B
 *
 * Handles background push notifications via Firebase Cloud Messaging.
 * This file MUST live at the public root so the browser can register it
 * at the top-level scope (navigator.serviceWorker.register('/firebase-messaging-sw.js')).
 *
 * NOTE: Uses firebase-compat SDK because service workers cannot use ES modules.
 *
 * CONFIG: Values must match the Firebase project configuration.
 * Update these if the project changes. Values sourced from firebase-config.ts / .env.
 */

/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyANQ6LpHgcbynuL8lKlK8GJduuxiri1V0s',
  authDomain: 'avalostaging.firebaseapp.com',
  projectId: 'avalostaging',
  storageBucket: 'avalostaging.firebasestorage.app',
  messagingSenderId: '1097334032970',
  appId: '1:1097334032970:web:f637e2ed4aa40435fc34b3',
});

const messaging = firebase.messaging();

/**
 * Background message handler — fires when the app tab is not focused
 * or the browser is minimized/closed.
 */
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || 'Avalo';
  const options = {
    body: payload.notification?.body || '',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    data: payload.data,
    actions: [
      { action: 'open', title: 'Open' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };

  self.registration.showNotification(title, options);
});

/**
 * Notification click handler — opens the relevant URL or falls back to root.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const action = event.action;
  if (action === 'dismiss') return;

  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Focus existing window if one is open
      for (const client of windowClients) {
        if (client.url === url && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});
