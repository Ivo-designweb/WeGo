// ═══════════════════════════════════════════════════════════════
// WeGo — sw.js v2.0
// Service Worker — cache offline + background sync
// ═══════════════════════════════════════════════════════════════

const CACHE_NAME = 'wego-v2.0';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/evento.html',
  '/spesa.html',
  '/riepilogo.html',
  '/impostazioni.html',
  '/admin.html',
  '/manifest.json',
  '/css/style.css',
  '/js/utils.js',
  '/js/db.js',
  '/js/supabase.js',
  '/js/sync.js',
  '/js/notifications.js',
  '/js/payments.js',
  '/js/app.js',
  '/js/evento.js',
  '/js/spesa.js',
  '/js/riepilogo.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// ─── INSTALL ──────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Install v2.0');
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Fetch in modalità 'reload': bypassa sempre la cache HTTP del browser,
      // così ogni nuova installazione del SW scarica i file davvero più
      // recenti presenti su Vercel, invece di rischiare di prendere una
      // copia stantia dalla cache disco del dispositivo.
      await Promise.all(STATIC_ASSETS.map(async (url) => {
        try {
          const response = await fetch(url, { cache: 'reload' });
          if (response && response.ok) {
            await cache.put(url, response);
          } else {
            console.warn('[SW] Asset non disponibile:', url, response && response.status);
          }
        } catch (e) {
          console.warn('[SW] Impossibile precaricare:', url, e);
        }
      }));
    })
  );
  self.skipWaiting();
});

// ─── ACTIVATE ─────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate v2.0');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ─── FETCH ────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API Supabase / Firebase → solo rete, niente cache
  if (url.hostname.includes('supabase.co') ||
      url.hostname.includes('firebase') ||
      url.hostname.includes('googleapis.com') ||
      url.hostname.includes('fcm.googleapis.com')) {
    return;
  }

  // Nominatim geocoding → solo rete
  if (url.hostname.includes('nominatim.openstreetmap.org')) {
    return;
  }

  // chiavi.json (configurazione centralizzata) → network-first.
  // Tenta sempre la rete per primo, così un aggiornamento del file si propaga
  // subito; se offline, ripiega sull'ultima copia salvata in cache.
  if (url.pathname === '/chiavi.json') {
    event.respondWith(
      fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  // Strategia Cache-First per asset statici
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Aggiorna cache solo per risposte valide
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Fallback per navigazione offline
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});

// ─── MESSAGE (da pagina → SW) ─────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    console.log('[SW] SKIP_WAITING ricevuto — installazione immediata');
    self.skipWaiting();
  }
});

// ─── BACKGROUND SYNC ──────────────────────────────────────────
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);
  if (event.tag === 'wego-sync') {
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(client => client.postMessage({ type: 'BACKGROUND_SYNC' }));
      })
    );
  }
});

// ─── PUSH NOTIFICATIONS ───────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  try {
    const data = event.data.json();
    event.waitUntil(
      self.registration.showNotification(data.title || 'WeGo', {
        body:    data.body || '',
        icon:    '/icons/icon-192.png',
        badge:   '/icons/icon-72.png',
        tag:     'wego-notification',
        data:    data
      })
    );
  } catch (e) {
    console.warn('[SW] Push parse error:', e);
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const data = event.notification.data;
      const url  = data?.eventId ? `/evento.html?id=${data.eventId}` : '/';
      const existing = clients.find(c => c.url.includes('wego') || c.url === self.location.origin + '/');
      if (existing) {
        existing.focus();
        existing.postMessage({ type: 'NOTIFICATION_CLICK', data });
      } else {
        self.clients.openWindow(url);
      }
    })
  );
});
