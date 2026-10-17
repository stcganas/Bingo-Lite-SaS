/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';

declare let self: ServiceWorkerGlobalScope;

// standard PWA workbox setup
self.skipWaiting();
clientsClaim();

// Deduplicate manifest entries by URL to prevent add-to-cache-list-conflicting-entries
const rawManifest = (self as any).__WB_MANIFEST || [];
const seenUrls = new Set<string>();
const cleanManifest = rawManifest.filter((entry: any) => {
  const url = typeof entry === 'string' ? entry : entry?.url;
  if (!url || seenUrls.has(url)) return false;
  seenUrls.add(url);
  return true;
});

precacheAndRoute(cleanManifest);
cleanupOutdatedCaches();

// Import OneSignal SDK worker inside Service Worker for seamless Web Push support
try {
  importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');
} catch (e) {
  console.warn('[SW] Could not import OneSignalSDK.sw.js inside sw.ts:', e);
}

// Native Web Push Notification Handlers for background & system tray alerts
self.addEventListener('push', (event: any) => {
  let data: any = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'Bingo Lite 🎱', body: event.data.text() };
    }
  }

  const title = data.title || data.heading || 'Bingo Lite 🎱';
  const options: NotificationOptions = {
    body: data.body || data.message || data.content || '¡Tienes una nueva notificación de Bingo Lite!',
    icon: 'https://cdn-icons-png.flaticon.com/512/591/591559.png',
    badge: 'https://cdn-icons-png.flaticon.com/512/591/591559.png',
    tag: data.tag || 'bingo-push',
    data: { url: data.web_url || data.url || '/' }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event: any) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || '/';
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList: any) => {
      for (const client of clientList) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
