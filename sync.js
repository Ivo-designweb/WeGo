// ═══════════════════════════════════════════════════════════════
// WeGo — sync.js v2.2
// Gestione sincronizzazione bidirezionale con Supabase
// v2.2: SINCRONIZZAZIONE INCREMENTALE (richiesta cliente — "troppo
//       lenta"):
//       - _syncExpense()/_syncPayment()/_syncUser() ora usano
//         SupabaseClient.*.upsert() (vero upsert PostgREST, supabase.js
//         v1.13) invece del vecchio "scarica TUTTI i record dell'evento
//         per controllare se questo esiste già" — una query sprecata
//         per OGNI record non sincronizzato, che cresceva con la storia
//         dell'evento.
//       - pullEvent() ora scarica solo i record modificati dopo l'ultimo
//         pull riuscito (parametro "since" su users/expenses/
//         payments.getByEvent(), supabase.js v1.13) invece di tutta la
//         storia dell'evento ad ogni sync. Watermark salvato in locale
//         per evento (_pullSinceKey, config "sync_since_<eventId>", MAI
//         sincronizzato tra device), calcolato sul MASSIMO updated_at
//         effettivamente ricevuto (non sull'orologio locale) con un
//         margine di sicurezza di 2 minuti per tollerare piccoli
//         disallineamenti di orologio tra device diversi. Non arretra
//         mai. Nuova resetPullWatermark(eventId), usata da
//         impostazioni.html dopo un import da backup (che può riportare
//         indietro nel tempo lo stato locale).
//       - Verificato con un test funzionale Node (dataset finto lato
//         server): primo pull completo, pull successivo senza modifiche
//         non ri-scarica nulla, un nuovo record lato server viene
//         comunque intercettato correttamente.
// v2.1: NUOVA sync differita ("quieta") — scheduleQuietSync()/
//       _runQuietSync()/flushQuietSyncNow()/cancelQuietSync(): il
//       salvataggio di un movimento (spesa.js) non blocca più l'utente
//       in attesa della rete — push()+pullEvent() partono da soli dopo
//       5s di inattività (debounce vero, timer che riparte ad ogni
//       chiamata, nessun tetto massimo — scelta del cliente), con una
//       rete di sicurezza automatica (visibilitychange/pagehide) che
//       forza comunque la sync se la pagina viene nascosta/chiusa
//       prima. Usata da EventoApp._syncQuiet() (evento.js v2.28) al
//       posto dell'await diretto. push()/pullEvent() e la rotella
//       #syncIcon (_showBar/_hideBar) restano invariati.
// v2.0: RIMOSSA la sincronizzazione selettiva eventi esterni (gating —
//       era v1.5): ogni evento si sincronizza ora sempre, senza attesa di
//       abilitazione admin. Rimossi _refreshGatedEvents(),
//       _isEventSyncAllowed(), _pendingEventId() (servivano solo al
//       gating) e tutti i controlli "if (!isEventSyncAllowed) continue"
//       in push() (pending ops, spese, pagamenti, utenti, foto). Rimossa
//       la pending op 'register_sync_request'. Resta SOLO l'abilitazione
//       Base→Pro (licenza dispositivo, invariata — vedi license.js).
// v1.9: FIX licenza foto per-evento (license.js v1.3) — il controllo
//       sync foto (push e pull, copertina e movimenti) è ora PER EVENTO
//       tramite _isPhotoSyncAllowedForEvent()/License.photoSyncAllowedForEvent(),
//       non più globale sul tier del device: un device Base collegato a
//       un evento ospitato da un creatore Pro può sincronizzare le foto
//       SOLO su quell'evento
// v1.8: licenza dispositivo (Fase 2, v4.4) — License.checkRemoteStatus()
//       richiamato ad ogni push() (come _refreshGatedEvents); gestione
//       della pending op 'request_device_license' (richiesta di
//       abilitazione fatta offline da Impostazioni, vedi license.js
//       requestPro())
// v1.7: licenza dispositivo (license.js) — i device in versione Base non
//       sincronizzano NESSUNA foto, né in invio né in ricezione (né
//       copertina evento né foto movimenti): vedi _executePending
//       (create_event/update_event), il blocco foto in push(), e
//       pullEvent() per entrambi i casi
// v1.6: sincronizzazione foto movimenti (push da DB.photos.getUnsynced,
//       pull batch da sp_expense_photos per evento) — vedi db.js/supabase.js
// v1.5: sincronizzazione selettiva per eventi esterni — un evento
//       "gated" (creato da un device non proprietario) non viene mai
//       inviato a Supabase finché il suo codice non è abilitato da un
//       admin (vedi admin.html / sp_sync_status). Vedi _refreshGatedEvents,
//       _isEventSyncAllowed, _pendingEventId qui sotto.
// ═══════════════════════════════════════════════════════════════

const Sync = {

  _isSyncing: false,

  // ─── SYNC DIFFERITA ("quieta") — NUOVO v2.1 ────────────────
  // Vedi scheduleQuietSync()/flushQuietSyncNow() più sotto per i dettagli.
  _quietSyncTimer:    null,
  _quietSyncEventId:  null,
  _quietSyncOnDone:   null,

  // ─── PUSH (locale → Supabase) ─────────────────────────────
  async push() {
    if (Sync._isSyncing) return;
    if (!Utils.isOnline()) return;
    if (!SupabaseClient.isConfigured()) return;

    Sync._isSyncing = true;
    Sync._showBar('Sincronizzazione in corso…');

    try {
      // Stesso principio per la licenza Pro di QUESTO device (vedi
      // license.js v1.1): una query in più, solo per sapere se lo stato
      // remoto (sp_device_license) è cambiato da quando l'abbiamo
      // controllato l'ultima volta.
      if (typeof License !== 'undefined') {
        await License.checkRemoteStatus();
      }

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

      // Sync utenti non sincronizzati (es. dopo il join: il flag joined_at
      // va spinto sul server, altrimenti gli altri device non sanno che
      // questa persona si è collegata).
      const unsyncedUsers = await DB.users.getUnsyced();
      for (const u of unsyncedUsers) {
        try {
          await Sync._syncUser(u);
          u.synced = true;
          await DB.users.save(u);
        } catch (e) {
          console.warn('[Sync] User sync failed:', u.id, e.message);
        }
      }

      // Sync foto movimenti non sincronizzate (caricamento o cancellazione
      // in attesa di essere propagata — vedi DB.photos.markDeleted).
      // FIX (v1.3 license.js): il controllo è ora PER EVENTO, non più
      // globale sul tier del device — un device Base collegato a un
      // evento ospitato da un creatore Pro può sincronizzare le foto SOLO
      // su quell'evento (vedi _isPhotoSyncAllowedForEvent sotto).
      const unsyncedPhotos = await DB.photos.getUnsynced();
      for (const photo of unsyncedPhotos) {
        try {
          const exp = await DB.expenses.getById(photo.expense_id);
          if (!exp) { await DB.photos.delete(photo.expense_id); continue; }
          if (!(await Sync._isPhotoSyncAllowedForEvent(exp.event_id))) continue;
          if (photo.sync_data) {
            await SupabaseClient.expensePhotos.upsert(photo.expense_id, photo.sync_data, photo.created_by || exp.created_by);
          } else {
            // sync_data assente = è stata eliminata su questo device
            await SupabaseClient.expensePhotos.delete(photo.expense_id);
          }
          await DB.photos.markSynced(photo.expense_id);
        } catch (e) {
          console.warn('[Sync] Photo sync failed:', photo.expense_id, e.message);
        }
      }

    } finally {
      Sync._isSyncing = false;
      Sync._hideBar();
    }
  },

  // ─── SYNC DIFFERITA ("quieta") — NUOVO v2.1 ────────────────
  // Richiesta cliente: salvare un movimento non deve più bloccare
  // l'utente in attesa della sincronizzazione di rete — si salva subito
  // in locale, e la sync vera e propria (push + pull) parte da sola
  // dopo un po' di inattività, mentre l'utente è già libero di fare
  // altro. Usata da EventoApp._syncQuiet() (evento.js) al posto
  // dell'await diretto a Sync.push()/pullEvent(); spesa.js NON chiama
  // più Sync in alcun modo dopo il salvataggio — è proprio il
  // ricaricamento di evento.html che segue (SpesaApp.goBack()) a far
  // scattare EventoApp.init() → _syncQuiet() → questo debounce.
  //
  // DEBOUNCE vero (non throttle): ogni chiamata cancella il timer
  // precedente e ne riparte uno nuovo — se l'utente salva più movimenti
  // ravvicinati, la sync parte una sola volta, "delayMs" dopo l'ULTIMO
  // salvataggio. Nessun tetto massimo di sicurezza (scelta esplicita,
  // confermata in chat): se l'utente continua a lavorare senza pause,
  // la sync resta rimandata finché non si ferma per almeno "delayMs".
  //
  // RETE DI SICUREZZA: se la pagina viene nascosta o chiusa prima che il
  // timer scada, flushQuietSyncNow() (auto-installata più sotto su
  // visibilitychange/pagehide) esegue subito la sync in sospeso, così
  // non si perde nulla anche uscendo subito dopo un salvataggio.
  //
  // La rotella di sincronizzazione in header (#syncIcon) continua a
  // essere gestita da _showBar()/_hideBar() dentro push() come già
  // prima: gira quando la sync differita parte DAVVERO, non durante
  // l'attesa — nessuna modifica necessaria lì.
  scheduleQuietSync(eventId, delayMs = 5000, onDone = null) {
    Sync._quietSyncEventId = eventId || Sync._quietSyncEventId;
    if (onDone) Sync._quietSyncOnDone = onDone;
    if (Sync._quietSyncTimer) clearTimeout(Sync._quietSyncTimer);
    Sync._quietSyncTimer = setTimeout(() => {
      Sync._quietSyncTimer = null;
      Sync._runQuietSync();
    }, delayMs);
  },

  // Annulla una sync differita in sospeso senza eseguirla (usata da
  // syncNow() prima di fare una sync manuale immediata, per evitare un
  // secondo giro superfluo pochi secondi dopo).
  cancelQuietSync() {
    if (Sync._quietSyncTimer) {
      clearTimeout(Sync._quietSyncTimer);
      Sync._quietSyncTimer = null;
    }
  },

  async _runQuietSync() {
    const eventId = Sync._quietSyncEventId;
    const onDone  = Sync._quietSyncOnDone;
    if (!Utils.isOnline()) return; // ritenterà al prossimo giro utile (init, torna online, ecc.)
    try {
      await Sync.push();
      if (eventId) await Sync.pullEvent(eventId);
      if (typeof onDone === 'function') await onDone();
    } catch (e) {
      console.warn('[Sync] Sync differita fallita:', e.message);
    }
  },

  // Esegue SUBITO una sync differita ancora in sospeso, bypassando
  // l'attesa — chiamata dalla rete di sicurezza qui sotto. Fire-and-
  // forget per natura (la pagina si sta nascondendo/chiudendo, non c'è
  // un modo affidabile per aspettare un'operazione async in quel
  // momento) e salta il refresh dell'interfaccia (onDone): non ha senso
  // ridisegnare una pagina che l'utente non sta più guardando.
  flushQuietSyncNow() {
    if (!Sync._quietSyncTimer) return; // niente in sospeso
    clearTimeout(Sync._quietSyncTimer);
    Sync._quietSyncTimer = null;
    const eventId = Sync._quietSyncEventId;
    if (!Utils.isOnline()) return;
    Sync.push().then(() => {
      if (eventId) return Sync.pullEvent(eventId);
    }).catch(() => {});
  },

  /**
   * FIX licenza foto per-evento (license.js v1.3): true se QUESTO device
   * sincronizza le foto (versione Pro), OPPURE se l'evento indicato è
   * ospitato da un creatore con versione Pro (event.photo_sync_enabled).
   * Usata per il push delle foto movimenti qui sotto e per pullEvent().
   */
  async _isPhotoSyncAllowedForEvent(eventId) {
    if (typeof License === 'undefined') return true;
    if (!eventId) return License.photoSyncAllowed();
    const ev = await DB.events.getById(eventId);
    return License.photoSyncAllowedForEvent(ev);
  },

  async _executePending(op) {
    const { type, payload } = op;
    switch (type) {
      case 'create_event': {
        // LICENZA (v1.7): versione Base = niente sincronizzazione foto,
        // nemmeno la copertina evento. Il campo resta SOLO in locale.
        const eventToSend = (typeof License !== 'undefined' && !License.photoSyncAllowed())
          ? { ...payload.event, photo: null }
          : payload.event;
        await SupabaseClient.events.create(eventToSend);
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
      case 'update_event': {
        const eventToSend = (typeof License !== 'undefined' && !License.photoSyncAllowed())
          ? { ...payload.event, photo: null }
          : payload.event;
        await SupabaseClient.events.update(eventToSend);
        await DB.events.markSynced(payload.event.id);
        break;
      }
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
      case 'request_device_license':
        // Richiesta di abilitazione Pro fatta offline da Impostazioni
        // (vedi license.js → requestPro()): qui arriva solo se il
        // tentativo diretto al momento dell'invio non era riuscito
        // (utente offline o errore di rete). Idempotente come sopra.
        await SupabaseClient.deviceLicense.request(payload.device_id, payload.label);
        break;
      default:
        console.warn('[Sync] Unknown pending type:', type);
    }
  },

  // NUOVO v2.2: usa SupabaseClient.expenses.upsert() (vero upsert
  // PostgREST — vedi supabase.js v1.13) invece del vecchio pattern
  // "scarica TUTTE le spese dell'evento, controlla se questo id esiste
  // già, poi decidi create o update" — quel fetch completo ad OGNI
  // spesa non sincronizzata era una delle cause della lentezza
  // percepita, soprattutto su eventi con molti movimenti. L'upsert
  // gestisce da solo sia il caso "nuova spesa" sia "modifica" (e anche
  // "creata e cancellata offline prima di aver mai sincronizzato", che
  // prima veniva silenziosamente ignorata) in un'unica richiesta.
  async _syncExpense(exp) {
    await SupabaseClient.expenses.upsert(exp);
  },

  async _syncPayment(pay) {
    await SupabaseClient.payments.upsert(pay);
  },

  async _syncUser(user) {
    await SupabaseClient.users.upsert(user);
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

    // ─── SINCRONIZZAZIONE INCREMENTALE — NUOVO v2.2 ──────────
    // Richiesta cliente ("troppo lenta"): invece di riscaricare SEMPRE
    // tutti gli utenti/spese/pagamenti dell'evento, chiediamo al server
    // solo i record modificati dopo l'ultimo pull riuscito per QUESTO
    // device (vedi supabase.js v1.13 — parametro "since" su
    // users/expenses/payments.getByEvent()). Il watermark è salvato in
    // locale per evento (_pullSinceKey), NON sincronizzato tra device:
    // ognuno tiene traccia solo di cosa ha già scaricato lui.
    // "since" resta null al primissimo pull di un evento (nessun
    // watermark salvato ancora) → fetch completo, come oggi, necessario
    // per avere tutta la storia la prima volta.
    const sinceKey = Sync._pullSinceKey(eventId);
    const since    = Utils.getConfig(sinceKey) || null;

    // Evento (sempre una singola riga — leggero di suo, nessuna
    // ottimizzazione incrementale necessaria: lo scarichiamo per intero
    // ad ogni pull, come già prima)
    const remoteEvent = await SupabaseClient.events.getById(eventId);
    if (!remoteEvent) return;

    const localEvent = await DB.events.getById(eventId);

    // FIX licenza foto per-evento (license.js v1.3): calcolato UNA VOLTA
    // qui, usando il valore FRESCO dal server (remoteEvent.photo_sync_enabled),
    // e riusato sotto sia per la copertina evento sia per le foto movimenti.
    const photoAllowed = (typeof License === 'undefined') ||
      License.photoSyncAllowedForEvent(remoteEvent);

    if (!localEvent ||
        new Date(remoteEvent.updated_at) > new Date(localEvent.updated_at)) {
      const merged = {
        ...(localEvent || {}),
        ...remoteEvent,
        synced: true
      };
      // Se non permesso (device Base su un evento NON ospitato da un
      // creatore Pro), non adottiamo la foto remota: il campo resta
      // quello già presente in locale (probabilmente null).
      if (!photoAllowed) {
        merged.photo = (localEvent && localEvent.photo) || null;
      }
      await DB.events.save(merged);
    }

    // Utenti — incrementale (vedi commento sopra)
    const remoteUsers = await SupabaseClient.users.getByEvent(eventId, since);
    if (Array.isArray(remoteUsers)) {
      for (const ru of remoteUsers) {
        const lu = await DB.users.getById(ru.id);
        if (!lu || new Date(ru.updated_at) > new Date(lu.updated_at)) {
          await DB.users.save({ ...(lu || {}), ...ru, synced: true });
        }
      }
    }

    // Spese — incrementale (vedi commento sopra)
    const remoteExp = await SupabaseClient.expenses.getByEvent(eventId, since);
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

      // Foto dei movimenti (versione compatta, ~30-50KB) — batch unico
      // invece di una richiesta per spesa. Solo per le spese che hanno
      // effettivamente has_photo=true.
      // FIX licenza foto per-evento (license.js v1.3): riusa photoAllowed
      // calcolato sopra — un device Base salta questo blocco SOLO se
      // anche l'evento non è ospitato da un creatore Pro.
      if (photoAllowed) {
        try {
          const expIdsWithPhoto = remoteExp.filter(re => re.has_photo).map(re => re.id);
          if (expIdsWithPhoto.length) {
            const remotePhotos = await SupabaseClient.expensePhotos.getByExpenseIds(expIdsWithPhoto);
            for (const rp of remotePhotos) {
              const existingPhoto = await DB.photos.getByExpense(rp.expense_id);
              if (!existingPhoto || new Date(rp.updated_at) > new Date(existingPhoto.updated_at)) {
                await DB.photos.save(rp.expense_id, rp.photo, {
                  sync_data:  rp.photo,
                  created_by: rp.created_by,
                  updated_at: rp.updated_at,
                  synced:     true
                });
              }
            }
          }
          // Pulizia: spese che non hanno più foto sul server (eliminata da
          // chi l'ha creata) ma ne hanno ancora una in locale — la togliamo.
          for (const re of remoteExp) {
            if (!re.has_photo) {
              const existingPhoto = await DB.photos.getByExpense(re.id);
              if (existingPhoto && (existingPhoto.data || existingPhoto.sync_data)) {
                await DB.photos.delete(re.id);
              }
            }
          }
        } catch (e) {
          console.warn('[Sync] Pull foto movimenti fallito:', e.message);
        }
      }
    }

    // Pagamenti saldati — incrementale (vedi commento sopra)
    const remotePay = await SupabaseClient.payments.getByEvent(eventId, since);
    if (Array.isArray(remotePay)) {
      for (const rp of remotePay) {
        const lp = await DB.payments.getById(rp.id);
        if (!lp || new Date(rp.updated_at) > new Date(lp.updated_at)) {
          await DB.payments.save({ ...(lp || {}), ...rp, synced: true });
        }
      }
    }

    // ─── AGGIORNA IL WATERMARK INCREMENTALE — NUOVO v2.2 ─────
    // Calcolato sul MASSIMO updated_at effettivamente ricevuto dal
    // server tra i record appena scaricati (evento + utenti + spese +
    // pagamenti) — MAI sull'orologio locale del device: gli updated_at
    // sono scritti dal device che ha fatto la modifica (vedi
    // supabase.js), quindi usare "adesso" del device che sta facendo il
    // pull potrebbe essere disallineato rispetto a chi ha scritto i
    // dati. Margine di sicurezza di 2 minuti sottratto per tollerare
    // piccoli disallineamenti di orologio residui tra device diversi
    // (se il margine non ci fosse, una modifica scritta con un orologio
    // leggermente "indietro" rischierebbe di essere saltata per sempre
    // dal prossimo pull incrementale). Non arretra MAI il watermark già
    // salvato, anche se questo giro non ha trovato nulla di nuovo.
    try {
      const seenTimestamps = [
        remoteEvent.updated_at,
        ...(Array.isArray(remoteUsers) ? remoteUsers.map(u => u.updated_at) : []),
        ...(Array.isArray(remoteExp)   ? remoteExp.map(e => e.updated_at)   : []),
        ...(Array.isArray(remotePay)   ? remotePay.map(p => p.updated_at)   : [])
      ].filter(Boolean);

      if (seenTimestamps.length) {
        const maxSeen = seenTimestamps.reduce((max, ts) => (ts > max ? ts : max));
        const safeWatermark = new Date(new Date(maxSeen).getTime() - 2 * 60 * 1000).toISOString();
        if (!since || safeWatermark > since) {
          Utils.setConfig(sinceKey, safeWatermark);
        }
      }
    } catch (e) {
      console.warn('[Sync] Aggiornamento watermark incrementale fallito:', e.message);
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
  // Chiave di config locale (per-device, MAI sincronizzata) usata per il
  // watermark della sincronizzazione incrementale — vedi pullEvent().
  _pullSinceKey(eventId) {
    return `sync_since_${eventId}`;
  },

  // Cancella il watermark incrementale di un evento, forzando un pull
  // completo (fetch di TUTTA la storia) al prossimo giro — usata quando
  // i dati locali di un evento potrebbero non essere più coerenti col
  // watermark salvato: import di un backup (impostazioni.html
  // importData(), che può riportare indietro nel tempo lo stato locale)
  // o quando ci si scollega da un evento (il prossimo eventuale rientro
  // deve ripartire da zero, non fidarsi di un vecchio watermark).
  resetPullWatermark(eventId) {
    Utils.setConfig(Sync._pullSinceKey(eventId), null);
  },

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

// ─── RETE DI SICUREZZA PER LA SYNC DIFFERITA — NUOVO v2.1 ─────────
// Auto-installata una sola volta al caricamento dello script (non serve
// che ogni pagina se ne ricordi): se la pagina viene nascosta (cambio
// tab/app, schermo spento) o chiusa mentre una sync differita è ancora
// in attesa (vedi scheduleQuietSync), la esegue subito invece di
// rischiare di perderla. 'visibilitychange' copre anche il passaggio in
// background su mobile (più affidabile di 'pagehide' da solo su iOS).
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') Sync.flushQuietSyncNow();
  });
}
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => Sync.flushQuietSyncNow());
}

window.Sync = Sync;
