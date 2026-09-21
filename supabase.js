// ═══════════════════════════════════════════════════════════════
// WeGo — supabase.js v1.16
// Client Supabase — lettura config da localStorage
// v1.16: NUOVA tabella sp_notification_log — storico persistente di ogni
//        notifica push TENTATA (destinatario, evento/movimento, testo,
//        esito), scritta dalla Edge Function send-push-notification (v3)
//        ad ogni invio. Prima non esisteva NESSUNA traccia di chi avesse
//        effettivamente ricevuto una notifica: né il database né l'app
//        conservavano gli invii. Sola lettura da admin.html tramite il
//        nuovo /api/notification-log.js (stesso pattern di
//        device-license.js — password admin + SUPABASE_SERVICE_KEY; la
//        tabella non ha NESSUN privilegio per la anon key pubblica).
//        RIESEGUIRE lo schema da Admin → Schema SQL.
// v1.15: NUOVO campo expenses.updated_by (create/update/upsert) — chi ha
//        salvato per ultimo un movimento, distinto da created_by che
//        resta il proprietario originale. Necessario ora che modifica ed
//        eliminazione sono aperte a qualunque operatore (vedi spesa.js) —
//        serve per l'indicazione "(nome)" in lista Movimenti e per il
//        testo delle notifiche push di modifica/eliminazione. Nuova
//        colonna in SQL_SCHEMA (sp_expenses.updated_by, UUID, con ALTER
//        TABLE IF NOT EXISTS per le installazioni esistenti — RIESEGUIRE
//        lo schema da Admin → Schema SQL).
// v1.14: SICUREZZA (segnalazione Supabase: "accesso completo al DB con
//        la anon key") — ogni richiesta ora invia l'header
//        "x-wego-codes" con i codici degli eventi che il device conosce
//        legittimamente (_collectEventCodes(): eventi nel DB locale +
//        l'eventuale codice appena digitato nel flusso "unisciti",
//        _extraCode in findByCode). Lato server, NUOVA sezione RLS
//        nello SQL_SCHEMA (da rieseguire su Supabase! — vedi anche il
//        file sicurezza_rls.sql): Row Level Security su TUTTE le
//        tabelle, policy che permettono di leggere/scrivere SOLO le
//        righe degli eventi i cui codici sono nell'header — chiunque
//        altro, pur avendo la anon key (pubblica per design), non vede
//        e non tocca nulla. La service key (/api/, Vercel) bypassa RLS:
//        admin e licenze invariati. Verificato con PostgreSQL 16 reale:
//        senza header 0 righe, con codice si vede/scrive solo il
//        proprio evento, update/insert su eventi altrui bloccati,
//        auto-abilitazione licenza bloccata.
// v1.13: sincronizzazione incrementale (richiesta cliente — "troppo
//        lenta"): NUOVI users.upsert()/expenses.upsert()/
//        payments.upsert() — vero upsert PostgREST (POST +
//        'Prefer: resolution=merge-duplicates' + 'on_conflict=id') in
//        UNA sola richiesta, al posto del vecchio pattern in sync.js
//        "scarica TUTTI i record dell'evento solo per controllare se
//        questo esiste già" prima di scegliere create() o update().
//        NUOVO parametro "since" anche su users.getByEvent()/
//        payments.getByEvent() (expenses.getByEvent() lo aveva già, ma
//        non veniva mai usato) — filtra lato server via
//        "updated_at=gt.<since>", usato da sync.js v2.2 pullEvent() per
//        scaricare solo i record nuovi/modificati dall'ultimo pull
//        invece di rifare sempre un fetch completo. request() accetta
//        ora un 5° parametro preferHeader (default invariato,
//        'return=representation') per poter passare l'header Prefer
//        richiesto dall'upsert.
// v1.12: nuovo campo expenses.is_cassa_comune in expenses.create()/
//        update() — flag "Uso Cassa Comune" (vedi spesa.html/spesa.js
//        v2.7, db.js v1.9, utils.js v1.4 calculateCassaComune()).
//        Schema SQL: 1 nuova colonna (ALTER TABLE ADD COLUMN IF NOT EXISTS)
// v1.11: RIMOSSO il namespace "syncStatus" (request/getByCode) — la
//        sincronizzazione selettiva eventi esterni non esiste più (vedi
//        app.js v2.18/sync.js v2.0). La tabella sp_sync_status e
//        /api/sync-status.js restano sul server, semplicemente non più
//        usati da nessun file — non serve nessuna migrazione SQL.
// v1.10: FIX CRITICO — expenses.update() non inviava i campi "type" e
//        "paid_for" nel PATCH: cambiare il tipo di un movimento
//        esistente (es. Spesa → Trasf.) sembrava non salvarsi, perché
//        il pull successivo riscriveva sopra col vecchio type rimasto
//        sul server. Aggiunti entrambi i campi. Nessuna nuova colonna
//        SQL necessaria per "+Cassiere" (vedi spesa.js/evento.js): è
//        solo un nuovo valore della colonna "type" già esistente
//        (VARCHAR, nessun vincolo CHECK).
// v1.9: fix licenza foto per-evento — events.create()/update() inviano
//       ora anche photo_sync_enabled (vedi license.js v1.3/sync.js);
//       nuovi campi expenses.category e expenses.is_forecast (campo
//       "Tipo" e flag "Previsione") in expenses.create()/update().
//       Schema SQL: 3 nuove colonne (ALTER TABLE ADD COLUMN IF NOT EXISTS)
// v1.8: MODIFICA SICUREZZA — syncStatus.request() e deviceLicense.request()
//       non scrivono più direttamente su Supabase con la anon key:
//       passano da /api/sync-status.js e /api/device-license.js, che
//       usano una chiave server-only (SUPABASE_SERVICE_KEY). Schema SQL
//       aggiornato: la anon key ha ora SOLO il permesso SELECT su
//       sp_sync_status e sp_device_license (REVOKE espliciti per chi
//       aveva già eseguito lo schema precedente). getByCode()/
//       getByDeviceId() restano letture dirette, invariate.
// v1.7: licenza dispositivo (Fase 2, v4.4) — nuovo namespace
//       deviceLicense (request/getByDeviceId) + tabella sp_device_license
//       nello schema SQL. Vedi license.js / impostazioni.html / admin.html.
// v1.6: sincronizzazione foto movimenti — tabella sp_expense_photos +
//       namespace expensePhotos (upsert/delete/getByExpense/getByExpenseIds)
// v1.5: fix critico — sp_events non aveva la colonna "photo", ma
//       events.update() la inviava comunque in ogni PATCH: PostgREST
//       rifiutava l'INTERA richiesta (non solo il campo foto), quindi
//       titolo/descrizione non si aggiornavano mai sul server dopo una
//       modifica. Aggiunta colonna (ALTER TABLE) + events.create() ora
//       invia anche la foto (prima la ometteva sempre, anche alla
//       creazione).
// v1.4: aggiunta tabella sp_sync_status (sincronizzazione selettiva
//       eventi esterni — vedi sync.js / admin.html)
// ═══════════════════════════════════════════════════════════════

const SupabaseClient = (() => {
  let _url    = null;
  let _key    = null;

  // ─── SICUREZZA RLS (v1.14) ─────────────────────────────────
  // Codice evento "extra" da includere nell'header della prossima
  // richiesta anche se l'evento non è ancora nel DB locale — serve al
  // flusso "unisciti con codice" (findByCode), dove il codice è stato
  // appena digitato dall'utente ma l'evento non esiste ancora sul device.
  let _extraCode = null;

  // Raccoglie tutti i codici evento che QUESTO device conosce
  // legittimamente: quelli degli eventi già presenti in locale
  // (creati o a cui si è collegato) + l'eventuale codice appena
  // digitato (_extraCode). Vengono inviati al server nell'header
  // "x-wego-codes": le policy RLS lato Supabase (vedi SQL_SCHEMA in
  // fondo) permettono di leggere/scrivere SOLO le righe degli eventi
  // il cui codice è in questa lista — chiunque altro, pur avendo la
  // anon key (pubblica per design, chiavi.json), non può più leggere o
  // toccare nulla senza conoscere un codice evento valido.
  // Lettura da IndexedDB: locale e veloce (~ms), nessuna rete.
  async function _collectEventCodes() {
    const codes = new Set();
    if (_extraCode) codes.add(_extraCode);
    try {
      if (typeof DB !== 'undefined' && DB.events && DB.events.getAll) {
        const evs = await DB.events.getAll();
        evs.forEach(ev => { if (ev && ev.code) codes.add(ev.code); });
      }
    } catch (e) { /* DB non ancora aperto: header vuoto, richiesta comunque inviata */ }
    return [...codes];
  }
  let _client = null;

  /**
   * Carica le credenziali dalla configurazione
   */
  function loadConfig() {
    _url = Utils.getConfig('supabase_url');
    _key = Utils.getConfig('supabase_anon_key');
  }

  /**
   * Verifica se Supabase è configurato
   */
  function isConfigured() {
    loadConfig();
    return !!(
      _url &&
      _key &&
      _url.startsWith('https://') &&
      _url.includes('.supabase.co')
    );
  }

  /**
   * Esegue una richiesta REST Supabase
   */
  // NUOVO: parametro preferHeader (default invariato) — serve per gli
  // upsert() qui sotto, che usano 'resolution=merge-duplicates' al posto
  // del default 'return=representation' per fare un vero upsert
  // PostgREST (INSERT ... ON CONFLICT DO UPDATE) in una sola richiesta,
  // invece di dover prima interrogare il server per sapere se il record
  // esiste già (vedi sync.js v2.2 _syncExpense/_syncPayment/_syncUser).
  async function request(method, path, body = null, params = null, preferHeader = 'return=representation') {
    if (!isConfigured()) {
      throw new Error('Supabase non configurato. Vai nelle impostazioni admin.');
    }

    let url = `${_url}/rest/v1/${path}`;
    if (params) {
      const qs = new URLSearchParams(params);
      url += `?${qs}`;
    }

    const headers = {
      'Content-Type':  'application/json',
      'apikey':        _key,
      'Authorization': `Bearer ${_key}`,
      'Prefer':        preferHeader
    };

    // Header per le policy RLS lato server (v1.14) — vedi
    // _collectEventCodes() sopra. Se vuoto (es. primissimo avvio senza
    // eventi), l'header non viene inviato: le policy negheranno l'accesso
    // alle righe, che è il comportamento corretto (niente da leggere).
    const eventCodes = await _collectEventCodes();
    if (eventCodes.length) headers['x-wego-codes'] = eventCodes.join(',');

    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);

    const res = await fetch(url, options);

    // 204 No Content
    if (res.status === 204) return null;

    const data = await res.json();

    if (!res.ok) {
      const msg = data?.message || data?.hint || `Errore HTTP ${res.status}`;
      throw new Error(`[Supabase] ${msg}`);
    }

    return data;
  }

  // ─── EVENTS TABLE ─────────────────────────────────────────
  const events = {
    async create(event) {
      return request('POST', 'sp_events', {
        id:          event.id,
        code:        event.code,
        title:       event.title,
        description: event.description || '',
        currency:    event.currency || 'EUR',
        created_by:  event.created_by || null,
        created_at:  event.created_at,
        updated_at:  event.updated_at,
        // FIX v1.5: mancava qui — la foto veniva salvata solo in locale alla
        // creazione dell'evento e non arrivava mai al server, quindi nessun
        // altro device la vedeva (events.update() invece la includeva già
        // correttamente, ma solo per le modifiche successive alla creazione).
        photo:       event.photo || null,
        photo_sync_enabled: !!event.photo_sync_enabled
      });
    },

    async update(event) {
      return request('PATCH', `sp_events?id=eq.${event.id}`, {
        title:       event.title,
        description: event.description,
        photo:       event.photo || null,
        photo_sync_enabled: !!event.photo_sync_enabled,
        updated_at:  Utils.now()
      });
    },

    async delete(eventId) {
      return request('DELETE', `sp_events?id=eq.${eventId}`);
    },

    async findByCode(code) {
      // Il codice è appena stato digitato dall'utente: l'evento non è
      // ancora nel DB locale, quindi va incluso esplicitamente
      // nell'header RLS di QUESTA richiesta (vedi _extraCode sopra),
      // altrimenti la policy lato server la respingerebbe.
      _extraCode = code;
      try {
        const results = await request('GET', 'sp_events', null, {
          code:   `eq.${code}`,
          select: '*'
        });
        return Array.isArray(results) ? results[0] || null : null;
      } finally {
        _extraCode = null;
      }
    },

    async getById(id) {
      const results = await request('GET', 'sp_events', null, {
        id:     `eq.${id}`,
        select: '*'
      });
      return Array.isArray(results) ? results[0] || null : null;
    }
  };

  // ─── USERS TABLE ──────────────────────────────────────────
  const users = {
    async create(user) {
      return request('POST', 'sp_users', {
        id:         user.id,
        event_id:   user.event_id,
        name:       user.name,
        color_idx:  user.color_idx || 0,
        created_at: user.created_at,
        updated_at: user.updated_at,
        active:     user.active !== false,
        joined_at:  user.joined_at || null,
        last_sync_at: user.last_sync_at || null
      });
    },

    // NUOVO (v1.13) — vero upsert PostgREST (INSERT ... ON CONFLICT id DO
    // UPDATE) in un'unica richiesta: sostituisce il vecchio pattern
    // "getByEvent + controlla se esiste + create o update" in sync.js,
    // che ri-scaricava TUTTI gli utenti dell'evento solo per decidere.
    // Stessi campi di create(), PostgREST li usa anche come SET in caso
    // di conflitto.
    async upsert(user) {
      return request('POST', 'sp_users', {
        id:         user.id,
        event_id:   user.event_id,
        name:       user.name,
        color_idx:  user.color_idx || 0,
        created_at: user.created_at,
        updated_at: user.updated_at,
        active:     user.active !== false,
        joined_at:  user.joined_at || null,
        last_sync_at: user.last_sync_at || null
      }, { on_conflict: 'id' }, 'resolution=merge-duplicates,return=representation');
    },

    // NUOVO parametro "since" (v1.13, stesso pattern già presente su
    // expenses.getByEvent): se indicato, filtra lato server solo gli
    // utenti modificati dopo quella data — sincronizzazione
    // incrementale, vedi sync.js v2.2 pullEvent().
    async getByEvent(eventId, since = null) {
      const params = {
        event_id: `eq.${eventId}`,
        select:   '*',
        order:    'created_at.asc'
      };
      if (since) params.updated_at = `gt.${since}`;
      return request('GET', 'sp_users', null, params);
    },

    async update(user) {
      return request('PATCH', `sp_users?id=eq.${user.id}`, {
        name:         user.name,
        active:       user.active,
        joined_at:    user.joined_at || null,
        last_sync_at: user.last_sync_at || null,
        updated_at:   Utils.now()
      });
    },

    async delete(userId) {
      return request('DELETE', `sp_users?id=eq.${userId}`);
    }
  };

  // ─── EXPENSES TABLE ───────────────────────────────────────
  const expenses = {
    async create(expense) {
      return request('POST', 'sp_expenses', {
        id:             expense.id,
        event_id:       expense.event_id,
        type:           expense.type || 'expense',
        title:          expense.title,
        description:    expense.description || '',
        amount:         expense.amount,
        currency:       expense.currency || 'EUR',
        paid_by:        expense.paid_by,
        paid_for:       expense.paid_for || null,
        participants:   expense.participants || [],
        payment_method: expense.payment_method || 'contanti',
        category:       expense.category || null,
        is_forecast:    !!expense.is_forecast,
        is_cassa_comune: !!expense.is_cassa_comune,
        date:           expense.date,
        location_lat:   expense.location?.lat || null,
        location_lng:   expense.location?.lng || null,
        location_address: expense.location?.address || null,
        has_photo:      expense.has_photo || false,
        notes:          expense.notes || '',
        settled:        expense.settled || false,
        created_by:     expense.created_by || null,
        updated_by:     expense.updated_by || expense.created_by || null,
        created_at:     expense.created_at,
        updated_at:     expense.updated_at,
        deleted:        expense.deleted || false
      });
    },

    async update(expense) {
      return request('PATCH', `sp_expenses?id=eq.${expense.id}`, {
        // FIX v1.10: "type" e "paid_for" mancavano qui (erano presenti
        // solo in create()) — cambiare il tipo di un movimento esistente
        // (es. Spesa → Trasf. / +Cassiere) non veniva mai inviato al
        // server: il pull successivo lo sovrascriveva col vecchio valore
        // rimasto su Supabase, dando l'impressione che il salvataggio
        // non avesse effetto.
        type:           expense.type || 'expense',
        title:          expense.title,
        description:    expense.description,
        amount:         expense.amount,
        paid_by:        expense.paid_by,
        paid_for:       expense.paid_for || null,
        participants:   expense.participants,
        payment_method: expense.payment_method,
        category:       expense.category || null,
        is_forecast:    !!expense.is_forecast,
        is_cassa_comune: !!expense.is_cassa_comune,
        date:           expense.date,
        location_lat:   expense.location?.lat || null,
        location_lng:   expense.location?.lng || null,
        location_address: expense.location?.address || null,
        has_photo:      expense.has_photo,
        notes:          expense.notes,
        settled:        expense.settled,
        deleted:        expense.deleted,
        updated_by:     expense.updated_by || expense.created_by || null,
        updated_at:     Utils.now()
      });
    },

    // NUOVO (v1.13) — vero upsert PostgREST (INSERT ... ON CONFLICT id DO
    // UPDATE) in un'unica richiesta: sostituisce il vecchio pattern
    // "getByEvent + controlla se esiste + create o update" in sync.js,
    // che ri-scaricava TUTTE le spese dell'evento solo per decidere.
    // Stessi campi di create(), PostgREST li usa anche come SET in caso
    // di conflitto.
    async upsert(expense) {
      return request('POST', 'sp_expenses', {
        id:             expense.id,
        event_id:       expense.event_id,
        type:           expense.type || 'expense',
        title:          expense.title,
        description:    expense.description || '',
        amount:         expense.amount,
        currency:       expense.currency || 'EUR',
        paid_by:        expense.paid_by,
        paid_for:       expense.paid_for || null,
        participants:   expense.participants || [],
        payment_method: expense.payment_method || 'contanti',
        category:       expense.category || null,
        is_forecast:    !!expense.is_forecast,
        is_cassa_comune: !!expense.is_cassa_comune,
        date:           expense.date,
        location_lat:   expense.location?.lat || null,
        location_lng:   expense.location?.lng || null,
        location_address: expense.location?.address || null,
        has_photo:      expense.has_photo || false,
        notes:          expense.notes || '',
        settled:        expense.settled || false,
        created_by:     expense.created_by || null,
        // Chi ha salvato per ultimo (NUOVO) — se il chiamante non lo
        // valorizza esplicitamente ricade sul creatore (comportamento
        // identico a prima per i record salvati dal loro stesso
        // proprietario, es. il primissimo salvataggio).
        updated_by:     expense.updated_by || expense.created_by || null,
        created_at:     expense.created_at,
        updated_at:     expense.updated_at,
        deleted:        expense.deleted || false
      }, { on_conflict: 'id' }, 'resolution=merge-duplicates,return=representation');
    },

    async getByEvent(eventId, since = null) {
      const params = {
        event_id: `eq.${eventId}`,
        select:   '*',
        order:    'date.desc,created_at.desc'
      };
      if (since) params.updated_at = `gt.${since}`;
      return request('GET', 'sp_expenses', null, params);
    },

    async delete(id) {
      return request('PATCH', `sp_expenses?id=eq.${id}`, {
        deleted:    true,
        updated_at: Utils.now()
      });
    }
  };

  // ─── EXPENSE PHOTOS TABLE ───────────────────────────────────
  // Foto compatta (max 900px / qualità 60%, ~30-50KB) collegata a un
  // movimento — vedi db.js DB.photos per la versione qualità più alta
  // che resta SOLO sul device di chi ha scattato la foto. Solo chi ha
  // creato il movimento (created_by) può modificarla/eliminarla: il
  // controllo è lato app (vedi evento.js/spesa.js), qui solo la lettura
  // e la scrittura grezza.
  const expensePhotos = {
    async upsert(expenseId, photoBase64, createdBy) {
      const existing = await request('GET', 'sp_expense_photos', null, { expense_id: `eq.${expenseId}`, select: 'expense_id' });
      if (Array.isArray(existing) && existing.length) {
        return request('PATCH', `sp_expense_photos?expense_id=eq.${expenseId}`, {
          photo:      photoBase64,
          updated_at: Utils.now()
        });
      }
      return request('POST', 'sp_expense_photos', {
        expense_id: expenseId,
        photo:      photoBase64,
        created_by: createdBy || null,
        updated_at: Utils.now()
      });
    },

    async delete(expenseId) {
      return request('DELETE', `sp_expense_photos?expense_id=eq.${expenseId}`);
    },

    async getByExpense(expenseId) {
      const r = await request('GET', 'sp_expense_photos', null, { expense_id: `eq.${expenseId}`, select: '*' });
      return Array.isArray(r) ? (r[0] || null) : null;
    },

    // Batch: tutte le foto collegate a una lista di movimenti (usato dal
    // pull di un evento, una sola chiamata invece di una per spesa).
    async getByExpenseIds(expenseIds) {
      if (!Array.isArray(expenseIds) || !expenseIds.length) return [];
      const r = await request('GET', 'sp_expense_photos', null, {
        expense_id: `in.(${expenseIds.join(',')})`,
        select:     '*'
      });
      return Array.isArray(r) ? r : [];
    }
  };

  // ─── PAYMENTS TABLE ───────────────────────────────────────
  const payments = {
    async create(payment) {
      return request('POST', 'sp_payments', {
        id:         payment.id,
        event_id:   payment.event_id,
        from_user:  payment.from_user,
        to_user:    payment.to_user,
        amount:     payment.amount,
        method:     payment.method || 'contanti',
        note:       payment.note || '',
        date:       payment.date,
        deleted:    payment.deleted || false,
        created_at: payment.created_at,
        updated_at: payment.updated_at
      });
    },

    async update(payment) {
      return request('PATCH', `sp_payments?id=eq.${payment.id}`, {
        from_user:  payment.from_user,
        to_user:    payment.to_user,
        amount:     payment.amount,
        method:     payment.method || 'contanti',
        note:       payment.note || '',
        date:       payment.date,
        deleted:    payment.deleted || false,
        updated_at: Utils.now()
      });
    },

    async delete(id) {
      return request('PATCH', `sp_payments?id=eq.${id}`, {
        deleted:    true,
        updated_at: Utils.now()
      });
    },

    // NUOVO (v1.13) — vero upsert PostgREST, stesso motivo di
    // expenses.upsert()/users.upsert() qui sopra.
    async upsert(payment) {
      return request('POST', 'sp_payments', {
        id:         payment.id,
        event_id:   payment.event_id,
        from_user:  payment.from_user,
        to_user:    payment.to_user,
        amount:     payment.amount,
        method:     payment.method || 'contanti',
        note:       payment.note || '',
        date:       payment.date,
        deleted:    payment.deleted || false,
        created_at: payment.created_at,
        updated_at: payment.updated_at
      }, { on_conflict: 'id' }, 'resolution=merge-duplicates,return=representation');
    },

    // NUOVO parametro "since" (v1.13) — vedi users.getByEvent()/
    // expenses.getByEvent() qui sopra, stesso pattern.
    async getByEvent(eventId, since = null) {
      const params = {
        event_id: `eq.${eventId}`,
        select:   '*',
        order:    'created_at.desc'
      };
      if (since) params.updated_at = `gt.${since}`;
      return request('GET', 'sp_payments', null, params);
    }
  };

  // ─── DEVICE LICENSE TABLE (licenza Base/Pro — NUOVO v1.7) ──────────
  // Abilitazione "versione Pro" per singolo dispositivo (vedi license.js
  // / impostazioni.html / admin.html). request() viene chiamato quando
  // l'utente invia la richiesta da Impostazioni (anche in coda se
  // offline, vedi License.requestPro() / sync.js); getByDeviceId() viene
  // interrogato periodicamente da License.checkRemoteStatus() per sapere
  // se è stato abilitato (e fino a quando, expires_at).
  //
  // MODIFICA SICUREZZA (v1.8): stessa logica di syncStatus sopra —
  // request() passa da /api/device-license.js invece di scrivere
  // direttamente su Supabase. Prima di questa modifica, chiunque avesse
  // la anon key pubblica (sempre scaricabile da chiavi.json) avrebbe
  // potuto scrivere direttamente enabled:true su questa tabella,
  // auto-abilitandosi alla versione Pro senza passare da admin.html.
  // Ora la anon key ha SOLO il permesso SELECT: getByDeviceId() (sotto)
  // continua a funzionare come lettura diretta, ma ogni scrittura
  // (richiesta, abilitazione, disabilitazione) passa solo dalla funzione
  // serverless, con una chiave diversa che il browser non vedrà mai.
  const deviceLicense = {
    async request(deviceId, label) {
      const res = await fetch('/api/device-license', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'request', device_id: deviceId, label })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error((data && data.error) || `Errore HTTP ${res.status}`);
      return data;
    },

    async getByDeviceId(deviceId) {
      const r = await request('GET', 'sp_device_license', null, { device_id: `eq.${deviceId}`, select: '*' });
      return Array.isArray(r) ? (r[0] || null) : null;
    }
  };

  // ─── PUSH SUBSCRIPTIONS TABLE ──────────────────────────────
  // Collega un device (Web Push subscription) a un evento + utente, così
  // il server sa a chi inviare la notifica quando viene registrato un
  // nuovo movimento in quell'evento.
  const pushSubscriptions = {
    async upsert(sub) {
      // Verifica se esiste già una riga per questo evento+endpoint
      const existing = await request('GET', 'sp_push_subscriptions', null, {
        event_id: `eq.${sub.event_id}`,
        endpoint: `eq.${sub.endpoint}`,
        select:   'id'
      });
      if (Array.isArray(existing) && existing.length > 0) {
        return request('PATCH', `sp_push_subscriptions?id=eq.${existing[0].id}`, {
          user_id:    sub.user_id || null,
          p256dh:     sub.p256dh,
          auth:       sub.auth,
          updated_at: Utils.now()
        });
      }
      return request('POST', 'sp_push_subscriptions', {
        event_id:   sub.event_id,
        user_id:    sub.user_id || null,
        endpoint:   sub.endpoint,
        p256dh:     sub.p256dh,
        auth:       sub.auth,
        created_at: Utils.now(),
        updated_at: Utils.now()
      });
    },

    async getByEvent(eventId) {
      return request('GET', 'sp_push_subscriptions', null, {
        event_id: `eq.${eventId}`,
        select:   '*'
      });
    },

    async deleteByEndpoint(endpoint) {
      return request('DELETE', `sp_push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`);
    }
  };

  // ─── SCHEMA SQL ───────────────────────────────────────────
  /**
   * Script SQL da eseguire nel Supabase SQL Editor
   * Disponibile da admin.html
   */
  const SQL_SCHEMA = `
-- WeGo Database Schema v1.0
-- Esegui questo script nel Supabase SQL Editor

-- Abilita UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- TABELLA EVENTI
CREATE TABLE IF NOT EXISTS sp_events (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code        VARCHAR(12) UNIQUE NOT NULL,
  title       VARCHAR(100) NOT NULL,
  description TEXT DEFAULT '',
  currency    VARCHAR(5) DEFAULT 'EUR',
  created_by  VARCHAR(50),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  archived    BOOLEAN DEFAULT FALSE,
  photo       TEXT
);
CREATE INDEX IF NOT EXISTS idx_sp_events_code ON sp_events(code);

-- TABELLA UTENTI (partecipanti)
CREATE TABLE IF NOT EXISTS sp_users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id      UUID NOT NULL REFERENCES sp_events(id) ON DELETE CASCADE,
  name          VARCHAR(50) NOT NULL,
  color_idx     INTEGER DEFAULT 0,
  active        BOOLEAN DEFAULT TRUE,
  joined_at     TIMESTAMPTZ,
  last_sync_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sp_users_event ON sp_users(event_id);

-- TABELLA SPESE
CREATE TABLE IF NOT EXISTS sp_expenses (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id         UUID NOT NULL REFERENCES sp_events(id) ON DELETE CASCADE,
  type             VARCHAR(20) DEFAULT 'expense',
  title            VARCHAR(100) NOT NULL,
  description      TEXT DEFAULT '',
  amount           DECIMAL(10,2) NOT NULL,
  currency         VARCHAR(5) DEFAULT 'EUR',
  paid_by          UUID REFERENCES sp_users(id),
  paid_for         UUID REFERENCES sp_users(id),
  participants     UUID[] DEFAULT '{}',
  payment_method   VARCHAR(30) DEFAULT 'contanti',
  date             DATE NOT NULL,
  location_lat     DECIMAL(10,7),
  location_lng     DECIMAL(10,7),
  location_address TEXT,
  has_photo        BOOLEAN DEFAULT FALSE,
  notes            TEXT DEFAULT '',
  settled          BOOLEAN DEFAULT FALSE,
  deleted          BOOLEAN DEFAULT FALSE,
  created_by       UUID REFERENCES sp_users(id),
  updated_by       UUID REFERENCES sp_users(id),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sp_expenses_event ON sp_expenses(event_id);
CREATE INDEX IF NOT EXISTS idx_sp_expenses_date  ON sp_expenses(date DESC);

-- Per installazioni precedenti: aggiunge updated_by se mancante (NUOVO) —
-- traccia CHI ha salvato per ultimo un movimento, distinto da created_by
-- che resta sempre il proprietario originale. Serve per: (1) mostrare
-- "(nome)" sotto l'importo in Movimenti quando un operatore diverso dal
-- proprietario modifica/elimina una spesa (ora consentito, vedi spesa.js);
-- (2) il testo delle notifiche push di modifica/eliminazione (Edge
-- Function send-push-notification).
ALTER TABLE sp_expenses ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES sp_users(id);

-- TABELLA PAGAMENTI SALDATI
CREATE TABLE IF NOT EXISTS sp_payments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id    UUID NOT NULL REFERENCES sp_events(id) ON DELETE CASCADE,
  from_user   UUID NOT NULL REFERENCES sp_users(id),
  to_user     UUID NOT NULL REFERENCES sp_users(id),
  amount      DECIMAL(10,2) NOT NULL,
  method      VARCHAR(30) DEFAULT 'contanti',
  note        TEXT DEFAULT '',
  date        DATE NOT NULL,
  deleted     BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sp_payments_event ON sp_payments(event_id);

-- Per installazioni precedenti: aggiunge la colonna deleted se mancante
ALTER TABLE sp_payments ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT FALSE;

-- Per installazioni precedenti: aggiunge joined_at se mancante. Serve per
-- mostrare correttamente "N connessi" su TUTTI i device, non solo su
-- quello dove ciascun partecipante ha fatto il join.
ALTER TABLE sp_users ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ;

-- Per installazioni precedenti: aggiunge last_sync_at se mancante. Serve a
-- mostrare in "Partecipanti" quando ciascun utente ha sincronizzato
-- l'ultima volta, per capire se ha i dati aggiornati.
ALTER TABLE sp_users ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ;

-- Per installazioni precedenti: aggiunge photo se mancante. SENZA questa
-- colonna, ogni modifica all'evento (anche solo il titolo) fallisce per
-- intero: events.update() invia sempre anche il campo "photo" nella
-- stessa richiesta PATCH, e PostgREST rifiuta tutta la richiesta se una
-- colonna non esiste — quindi titolo/descrizione non si aggiornavano MAI
-- sul server, non solo la foto (bug v4.2).
ALTER TABLE sp_events ADD COLUMN IF NOT EXISTS photo TEXT;

-- Fix licenza foto per-evento (v4.8): true se il CREATORE dell'evento ha
-- (o aveva all'ultima modifica) la versione Pro — permette anche a un
-- partecipante con device Base di usare le foto, SOLO su questo evento
-- (vedi license.js -> photoSyncAllowedForEvent(), sync.js, app.js).
ALTER TABLE sp_events ADD COLUMN IF NOT EXISTS photo_sync_enabled BOOLEAN DEFAULT FALSE;

-- Campo "Tipo" (categoria di spesa, facoltativo — vedi payments.js ->
-- ExpenseCategories / Impostazioni -> Categorie spesa) e flag
-- "Previsione" (spesa futura, non divisa, esclusa dai saldi/totali da
-- dividere — vedi evento.js _renderSpese/_renderSaldi). Entrambi NUOVI
-- v4.8, solo per il tipo 'expense' (mai per 'transfer').
ALTER TABLE sp_expenses ADD COLUMN IF NOT EXISTS category    VARCHAR(50);
ALTER TABLE sp_expenses ADD COLUMN IF NOT EXISTS is_forecast BOOLEAN DEFAULT FALSE;

-- Flag "Uso Cassa Comune" (NUOVO v1.12, solo per il tipo 'expense') —
-- indica che quella spesa è stata pagata con la cassa comune raccolta
-- da un movimento "+Cassiere", invece che di tasca propria. Usato SOLO
-- dal calcolo informativo "Cassa Comune" nei Saldi (utils.js ->
-- calculateCassaComune()), non influisce sul saldo normale.
ALTER TABLE sp_expenses ADD COLUMN IF NOT EXISTS is_cassa_comune BOOLEAN DEFAULT FALSE;

-- TABELLA SOTTOSCRIZIONI PUSH (Web Push / notifiche)
-- Collega un device a un evento: serve al backend per sapere a chi inviare
-- la notifica quando viene registrato un nuovo movimento in quell'evento.
CREATE TABLE IF NOT EXISTS sp_push_subscriptions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id    UUID NOT NULL REFERENCES sp_events(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES sp_users(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, endpoint)
);
CREATE INDEX IF NOT EXISTS idx_sp_push_subs_event ON sp_push_subscriptions(event_id);

-- TABELLA STATO SINCRONIZZAZIONE EVENTI ESTERNI (v1.4)
-- Un evento creato da un device "non proprietario" (senza il codice
-- dispositivo configurato in Impostazioni → Avanzate) resta SOLO sul
-- device che l'ha creato finché non viene abilitato qui. L'abilitazione
-- avviene da admin.html (manualmente o dalla lista automatica) e NON
-- elimina mai dati già presenti: la disabilitazione blocca solo i FUTURI
-- invii, senza toccare quanto già sincronizzato.
CREATE TABLE IF NOT EXISTS sp_sync_status (
  code         VARCHAR(12) PRIMARY KEY,
  title        VARCHAR(100),
  created_by   VARCHAR(50),
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  enabled      BOOLEAN DEFAULT FALSE,
  enabled_at   TIMESTAMPTZ,
  enabled_by   VARCHAR(50)
);

-- TABELLA FOTO MOVIMENTI (v4.3) — versione compatta, max 900px / qualità
-- 60% (~30-50KB). La foto a qualità piena resta SOLO sul device di chi
-- l'ha scattata (mai sincronizzata): qui viaggia solo questa versione
-- compressa apposta per essere leggera da sincronizzare su tutti i
-- device. Solo chi ha creato il movimento può modificarla/eliminarla
-- (controllo lato app, vedi evento.js/spesa.js).
CREATE TABLE IF NOT EXISTS sp_expense_photos (
  expense_id  UUID PRIMARY KEY REFERENCES sp_expenses(id) ON DELETE CASCADE,
  photo       TEXT NOT NULL,
  created_by  UUID REFERENCES sp_users(id),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- TABELLA LICENZA DISPOSITIVO (v4.4) — abilitazione "versione Pro" per
-- singolo dispositivo (vedi license.js / impostazioni.html / admin.html).
-- device_id è generato dal client (localStorage), non dal database.
-- expires_at è sempre impostato dall'admin quando abilita (una data
-- lontana nel tempo equivale a "senza scadenza") — license.js confronta
-- periodicamente la data corrente con questo campo per decidere se il
-- dispositivo è ancora abilitato.
CREATE TABLE IF NOT EXISTS sp_device_license (
  device_id    VARCHAR(64) PRIMARY KEY,
  label        VARCHAR(100),
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  enabled      BOOLEAN DEFAULT FALSE,
  expires_at   TIMESTAMPTZ,
  enabled_at   TIMESTAMPTZ,
  enabled_by   VARCHAR(50)
);

-- TABELLA LOG NOTIFICHE PUSH (NUOVO v1.16) — storico persistente di ogni
-- notifica push TENTATA (non solo quelle riuscite): chi era il
-- destinatario, per quale evento/movimento, il testo inviato e se è
-- andata a buon fine o no. Scritta dalla Edge Function
-- send-push-notification (v3) subito dopo ogni invio — prima d'ora non
-- esisteva NESSUNA traccia persistente degli invii: né il database né
-- l'app conservavano chi avesse effettivamente ricevuto una notifica.
-- Sola lettura da admin.html tramite /api/notification-log.js (vedi
-- sezione RLS più sotto: nessun privilegio per la anon key pubblica).
CREATE TABLE IF NOT EXISTS sp_notification_log (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id    UUID REFERENCES sp_events(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES sp_users(id) ON DELETE SET NULL,
  table_name  VARCHAR(30),
  record_id   UUID,
  title       TEXT,
  body        TEXT,
  success     BOOLEAN DEFAULT TRUE,
  error       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sp_notification_log_event   ON sp_notification_log(event_id);
CREATE INDEX IF NOT EXISTS idx_sp_notification_log_created ON sp_notification_log(created_at DESC);

-- ═══════════════════════════════════════════════════════════════
-- SICUREZZA — ROW LEVEL SECURITY basata sui codici evento (v7.1)
-- ═══════════════════════════════════════════════════════════════
-- PRIMA (fino a v7.0): RLS disattivato + GRANT ampi alla anon key —
-- la anon key è PUBBLICA per design (chiavi.json), quindi chiunque
-- poteva leggere/scrivere l'INTERO database con una richiesta HTTP.
-- ORA: l'app invia in ogni richiesta l'header "x-wego-codes" con i
-- codici degli eventi che quel device conosce legittimamente (creati o
-- a cui si è collegato — vedi supabase.js _collectEventCodes()); le
-- policy qui sotto permettono di toccare SOLO le righe di quegli
-- eventi. Il codice evento diventa di fatto la "chiave" dell'evento —
-- coerente col design dell'app ("chi ha il codice partecipa").
-- La service key (SUPABASE_SERVICE_KEY, solo su Vercel) bypassa RLS:
-- le funzioni /api/ continuano a funzionare invariate.

-- Funzione helper: codici evento dichiarati nell'header della richiesta.
-- NULLIF: se request.headers non è impostato o è vuoto (mai il caso con
-- PostgREST/Supabase, ma difendiamoci comunque), il cast ::json su
-- stringa vuota esploderebbe — così invece torna una lista vuota.
CREATE OR REPLACE FUNCTION wego_codes() RETURNS text[]
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    string_to_array(NULLIF(current_setting('request.headers', true), '')::json->>'x-wego-codes', ','),
    ARRAY[]::text[]
  );
$$;

-- Funzione helper: id degli eventi corrispondenti a quei codici.
-- SECURITY DEFINER: la risoluzione codice→id deve leggere sp_events
-- BYPASSANDO la RLS di sp_events stessa (altrimenti riferimento
-- circolare); search_path fissato come richiesto dalle best practice
-- Supabase per le funzioni SECURITY DEFINER.
CREATE OR REPLACE FUNCTION wego_event_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM sp_events WHERE code = ANY(wego_codes());
$$;

-- Abilita RLS su tutte le tabelle esposte
ALTER TABLE sp_events             ENABLE ROW LEVEL SECURITY;
ALTER TABLE sp_users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE sp_expenses           ENABLE ROW LEVEL SECURITY;
ALTER TABLE sp_payments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE sp_expense_photos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE sp_push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sp_sync_status        ENABLE ROW LEVEL SECURITY;
ALTER TABLE sp_device_license     ENABLE ROW LEVEL SECURITY;
ALTER TABLE sp_notification_log   ENABLE ROW LEVEL SECURITY;

-- sp_events: accesso solo alle righe il cui codice è nell'header
DROP POLICY IF EXISTS wego_events_select ON sp_events;
DROP POLICY IF EXISTS wego_events_insert ON sp_events;
DROP POLICY IF EXISTS wego_events_update ON sp_events;
CREATE POLICY wego_events_select ON sp_events FOR SELECT TO anon
  USING (code = ANY(wego_codes()));
CREATE POLICY wego_events_insert ON sp_events FOR INSERT TO anon
  WITH CHECK (code = ANY(wego_codes()));
CREATE POLICY wego_events_update ON sp_events FOR UPDATE TO anon
  USING (code = ANY(wego_codes())) WITH CHECK (code = ANY(wego_codes()));

-- sp_users / sp_expenses / sp_payments: accesso solo alle righe dei
-- propri eventi (event_id risolto tramite i codici dell'header)
DROP POLICY IF EXISTS wego_users_select ON sp_users;
DROP POLICY IF EXISTS wego_users_insert ON sp_users;
DROP POLICY IF EXISTS wego_users_update ON sp_users;
CREATE POLICY wego_users_select ON sp_users FOR SELECT TO anon
  USING (event_id IN (SELECT wego_event_ids()));
CREATE POLICY wego_users_insert ON sp_users FOR INSERT TO anon
  WITH CHECK (event_id IN (SELECT wego_event_ids()));
CREATE POLICY wego_users_update ON sp_users FOR UPDATE TO anon
  USING (event_id IN (SELECT wego_event_ids()))
  WITH CHECK (event_id IN (SELECT wego_event_ids()));

DROP POLICY IF EXISTS wego_expenses_select ON sp_expenses;
DROP POLICY IF EXISTS wego_expenses_insert ON sp_expenses;
DROP POLICY IF EXISTS wego_expenses_update ON sp_expenses;
CREATE POLICY wego_expenses_select ON sp_expenses FOR SELECT TO anon
  USING (event_id IN (SELECT wego_event_ids()));
CREATE POLICY wego_expenses_insert ON sp_expenses FOR INSERT TO anon
  WITH CHECK (event_id IN (SELECT wego_event_ids()));
CREATE POLICY wego_expenses_update ON sp_expenses FOR UPDATE TO anon
  USING (event_id IN (SELECT wego_event_ids()))
  WITH CHECK (event_id IN (SELECT wego_event_ids()));

DROP POLICY IF EXISTS wego_payments_select ON sp_payments;
DROP POLICY IF EXISTS wego_payments_insert ON sp_payments;
DROP POLICY IF EXISTS wego_payments_update ON sp_payments;
CREATE POLICY wego_payments_select ON sp_payments FOR SELECT TO anon
  USING (event_id IN (SELECT wego_event_ids()));
CREATE POLICY wego_payments_insert ON sp_payments FOR INSERT TO anon
  WITH CHECK (event_id IN (SELECT wego_event_ids()));
CREATE POLICY wego_payments_update ON sp_payments FOR UPDATE TO anon
  USING (event_id IN (SELECT wego_event_ids()))
  WITH CHECK (event_id IN (SELECT wego_event_ids()));

-- sp_expense_photos: legata alla spesa → all'evento (doppio salto)
DROP POLICY IF EXISTS wego_photos_all ON sp_expense_photos;
CREATE POLICY wego_photos_all ON sp_expense_photos FOR ALL TO anon
  USING (expense_id IN (SELECT id FROM sp_expenses WHERE event_id IN (SELECT wego_event_ids())))
  WITH CHECK (expense_id IN (SELECT id FROM sp_expenses WHERE event_id IN (SELECT wego_event_ids())));

-- sp_push_subscriptions: per evento (serve anche DELETE per la disiscrizione)
DROP POLICY IF EXISTS wego_push_all ON sp_push_subscriptions;
CREATE POLICY wego_push_all ON sp_push_subscriptions FOR ALL TO anon
  USING (event_id IN (SELECT wego_event_ids()))
  WITH CHECK (event_id IN (SELECT wego_event_ids()));

-- sp_sync_status / sp_device_license: sola lettura per anon (il client
-- deve poter leggere il PROPRIO stato); scritture SOLO via /api/ con la
-- service key (che bypassa RLS). Invariato rispetto a prima nel
-- comportamento, ma ora con RLS attivo.
DROP POLICY IF EXISTS wego_syncstatus_select ON sp_sync_status;
CREATE POLICY wego_syncstatus_select ON sp_sync_status FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS wego_license_select ON sp_device_license;
CREATE POLICY wego_license_select ON sp_device_license FOR SELECT TO anon USING (true);

-- sp_notification_log: NESSUNA policy per anon (RLS attiva, zero
-- privilegi di default) — consultabile SOLO dalle funzioni server con la
-- service role key (la Edge Function per scriverla, /api/notification-log.js
-- per leggerla da admin.html), che bypassano comunque la RLS. La anon
-- key pubblica non può leggerla né scriverla in nessun modo.

-- GRANT: i permessi a livello tabella restano necessari (RLS filtra le
-- RIGHE, i GRANT decidono le OPERAZIONI)
GRANT SELECT, INSERT, UPDATE ON sp_events      TO anon;
GRANT SELECT, INSERT, UPDATE ON sp_users       TO anon;
GRANT SELECT, INSERT, UPDATE ON sp_expenses    TO anon;
GRANT SELECT, INSERT, UPDATE ON sp_payments    TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON sp_push_subscriptions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON sp_expense_photos TO anon;

-- sp_sync_status e sp_device_license: governano "chi è abilitato a
-- cosa" — scritture SOLO dalle funzioni server /api/ con la
-- SUPABASE_SERVICE_KEY. Le REVOKE sono indispensabili se hai già
-- eseguito una versione precedente di questo schema.
REVOKE INSERT, UPDATE, DELETE ON sp_sync_status    FROM anon;
REVOKE INSERT, UPDATE, DELETE ON sp_device_license FROM anon;
GRANT SELECT ON sp_sync_status    TO anon;
GRANT SELECT ON sp_device_license TO anon;

-- sp_notification_log: scritta dalla Edge Function, letta da /api/
-- notification-log.js, ENTRAMBE con la service role key — GRANT
-- esplicito (i privilegi di default su una tabella nuova non sempre
-- bastano a service_role su ogni progetto Supabase, vedi il fix v5.4
-- per sp_device_license/sp_sync_status: stesso sintomo, stessa causa).
-- Zero privilegi per anon (vedi policy/commento più sopra).
GRANT SELECT, INSERT ON sp_notification_log TO service_role;

SELECT 'Schema WeGo installato correttamente!' AS status;
`;

  return {
    isConfigured,
    loadConfig,
    events,
    users,
    expenses,
    expensePhotos,
    payments,
    pushSubscriptions,
    deviceLicense,
    SQL_SCHEMA
  };
})();

window.SupabaseClient = SupabaseClient;
