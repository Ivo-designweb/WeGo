// ═══════════════════════════════════════════════════════════════
// WeGo — sw.js v8.0
// Service Worker — cache offline + background sync
// v8.0: nessuna modifica alla lista di precache — menu "⋮" di evento.html
//       aggiorna la voce "Impostazioni" e rimuove "Elimina evento"
//       (duplicata, vedi evento.html/evento.js v2.36) — solo bump di
//       versione "di famiglia" per index.html/evento.html/
//       impostazioni.html.
// v7.9: nessuna modifica alla lista di precache — le icone categoria in
//       Movimenti/form Spesa (nascoste dalla v7.8) sono ora
//       configurabili da Impostazioni → Categorie spesa ("Mostra icone
//       categoria", default spento) invece di essere forzate via HTML
//       (utils.js v1.5 Utils.applyCategoryIconsVisibility(), evento.js
//       v2.35, spesa.js v3.2, evento.html/spesa.html/impostazioni.html)
//       — solo bump di versione "di famiglia" per index.html/
//       evento.html/impostazioni.html (spesa.html ha un proprio numero
//       di versione separato, ma condivide comunque questo CACHE_NAME).
// v7.8: nessuna modifica alla lista di precache — Riepilogo→"Partecipante"
//       ora mostra la quota pro-capite invece del saldo netto (torta +
//       elenco), nuovo titolo/nota nella pagina; icona categoria nascosta
//       (non rimossa) nella lista Movimenti e nel form Spesa, pronta per
//       un futuro flag in Impostazioni (evento.html v7.8/evento.js v2.34,
//       spesa.html v4.1) — solo bump di versione "di famiglia" per
//       index.html/impostazioni.html (spesa.html ha un proprio numero di
//       versione separato, ma condivide comunque questo CACHE_NAME).
// v7.7: nessuna modifica alla lista di precache — modifica/eliminazione
//       movimenti aperte a qualunque operatore con conferma se non
//       proprietario, eliminazioni sincronizzate in modo più robusto
//       (pulizia fisica locale dopo push/pull invece di restare marcate
//       "deleted" per sempre), sync più veloce (immediata con soglia
//       15s su apertura pagina/ritorno online/ritorno in foreground,
//       nuovo pull-to-refresh in evento.html), "(nome)" sotto l'importo
//       quando un movimento è stato modificato da un operatore diverso
//       dal proprietario, notifiche push ora anche su modifica/
//       eliminazione (db.js v1.11, supabase.js v1.15, sync.js v2.4,
//       spesa.js v3.2, evento.js v2.33, app.js v2.20, evento.html/
//       index.html/impostazioni.html) — anche index.html allineato alla
//       versione "famiglia" (era rimasto indietro a v7.2). Bump di
//       versione anche solo "di famiglia" per index.html.
// v7.6: nessuna modifica alla lista di precache — icone categoria
//       ingrandite a 50px in lista Movimenti e legenda Riepilogo
//       (evento.html/evento.js v7.6/v2.32), nuovo selettore "Tipo" a
//       icone grandi (60px) nel form spesa al posto del vecchio
//       <select> nativo (spesa.html v4.0/spesa.js v3.1) — solo bump
//       di versione per la "famiglia" index/evento/impostazioni
//       (spesa.html/js hanno un proprio numero di versione separato,
//       ma condividono comunque questo CACHE_NAME).
// v7.5: aggiunte le 8 nuove icone PNG a colori (letto, dormire-nel-
//       letto, cane, gatto, guida-turistica, strada, dogana,
//       autostrada — payments.js v1.4) alla lista di precache, +
//       ingrandimento icone categoria nella lista Movimenti e nuova
//       icona nella legenda del Riepilogo per "Tipo spesa" (evento.html/
//       evento.js v2.31, nessun file da precache aggiuntivo per queste
//       due). Bump necessario per la lista di precache cambiata.
// v7.4: aggiunte 42 nuove icone PNG a colori delle categorie di spesa
//       alla lista di precache (payments.js v1.3, set Icons8 free —
//       vedi Crediti in impostazioni.html) — bump di versione
//       necessario proprio perché la lista di precache è cambiata
//       (a differenza dei bump "di famiglia" delle versioni
//       precedenti, qui servono davvero i nuovi file in cache per
//       l'uso offline).
// v7.3: nessuna modifica alla lista di precache — icone categorie di
//       spesa nella lista Movimenti, editor icona/descrizione categorie
//       in Impostazioni, fix totale "Per Partecipante" nel tab
//       Riepilogo, font seconda riga movimenti più leggibile (evento.js
//       v2.30, evento.html/impostazioni.html v7.3, payments.js v1.2,
//       spesa.js v3.0) — solo bump di versione per la "famiglia"
//       index/evento/impostazioni.
// v7.2: nessuna modifica alla lista di precache — campo posizione ora
//       editabile liberamente (spesa.js v2.9/spesa.html v3.9), icona
//       moneta + click-per-navigare sui pin della Mappa (evento.js
//       v2.29) — solo bump di versione per la "famiglia"
//       index/evento/impostazioni.
// v7.1: nessuna modifica alla lista di precache — bump versione per la
//       SICUREZZA database (supabase.js v1.14): header "x-wego-codes" +
//       RLS lato Supabase (VA ESEGUITO sicurezza_rls.sql nel SQL Editor
//       DOPO il deploy di questi file!) — solo bump di versione per la
//       "famiglia" index/evento/impostazioni.
// v7.0: nessuna modifica alla lista di precache — bump versione per
//       rigenerare la cache con l'OTTIMIZZAZIONE latenza sync (sync.js
//       v2.3): controllo licenza max 1 volta/5min, 4 letture del pull
//       in parallelo, "ultima presenza" max 1 volta/5min e non
//       bloccante — solo bump di versione per la "famiglia"
//       index/evento/impostazioni.
// v6.9: nessuna modifica alla lista di precache (già includeva
//       supabase.js/sync.js) — bump versione per rigenerare la cache
//       con la sincronizzazione INCREMENTALE (sync.js v2.2/
//       supabase.js v1.13): pull scarica solo i record nuovi/modificati
//       dall'ultimo sync invece di tutta la storia dell'evento, push
//       usa un vero upsert lato server invece di un fetch completo per
//       ogni record da controllare — solo bump di versione per la
//       "famiglia" index/evento/impostazioni.
// v6.8: nessuna modifica alla lista di precache (già includeva
//       sync.js/evento.js/spesa.js) — bump versione per rigenerare la
//       cache con la NUOVA sync differita ("quieta", sync.js v2.1):
//       salvare una spesa non blocca più l'utente in attesa della rete,
//       la sincronizzazione parte da sola 5s dopo in automatico — solo
//       bump di versione per la "famiglia" index/evento/impostazioni.
// v6.7: AGGIUNTI 'leaflet.js'/'leaflet.css'/'leaflet-marker-*.png' a
//       STATIC_ASSETS — libreria vendorizzata in locale (nessun CDN,
//       nessuna API key) usata dal nuovo criterio "Mappa" nel tab
//       Riepilogo (evento.js v2.27), così la mappa funziona anche
//       offline dopo il primo caricamento (i TILE della mappa in sé
//       restano dalla rete OpenStreetMap, non precacheabili — richiede
//       connessione quando la si guarda, come sarebbe anche con Google
//       Maps). Le richieste verso tile.openstreetmap.org NON sono
//       intercettate da nessuna regola qui: ricadono nel ramo
//       "Cache-First per tutto il resto" già esistente, che fa comunque
//       fetch() dalla rete quando la cache non ha il tile (funziona
//       senza modifiche).
// v6.6: nessuna modifica alla lista di precache — NUOVA funzione
//       "Importa da backup" in impostazioni.html (merge per ID, nessuna
//       sync forzata — solo locale) — solo bump di versione per la
//       "famiglia" index/evento/impostazioni.
// v6.5: nessuna modifica alla lista di precache — FIX grafico Riepilogo
//       "Per Partecipante" (include anche i Trasferimenti), bottone
//       Excel rinominato + icona + conferma (evento.js v2.26), fix
//       "Esporta dati locali" ora completo con spese/partecipanti/
//       pagamenti + gate Pro, db.js v1.10 (evento.js/impostazioni.html/
//       db.js) — solo bump di versione per la "famiglia"
//       index/evento/impostazioni.
// v6.4: AGGIUNTO 'exceljs.min.js' a STATIC_ASSETS — libreria vendorizzata
//       in locale (nessun CDN) usata dal bottone "Esporta in Excel" nel
//       tab Riepilogo (evento.js v2.25), così l'export funziona anche
//       offline dopo il primo caricamento. Nessun'altra modifica alla
//       lista di precache — solo bump di versione per la "famiglia"
//       index/evento/impostazioni.
// v6.3: nessuna modifica alla lista di precache — NUOVO 4° tab
//       "Riepilogo" con grafico a torta delle spese in evento.html
//       (evento.js v2.24) e numero di versione accanto al logo "WeGo"
//       in home (index.html) — solo bump di versione per la "famiglia"
//       index/evento/impostazioni, tutto interno ai file già precaricati
// v6.2: nessuna modifica alla lista di precache — NUOVA evidenziazione
//       "Help" sul logo grande "WeGo" in home (bordo pulsante + freccia
//       animata, app.js v2.19/index.html) — solo bump di versione per
//       la "famiglia" index/evento/impostazioni, tutto interno ai file
//       già precaricati
// v6.1: NUOVA pagina /aiuto.html (Guida) aggiunta alla lista di precache
//       — link raggiungibile dalla scritta grande "WeGo"/icona app in
//       home (index.html). Icona app a sinistra del logo grande, link
//       alla Guida — solo bump di versione per la "famiglia" index/
//       evento/impostazioni
// v6.0: nessuna modifica alla lista di precache — badge "Pro"/"Base" in
//       corsivo allineato alla base del logo "WeGo" grande (index.html),
//       shareRiepilogo() riusa EventoApp._balances invece di ricalcolare
//       (evento.js v2.23) — solo bump di versione per la "famiglia"
//       index/evento/impostazioni, tutto interno ai file già precaricati
// v5.9: nessuna modifica alla lista di precache — shareRiepilogo() resa
//       coerente con i 4 totali Movimenti: "+Cassiere" escluso anche dal
//       "Totale" del riepilogo testuale condivisibile (evento.js v2.22)
//       — solo bump di versione per la "famiglia" index/evento/
//       impostazioni, tutto interno ai file già precaricati
// v5.8: nessuna modifica alla lista di precache — "+Cassiere" escluso dai
//       4 totali Movimenti, "Spese" diventa un conteggio (evento.js
//       v2.21) — solo bump di versione per la "famiglia" index/evento/
//       impostazioni, tutto interno ai file già precaricati
// v5.7: nessuna modifica alla lista di precache — NUOVO flag "Uso Cassa
//       Comune" (spesa.html/spesa.js v2.7) e saldo informativo "Cassa
//       Comune" nei Saldi (evento.js v2.20, utils.js v1.4) — solo
//       bump di versione per la "famiglia" index/evento/impostazioni,
//       tutto interno ai file già precaricati
// v5.6: nessuna modifica alla lista di precache — FIX CRITICO
//       license.js v1.4: requestPro() non nasconde più un errore reale
//       del server dietro un falso "Richiesta inviata!" (vedi
//       situazione.md), tutto interno ai file già precaricati
// v5.5: nessuna modifica alla lista di precache — /api/device-license.js
//       e /api/sync-status.js (v3) ora propagano l'errore Postgres
//       completo (code/details/hint) invece del solo messaggio breve,
//       per diagnosticare "permission denied" e simili senza dover
//       guardare i log di Vercel — funzioni serverless, non in cache
// v5.4: nessuna modifica alla lista di precache — FIX schema SQL
//       "permission denied for table sp_device_license" (supabase.js
//       v1.12): GRANT esplicito a service_role, da rieseguire su Supabase
//       (Admin → Schema SQL), tutto interno ai file già precaricati
// v5.3: nessuna modifica alla lista di precache — RIMOSSA la
//       sincronizzazione selettiva eventi esterni (gating, vedi app.js
//       v2.18/sync.js v2.0/db.js v1.8/supabase.js v1.11/evento.js v2.19):
//       ogni evento si sincronizza ora sempre, senza attesa di
//       abilitazione admin. Sezione "Sincronizzazione eventi esterni"
//       rimossa da admin.html (v2.0), lista "Dispositivi in attesa"
//       (licenza Pro) riprogettata con header colonne fisso. Riga
//       "Dispositivo proprietario" rimossa da impostazioni.html. Menu
//       "Richiedi sincronizzazione" in evento.html diventa "Passa a Pro".
//       Tutto interno ai file già precaricati.
// v5.2: FIX CRITICO — le 8 icone PWA (icon72.png … icon512.png) erano
//       file JPEG rinominati ".png", con dimensioni reali diverse da
//       quelle dichiarate nel manifest (es. icon192.png era in realtà
//       196×196, icon512.png era 532×532). Chrome scarta come "non
//       valida" qualunque icona la cui dimensione reale non corrisponda
//       esattamente a quella dichiarata: con NESSUNA icona valida, il
//       manifest non superava il requisito minimo di installabilità —
//       "beforeinstallprompt" non si sarebbe mai generato su Android,
//       a prescindere da installazioni/disinstallazioni precedenti.
//       Rigenerate come PNG veri, alle dimensioni esatte dichiarate,
//       dalla sorgente migliore disponibile (icon512.png, 532×532).
//       Rimosso anche "maskable" dal purpose in manifest.json (il logo
//       non ha margine di sicurezza per il ritaglio circolare/squircle
//       di Android, rischierebbe di tagliare testo/avatar). Il CACHE_NAME
//       cambia apposta in questa versione: i device che avevano già in
//       cache le vecchie icone rotte (strategia Cache-First per le
//       immagini, vedi fetch handler) le scaricano di nuovo da zero.
// v5.1: nessuna modifica alla lista di precache — NUOVO bottone
//       "Installa" in index.html (app.js v2.17), FIX percorsi icona/
//       badge notifiche push (icon/icon-NN.png inesistente → /iconNN.png,
//       file reali in root), tutto interno ai file già precaricati
// v5.0: nessuna modifica alla lista di precache — FIX layout flex
//       "Previsione"/"Tipo" in modifica movimento (spesa.js v2.6) e
//       FIX "Versato" che includeva le previsioni + badge "(Prev. ...)"
//       nei Partecipanti (evento.js v2.18), tutto interno ai file già
//       precaricati
// v4.9: nessuna modifica alla lista di precache — nuovo terzo tipo
//       movimento "+Cassiere" (versamento alla cassa comune, segno
//       opposto a una spesa nei saldi/totali), bottone "Trasf." (ex
//       "Mov. cassa"), fix bug type/paid_for non salvati in modifica
//       movimento (supabase.js v1.10), tutto interno ai file già
//       precaricati
// v4.8: nessuna modifica alla lista di precache — campo "Previsione" e
//       "Tipo" (categoria spesa) nel form movimento, 4 totali in alto
//       nei movimenti (Totale/Previsione/Spese/Pro capite), colonna
//       "Prev." nei Saldi, fix licenza foto per-evento (un device Base
//       collegato a un evento Pro può sincronizzare le foto SOLO lì)
// v4.7: nessuna modifica alla lista di precache — modifica di sicurezza
//       (sp_sync_status / sp_device_license non più scrivibili dalla
//       anon key, vedi supabase.js v1.8) e badge "Pro N" spostato vicino
//       al logo invece che tra le icone azione, tutto interno ai file
//       già precaricati
// v4.6: nessuna modifica alla lista di precache (Fase 4 licenza Base/Pro
//       — schermata bloccante di downgrade + badge "Pro N", tutta logica
//       interna ad app.js/evento.js/license.js, già precaricati)
// v4.5: nessuna modifica alla lista di precache (la nuova funzione
//       /api/device-license.js è una funzione serverless, esclusa dalla
//       cache come tutte le /api/* — vedi sync.js v1.8 / license.js v1.1)
// v4.4: aggiunto /license.js alla lista di precache (gestione licenza
//       Base/Pro — vedi license.js, db.js v1.6, sync.js v1.7)
// v3.7: esclude /api/* dall'intercettazione (sempre rete, mai cache —
//       sono le funzioni serverless per login admin / gating sync)
// ═══════════════════════════════════════════════════════════════

const CACHE_NAME = 'wego-v8.0';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/evento.html',
  '/spesa.html',
  '/impostazioni.html',
  '/admin.html',
  '/aiuto.html',
  '/manifest.json',
  '/style.css',
  '/utils.js',
  '/db.js',
  '/license.js',
  '/supabase.js',
  '/sync.js',
  '/notifications.js',
  '/payments.js',
  '/app.js',
  '/evento.js',
  '/spesa.js',
  '/exceljs.min.js',
  '/leaflet.js',
  '/leaflet.css',
  '/leaflet-marker-icon.png',
  '/leaflet-marker-icon-2x.png',
  '/leaflet-marker-shadow.png',
  '/caticon-aeroporto.png',
  '/caticon-anello-di-diamanti.png',
  '/caticon-apri-libro.png',
  '/caticon-arena.png',
  '/caticon-auto.png',
  '/caticon-banconote.png',
  '/caticon-bar.png',
  '/caticon-batteria-carica.png',
  '/caticon-benzinaio.png',
  '/caticon-biglietto.png',
  '/caticon-birra.png',
  '/caticon-caffe-espresso.png',
  '/caticon-camion.png',
  '/caticon-cappello-di-laurea.png',
  '/caticon-cartellino-del-prezzo.png',
  '/caticon-cassetta-postale-chiusa-bandiera-giu.png',
  '/caticon-champagne.png',
  '/caticon-chitarra.png',
  '/caticon-ciotola-di-riso.png',
  '/caticon-cocktail.png',
  '/caticon-cono-gelato.png',
  '/caticon-consegna.png',
  '/caticon-cupcake.png',
  '/caticon-farmaceutico.png',
  '/caticon-maglione.png',
  '/caticon-manutenzione.png',
  '/caticon-monastero.png',
  '/caticon-museo.png',
  '/caticon-navetta.png',
  '/caticon-occhiali.png',
  '/caticon-ombrello.png',
  '/caticon-pagato.png',
  '/caticon-palloncini-da-party.png',
  '/caticon-parchimetro.png',
  '/caticon-pillole.png',
  '/caticon-regalo.png',
  '/caticon-ricerca.png',
  '/caticon-scarpe-da-ginnastica.png',
  '/caticon-stereo-portatile.png',
  '/caticon-trasporti.png',
  '/caticon-tv.png',
  '/caticon-vino-e-bicchiere.png',
  '/caticon-autostrada.png',
  '/caticon-cane.png',
  '/caticon-dogana.png',
  '/caticon-dormire-nel-letto.png',
  '/caticon-gatto.png',
  '/caticon-guida-turistica.png',
  '/caticon-letto.png',
  '/caticon-strada.png',
];

// ─── INSTALL ──────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Install v7.7');
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
  console.log('[SW] Activate v7.7');
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

  // Funzioni serverless (/api/*) → solo rete, mai cache. Sono chiamate
  // sempre "fresche" (login admin, verifica codice proprietario, stato
  // sincronizzazione): intercettarle con una strategia di cache darebbe
  // risposte stantie o, peggio, riproporrebbe un vecchio risultato di
  // login. Lasciamo che il browser le gestisca direttamente.
  if (url.pathname.startsWith('/api/')) {
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
        icon:    '/icon192.png',
        badge:   '/icon72.png',
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
