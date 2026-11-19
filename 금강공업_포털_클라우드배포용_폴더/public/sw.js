// Service Worker for Kumkang Test Report PWA
const CACHE_NAME = 'kumkang-portal-v1';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', (e) => {
  // Network first fallback
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
