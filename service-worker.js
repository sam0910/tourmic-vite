const CACHE_NAME = 'pwa-workshop-v1';
const OFFLINE_URL = 'offline.html';

const ASSETS_TO_CACHE = ['/', '/index.html', '/sender.html', '/offline.html', '/css/style.css', '/css/preview.css', '/js/main.js', '/js/preview.js', '/manifest.json', '/images/logo.svg', '/images/maskable.svg', '/images/paper.svg', '/images/mode_night_gm_grey_24dp.svg', '/images/wb_sunny_gm_grey_24dp.svg', '/images/icons/logo-48.png', '/images/icons/logo-72.png', '/images/icons/logo-96.png', '/images/icons/logo-128.png', '/images/icons/logo-192.png', '/images/icons/logo-384.png', '/images/icons/logo-512.png', '/images/icons/maskable-1024.png'];

// Install event - cache assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // Cache all static assets
      await cache.addAll(ASSETS_TO_CACHE);
      // Cache offline page
      const offlineResponse = new Response(await cache.match(OFFLINE_URL), {
        headers: { 'Content-Type': 'text/html' },
      });
      await cache.put(OFFLINE_URL, offlineResponse);
    })(),
  );
  // Force waiting service worker to become active
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Enable navigation preload if supported
      if ('navigationPreload' in self.registration) {
        await self.registration.navigationPreload.enable();
      }

      // Clean up old caches
      const cacheKeys = await caches.keys();
      const deletions = cacheKeys.map((key) => {
        if (key !== CACHE_NAME) {
          return caches.delete(key);
        }
      });
      await Promise.all(deletions);
    })(),
  );
  // Take control of all pages immediately
  self.clients.claim();
});

// Fetch event - serve from cache or network
self.addEventListener('fetch', (event) => {
  event.respondWith(
    (async () => {
      try {
        // Try to use navigation preload response if available
        const preloadResponse = await event.preloadResponse;
        if (preloadResponse) {
          return preloadResponse;
        }

        // Try to fetch from network
        const networkResponse = await fetch(event.request);

        // Cache successful GET requests
        if (event.request.method === 'GET') {
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, networkResponse.clone());
        }

        return networkResponse;
      } catch (error) {
        // Network failed, try to serve from cache
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(event.request);

        if (cachedResponse) {
          return cachedResponse;
        }

        // If HTML request failed, show offline page
        if (event.request.mode === 'navigate') {
          const offlineResponse = await cache.match(OFFLINE_URL);
          if (offlineResponse) {
            return offlineResponse;
          }
        }

        // Nothing in cache, propagate error
        throw error;
      }
    })(),
  );
});
