const CACHE_NAME = 'pwa-workshop-v1';
const OFFLINE_URL = 'offline.html';
const AUDIO_CACHE_NAME = 'audio-cache-v1';

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
        if (key !== CACHE_NAME && key !== AUDIO_CACHE_NAME) {
          return caches.delete(key);
        }
      });
      await Promise.all(deletions);
    })(),
  );
  // Take control of all pages immediately
  self.clients.claim();
});

// Handle background sync for audio data
self.addEventListener('sync', (event) => {
  if (event.tag === 'audio-sync') {
    event.waitUntil(
      (async () => {
        try {
          const cache = await caches.open(AUDIO_CACHE_NAME);
          const audioData = await cache.match('/audio-cache');
          if (audioData) {
            // Get all clients
            const clients = await self.clients.matchAll();
            // Find the sender page
            const senderClient = clients.find((client) => client.url.includes('sender.html'));

            if (senderClient) {
              // Send cached audio data back to the page
              senderClient.postMessage({
                type: 'cached-audio',
                data: await audioData.arrayBuffer(),
              });
            }
          }
        } catch (err) {
          console.error('Error in background sync:', err);
        }
      })(),
    );
  }
});

// Handle background fetch events
self.addEventListener('backgroundfetchsuccess', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const records = await event.registration.matchAll();
        const promises = records.map(async (record) => {
          const response = await record.responseReady;
          // Store audio data in cache
          const cache = await caches.open(AUDIO_CACHE_NAME);
          await cache.put('/audio-cache', response);

          // Attempt to sync with the server
          await self.registration.sync.register('audio-sync');
        });
        await Promise.all(promises);
      } catch (err) {
        console.error('Background fetch failed:', err);
      } finally {
        event.registration.complete();
      }
    })(),
  );
});

self.addEventListener('backgroundfetchfail', (event) => {
  console.error('Background fetch failed:', event);
  event.registration.complete();
});

self.addEventListener('backgroundfetchabort', (event) => {
  console.log('Background fetch aborted:', event);
  event.registration.complete();
});

// Handle messages from the page
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'cache-audio') {
    event.waitUntil(
      (async () => {
        try {
          const cache = await caches.open(AUDIO_CACHE_NAME);
          const response = new Response(event.data.audioData);
          await cache.put('/audio-cache', response);
        } catch (err) {
          console.error('Error caching audio data:', err);
        }
      })(),
    );
  }
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

        // Check if this is an audio stream request
        if (event.request.headers.get('accept')?.includes('audio')) {
          // If we have cached audio data, stream it
          const audioCache = await caches.open(AUDIO_CACHE_NAME);
          const cachedAudio = await audioCache.match('/audio-cache');
          if (cachedAudio) {
            return new Response(cachedAudio.body, {
              headers: {
                'Content-Type': 'audio/mpeg',
                'Cache-Control': 'no-cache',
              },
            });
          }
        } else if (cachedResponse) {
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
