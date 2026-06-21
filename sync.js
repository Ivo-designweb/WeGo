// ═══════════════════════════════════════════════════════════════
// WeGo — sync.js v1.5
// Gestione sincronizzazione bidirezionale con Supabase
// v1.5: sincronizzazione selettiva per eventi esterni — un evento
//       "gated" (creato da un device non proprietario) non viene mai
//       inviato a Supabase finché il suo codice non è abilitato da un
//       admin (vedi admin.html / sp_sync_status). Vedi _refreshGatedEvents,
//       _isEventSyncAllowed, _pendingEventId qui sotto.
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
      // Prima di tutto: per gli eventi "gated" (creati da un device non
      // proprietario) verifica se nel frattempo un admin li ha abilitati
      // (o disabilitati di nuovo) su sp_sync_status. Per gli eventi non
      // gated non fa nulla: zero query extra per l'uso normale.
      await Sync._refreshGatedEvents();

      const pendingOps = await DB.pending.getAll();
      console.log(`[Sync] Push: ${pendingOps.length} operazioni pending`);

      for (const op of pendingOps) {
        try {
          const eventId = Sync._pendingEventId(op);
          if (eventId && !(await Sync._isEventSyncAllowed(eventId))) {
            // Evento ancora in attesa di abilitazione: resta in coda,
            // non è un errore, semplicemente non lo inviamo ora.
            continue;
          }
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
          if (!(await Sync._isEventSyncAllowed(exp.event_id))) continue;
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
          if (!(await Sync._isEventSyncAllowed(pay.event_id))) continue;
          await Sync._syncPayment(pay);
          pay.synced = true;
          await DB.payments.save(pay);
        } catch (e) {
          console.warn('[Sync] Payment sync failed:', pay.id, e.message);
        }
      }

      // Sync utenti non sincronizzati (es. dopo il join: il flag joined_at
      // va spinto sul server, altrimenti gli altri device non sanno che
      // questa persona si è collegata).
      const unsyncedUsers = await DB.users.getUnsyced();
      for (const u of unsyncedUsers) {
        try {
          if (!(await Sync._isEventSyncAllowed(u.event_id))) continue;
          await Sync._syncUser(u);
          u.synced = true;
          await DB.users.save(u);
        } catch (e) {
          console.warn('[Sync] User sync failed:', u.id, e.message);
        }
      }

    } finally {
      Sync._isSyncing = false;
      Sync._hideBar();
    }
  },

  // ─── GATING EVENTI ESTERNI ─────────────────────────────────
  /**
   * Per ogni evento locale "gated" (creato da un device senza il codice
   * proprietario), verifica su sp_sync_status se è stato abilitato (o
   * disabilitato di nuovo) e aggiorna il permesso locale di conseguenza.
   * Non tocca in alcun modo gli eventi non gated (proprietario/legacy):
   * zero overhead per l'uso normale.
   */
  async _refreshGatedEvents() {
    let all = [];
    try { all = await DB.events.getAll(); } catch (e) { return; }
    const gated = all.filter(e => e.gated);
    if (!gated.length) return;

    for (const ev of gated) {
      try {
        const status = await SupabaseClient.syncStatus.getByCode(ev.code);
        const allowedNow = !!(status && status.enabled);
        if (allowedNow !== !!ev.sync_allowed) {
          await DB.events.setSyncAllowed(ev.id, allowedNow);
          if (allowedNow) {
            Utils.toast(`Evento "${ev.title}" abilitato alla sincronizzazione ✓`, 'success', 4000);
          }
        }
      } catch (e) {
        // Offline a metà ciclo, o tabella sp_sync_status non ancora creata
        // sul server: non blocca il resto della sincronizzazione.
        console.warn('[Sync] Verifica gating fallita per', ev.code, e.message);
      }
    }
  },

  /**
   * Permesso effettivo di sincronizzare un evento: true per qualunque
   * evento non gated (proprietario o legacy), altrimenti il valore
   * aggiornato da _refreshGatedEvents().
   */
  async _isEventSyncAllowed(eventId) {
    if (!eventId) return true;
    const ev = await DB.events.getById(eventId);
    if (!ev) return true; // evento non trovabile localmente: non blocchiamo
    if (!ev.gated) return true;
    return !!ev.sync_allowed;
  },

  /**
   * Estrae l'event_id collegato a un'operazione pending, per poterne
   * verificare il gating prima di eseguirla. 'register_sync_request' non
   * ha un evento da bloccare: è proprio il meccanismo che segnala il
   * codice all'admin, va sempre eseguito.
   */
  _pendingEventId(op) {
    const p = op.payload || {};
    switch (op.type) {
      case 'create_event':
      case 'update_event':       return p.event?.id || null;
      case 'delete_event':       return p.eventId || null;
      case 'create_user':        return p.user?.event_id || null;
      case 'delete_user':        return p.eventId || null;
      case 'clear_joined':       return p.user?.event_id || null;
      case 'register_sync_request': return null;
      default:                   return null;
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
          await DB.users.markSynced(u.id);
        }
        await DB.events.markSynced(payload.event.id);
        break;
      }
      case 'update_event':
        await SupabaseClient.events.update(payload.event);
        await DB.events.markSynced(payload.event.id);
        break;
      case 'create_user':
        await SupabaseClient.users.create(payload.user);
        await DB.users.markSynced(payload.user.id);
        break;
      case 'delete_user':
        await SupabaseClient.users.delete(payload.userId);
        break;
      case 'delete_event':
        await SupabaseClient.events.delete(payload.eventId);
        break;
      case 'clear_joined':
        // Bottone "Scollegati": rimuove lo stato di connessione di questo
        // utente anche sul server, così gli altri device lo vedono come
        // non connesso (il record locale è già stato eliminato a questo punto).
        await SupabaseClient.users.update(payload.user);
        break;
      case 'register_sync_request':
        // Segnala il codice evento sulla tabella sp_sync_status, così
        // admin.html può mostrarlo nella lista "in attesa" anche prima
        // che il creatore lo comunichi via WhatsApp. Non crea l'evento
        // sul server: è solo un avviso informativo, idempotente.
        await SupabaseClient.syncStatus.request(payload.code, payload.title, payload.createdBy);
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

  async _syncUser(user) {
    // Controlla se esiste già su Supabase (creato a sua volta dal creatore
    // dell'evento, o da un altro device) per decidere create vs update.
    const remote = await SupabaseClient.users.getByEvent(user.event_id);
    const exists = Array.isArray(remote) && remote.some(r => r.id === user.id);

    if (exists) {
      await SupabaseClient.users.update(user);
    } else {
      await SupabaseClient.users.create(user);
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

    // ─── ULTIMA PRESENZA (last_sync_at) ──────────────────────
    // Il pull è andato a buon fine: questo device ha appena ottenuto i
    // dati aggiornati di questo evento. Aggiorna sul server l'orario
    // dell'ultima sincronizzazione per l'utente di QUESTO device, così
    // gli altri partecipanti possono vedere (nella pagina Partecipanti)
    // se i suoi dati sono aggiornati. Aggiornamento diretto e "best
    // effort": non deve mai bloccare o far fallire il pull.
    try {
      const session = DB.sessions.get(eventId);
      if (session?.userId) {
        const me = await DB.users.getById(session.userId);
        if (me) {
          me.last_sync_at = Utils.now();
          me.synced = false;
          await DB.users.save(me);
          if (Utils.isOnline()) {
            await SupabaseClient.users.update(me);
            await DB.users.markSynced(me.id);
          }
        }
      }
    } catch (e) {
      console.warn('[Sync] Aggiornamento last_sync_at non riuscito:', e.message);
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
  // Non mostra più la barra arancione: evidenzia l'icona sync in header
  _showBar(text = 'Sincronizzazione…') {
    const icon = document.getElementById('syncIcon');
    if (icon) {
      icon.style.color     = 'var(--amber)';
      icon.style.animation = 'spin 0.8s linear infinite';
    }
  },

  _hideBar() {
    const icon = document.getElementById('syncIcon');
    if (icon) {
      icon.style.color     = '';
      icon.style.animation = '';
    }
  }
};

window.Sync = Sync;
