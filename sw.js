// Service Worker for HCC School Website
// Version: 1.0.0
// Strategy: Network First (Always fresh from GitHub)

const CACHE_NAME = 'hcc-school-v1.0.0';
const CACHE_VERSION = '1.0.0';

// Files to cache immediately on install
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/staff.html',
  '/admission.html',
  '/infrastructure.html',
  '/gallery.html',
  '/achievements.html',
  '/contact.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

// Dynamic cache for images and API responses
const DYNAMIC_CACHE = 'hcc-dynamic-v1';

// Install Event - Precache essential files
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Precaching app shell');
        return cache.addAll(PRECACHE_URLS);
      })
      .then(() => {
        console.log('[SW] Installation complete');
        return self.skipWaiting(); // Activate immediately
      })
      .catch((error) => {
        console.error('[SW] Installation failed:', error);
      })
  );
});

// Activate Event - Clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME && cacheName !== DYNAMIC_CACHE) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[SW] Activation complete');
        return self.clients.claim(); // Take control immediately
      })
  );
});

// Fetch Event - Network First Strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip chrome extensions and non-http(s) requests
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // API requests - Network only (always fresh)
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(
      fetch(request)
        .catch(() => {
          return new Response(JSON.stringify({ error: 'Network error' }), {
            headers: { 'Content-Type': 'application/json' }
          });
        })
    );
    return;
  }

  // Images - Cache first, then network
  if (request.destination === 'image') {
    event.respondWith(
      caches.match(request)
        .then((cachedResponse) => {
          if (cachedResponse) {
            // Return cached image but update in background
            fetch(request)
              .then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                  caches.open(DYNAMIC_CACHE)
                    .then((cache) => cache.put(request, networkResponse));
                }
              })
              .catch(() => {}); // Ignore network errors
            
            return cachedResponse;
          }

          // Not in cache - fetch from network
          return fetch(request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                const responseClone = networkResponse.clone();
                caches.open(DYNAMIC_CACHE)
                  .then((cache) => cache.put(request, responseClone));
              }
              return networkResponse;
            })
            .catch(() => {
              // Return placeholder image on error
              return new Response(
                '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect fill="#E7D8CA" width="300" height="300"/><text fill="#531C22" font-size="20" x="50%" y="50%" text-anchor="middle" dy=".3em">Image Unavailable</text></svg>',
                { headers: { 'Content-Type': 'image/svg+xml' } }
              );
            });
        })
    );
    return;
  }

  // HTML pages - Network first (always fresh from GitHub)
  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        // Clone response before caching
        const responseClone = networkResponse.clone();
        
        // Update cache in background
        if (networkResponse && networkResponse.status === 200) {
          caches.open(CACHE_NAME)
            .then((cache) => cache.put(request, responseClone));
        }
        
        return networkResponse;
      })
      .catch(() => {
        // Network failed - try cache
        return caches.match(request)
          .then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            
            // No cache - return offline page
            if (request.destination === 'document') {
              return caches.match('/index.html');
            }
            
            return new Response('Offline', { status: 503 });
          });
      })
  );
});

// Background Sync - For offline form submissions
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-admissions') {
    event.waitUntil(syncAdmissionData());
  }
});

async function syncAdmissionData() {
  // Get pending submissions from IndexedDB
  // Send to Supabase when back online
  console.log('[SW] Syncing offline submissions...');
  // Implementation will be in admission.html
}

// Push Notifications
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  
  const title = data.title || 'HCC High School';
  const options = {
    body: data.body || 'New notification from HCC School',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/',
      dateOfArrival: Date.now()
    },
    actions: [
      {
        action: 'open',
        title: 'View',
        icon: '/icons/icon-72x72.png'
      },
      {
        action: 'close',
        title: 'Dismiss',
        icon: '/icons/icon-72x72.png'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Notification Click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  // Open URL from notification
  const urlToOpen = event.notification.data.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Check if window is already open
        for (let client of clientList) {
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus();
          }
        }
        // Open new window
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

// Message from page
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_VERSION });
  }
});
