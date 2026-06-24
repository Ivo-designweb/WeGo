// ═══════════════════════════════════════════════════════════════
// WeGo — license.js v1.1
// Gestione del livello di abilitazione del dispositivo: 'base' (default,
// gratuito) oppure 'pro' (soluzione completa, abilitata dall'admin).
//
// v1.1: Fase 2 — infrastruttura di richiesta/abilitazione:
//       getDeviceId() (delega a Utils.getDeviceId(), già esistente),
//       requestPro() (invia/accoda la richiesta su sp_device_license —
//       vedi supabase.js v1.7), checkRemoteStatus() (confronta lo stato
//       remoto con il tier locale e lo aggiorna — richiamato da
//       Sync.push(), vedi sync.js v1.8). NOTA: qui aggiorniamo SOLO il
//       tier locale; la schermata bloccante di downgrade Pro→Base con
//       eventuale pulizia eventi in eccesso arriva nella Fase 4 (non
//       ancora implementata).
// v1.0: introduzione tier 'base'/'pro' e relativi limiti:
//       - Base:  1 evento totale (creato o collegato), max 15
//                partecipanti per evento creato, niente sincronizzazione
//                foto (copertina evento + foto movimenti)
//       - Pro:   max 100 eventi CREATI (i collegati non contano), max 50
//                partecipanti per evento creato, foto sincronizzate
// ═══════════════════════════════════════════════════════════════

const License = {

  LIMITS: {
    base: { maxEvents: 1,   maxParticipants: 15, photoSync: false },
    pro:  { maxEvents: 100, maxParticipants: 50, photoSync: true  }
  },

  // ─── TIER CORRENTE ────────────────────────────────────────
  /**
   * Tier corrente di QUESTO device — 'base' o 'pro'. Salvato in
   * localStorage (wego_config → license_tier), stesso meccanismo già
   * usato per "owner_device". Default sempre 'base' se non impostato.
   */
  getTier() {
    return Utils.getConfig('license_tier', 'base') === 'pro' ? 'pro' : 'base';
  },

  isPro() {
    return License.getTier() === 'pro';
  },

  getLimits() {
    return License.LIMITS[License.getTier()];
  },

  /**
   * Imposta il tier locale. Richiamata da checkRemoteStatus() dopo aver
   * verificato lo stato su sp_device_license.
   */
  setTier(tier) {
    Utils.setConfig('license_tier', tier === 'pro' ? 'pro' : 'base');
  },

  // ─── IDENTITÀ DISPOSITIVO ─────────────────────────────────
  /**
   * Identificativo univoco di QUESTO device. Delega a Utils.getDeviceId()
   * (già esistente e già mostrato in Impostazioni → Generale → "Device
   * ID", con bottone Copia) invece di generarne uno separato — un solo
   * ID per device in tutta l'app. NON è un identificativo hardware reale
   * (una PWA non può leggerne uno: il browser non lo permette) — è
   * legato a questa installazione del browser, e si "perde" solo
   * cancellando i dati del sito o disinstallando/reinstallando la PWA.
   */
  getDeviceId() {
    return Utils.getDeviceId();
  },

  /**
   * true se una data di scadenza è così lontana nel tempo da poter essere
   * mostrata all'utente come "nessuna scadenza" (oltre 20 anni da oggi).
   */
  looksUnlimited(iso) {
    if (!iso) return false;
    const years = (new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 365);
    return years > 20;
  },

  /** Data di scadenza della licenza Pro corrente (cache locale, solo informativa). */
  getExpiresAt() {
    return Utils.getConfig('license_expires_at', null);
  },

  // ─── RICHIESTA ABILITAZIONE (Fase 2) ──────────────────────
  /**
   * Invia (o accoda se offline) la richiesta di abilitazione alla
   * versione Pro per questo device. `label` è una nota libera (es. il
   * nickname dell'utente) per aiutare l'admin a riconoscere la richiesta
   * nel pannello — vedi admin.html (Fase 3).
   * Tentativo diretto se online (funziona anche su pagine che non
   * caricano sync.js, es. impostazioni.html); altrimenti l'operazione
   * resta in coda (DB.pending) e verrà inviata dal normale ciclo di
   * sincronizzazione la prossima volta che l'app è online (vedi sync.js
   * → _executePending 'request_device_license').
   */
  async requestPro(label) {
    const deviceId = License.getDeviceId();
    const payload  = { device_id: deviceId, label: label || null };

    if (typeof Utils !== 'undefined' && Utils.isOnline() &&
        typeof SupabaseClient !== 'undefined' && SupabaseClient.isConfigured()) {
      try {
        await SupabaseClient.deviceLicense.request(payload.device_id, payload.label);
        return deviceId;
      } catch (e) {
        console.warn('[License] requestPro diretto fallito, lo accodo:', e.message);
      }
    }
    if (typeof DB !== 'undefined' && DB.pending) {
      await DB.pending.add({ type: 'request_device_license', payload });
    }
    return deviceId;
  },

  /**
   * Confronta lo stato remoto (sp_device_license) con il tier locale e lo
   * aggiorna di conseguenza. Richiamata da Sync.push() ad ogni ciclo di
   * sincronizzazione (come _refreshGatedEvents per gli eventi esterni) —
   * zero overhead extra oltre a una singola query.
   * NOTA (Fase 2): qui aggiorniamo SOLO il tier locale. La gestione del
   * downgrade Pro→Base con eventuale pulizia degli eventi in eccesso
   * (schermata bloccante, vedi situazione.md §5bis Fase 4) non è ancora
   * implementata — per ora il device torna semplicemente a comportarsi
   * come "Base" per le azioni future, senza toccare nulla di esistente.
   */
  async checkRemoteStatus() {
    if (typeof SupabaseClient === 'undefined' || !SupabaseClient.isConfigured()) return;
    if (typeof Utils === 'undefined' || !Utils.isOnline()) return;

    try {
      const deviceId = License.getDeviceId();
      const row = await SupabaseClient.deviceLicense.getByDeviceId(deviceId);
      const effectivelyEnabled = !!(row && row.enabled && row.expires_at && new Date(row.expires_at) > new Date());
      const newTier = effectivelyEnabled ? 'pro' : 'base';
      const wasTier = License.getTier();

      if (effectivelyEnabled) {
        Utils.setConfig('license_expires_at', row.expires_at);
      } else {
        Utils.setConfig('license_expires_at', null);
      }

      if (newTier !== wasTier) {
        License.setTier(newTier);
        if (newTier === 'pro') {
          Utils.toast('Versione Pro abilitata ✓', 'success', 4000);
        }
        // Downgrade pro→base: vedi nota Fase 4 sopra — nessuna azione
        // distruttiva in questa fase, solo il tier locale cambia.
      }
    } catch (e) {
      console.warn('[License] checkRemoteStatus error:', e);
    }
  },

  // ─── CONTEGGIO EVENTI ─────────────────────────────────────
  /**
   * Eventi CREATI da questo device (events.is_mine === true, vedi db.js).
   * È il conteggio che vale per il tetto dei 100 eventi della versione
   * Pro — gli eventi a cui ci si è solo uniti NON contano.
   */
  async countMyEvents() {
    try {
      const all = await DB.events.getAll();
      return all.filter(e => e.is_mine).length;
    } catch (e) {
      console.warn('[License] countMyEvents error:', e);
      return 0;
    }
  },

  /**
   * TUTTI gli eventi presenti su questo device (creati o collegati) — è
   * il conteggio che vale per il tetto "1 evento totale" della versione
   * Base.
   */
  async countAllEvents() {
    try {
      const all = await DB.events.getAll();
      return all.length;
    } catch (e) {
      console.warn('[License] countAllEvents error:', e);
      return 0;
    }
  },

  /** Eventi Pro ancora disponibili (per il badge "Pro N" — fase successiva). */
  async eventsRemaining() {
    if (!License.isPro()) return null;
    const used = await License.countMyEvents();
    return Math.max(0, License.LIMITS.pro.maxEvents - used);
  },

  // ─── VERIFICHE DI LIMITE ──────────────────────────────────
  /**
   * true se questo device può CREARE un nuovo evento.
   * Base: conta TUTTI gli eventi presenti (creati+collegati), max 1.
   * Pro:  conta solo quelli creati da lui, max 100.
   */
  async canCreateEvent() {
    if (License.isPro()) {
      const mine = await License.countMyEvents();
      return mine < License.LIMITS.pro.maxEvents;
    }
    const all = await License.countAllEvents();
    return all < License.LIMITS.base.maxEvents;
  },

  /**
   * true se questo device può UNIRSI a un evento esistente.
   * Pro: nessun limite (i collegati non contano verso i 100).
   * Base: conta verso lo stesso unico slot totale (max 1 evento).
   */
  async canJoinEvent() {
    if (License.isPro()) return true;
    const all = await License.countAllEvents();
    return all < License.LIMITS.base.maxEvents;
  },

  /**
   * true se si può aggiungere un altro partecipante a un evento che ha
   * già `currentCount` persone. Il limite applicato è quello di QUESTO
   * device (chi aggiunge partecipanti è sempre il creatore dell'evento).
   */
  canAddParticipant(currentCount) {
    return currentCount < License.getLimits().maxParticipants;
  },

  /** true se questo device sincronizza le foto (copertina evento + movimenti). */
  photoSyncAllowed() {
    return License.getLimits().photoSync;
  },

  // ─── MESSAGGI STANDARD (coerenza testi in app.js/evento.js/spesa.js) ──
  msgMaxEvents() {
    return License.isPro()
      ? `Hai raggiunto il limite di ${License.LIMITS.pro.maxEvents} eventi creati della versione Pro.`
      : 'Con la versione Base puoi avere un solo evento attivo. Elimina o scollegati dall\'evento attuale per crearne un altro, oppure passa alla versione Pro (fino a 100 eventi).';
  },

  msgMaxParticipants() {
    const limits = License.getLimits();
    return License.isPro()
      ? `Limite di ${limits.maxParticipants} partecipanti raggiunto per questo evento (versione Pro).`
      : `Limite di ${limits.maxParticipants} partecipanti raggiunto (versione Base). Passa alla versione Pro per arrivare a 50.`;
  },

  msgPhotoLocked() {
    return 'Funzione prevista solo su versione Pro';
  }
};

window.License = License;
