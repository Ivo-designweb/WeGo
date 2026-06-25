// ═══════════════════════════════════════════════════════════════
// WeGo — license.js v1.2
// Gestione del livello di abilitazione del dispositivo: 'base' (default,
// gratuito) oppure 'pro' (soluzione completa, abilitata dall'admin).
//
// v1.2: Fase 4 — downgrade Pro→Base (disabilitazione admin o scadenza):
//       checkRemoteStatus() ora, quando rileva un VERO downgrade (era
//       'pro', ora è 'base') con più eventi di quanti la versione Base ne
//       permetta, NON cancella nulla in automatico — imposta solo un
//       flag (license_downgrade_pending) e ricarica la pagina, che alla
//       riapertura mostrerà renderDowngradeGateIfNeeded() (schermata
//       bloccante, richiamata da app.js/evento.js appena dopo DB.open()):
//       l'utente scegli "mantieni solo l'evento più vecchio" (cancella
//       tutti gli altri, sul server per i creati, scollegamento per i
//       collegati) oppure "richiedi una nuova abilitazione" (nessuna
//       cancellazione, resta bloccato finché non viene riabilitato).
// v1.1: Fase 2 — infrastruttura di richiesta/abilitazione:
//       getDeviceId() (delega a Utils.getDeviceId(), già esistente),
//       requestPro() (invia/accoda la richiesta su sp_device_license —
//       vedi supabase.js v1.7), checkRemoteStatus() (confronta lo stato
//       remoto con il tier locale e lo aggiorna — richiamato da
//       Sync.push(), vedi sync.js v1.8).
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
          return;
        }

        // Downgrade VERO (era pro, ora è base — disabilitazione admin o
        // scadenza superata, vedi situazione.md §5bis Fase 4). Non
        // cancelliamo nulla qui: se il device ha più eventi di quanti la
        // versione Base ne permetta, ci limitiamo a segnalarlo con un
        // flag e a ricaricare — la scelta (quale evento tenere, o
        // richiedere una nuova abilitazione) la fa l'utente nella
        // schermata bloccante (renderDowngradeGateIfNeeded(), richiamata
        // da app.js/evento.js appena dopo DB.open()).
        if (typeof DB === 'undefined') return;
        const events = await DB.events.getAll().catch(() => []);
        if (events.length > License.LIMITS.base.maxEvents) {
          Utils.setConfig('license_downgrade_pending', true);
          window.location.reload();
        }
      }
    } catch (e) {
      console.warn('[License] checkRemoteStatus error:', e);
    }
  },

  // ─── DOWNGRADE PRO→BASE (Fase 4) ──────────────────────────
  /**
   * Se questo device ha appena perso la versione Pro (vedi
   * checkRemoteStatus()) e ha più eventi di quanti la versione Base ne
   * permetta, mostra una schermata bloccante a schermo intero — invece
   * di cancellare automaticamente qualsiasi cosa — e chiede all'utente
   * di scegliere. Va richiamata come PRIMA cosa (subito dopo DB.open())
   * nell'init() di App (index.html) ed EventoApp (evento.html).
   * Ritorna true se ha mostrato il blocco — il chiamante deve fermare lì
   * la propria inizializzazione; false se non c'è nulla da mostrare (caso
   * normale, quasi sempre).
   */
  async renderDowngradeGateIfNeeded() {
    if (!Utils.getConfig('license_downgrade_pending', false)) return false;
    if (typeof DB === 'undefined') return false;

    let events;
    try { events = await DB.events.getAll(); } catch { events = []; }

    // Nel frattempo l'utente potrebbe aver già eliminato eventi a
    // sufficienza per sua iniziativa: in tal caso non c'è più nulla da
    // chiedere, puliamo il flag e lasciamo proseguire l'app normalmente.
    if (events.length <= License.LIMITS.base.maxEvents) {
      Utils.setConfig('license_downgrade_pending', false);
      return false;
    }

    // L'evento più vecchio (creato o collegato — la data che conta è
    // created_at, cioè da quando è comparso su QUESTO device) resta;
    // tutti gli altri vengono proposti per la rimozione.
    const sorted = [...events].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const keep   = sorted[0];
    const remove = sorted.slice(1);

    License._buildDowngradeOverlay(keep, remove);
    return true;
  },

  _buildDowngradeOverlay(keep, remove) {
    if (document.getElementById('downgradeGate')) return; // già mostrata

    const esc  = (s) => (typeof Utils !== 'undefined' ? Utils.escapeHtml(s || '') : String(s || ''));
    const list = remove.map(e => `<li style="margin-bottom:3px;">${esc(e.title) || 'Senza titolo'}</li>`).join('');

    const overlay = document.createElement('div');
    overlay.id = 'downgradeGate';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:1000;background:var(--bg-primary);' +
      'display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto;';

    overlay.innerHTML = `
      <div style="width:100%;max-width:380px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--r-lg);padding:24px 22px;margin:auto;">
        <div style="width:46px;height:46px;border-radius:50%;background:rgba(245,158,11,0.12);display:flex;align-items:center;justify-content:center;margin:0 auto 14px;">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
        </div>
        <div style="font-size:17px;font-weight:700;color:var(--text-primary);text-align:center;margin-bottom:6px;">Versione Pro terminata</div>
        <p style="font-size:13.5px;color:var(--text-secondary);line-height:1.5;text-align:center;margin-bottom:16px;">
          La versione Pro di questo dispositivo non è più attiva. Con la versione Base puoi avere un solo evento attivo — scegli come continuare.
        </p>
        <div style="background:var(--bg-input);border-radius:var(--r-md);padding:11px 14px;margin-bottom:12px;">
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px;">Resterebbe attivo (il più vecchio):</div>
          <div style="font-size:14px;font-weight:700;color:var(--green);">✓ ${esc(keep.title) || 'Senza titolo'}</div>
        </div>
        <div style="background:var(--bg-input);border-radius:var(--r-md);padding:11px 14px;margin-bottom:18px;">
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:5px;">Verrebbero eliminati (${remove.length}):</div>
          <ul style="font-size:13.5px;color:var(--text-primary);padding-left:18px;margin:0;max-height:120px;overflow-y:auto;">${list}</ul>
        </div>
        <button class="btn btn--primary btn--full" id="downgradeConfirmBtn" style="margin-bottom:8px;">
          Conferma — mantieni solo questo evento
        </button>
        <button class="btn btn--ghost btn--full" id="downgradeRequestBtn">Richiedi una nuova abilitazione</button>
        <p id="downgradeRequestNote" style="display:none;font-size:12.5px;color:var(--green);text-align:center;margin-top:10px;line-height:1.5;">
          Richiesta inviata. Puoi chiudere l'app e riaprirla con calma: se nel frattempo verrai abilitato, non perderai nulla.
        </p>
      </div>
    `;

    document.body.appendChild(overlay);
    document.getElementById('downgradeConfirmBtn').addEventListener('click', () => License._confirmDowngradeCleanup(keep, remove));
    document.getElementById('downgradeRequestBtn').addEventListener('click', () => License._requestProFromGate());
  },

  async _confirmDowngradeCleanup(keep, remove) {
    const btn1 = document.getElementById('downgradeConfirmBtn');
    const btn2 = document.getElementById('downgradeRequestBtn');
    if (btn1) { btn1.disabled = true; btn1.textContent = 'Eliminazione in corso…'; }
    if (btn2) btn2.disabled = true;

    for (const ev of remove) {
      try {
        await License._removeEventLocally(ev);
      } catch (e) {
        console.warn('[License] Errore rimozione evento in downgrade:', ev.id, e);
      }
    }

    Utils.setConfig('license_downgrade_pending', false);
    if (Utils.isOnline() && typeof Sync !== 'undefined') {
      Sync.push().catch(() => {});
    }

    Utils.toast(`Versione Base attiva — è rimasto solo "${keep.title || 'l\'evento'}"`, 'success', 5000);
    window.location.reload();
  },

  /**
   * Rimuove un evento dal device durante la pulizia di downgrade, con lo
   * STESSO comportamento già usato altrove nell'app (nessuna nuova
   * logica): se creato su questo device, cancellazione completa anche
   * dal server (come App.confirmDeleteFromMenu in app.js — cascata già
   * presente nello schema SQL); se a cui ci si era solo uniti,
   * scollegamento locale completo con pulizia del proprio stato
   * "connesso" sul server (come App.leaveEvent in app.js) — i dati del
   * gruppo restano intatti per gli altri partecipanti.
   */
  async _removeEventLocally(ev) {
    if (ev.is_mine) {
      await DB.events.delete(ev.id);
      DB.sessions.remove(ev.id);
      await DB.pending.add({ type: 'delete_event', payload: { eventId: ev.id } });
      if (localStorage.getItem('wego_last_event_id') === ev.id) {
        localStorage.removeItem('wego_last_event_id');
      }
      return;
    }

    const session  = DB.sessions.get(ev.id);
    const myUserId = session?.userId || null;
    const myUserSnapshot = myUserId ? await DB.users.getById(myUserId) : null;

    DB.sessions.remove(ev.id);

    const users = await DB.users.getByEvent(ev.id);
    for (const u of users) await DB.users.delete(u.id);

    const expenses = await DB.expenses.getByEvent(ev.id);
    for (const ex of expenses) {
      await DB.photos.delete(ex.id).catch(() => {});
      await DB.expenses.hardDelete(ex.id);
    }

    const payments = await DB.payments.getByEvent(ev.id);
    for (const p of payments) await DB.payments.delete(p.id);

    await DB.events.delete(ev.id);

    if (localStorage.getItem('wego_last_event_id') === ev.id) {
      localStorage.removeItem('wego_last_event_id');
    }

    if (myUserSnapshot) {
      const clearedUser = { ...myUserSnapshot, joined_at: null };
      try {
        if (Utils.isOnline() && typeof SupabaseClient !== 'undefined') {
          await SupabaseClient.users.update(clearedUser);
        } else {
          await DB.pending.add({ type: 'clear_joined', payload: { user: clearedUser } });
        }
      } catch {
        await DB.pending.add({ type: 'clear_joined', payload: { user: clearedUser } }).catch(() => {});
      }
    }
  },

  async _requestProFromGate() {
    const btn2 = document.getElementById('downgradeRequestBtn');
    const note = document.getElementById('downgradeRequestNote');
    if (btn2) { btn2.disabled = true; btn2.textContent = 'Invio…'; }
    try {
      const savedNick = Utils.getConfig('default_nickname', '') || Utils.getConfig('nickname', '');
      await License.requestPro(savedNick || null);
      if (note) note.style.display = 'block';
      if (btn2) btn2.textContent = 'Richiesta inviata ✓';
      // NESSUNA cancellazione e nessuna ricarica: l'utente resta sulla
      // schermata bloccante finché non sceglie "Conferma" oppure finché
      // un prossimo avvio dell'app non rileva che è stato riabilitato
      // (checkRemoteStatus() pulisce automaticamente il flag in quel caso
      // tramite il normale confronto newTier !== wasTier).
    } catch (e) {
      Utils.toast('Errore invio richiesta: ' + e.message, 'error');
      if (btn2) { btn2.disabled = false; btn2.textContent = 'Richiedi una nuova abilitazione'; }
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
  },

  // ─── BADGE "PRO N" IN HOME (Fase 4) ────────────────────────
  /**
   * Aggiorna l'elemento badge "Pro N" in home (in alto a destra) con gli
   * eventi Pro ancora disponibili — N = 100 - eventi CREATI da questo
   * device (i collegati non contano, vedi countMyEvents()/eventsRemaining()).
   * Nascosto del tutto se il device è in versione Base. Richiamata da
   * App._render() in app.js — solo index.html.
   */
  async renderProBadge(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    if (!License.isPro()) { el.style.display = 'none'; return; }
    const remaining = await License.eventsRemaining();
    el.textContent = `Pro ${remaining}`;
    el.style.display = '';
  }
};

window.License = License;
