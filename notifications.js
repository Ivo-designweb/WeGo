// ═══════════════════════════════════════════════════════════════
// WeGo — notifications.js v1.3
// Gestione notifiche push con Web Push (VAPID) + Supabase
// v1.3: FIX — icon/badge delle notifiche puntavano a "/icons/icon-NN.png"
//       (cartella/nome inesistenti — i file reali sono in root, es.
//       "/icon192.png", senza trattino). Stesso fix in manifest.json,
//       sw.js, admin.html (vedi app.js v2.17 per il contesto: trovato
//       mentre si verificava perché il prompt di installazione PWA non
//       sempre si attiva su Android — icone non risolvibili = PWA non
//       installabile per Chrome).
// v1.2: fix critico — _registerToken riusava una sottoscrizione del
//       browser legata a una vecchia chiave VAPID pubblica anche dopo
//       averla rigenerata sul server (il browser non se ne accorge da
//       solo). Causava errori "VAPID public key mismatch" 401/403 lato
//       Edge Function: i destinatari non ricevevano nulla pur risultando
//       correttamente registrati. Ora la sottoscrizione viene confrontata
//       con la chiave attualmente configurata e rinnovata se non coincide.
// ═══════════════════════════════════════════════════════════════

const Notifications = {

  _vapidKey:      null,
  _fcmApiKey:     null,
  _fcmProjectId:  null,
  _fcmSenderId:   null,
  _fcmAppId:      null,
  _token:         null,
  _initialized:   false,

  // ─── INIT ─────────────────────────────────────────────────
  async init() {
    // Carica config da localStorage
    Notifications._vapidKey     = Utils.getConfig('fcm_vapid_key');
    Notifications._fcmApiKey    = Utils.getConfig('fcm_api_key');
    Notifications._fcmProjectId = Utils.getConfig('fcm_project_id');
    Notifications._fcmSenderId  = Utils.getConfig('fcm_sender_id');
    Notifications._fcmAppId     = Utils.getConfig('fcm_app_id');

    if (!Notifications.isConfigured()) {
      console.log('[FCM] Non configurato — notifiche disabilitate');
      return;
    }

    // Controlla permessi
    if (Notification.permission === 'denied') {
      console.warn('[FCM] Notifiche bloccate dall\'utente');
      return;
    }

    Notifications._initialized = true;
    console.log('[FCM] Inizializzato');
  },

  isConfigured() {
    return !!(
      Notifications._vapidKey &&
      Notifications._fcmApiKey &&
      Notifications._fcmProjectId &&
      Notifications._fcmSenderId &&
      Notifications._fcmAppId
    );
  },

  // ─── RICHIEDI PERMESSO ────────────────────────────────────
  async requestPermission() {
    if (!('Notification' in window)) {
      Utils.toast('Le notifiche non sono supportate su questo dispositivo', 'error');
      return false;
    }

    if (Notification.permission === 'granted') return true;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      Utils.toast('Permesso notifiche non concesso', 'error');
      return false;
    }

    // Registra token FCM
    await Notifications._registerToken();
    return true;
  },

  // ─── REGISTRA TOKEN FCM ───────────────────────────────────
  // eventId/userId sono opzionali: se forniti, la sottoscrizione viene
  // anche salvata su Supabase, collegata a quell'evento, così il server
  // sa A CHI inviare la notifica quando qualcun altro registra un movimento.
  async _registerToken(eventId = null, userId = null) {
    if (!Notifications.isConfigured()) return;
    if (!window._swRegistration) return;

    try {
      const desiredKey = Notifications._urlBase64ToUint8Array(Notifications._vapidKey);

      // Riusa la sottoscrizione esistente SOLO se è legata alla stessa
      // chiave VAPID pubblica attualmente configurata. Il browser non
      // invalida da solo una sottoscrizione quando cambi la chiave sul
      // server (es. dopo averla rigenerata): senza questo controllo,
      // continuerebbe a restituire la vecchia sottoscrizione per sempre,
      // e il server riceverebbe endpoint/chiavi che la nuova chiave
      // privata non può più autenticare (errori 401/403 "VAPID public
      // key mismatch" — nessun errore visibile qui, solo notifiche che
      // non arrivano mai a destinazione).
      let subscription = await window._swRegistration.pushManager.getSubscription();
      if (subscription) {
        try {
          const currentKey = new Uint8Array(subscription.options.applicationServerKey);
          const sameKey = currentKey.length === desiredKey.length &&
                          currentKey.every((b, i) => b === desiredKey[i]);
          if (!sameKey) {
            console.log('[Push] Chiave VAPID cambiata: rinnovo la sottoscrizione');
            await subscription.unsubscribe();
            subscription = null;
          }
        } catch (e) {
          // Browser senza supporto a subscription.options (raro): non
          // possiamo verificare la corrispondenza, manteniamo quella
          // esistente com'era prima di questo fix.
          console.warn('[Push] Impossibile verificare la chiave VAPID della sottoscrizione esistente:', e.message);
        }
      }

      if (!subscription) {
        subscription = await window._swRegistration.pushManager.subscribe({
          userVisibleOnly:      true,
          applicationServerKey: desiredKey
        });
      }

      // Salva token localmente (per diagnostica/retrocompatibilità)
      const token = JSON.stringify(subscription);
      Notifications._token = token;
      Utils.setConfig('push_token', token);
      Utils.setConfig('push_endpoint', subscription.endpoint);

      console.log('[Push] Sottoscrizione attiva');

      // Invia la sottoscrizione al server: senza questo passo il backend
      // non ha modo di sapere a quale endpoint inviare le notifiche.
      if (eventId) {
        await Notifications._saveTokenToServer(subscription, eventId, userId);
      }

      return token;
    } catch (e) {
      console.warn('[Push] Token registration error:', e);
    }
  },

  // ─── SALVA SOTTOSCRIZIONE SU SUPABASE ─────────────────────
  async _saveTokenToServer(subscription, eventId, userId) {
    if (typeof SupabaseClient === 'undefined' || !SupabaseClient.isConfigured()) return;
    try {
      const raw = subscription.toJSON ? subscription.toJSON() : JSON.parse(JSON.stringify(subscription));
      await SupabaseClient.pushSubscriptions.upsert({
        event_id: eventId,
        user_id:  userId || null,
        endpoint: raw.endpoint,
        p256dh:   raw.keys?.p256dh || '',
        auth:     raw.keys?.auth   || ''
      });
      console.log('[Push] Sottoscrizione salvata su Supabase per evento', eventId);
    } catch (e) {
      console.warn('[Push] Salvataggio server-side fallito:', e.message);
    }
  },

  // ─── REGISTRA/AGGIORNA LA SOTTOSCRIZIONE PER UN EVENTO ────
  // Da chiamare ad ogni apertura di evento.html: se il permesso è già
  // stato concesso, collega silenziosamente questo device a questo evento
  // sul server, senza richiedere nulla all'utente.
  async registerForEvent(eventId, userId) {
    if (!eventId) return;
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    if (!Notifications.isConfigured()) return;
    await Notifications._registerToken(eventId, userId);
  },

  // ─── NOTIFICA LOCALE ──────────────────────────────────────
  async showLocal(title, body, options = {}) {
    if (Notification.permission !== 'granted') return;
    if (!window._swRegistration) return;

    await window._swRegistration.showNotification(title, {
      body,
      icon:    '/icon192.png',
      badge:   '/icon72.png',
      vibrate: [100, 50, 100],
      tag:     options.tag || 'wego',
      data:    options.data || {},
      ...options
    });
  },

  // ─── NOTIFICA NUOVA SPESA ─────────────────────────────────
  async notifyNewExpense(expense, eventTitle, payerName) {
    await Notifications.showLocal(
      `Nuova spesa — ${Utils.escapeHtml(eventTitle)}`,
      `${payerName} ha aggiunto "${expense.title}" (${Utils.formatAmount(expense.amount)})`,
      {
        tag:  `expense-${expense.id}`,
        data: { url: `/evento.html?id=${expense.event_id}`, expense_id: expense.id }
      }
    );
  },

  // ─── NOTIFICA SALDO SALDATO ───────────────────────────────
  async notifySettled(fromName, toName, amount, eventTitle) {
    await Notifications.showLocal(
      `Pagamento ricevuto — ${Utils.escapeHtml(eventTitle)}`,
      `${fromName} ha saldato ${Utils.formatAmount(amount)} a ${toName}`,
      { tag: 'payment-settled' }
    );
  },

  // ─── HELPER VAPID ─────────────────────────────────────────
  _urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const output  = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      output[i] = rawData.charCodeAt(i);
    }
    return output;
  },

  // ─── STATUS ───────────────────────────────────────────────
  getStatus() {
    return {
      configured:  Notifications.isConfigured(),
      permission:  Notification.permission || 'unknown',
      initialized: Notifications._initialized,
      hasToken:    !!Notifications._token
    };
  }
};

window.Notifications = Notifications;
