// ═══════════════════════════════════════════════════════════════
// WeGo — license.js v1.0  (NUOVO FILE)
// Gestione del livello di abilitazione del dispositivo: 'base' (default,
// gratuito) oppure 'pro' (soluzione completa, abilitata dall'admin).
//
// v1.0: introduzione tier 'base'/'pro' e relativi limiti:
//       - Base:  1 evento totale (creato o collegato), max 15
//                partecipanti per evento creato, niente sincronizzazione
//                foto (copertina evento + foto movimenti)
//       - Pro:   max 100 eventi CREATI (i collegati non contano), max 50
//                partecipanti per evento creato, foto sincronizzate
// In questa fase il tier è sempre 'base': il meccanismo di richiesta/
// abilitazione lato server (sp_device_license, admin.html) e il
// controllo periodico di scadenza arriveranno nella fase successiva
// (vedi situazione.md §11) — License.setTier() è già pronto per essere
// richiamato da quel meccanismo senza dover toccare il resto dell'app.
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
   * Imposta il tier locale. Richiamata dal meccanismo di abilitazione
   * (fase successiva) dopo aver verificato lo stato su sp_device_license.
   */
  setTier(tier) {
    Utils.setConfig('license_tier', tier === 'pro' ? 'pro' : 'base');
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
