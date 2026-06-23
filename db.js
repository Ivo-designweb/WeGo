// ═══════════════════════════════════════════════════════════════
// WeGo — db.js v1.5
// Gestione dati locali con IndexedDB (offline-first)
// v1.5: fix critico più ampio — lo stesso bug di events.save() (v1.4)
//       era presente anche in put() a livello generico (sovrascriveva
//       SEMPRE updated_at, neutralizzando di fatto anche il fix v1.4) e
//       in users.save()/expenses.save()/payments.save(). Corretti tutti.
//       Store "photos" riprogettato per la sincronizzazione delle foto
//       dei movimenti (sync_data, synced, markDeleted, markSynced,
//       getUnsynced) — vedi sync.js / supabase.js.
// v1.4: fix critico — events.save() sovrascriveva SEMPRE updated_at con
//       l'orario locale, anche quando arrivava un pull dal server col
//       valore reale. Rompeva il confronto "il server ha una versione più
//       recente?" non appena l'orologio del device superava quello di chi
//       aveva modificato l'evento: titolo/descrizione non si aggiornavano
//       più, nemmeno scollegandosi e ricollegandosi. Ora preserva
//       updated_at se passato esplicitamente.
// v1.3: aggiunta sincronizzazione selettiva per eventi esterni
//       (campi events.gated / events.sync_allowed, vedi sync.js)
// ═══════════════════════════════════════════════════════════════

const DB = (() => {
  const DB_NAME    = 'wego_db';
  const DB_VERSION = 1;
  let _db = null;

  // ─── SCHEMA ───────────────────────────────────────────────
  const STORES = {
    events:   { keyPath: 'id', indexes: ['code', 'created_at', 'updated_at'] },
    users:    { keyPath: 'id', indexes: ['event_id', 'name'] },
    expenses: { keyPath: 'id', indexes: ['event_id', 'created_at', 'paid_by', 'type'] },
    payments: { keyPath: 'id', indexes: ['event_id', 'from_user', 'to_user'] },
    pending:  { keyPath: 'id', indexes: ['type', 'created_at'] },  // operazioni offline da sincronizzare
    photos:   { keyPath: 'id', indexes: ['expense_id'] }           // foto locali
  };

  // ─── INIT ─────────────────────────────────────────────────
  function open() {
    return new Promise((resolve, reject) => {
      if (_db) { resolve(_db); return; }

      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        console.log('[DB] Upgrade to version', DB_VERSION);

        for (const [storeName, config] of Object.entries(STORES)) {
          if (!db.objectStoreNames.contains(storeName)) {
            const store = db.createObjectStore(storeName, { keyPath: config.keyPath });
            config.indexes.forEach(idx => {
              store.createIndex(idx, idx, { unique: false });
            });
            console.log(`[DB] Created store: ${storeName}`);
          }
        }
      };

      req.onsuccess = (e) => {
        _db = e.target.result;
        console.log('[DB] Opened WeGo DB');
        resolve(_db);
      };

      req.onerror = (e) => {
        console.error('[DB] Open error:', e.target.error);
        reject(e.target.error);
      };

      // Si verifica se un'altra tab/finestra ha una connessione aperta a una
      // versione precedente del DB. Non blocca l'app: la apertura resterà in
      // sospeso finché l'altra tab non si chiude, ma logghiamo per diagnosi.
      req.onblocked = () => {
        console.warn('[DB] Apertura bloccata da un\'altra tab aperta');
      };
    });
  }

  // ─── HELPERS ──────────────────────────────────────────────
  async function tx(storeNames, mode = 'readonly') {
    const db = await open();
    const stores = Array.isArray(storeNames) ? storeNames : [storeNames];
    const transaction = db.transaction(stores, mode);
    if (stores.length === 1) return transaction.objectStore(stores[0]);
    return stores.reduce((acc, s) => { acc[s] = transaction.objectStore(s); return acc; }, {});
  }

  function promisify(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = e => resolve(e.target.result);
      request.onerror   = e => reject(e.target.error);
    });
  }

  async function getAll(storeName, indexName = null, query = null) {
    const store = await tx(storeName);
    const target = indexName ? store.index(indexName) : store;
    return promisify(query ? target.getAll(query) : target.getAll());
  }

  async function getOne(storeName, key) {
    const store = await tx(storeName);
    return promisify(store.get(key));
  }

  async function put(storeName, item) {
    const store = await tx(storeName, 'readwrite');
    // FIX: prima sovrascriveva SEMPRE updated_at con l'orario locale, anche
    // quando il chiamante (es. *.save() dopo un pull) aveva già calcolato
    // correttamente il valore da preservare — questo neutralizzava del
    // tutto il fix v4.1 su events.save(), perché qualunque valore venisse
    // passato qui sotto veniva comunque rimpiazzato. Ora rispetta
    // l'updated_at già presente nell'item; lo imposta a "ora" SOLO se
    // manca del tutto (es. primissima creazione di un record).
    const record = item.updated_at !== undefined && item.updated_at !== null
      ? item
      : { ...item, updated_at: Utils.now() };
    return promisify(store.put(record));
  }

  async function remove(storeName, key) {
    const store = await tx(storeName, 'readwrite');
    return promisify(store.delete(key));
  }

  async function clear(storeName) {
    const store = await tx(storeName, 'readwrite');
    return promisify(store.clear());
  }

  // ─── EVENTS ───────────────────────────────────────────────
  const events = {
    async getAll() {
      return getAll('events');
    },

    async getByCode(code) {
      const all = await getAll('events', 'code', IDBKeyRange.only(code));
      return all[0] || null;
    },

    async getById(id) {
      return getOne('events', id);
    },

    async save(event) {
      const item = {
        id:          event.id || Utils.uuid(),
        code:        event.code || Utils.generateEventCode(),
        title:       event.title || '',
        description: event.description || '',
        photo:       event.photo || null,
        currency:    event.currency || Utils.getConfig('currency') || 'EUR',
        created_at:  event.created_at || Utils.now(),
        created_by:  event.created_by || null,
        // FIX: preserva updated_at se viene passato esplicitamente (es. da
        // Sync.pullEvent con il valore reale del server, o da saveEditEvent
        // che lo imposta a "ora" apposta). Prima veniva sempre sovrascritto
        // con l'orario LOCALE del device, anche durante un pull — questo
        // rompeva silenziosamente il confronto "il server ha una versione
        // più recente?" non appena l'orologio di questo device superava
        // quello del device che aveva fatto la modifica (bastava un minimo
        // di disallineamento tra i due orologi): i pull successivi
        // smettevano di funzionare per sempre su quell'evento, anche
        // scollegandosi e ricollegandosi, perché la nuova modifica remota
        // sembrava sempre "più vecchia" del falso updated_at locale.
        updated_at:  event.updated_at || Utils.now(),
        synced:      event.synced || false,
        archived:    event.archived || false,
        // ── SINCRONIZZAZIONE SELETTIVA EVENTI ESTERNI (v1.3) ──────
        // gated:true  = evento creato da un device "non proprietario": la
        //   sincronizzazione resta sospesa finché un admin non abilita il
        //   codice (vedi Sync._refreshGatedEvents in sync.js).
        // gated:false = evento del device proprietario, o evento legacy
        //   creato prima di questa versione: comportamento invariato,
        //   sempre sincronizzato come prima.
        // sync_allowed = permesso EFFETTIVO attuale di sincronizzare:
        //   per gli eventi non gated è sempre true; per quelli gated viene
        //   aggiornato in automatico da Sync in base allo stato remoto
        //   (tabella sp_sync_status).
        gated:        event.gated || false,
        sync_allowed: event.gated ? (event.sync_allowed || false) : true
      };
      await put('events', item);
      return item;
    },

    async delete(id) {
      return remove('events', id);
    },

    async markSynced(id) {
      const ev = await getOne('events', id);
      if (ev) { ev.synced = true; await put('events', ev); }
    },

    // Aggiorna solo il permesso di sincronizzazione (usato da Sync dopo
    // aver verificato lo stato su sp_sync_status), senza toccare gli altri
    // campi né forzare un nuovo invio di update_event.
    async setSyncAllowed(id, allowed) {
      const ev = await getOne('events', id);
      if (ev) { ev.sync_allowed = !!allowed; await put('events', ev); }
      return ev;
    }
  };

  // ─── USERS (partecipanti evento) ──────────────────────────
  const users = {
    async getByEvent(eventId) {
      return getAll('users', 'event_id', IDBKeyRange.only(eventId));
    },

    async getById(id) {
      return getOne('users', id);
    },

    async save(user) {
      const item = {
        id:         user.id || Utils.uuid(),
        event_id:   user.event_id,
        name:       user.name || '',
        color_idx:  user.color_idx ?? Utils.avatarColorIndex(user.name),
        created_at: user.created_at || Utils.now(),
        updated_at: user.updated_at || Utils.now(),
        synced:     user.synced || false,
        active:     user.active !== false,
        // Quando questo utente ha effettuato il "join" (selezionato il
        // proprio nome ed entrato nell'evento). null = invitato ma non
        // ancora connesso da nessun device. Va sincronizzato sul server
        // (sp_users.joined_at) per essere visibile da TUTTI i device,
        // non solo da quello su cui è avvenuto il join.
        joined_at:  user.joined_at || null,
        // Ultima volta che QUESTO utente (su un qualunque device) ha
        // completato una sincronizzazione dei dati dell'evento. Permette
        // agli altri partecipanti di capire se ha i dati aggiornati.
        last_sync_at: user.last_sync_at || null
      };
      await put('users', item);
      return item;
    },

    async delete(id) {
      return remove('users', id);
    },

    async getByEventAndName(eventId, name) {
      const all = await users.getByEvent(eventId);
      return all.find(u => u.name.toLowerCase() === name.toLowerCase()) || null;
    },

    async getUnsyced() {
      const all = await getAll('users');
      return all.filter(u => !u.synced);
    },

    async markSynced(id) {
      const u = await getOne('users', id);
      if (u) { u.synced = true; await put('users', u); }
    }
  };

  // ─── EXPENSES ─────────────────────────────────────────────
  const expenses = {
    async getByEvent(eventId) {
      return getAll('expenses', 'event_id', IDBKeyRange.only(eventId));
    },

    async getById(id) {
      return getOne('expenses', id);
    },

    async save(expense) {
      const item = {
        id:             expense.id || Utils.uuid(),
        event_id:       expense.event_id,
        type:           expense.type || 'expense',   // 'expense' | 'transfer'
        title:          expense.title || '',
        description:    expense.description || '',
        amount:         parseFloat(expense.amount) || 0,
        currency:       expense.currency || Utils.getConfig('currency') || 'EUR',
        paid_by:        expense.paid_by || null,     // userId
        paid_for:       expense.paid_for || null,    // userId (solo per 'transfer')
        participants:   expense.participants || [],  // [userId, ...]
        payment_method: expense.payment_method || 'contanti',
        date:           expense.date || Utils.today(),
        location:       expense.location || null,   // { lat, lng, address }
        has_photo:      expense.has_photo || false,
        notes:          expense.notes || '',
        settled:        expense.settled || false,
        created_at:     expense.created_at || Utils.now(),
        created_by:     expense.created_by || null,
        updated_at:     expense.updated_at || Utils.now(),
        synced:         expense.synced || false,
        deleted:        expense.deleted || false
      };
      await put('expenses', item);
      return item;
    },

    async delete(id) {
      // Soft delete per mantenere coerenza offline
      const exp = await getOne('expenses', id);
      if (exp) {
        exp.deleted = true;
        exp.synced  = false;
        await put('expenses', exp);
      }
    },

    async hardDelete(id) {
      return remove('expenses', id);
    },

    async getUnsyced() {
      const all = await getAll('expenses');
      return all.filter(e => !e.synced);
    }
  };

  // ─── PHOTOS ───────────────────────────────────────────────
  // ─── PHOTOS (foto dei movimenti) ───────────────────────────
  // "data" = versione qualità più alta, resta SOLO sul device di chi ha
  //   scattato la foto (non viene mai inviata al server).
  // "sync_data" = versione compatta (max 900px / qualità 60%, ~30-50KB)
  //   generata apposta per la sincronizzazione: questa sì viene inviata
  //   al server e scaricata dagli altri device (vedi sync.js).
  const photos = {
    async getByExpense(expenseId) {
      const all = await getAll('photos', 'expense_id', IDBKeyRange.only(expenseId));
      return all[0] || null;
    },

    async save(expenseId, base64Data, opts = {}) {
      const existing = await photos.getByExpense(expenseId);
      const item = {
        id:         `photo_${expenseId}`,
        expense_id: expenseId,
        data:       base64Data,
        sync_data:  opts.sync_data  !== undefined ? opts.sync_data  : (existing?.sync_data  ?? null),
        created_by: opts.created_by !== undefined ? opts.created_by : (existing?.created_by ?? null),
        created_at: existing?.created_at || Utils.now(),
        updated_at: opts.updated_at || Utils.now(),
        synced:     opts.synced !== undefined ? opts.synced : (existing?.synced ?? false)
      };
      await put('photos', item);
      return item;
    },

    // Segna la foto come eliminata e DA PROPAGARE al server (non la
    // rimuove subito da IndexedDB: se il device è offline in questo
    // momento, la cancellazione andrebbe persa — resta in coda finché
    // Sync.push() non riesce a inviarla, esattamente come le altre
    // entità soft-delete).
    async markDeleted(expenseId) {
      const existing = await photos.getByExpense(expenseId);
      if (!existing) return;
      existing.data      = null;
      existing.sync_data = null;
      existing.synced    = false;
      existing.updated_at = Utils.now();
      await put('photos', existing);
    },

    async markSynced(expenseId, syncData) {
      const existing = await photos.getByExpense(expenseId);
      if (existing) {
        existing.synced = true;
        if (syncData !== undefined) existing.sync_data = syncData;
        await put('photos', existing);
      }
    },

    async getUnsynced() {
      const all = await getAll('photos');
      return all.filter(p => !p.synced);
    },

    // Rimozione locale "fisica" — solo per pulizia (es. l'intero evento
    // viene rimosso dal device) o dopo che il record collegato non esiste
    // più: NON propaga nulla al server, usare markDeleted() per quello.
    async delete(expenseId) {
      return remove('photos', `photo_${expenseId}`);
    }
  };

  // ─── PAYMENTS (saldi saldati) ──────────────────────────────
  const payments = {
    async getByEvent(eventId) {
      const all = await getAll('payments', 'event_id', IDBKeyRange.only(eventId));
      return all.filter(p => !p.deleted);
    },

    async getById(id) {
      return getOne('payments', id);
    },

    async save(payment) {
      const item = {
        id:         payment.id || Utils.uuid(),
        event_id:   payment.event_id,
        from_user:  payment.from_user,
        to_user:    payment.to_user,
        amount:     parseFloat(payment.amount) || 0,
        method:     payment.method || 'contanti',
        note:       payment.note || '',
        date:       payment.date || Utils.today(),
        deleted:    payment.deleted || false,
        created_at: payment.created_at || Utils.now(),
        updated_at: payment.updated_at || Utils.now(),
        synced:     payment.synced || false
      };
      await put('payments', item);
      return item;
    },

    async delete(id) {
      // Soft delete per mantenere coerenza offline
      const pay = await getOne('payments', id);
      if (pay) {
        pay.deleted = true;
        pay.synced  = false;
        pay.updated_at = Utils.now();
        await put('payments', pay);
      }
    },

    async getUnsyced() {
      const all = await getAll('payments');
      return all.filter(p => !p.synced);
    }
  };

  // ─── PENDING QUEUE (operazioni offline) ───────────────────
  const pending = {
    async add(operation) {
      const item = {
        id:         Utils.uuid(),
        type:       operation.type,   // 'create_event','update_event','create_expense', etc.
        payload:    operation.payload,
        created_at: Utils.now(),
        retries:    0
      };
      await put('pending', item);
      return item;
    },

    async getAll() {
      return getAll('pending');
    },

    async remove(id) {
      return remove('pending', id);
    },

    async clear() {
      return clear('pending');
    },

    async count() {
      const all = await getAll('pending');
      return all.length;
    }
  };

  // ─── DEVICE SESSIONS (utente attivo per evento) ───────────
  const sessions = {
    /**
     * Salva l'associazione device→utente per un evento
     */
    set(eventId, userId, userName) {
      const sessions = Utils.getConfig('sessions') || {};
      sessions[eventId] = { userId, userName, at: Utils.now() };
      Utils.setConfig('sessions', sessions);
    },

    /**
     * Ottiene l'utente attivo per un evento
     */
    get(eventId) {
      const sessions = Utils.getConfig('sessions') || {};
      return sessions[eventId] || null;
    },

    /**
     * Rimuove la sessione per un evento
     */
    remove(eventId) {
      const sessions = Utils.getConfig('sessions') || {};
      delete sessions[eventId];
      Utils.setConfig('sessions', sessions);
    },

    /**
     * Lista tutti gli eventi a cui il device è collegato
     */
    getAll() {
      return Utils.getConfig('sessions') || {};
    }
  };

  // ─── EXPORT ───────────────────────────────────────────────
  return { open, events, users, expenses, photos, payments, pending, sessions };
})();

window.DB = DB;
