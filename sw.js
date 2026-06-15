// SplitPay Service Worker v1.1
const APP_VERSION = '1.1';
const CACHE_NAME = `splitpay-v${APP_VERSION}`;
const OFFLINE_URL = '/offline.html';

// File da mettere in cache al primo avvio
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/evento.html',
  '/spesa.html',
  '/riepilogo.html',
  '/impostazioni.html',
  '/manifest.json',
  '/css/style.css',
  '/js/app.js',
  '/js/db.js',
  '/js/sync.js',
  '/js/utils.js',
  '/js/payments.js',
  '/js/notifications.js',
  '/js/supabase.js',
  '/js/evento.js',
  '/js/spesa.js'
];

// ─── INSTALL ───────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  console.log(`[SW] Installing SplitPay v${APP_VERSION}`);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
      .catch((err) => console.warn('[SW] Cache install error:', err))
  );
});

// ─── ACTIVATE ──────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log(`[SW] Activating SplitPay v${APP_VERSION}`);
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith('splitpay-') && name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// ─── FETCH ─────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignora richieste a domini esterni (Supabase, Firebase, etc.)
  if (url.origin !== location.origin) {
    return;
  }

  // Strategia: Cache First per asset statici, Network First per dati
  if (request.method === 'GET') {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          // Aggiorna in background (stale-while-revalidate)
          fetch(request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, networkResponse.clone());
              });
            }
          }).catch(() => {});
          return cachedResponse;
        }

        // Non in cache: prova la rete
        return fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return networkResponse;
        }).catch(() => {
          // Rete non disponibile: pagina offline
          if (request.headers.get('accept').includes('text/html')) {
            return caches.match(OFFLINE_URL);
          }
        });
      })
    );
  }
});

// ─── PUSH NOTIFICATIONS ────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  console.log('[SW] Push received');
  let data = {
    title: 'SplitPay',
    body: 'Hai una nuova notifica',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    tag: 'splitpay-notification',
    data: {}
  };

  if (event.data) {
    try {
      const payload = event.data.json();
      data = { ...data, ...payload };
    } catch (e) {
      data.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: data.badge,
      tag: data.tag,
      vibrate: [100, 50, 100],
      data: data.data,
      actions: [
        { action: 'open', title: 'Apri', icon: '/icons/icon-72.png' },
        { action: 'close', title: 'Chiudi' }
      ]
    })
  );
});

// ─── NOTIFICATION CLICK ────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.action);
  event.notification.close();

  if (event.action === 'close') return;

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Se c'è già una finestra aperta, la porta in primo piano
        for (const client of clientList) {
          if (client.url.includes(location.origin) && 'focus' in client) {
            client.focus();
            client.postMessage({ type: 'NOTIFICATION_CLICK', url: urlToOpen, data: event.notification.data });
            return;
          }
        }
        // Altrimenti apre una nuova finestra
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

// ─── BACKGROUND SYNC ───────────────────────────────────────────────────────
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);
  if (event.tag === 'splitpay-sync') {
    event.waitUntil(doBackgroundSync());
  }
});

async function doBackgroundSync() {
  try {
    const allClients = await clients.matchAll();
    allClients.forEach((client) => {
      client.postMessage({ type: 'BACKGROUND_SYNC' });
    });
  } catch (err) {
    console.warn('[SW] Background sync error:', err);
  }
}

// ─── MESSAGE HANDLER ───────────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  const { type } = event.data || {};

  if (type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (type === 'GET_VERSION') {
    event.source.postMessage({ type: 'VERSION', version: APP_VERSION });
  }
});
