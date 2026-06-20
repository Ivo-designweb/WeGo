// ═══════════════════════════════════════════════════════════════
// WeGo — sw.js v3.0
// Service Worker — cache offline + background sync
// ═══════════════════════════════════════════════════════════════

const CACHE_NAME = 'wego-v3.0';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/evento.html',
  '/spesa.html',
  '/impostazioni.html',
  '/admin.html',
  '/manifest.json',
  '/style.css',
  '/utils.js',
  '/db.js',
  '/supabase.js',
  '/sync.js',
  '/notifications.js',
  '/payments.js',
  '/app.js',
  '/evento.js',
  '/spesa.js',
];

// ─── INSTALL ──────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Install v3.0');
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
  console.log('[SW] Activate v3.0');
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

  // Strategia Network-First per HTML e JS: prova sempre la rete così i deploy
  // si propagano subito senza dover forzare il refresh manuale. Se offline,
  // usa la copia in cache come fallback.
  // Cache-First solo per font, immagini e risorse statiche binarie.
  const isHtmlOrJs = url.pathname.endsWith('.html') ||
                     url.pathname.endsWith('.js') ||
                     url.pathname.endsWith('.css') ||
                     url.pathname === '/';

  if (isHtmlOrJs) {
    event.respondWith(
      fetch(event.request, { cache: 'no-cache' }).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline: usa cache
        return caches.match(event.request).then(cached => {
          if (cached) return cached;
          if (event.request.mode === 'navigate') return caches.match('/index.html');
        });
      })
    );
    return;
  }

  // Cache-First per tutto il resto (immagini, icone, font)
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        if (event.request.mode === 'navigate') return caches.match('/index.html');
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
