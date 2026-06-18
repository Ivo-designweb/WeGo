// ═══════════════════════════════════════════════════════════════
// WeGo — sync.js v1.3
// Gestione sincronizzazione bidirezionale con Supabase
// ═══════════════════════════════════════════════════════════════

const Sync = {

  _isSyncing: false,

  // ─── PUSH (locale → Supabase) ─────────────────────────────
  async push() {
    if (Sync._isSyncing) return;
    if (!Utils.isOnline()) return;
    if (!SupabaseClient.isConfigured()) return;

    Sync._isSyncing = true;
    Sync._showBar('Sincronizzazione in corso…');

    try {
      const pendingOps = await DB.pending.getAll();
      console.log(`[Sync] Push: ${pendingOps.length} operazioni pending`);

      for (const op of pendingOps) {
        try {
          await Sync._executePending(op);
          await DB.pending.remove(op.id);
        } catch (e) {
          console.warn('[Sync] Pending op failed:', op.type, e.message);
          // Incrementa retry (non blocca le altre)
        }
      }

      // Sync spese non sincronizzate
      const unsyncedExp = await DB.expenses.getUnsyced();
      for (const exp of unsyncedExp) {
        try {
          await Sync._syncExpense(exp);
          exp.synced = true;
          await DB.expenses.save(exp);
        } catch (e) {
          console.warn('[Sync] Expense sync failed:', exp.id, e.message);
        }
      }

      // Sync pagamenti non sincronizzati
      const unsyncedPay = await DB.payments.getUnsyced();
      for (const pay of unsyncedPay) {
        try {
          await Sync._syncPayment(pay);
          pay.synced = true;
          await DB.payments.save(pay);
        } catch (e) {
          console.warn('[Sync] Payment sync failed:', pay.id, e.message);
        }
      }

    } finally {
      Sync._isSyncing = false;
      Sync._hideBar();
    }
  },

  async _executePending(op) {
    const { type, payload } = op;
    switch (type) {
      case 'create_event': {
        await SupabaseClient.events.create(payload.event);
        // Crea tutti gli utenti iniziali (creatore + eventuali invitati),
        // uno alla volta e in ordine, SOLO dopo che l'evento esiste già su
        // Supabase (altrimenti la foreign key event_id fallirebbe).
        // payload.users è il formato attuale; payload.user è il fallback
        // per compatibilità con operazioni pending salvate da versioni precedenti.
        const initialUsers = Array.isArray(payload.users) && payload.users.length
          ? payload.users
          : [payload.user];
        for (const u of initialUsers) {
          await SupabaseClient.users.create(u);
        }
        await DB.events.markSynced(payload.event.id);
        break;
      }
      case 'update_event':
        await SupabaseClient.events.update(payload.event);
        break;
      case 'create_user':
        await SupabaseClient.users.create(payload.user);
        break;
      case 'delete_user':
        await SupabaseClient.users.delete(payload.userId);
        break;
      case 'delete_event':
        await SupabaseClient.events.delete(payload.eventId);
        break;
      default:
        console.warn('[Sync] Unknown pending type:', type);
    }
  },

  async _syncExpense(exp) {
    // Controlla se esiste su Supabase
    const remote = await SupabaseClient.expenses.getByEvent(exp.event_id);
    const exists  = Array.isArray(remote) && remote.some(r => r.id === exp.id);

    if (exp.deleted) {
      if (exists) await SupabaseClient.expenses.delete(exp.id);
    } else if (exists) {
      await SupabaseClient.expenses.update(exp);
    } else {
      await SupabaseClient.expenses.create(exp);
    }
  },

  async _syncPayment(pay) {
    // Controlla se esiste su Supabase
    const remote = await SupabaseClient.payments.getByEvent(pay.event_id);
    const exists = Array.isArray(remote) && remote.some(r => r.id === pay.id);

    if (pay.deleted) {
      if (exists) await SupabaseClient.payments.delete(pay.id);
    } else if (exists) {
      await SupabaseClient.payments.update(pay);
    } else {
      await SupabaseClient.payments.create(pay);
    }
  },

  // ─── PULL (Supabase → locale) ─────────────────────────────
  async pull() {
    if (!Utils.isOnline()) return;
    if (!SupabaseClient.isConfigured()) return;

    const sessions = DB.sessions.getAll();
    const eventIds = Object.keys(sessions);
    if (eventIds.length === 0) return;

    console.log(`[Sync] Pull: ${eventIds.length} eventi`);

    for (const eventId of eventIds) {
      try {
        await Sync.pullEvent(eventId);
      } catch (e) {
        console.warn('[Sync] Pull event failed:', eventId, e.message);
      }
    }
  },

  async pullEvent(eventId) {
    if (!SupabaseClient.isConfigured()) return;

    // Evento
    const remoteEvent = await SupabaseClient.events.getById(eventId);
    if (!remoteEvent) return;

    const localEvent = await DB.events.getById(eventId);
    if (!localEvent ||
        new Date(remoteEvent.updated_at) > new Date(localEvent.updated_at)) {
      await DB.events.save({
        ...(localEvent || {}),
        ...remoteEvent,
        synced: true
      });
    }

    // Utenti
    const remoteUsers = await SupabaseClient.users.getByEvent(eventId);
    if (Array.isArray(remoteUsers)) {
      for (const ru of remoteUsers) {
        const lu = await DB.users.getById(ru.id);
        if (!lu || new Date(ru.updated_at) > new Date(lu.updated_at)) {
          await DB.users.save({ ...(lu || {}), ...ru, synced: true });
        }
      }
    }

    // Spese
    const remoteExp = await SupabaseClient.expenses.getByEvent(eventId);
    if (Array.isArray(remoteExp)) {
      for (const re of remoteExp) {
        const le = await DB.expenses.getById(re.id);
        if (!le || new Date(re.updated_at) > new Date(le.updated_at)) {
          // Ricostruisce location da colonne separate
          const location = (re.location_lat && re.location_lng)
            ? { lat: re.location_lat, lng: re.location_lng, address: re.location_address || '' }
            : null;

          await DB.expenses.save({
            ...(le || {}),
            ...re,
            location,
            synced: true
          });
        }
      }
    }

    // Pagamenti saldati
    const remotePay = await SupabaseClient.payments.getByEvent(eventId);
    if (Array.isArray(remotePay)) {
      for (const rp of remotePay) {
        const lp = await DB.payments.getById(rp.id);
        if (!lp || new Date(rp.updated_at) > new Date(lp.updated_at)) {
          await DB.payments.save({ ...(lp || {}), ...rp, synced: true });
        }
      }
    }
  },

  // ─── CERCA EVENTO PER CODICE ──────────────────────────────
  async findEventByCode(code) {
    if (!Utils.isOnline() || !SupabaseClient.isConfigured()) return null;
    try {
      return await SupabaseClient.events.findByCode(code);
    } catch (e) {
      console.warn('[Sync] findEventByCode error:', e);
      return null;
    }
  },

  // ─── BACKGROUND SYNC (via SW) ─────────────────────────────
  async requestBackgroundSync() {
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      try {
        const reg = await navigator.serviceWorker.ready;
        await reg.sync.register('wego-sync');
        console.log('[Sync] Background sync registered');
      } catch (e) {
        console.warn('[Sync] Background sync not available:', e);
      }
    }
  },

  // ─── UI HELPERS ───────────────────────────────────────────
  _showBar(text = 'Sincronizzazione…') {
    const bar = document.getElementById('syncBar');
    const txt = document.getElementById('syncBarText');
    if (bar) bar.classList.remove('hidden');
    if (txt) txt.textContent = text;
  },

  _hideBar() {
    const bar = document.getElementById('syncBar');
    if (bar) bar.classList.add('hidden');
  }
};

window.Sync = Sync;
