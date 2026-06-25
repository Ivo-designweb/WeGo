// ═══════════════════════════════════════════════════════════════
// WeGo — evento.js v2.15
// Logica pagina dettaglio evento
// v2.15: Fase 4 licenza Base/Pro — controllo License.renderDowngradeGateIfNeeded()
//        subito dopo DB.open() (schermata bloccante se il device ha
//        appena perso la versione Pro con troppi eventi)
// v2.14: limite partecipanti (License.js — 15 Base / 50 Pro) applicato
//        in addUser(); sincronizzazione foto movimenti disattivata per i
//        device in versione Base (vedi sync.js / spesa.js)
// v2.13: sincronizzazione foto movimenti — permesso di modifica/
//        cancellazione foto basato su created_by (creatore), non più
//        paid_by (pagatore, usati per due scopi diversi prima); foto
//        ora cancellata con markDeleted (propaga al server, non più
//        hard delete locale); bump updated_at su modifica pagamento e
//        self-heal joined_at (vedi anche db.js v1.5)
// v2.12: puntino sync sempre visibile, schema colori allineato al
//        puntino di connessione (verde/rosso, niente più giallo);
//        messaggio popup manuale aggiornato (richiede autorizzazione)
// v2.11: rimosso il banner persistente "in attesa di sincronizzazione"
//        — sostituito da un puntino accanto all'icona di aggiornamento
// v2.10: eventId nel payload delete_user (vedi sync.js gating)
// ═══════════════════════════════════════════════════════════════

const EventoApp = {

  // ─── STATO ────────────────────────────────────────────────
  _eventId:       null,
  _event:         null,
  _users:         [],
  _expenses:      [],
  _payments:      [],
  _currentTab:    'spese',
  _currentUserId: null,
  _balances:      {},
  _menuOpen:      false,
  _searchQuery:   '',

  // ─── INIT ─────────────────────────────────────────────────
  async init() {
    const params = new URLSearchParams(window.location.search);
    EventoApp._eventId = params.get('id');

    if (!EventoApp._eventId) {
      Utils.toast('Evento non trovato', 'error');
      setTimeout(() => { window.location.href = '/index.html'; }, 1500);
      return;
    }

    // Carica chiavi.json dal server (sovrascrive sempre supabase/fcm locali se presente)
    Utils.applyTheme(Utils.getConfig('theme', 'dark'));
    Utils.loadRemoteConfig().catch(() => {}); // background: non blocca i dati locali

    // Registra il Service Worker e attende che sia ATTIVO (non solo
    // "installing"): serve per le notifiche push (pushManager richiede un
    // worker attivo) ed è più robusto del semplice register() fire-and-forget.
    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('/sw.js');
        window._swRegistration = await navigator.serviceWorker.ready;
      } catch (e) {
        console.warn('[SW] Registrazione non riuscita:', e);
      }
    }

    // Apertura IndexedDB: priorità assoluta ai dati locali (offline-first).
    // Se fallisce non blocchiamo tutto: l'utente vedrà al massimo un errore
    // puntuale invece di restare bloccato su "Caricamento…".
    try {
      await DB.open();
    } catch (e) {
      console.error('[Evento] DB.open failed:', e);
      Utils.toast('Errore database locale', 'error');
    }

    // Licenza (Fase 4, license.js): stesso controllo di app.js — se il
    // device ha appena perso la versione Pro con troppi eventi per la
    // versione Base, blocca tutto qui prima di caricare l'evento.
    if (typeof License !== 'undefined' && await License.renderDowngradeGateIfNeeded()) {
      return;
    }

    // Salva come ultimo evento aperto
    localStorage.setItem('wego_last_event_id', EventoApp._eventId);

    await EventoApp.loadAll();

    const session = DB.sessions.get(EventoApp._eventId);
    EventoApp._currentUserId = session?.userId || null;

    // Self-heal per utenti esistenti creati prima dell'introduzione del
    // campo joined_at: se questo device sa già "chi sono" (sessione locale)
    // ma il record utente non ha ancora joined_at, lo impostiamo ora e lo
    // sincronizziamo, così anche gli altri device vedranno correttamente
    // questo partecipante come connesso.
    if (EventoApp._currentUserId) {
      try {
        const me = await DB.users.getById(EventoApp._currentUserId);
        if (me && !me.joined_at) {
          me.joined_at = Utils.now();
          me.synced    = false;
          me.updated_at = Utils.now();
          await DB.users.save(me);
          // Aggiorna anche l'array in memoria, così se si passa al tab
          // "Partecipanti" senza ricaricare la pagina lo stato è già corretto.
          const cached = EventoApp._users.find(u => u.id === me.id);
          if (cached) cached.joined_at = me.joined_at;
          if (Utils.isOnline()) Sync.push().catch(() => {});
        }
      } catch (e) {
        console.warn('[Evento] Self-heal joined_at fallito:', e.message);
      }
    }

    EventoApp._initNetwork();

    if (Utils.isOnline()) EventoApp._syncQuiet();

    // Notifiche push: se il permesso è già stato concesso in precedenza,
    // (ri)registra la sottoscrizione per QUESTO evento — è il passo che
    // manca per far arrivare le notifiche di nuovi movimenti quando l'app
    // è chiusa, perché il device deve essere noto al server per ogni evento.
    if (typeof Notifications !== 'undefined') {
      Notifications.init().catch(() => {});
      Notifications.registerForEvent(EventoApp._eventId, EventoApp._currentUserId).catch(() => {});
    }

    // Chiudi menu al click fuori
    document.addEventListener('click', (e) => {
      if (EventoApp._menuOpen &&
          !document.getElementById('eventMenu').contains(e.target) &&
          !document.getElementById('eventMenuBtn').contains(e.target)) {
        EventoApp.closeEventMenu();
      }
    });
  },

  _initNetwork() {
    const ind = document.getElementById('connectionIndicator');
    const update = () => {
      if (ind) ind.style.background = Utils.isOnline() ? 'var(--green)' : 'var(--red)';
      if (Utils.isOnline()) EventoApp._syncQuiet();
    };
    window.addEventListener('online',  update);
    window.addEventListener('offline', update);
    update();
  },

  // ─── CARICA TUTTI I DATI ──────────────────────────────────
  async loadAll() {
    try {
      EventoApp._event    = await DB.events.getById(EventoApp._eventId);
      EventoApp._users    = await DB.users.getByEvent(EventoApp._eventId);
      const allExp        = await DB.expenses.getByEvent(EventoApp._eventId);
      EventoApp._expenses = allExp.filter(e => !e.deleted);
      EventoApp._payments = await DB.payments.getByEvent(EventoApp._eventId);
    } catch (e) {
      console.error('[Evento] loadAll error:', e);
      Utils.toast('Errore nel caricamento dei dati locali', 'error');
      return;
    }

    if (!EventoApp._event) {
      Utils.toast('Evento non trovato nel database locale', 'error');
      return;
    }

    EventoApp._calcBalances();
    EventoApp._renderAll();
  },

  // ─── CALCOLA SALDI ────────────────────────────────────────
  _calcBalances() {
    EventoApp._balances = Utils.calculateBalances(
      EventoApp._expenses,
      EventoApp._users
    );
    for (const pay of EventoApp._payments) {
      EventoApp._balances[pay.from_user] = (EventoApp._balances[pay.from_user] || 0) + pay.amount;
      EventoApp._balances[pay.to_user]   = (EventoApp._balances[pay.to_user]   || 0) - pay.amount;
    }
  },

  // ─── RENDER TUTTO ─────────────────────────────────────────
  _renderAll() {
    EventoApp._renderHero();
    EventoApp._renderTab(EventoApp._currentTab);
  },

  _renderHero() {
    const ev = EventoApp._event;
    if (!ev) return;

    document.title = `${ev.title} — WeGo`;

    // Header compatto: foto + titolo + codice
    const titleEl = document.getElementById('headerEventTitle');
    const codeEl  = document.getElementById('headerEventCodeText');
    const photoEl = document.getElementById('headerEventPhoto');

    if (titleEl) titleEl.textContent = ev.title;
    if (codeEl)  codeEl.textContent  = ev.code;

    if (ev.photo && photoEl) {
      photoEl.innerHTML = `<img src="${ev.photo}" alt="" />`;
    }

    // Mostra bottone elimina e aggiungi partecipante solo al creatore
    const session = DB.sessions.get(EventoApp._eventId);
    const currentUserName = session?.userName || '';
    const isCreator = ev.created_by && currentUserName &&
                      ev.created_by.toLowerCase() === currentUserName.toLowerCase();

    const deleteBtn = document.getElementById('ctxDeleteBtn');
    if (deleteBtn) deleteBtn.style.display = isCreator ? '' : 'none';

    // ctx-menu "Aggiungi partecipante": solo al creatore
    const ctxAddUser = document.querySelector('.ctx-item[onclick="EventoApp.showAddUser()"]');
    if (ctxAddUser) ctxAddUser.style.display = isCreator ? '' : 'none';

    // Contatori tab
    const nMovimenti = EventoApp._expenses.filter(e => !e.deleted).length + EventoApp._payments.length;
    const countSpeseEl = document.getElementById('tabSpeseCount');
    const countPartEl  = document.getElementById('tabPartCount');
    if (countSpeseEl) countSpeseEl.textContent = nMovimenti ? `(${nMovimenti})` : '';
    if (countPartEl)  countPartEl.textContent  = EventoApp._users.length ? `(${EventoApp._users.length})` : '';

    // Puntino di stato sincronizzazione, accanto al puntino di connessione e
    // all'icona di aggiornamento: stesso schema colori (verde/rosso), sempre
    // visibile. Verde = sincronizzato col server (evento non gated, oppure
    // gated ma abilitato); rosso = NON sincronizzato (gated e non ancora
    // abilitato). Nessun popup qui: solo un'indicazione visiva passiva,
    // sempre aggiornata ad ogni sync (manuale o automatica) perché
    // _renderHero() viene chiamata da loadAll() dopo ogni ciclo
    // (vedi syncNow()/_syncQuiet()).
    const gateDot = document.getElementById('syncGateDot');
    if (gateDot) {
      const isSynced = !ev.gated || !!ev.sync_allowed;
      gateDot.style.background = isSynced ? 'var(--green)' : 'var(--red)';
      gateDot.title = isSynced
        ? 'Sincronizzato'
        : 'Non sincronizzato — tocca l\'icona di aggiornamento per i dettagli';
    }

    // Voce di menu "Richiedi sincronizzazione": visibile solo se l'evento
    // è ancora in attesa di abilitazione (gated e non sync_allowed).
    const ctxSyncBtn = document.getElementById('ctxSyncRequestBtn');
    if (ctxSyncBtn) ctxSyncBtn.style.display = (ev.gated && !ev.sync_allowed) ? '' : 'none';
  },

  // ─── RICHIESTA SINCRONIZZAZIONE (evento gated) ────────────
  // Invia il codice evento via WhatsApp (o condivisione di sistema) a chi
  // deve abilitare la sincronizzazione — l'app non conosce il contatto
  // dell'admin, quindi apre la condivisione generica così l'utente scrive
  // a chi vuole (es. il numero WhatsApp che già usa per contattarlo).
  shareSyncRequest() {
    const ev = EventoApp._event;
    if (!ev) return;
    const msg = `Ciao! Ho creato l'evento "${ev.title}" su WeGo.\n\nCodice: ${ev.code}\n\nPuoi abilitare la sincronizzazione sul server?`;
    if (navigator.share) {
      navigator.share({ title: 'WeGo — richiesta sincronizzazione', text: msg }).catch(() => {
        window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
      });
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
    }
  },

  // ─── SWITCH TAB ───────────────────────────────────────────
  switchTab(tab) {
    EventoApp._currentTab = tab;

    ['spese', 'partecipanti', 'saldi'].forEach(t => {
      const cap = t.charAt(0).toUpperCase() + t.slice(1);
      const btn   = document.getElementById(`tab${cap}`);
      const panel = document.getElementById(`panel${cap}`);
      if (btn)   btn.classList.toggle('active', t === tab);
      if (panel) panel.style.display = t === tab ? '' : 'none';
    });

    const fabBar = document.getElementById('fabBar');
    if (fabBar) fabBar.style.display = tab === 'spese' ? '' : 'none';

    // Mostra/nasconde la testata sticky dei totali (solo nel tab Movimenti)
    const stickyHead = document.getElementById('speseStickyHead');
    if (stickyHead) stickyHead.style.display = tab === 'spese' ? '' : 'none';

    EventoApp._renderTab(tab);
  },

  _renderTab(tab) {
    if (tab === 'spese')        EventoApp._renderSpese();
    if (tab === 'partecipanti') EventoApp._renderPartecipanti();
    if (tab === 'saldi')        EventoApp._renderSaldi();
  },

  // ─── RICERCA MOVIMENTI (descrizione, note, data) ──────────
  onSearchInput() {
    const input    = document.getElementById('movSearchInput');
    const clearBtn = document.getElementById('movSearchClearBtn');
    if (clearBtn) clearBtn.style.display = input && input.value ? '' : 'none';
  },

  runSearch() {
    const input = document.getElementById('movSearchInput');
    EventoApp._searchQuery = input ? input.value : '';
    EventoApp.onSearchInput();
    EventoApp._renderSpese();
  },

  clearSearch() {
    const input = document.getElementById('movSearchInput');
    if (input) input.value = '';
    EventoApp._searchQuery = '';
    EventoApp.onSearchInput();
    EventoApp._renderSpese();
  },

  // ─── RENDER MOVIMENTI (spese + trasferimenti + pagamenti) ──
  _renderSpese() {
    const expenses = EventoApp._expenses;          // include 'expense' e 'transfer'
    const payments = EventoApp._payments;
    const users    = EventoApp._users;
    const currency = EventoApp._event?.currency || 'EUR';

    const userMap = {};
    users.forEach(u => { userMap[u.id] = u; });

    // Solo le spese reali concorrono al totale e alla media (NO trasferimenti/pagamenti)
    const realExpenses = expenses.filter(e => (e.type || 'expense') === 'expense');
    const totale = realExpenses.reduce((s, e) => s + parseFloat(e.amount || 0), 0);
    const count  = realExpenses.length;

    document.getElementById('summaryTotal').textContent = Utils.formatAmount(totale, currency);
    document.getElementById('summaryCount').textContent = count;
    document.getElementById('summaryAvg').textContent   =
      count > 0 && users.length > 0
        ? Utils.formatAmount(totale / users.length, currency)
        : '—';

    // Quota personale: importo in grassetto, verde se a credito, rosso se a debito
    const myQuotaInner = document.getElementById('myQuotaInner');
    const myQuotaText  = document.getElementById('myQuotaText');
    if (EventoApp._currentUserId && myQuotaInner) {
      const myBal = EventoApp._balances[EventoApp._currentUserId] || 0;
      const amountHtml = `<b style="font-weight:700;color:${myBal >= 0 ? 'var(--green)' : 'var(--red)'};">${Utils.formatAmount(Math.abs(myBal), currency)}</b>`;
      myQuotaText.innerHTML = myBal >= 0
        ? `Sei in credito di ${amountHtml}`
        : `Devi ${amountHtml}`;
      myQuotaInner.style.display = 'flex';
    }

    const container = document.getElementById('expenseList');
    if (!container) return;

    // Costruisce elenco unificato dei movimenti
    let movements = [];

    for (const exp of expenses) {
      movements.push({
        kind:    (exp.type === 'transfer') ? 'transfer' : 'expense',
        id:      exp.id,
        date:    exp.date || Utils.formatDate(exp.created_at),
        created: exp.created_at || '',
        data:    exp
      });
    }
    for (const pay of payments) {
      movements.push({
        kind:    'payment',
        id:      pay.id,
        date:    pay.date || Utils.formatDate(pay.created_at),
        created: pay.created_at || '',
        data:    pay
      });
    }

    // Filtro di ricerca: descrizione (titolo), note e data del movimento
    const query = (EventoApp._searchQuery || '').trim().toLowerCase();
    if (query) {
      movements = movements.filter(m => {
        const title = (m.data.title || '').toLowerCase();
        const notes = (m.data.notes || m.data.note || '').toLowerCase();
        const dateRaw   = (m.date || '').toLowerCase();
        const dateLabel = Utils.formatDateLabel(m.date).toLowerCase();
        const dateShort = Utils.formatDate(m.date).toLowerCase();
        return title.includes(query) || notes.includes(query) ||
               dateRaw.includes(query) || dateLabel.includes(query) || dateShort.includes(query);
      });
    }

    if (movements.length === 0) {
      container.innerHTML = query
        ? `
        <div class="empty-state" style="padding:30px 0;">
          <p class="empty-state__title">Nessun risultato</p>
          <p class="empty-state__desc">Nessun movimento corrisponde alla ricerca "${Utils.escapeHtml(EventoApp._searchQuery)}".</p>
        </div>`
        : `
        <div class="empty-state" style="padding:30px 0;">
          <p class="empty-state__title">Nessun movimento</p>
          <p class="empty-state__desc">Tocca + per aggiungere la prima spesa o un movimento di cassa.</p>
        </div>`;
      return;
    }

    // Raggruppa per data (desc), all'interno ordina per created desc
    const grouped = {};
    for (const m of movements) {
      if (!grouped[m.date]) grouped[m.date] = [];
      grouped[m.date].push(m);
    }

    let html = '';
    for (const [day, items] of Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0]))) {
      items.sort((a, b) => String(b.created).localeCompare(String(a.created)));
      html += `<div class="exp-group-date">${Utils.formatDateLabel(day)}</div>`;
      for (const m of items) {
        html += EventoApp._renderMovementItem(m, userMap, currency);
      }
    }
    container.innerHTML = html;
  },

  _renderMovementItem(m, userMap, currency) {
    const amountStr = Utils.formatAmount(parseFloat(m.data.amount || 0), currency);

    // ── PAGAMENTO (saldo) ──
    if (m.kind === 'payment') {
      const from = userMap[m.data.from_user];
      const to   = userMap[m.data.to_user];
      const fromName = from ? Utils.escapeHtml(from.name) : '?';
      const toName   = to   ? Utils.escapeHtml(to.name)   : '?';
      const idx = from ? Utils.avatarColorIndex(from.name) : 0;
      const syncBadge = m.data.synced === false ? `<span class="exp-badge exp-badge--sync">sync</span>` : '';
      const methodBadge = m.data.method ? `<span class="exp-badge">${Utils.escapeHtml(m.data.method)}</span>` : '';
      return `
        <div class="exp-item" onclick="EventoApp.editPayment('${m.id}')">
          <div class="exp-avatar">
            <div class="avatar avatar-${idx} avatar--sm" style="background:var(--green);">↹</div>
          </div>
          <div class="exp-info">
            <div class="exp-title">${fromName} → ${toName}</div>
            <div class="exp-meta">
              <span class="exp-badge" style="color:var(--green);background:rgba(34,197,94,0.12);">pagamento</span>
              ${methodBadge}${syncBadge}
            </div>
          </div>
          <div class="exp-amount">
            <div class="exp-amount__val" style="color:var(--green);">${amountStr}</div>
          </div>
        </div>`;
    }

    // ── TRASFERIMENTO (movimento cassa) ──
    if (m.kind === 'transfer') {
      const from = userMap[m.data.paid_by];
      const to   = userMap[m.data.paid_for];
      const fromName = from ? Utils.escapeHtml(from.name) : '?';
      const toName   = to   ? Utils.escapeHtml(to.name)   : '?';
      const idx = from ? Utils.avatarColorIndex(from.name) : 0;
      const syncBadge = m.data.synced === false ? `<span class="exp-badge exp-badge--sync">sync</span>` : '';
      return `
        <div class="exp-item" onclick="EventoApp.editExpense('${m.id}')">
          <div class="exp-avatar">
            <div class="avatar avatar-${idx} avatar--sm">${from ? Utils.initials(from.name) : '?'}</div>
          </div>
          <div class="exp-info">
            <div class="exp-title">${Utils.escapeHtml(m.data.title || 'Movimento cassa')}</div>
            <div class="exp-meta">
              <span class="exp-badge">trasferimento</span>
              <span class="exp-meta-txt">${fromName} → ${toName}</span>${syncBadge}
            </div>
          </div>
          <div class="exp-amount">
            <div class="exp-amount__val">${amountStr}</div>
          </div>
        </div>`;
    }

    // ── SPESA NORMALE ──
    const exp = m.data;
    const payer    = userMap[exp.paid_by];
    const payerIdx = payer ? Utils.avatarColorIndex(payer.name) : 0;
    const payerInit = payer ? Utils.initials(payer.name) : '?';
    const isMyExp  = exp.paid_by === EventoApp._currentUserId;
    // Permesso di modificare/eliminare la foto: solo chi ha CREATO il
    // movimento (non chi l'ha pagato — possono essere persone diverse).
    const isPhotoOwner = exp.created_by === EventoApp._currentUserId;
    const nPart    = (exp.participants || []).length;
    const syncBadge = exp.synced === false ? `<span class="exp-badge exp-badge--sync">sync</span>` : '';
    const photoBadge = exp.has_photo
      ? `<span class="exp-badge exp-badge--photo" style="cursor:pointer;" onclick="EventoApp.openLightbox('${exp.id}',${isPhotoOwner},event)" title="Vedi foto">📷</span>`
      : '';
    const gpsBadge   = (exp.location_lat || exp.location?.lat) ? `<span class="exp-badge">📍</span>` : '';
    const methodBadge = exp.payment_method ? `<span class="exp-badge">${Utils.escapeHtml(exp.payment_method)}</span>` : '';
    return `
      <div class="exp-item" onclick="EventoApp.editExpense('${exp.id}')">
        <div class="exp-avatar">
          <div class="avatar avatar-${payerIdx} avatar--sm" title="${payer ? Utils.escapeHtml(payer.name) : '?'}">${payerInit}</div>
        </div>
        <div class="exp-info">
          <div class="exp-title">${Utils.escapeHtml(exp.title)}</div>
          <div class="exp-meta">
            ${payer ? `<span class="exp-meta-txt">${Utils.escapeHtml(payer.name)}</span>` : ''}
            ${nPart ? `<span class="exp-meta-txt">· diviso tra ${nPart}</span>` : ''}
            ${photoBadge}${gpsBadge}${methodBadge}${syncBadge}
          </div>
        </div>
        <div class="exp-amount">
          <div class="exp-amount__val">${amountStr}</div>
          ${isMyExp ? `<div class="exp-amount__lbl" style="color:var(--green);">tu</div>` : ''}
        </div>
      </div>`;
  },

  // ─── RENDER PARTECIPANTI ──────────────────────────────────
  // ─── TOTALE VERSATO/INCASSATO PER PARTECIPANTE ────────────
  // Sostituisce il saldo (credito/debito) nella lista partecipanti con:
  //   (spese pagate + movimenti cassa in uscita) - movimenti cassa in entrata
  // Se il risultato è negativo (ha incassato più di quanto versato),
  // si mostra il valore assoluto con un colore diverso per segnalarlo.
  _calcUserContribution(userId) {
    let paidExpenses    = 0;
    let transfersOut    = 0;
    let transfersIn     = 0;

    for (const exp of EventoApp._expenses) {
      const amount = Number(exp.amount) || 0;
      if (exp.type === 'transfer') {
        if (exp.paid_by  === userId) transfersOut += amount;
        if (exp.paid_for === userId) transfersIn  += amount;
      } else {
        if (exp.paid_by === userId) paidExpenses += amount;
      }
    }

    const net = (paidExpenses + transfersOut) - transfersIn;
    return { amount: Math.abs(net), isNetReceiver: net < 0 };
  },

  // ─── FORMATO DATA "ultima connessione" per pagina Partecipanti ──
  // Esempio richiesto: "21 giugno 26 - 17:07"
  _formatLastSeen(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const day   = d.toLocaleDateString('it-IT', { day: 'numeric' });
    const month = d.toLocaleDateString('it-IT', { month: 'long' });
    const year  = String(d.getFullYear()).slice(-2);
    const time  = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    return `${day} ${month} ${year} - ${time}`;
  },

  _renderPartecipanti() {
    const container = document.getElementById('partecipantiList');
    if (!container) return;

    const currency = EventoApp._event?.currency || 'EUR';

    const ev = EventoApp._event;
    const creatorName = ev?.created_by || '';

    let html = '';
    for (const user of EventoApp._users) {
      const idx       = Utils.avatarColorIndex(user.name);
      const contrib    = EventoApp._calcUserContribution(user.id);
      const balColor   = contrib.isNetReceiver ? 'var(--accent)' : 'var(--green)';
      const balText    = Utils.formatAmount(contrib.amount, currency);
      const balLabel   = contrib.isNetReceiver ? 'Incassato' : 'Versato';
      const isMe      = user.id === EventoApp._currentUserId;
      const isCreator = creatorName && user.name.toLowerCase() === creatorName.toLowerCase();
      // "Connesso" = ha effettuato il join almeno una volta (joined_at
      // sincronizzato dal server, visibile da TUTTI i device — non solo
      // da quello su cui è avvenuto il join).
      const hasJoined = !!user.joined_at;

      // Bottone invita: non mostrare sul creatore, né su chi è già connesso
      // (l'invito via WhatsApp serve solo a chi non ha ancora fatto il join)
      const inviteBtn = (!isCreator && !hasJoined)
        ? `<button onclick="EventoApp.shareInviteWhatsApp('${Utils.escapeHtml(user.name).replace(/'/g,"\\'")}');event.stopPropagation();"
            style="margin-left:8px;background:#25D366;border:none;border-radius:4px;padding:1px 6px;cursor:pointer;display:inline-flex;align-items:center;gap:3px;font-size:10.5px;font-weight:700;color:#fff;">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="white">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            Invita
          </button>`
        : '';

      // Stato connessione: se connesso, su un'unica riga mostriamo anche
      // data/ora dell'ultima sincronizzazione, con badge blu a contrasto
      // (es. "Connesso 21 giugno 26 - 17:07"), senza parentesi e senza
      // andare mai a capo. Se non connesso, resta solo "Non ancora
      // connesso" + bottone invita.
      const lastSeenText = EventoApp._formatLastSeen(user.last_sync_at);
      const statusLine = hasJoined
        ? `<span style="white-space:nowrap;">● Connesso</span>${lastSeenText
            ? ` <span style="background:#2563EB;color:#fff;font-weight:700;padding:1px 7px;border-radius:999px;font-size:9.5px;white-space:nowrap;">${lastSeenText}</span>`
            : ''}`
        : `<span style="white-space:nowrap;">○ Non ancora connesso</span> ${inviteBtn}`;

      html += `
        <div class="part-item" ${isMe ? 'style="background:rgba(59,130,246,0.05);border-radius:8px;padding:10px 8px;"' : ''}>
          <div class="avatar avatar-${idx}">${Utils.initials(user.name)}</div>
          <div class="part-info">
            <div class="part-name">
              ${Utils.escapeHtml(user.name)}
              ${isMe ? '<span style="font-size:10.5px;font-weight:700;color:var(--accent);background:rgba(59,130,246,0.1);padding:1px 5px;border-radius:999px;margin-left:5px;">Tu</span>' : ''}
              ${isCreator ? '<span style="font-size:10.5px;font-weight:700;color:var(--text-muted);background:var(--bg-input);padding:1px 5px;border-radius:999px;margin-left:5px;">Creatore</span>' : ''}
            </div>
            <div class="part-sub" style="display:flex;align-items:center;gap:4px;font-size:12.5px;${hasJoined ? 'flex-wrap:nowrap;overflow:hidden;' : 'flex-wrap:wrap;'}">
              ${statusLine}
            </div>
          </div>
          <div class="part-balance" style="color:${balColor};text-align:right;">
            ${balText}
            <div style="font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.3px;">${balLabel}</div>
          </div>
          <button onclick="EventoApp.deleteParticipant('${user.id}','${Utils.escapeHtml(user.name).replace(/'/g,"\\'")}');event.stopPropagation();"
            style="margin-left:8px;background:none;border:none;color:var(--red);cursor:pointer;opacity:0.6;padding:4px;flex-shrink:0;"
            title="Elimina partecipante">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
              <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
          </button>
        </div>`;
    }

    container.innerHTML = html || '<p style="color:var(--text-muted);font-size:17.5px;padding:16px 0;">Nessun partecipante.</p>';

    // Punto 1: mostra il bottone "Aggiungi partecipante" solo al creatore
    const session = DB.sessions.get(EventoApp._eventId);
    const currentUserName = session?.userName || '';
    const isCreator = creatorName && currentUserName &&
      creatorName.toLowerCase() === currentUserName.toLowerCase();
    const addBtnWrap = document.getElementById('addUserBtnWrap');
    if (addBtnWrap) addBtnWrap.style.display = isCreator ? '' : 'none';
  },

  // ─── RENDER SALDI ─────────────────────────────────────────
  _renderSaldi() {
    const currency = EventoApp._event?.currency || 'EUR';
    const users    = EventoApp._users;
    const balances = EventoApp._balances;

    // Lista saldi
    const balContainer = document.getElementById('balanceList');
    const sorted = [...users].sort((a, b) => (balances[b.id] || 0) - (balances[a.id] || 0));
    const maxAbs = Math.max(...Object.values(balances).map(v => Math.abs(v)), 0.01);

    let balHtml = '';
    for (const u of sorted) {
      const bal   = balances[u.id] || 0;
      const color = bal > 0 ? 'var(--green)' : bal < 0 ? 'var(--red)' : 'var(--text-muted)';
      const pct   = Math.round((Math.abs(bal) / maxAbs) * 100);
      const idx   = Utils.avatarColorIndex(u.name);
      balHtml += `
        <div class="balance-item">
          <div class="avatar avatar-${idx} avatar--sm">${Utils.initials(u.name)}</div>
          <div class="balance-info">
            <div class="balance-name">${Utils.escapeHtml(u.name)}</div>
            <div class="balance-bar-wrap">
              <div class="balance-bar" style="width:${pct}%;background:${color};"></div>
            </div>
          </div>
          <div class="balance-val" style="color:${color};">
            ${bal > 0 ? '+' : ''}${Utils.formatAmount(bal, currency)}
          </div>
        </div>`;
    }
    if (balContainer) balContainer.innerHTML = balHtml;

    // Transazioni minime
    const txnContainer = document.getElementById('transactionsList');
    const userNames = {};
    users.forEach(u => { userNames[u.id] = u.name; });
    const txns = Utils.calculateMinimalTransactions(balances, userNames);

    if (txnContainer) {
      if (txns.length === 0) {
        txnContainer.innerHTML = `<p style="font-size:16.5px;color:var(--text-muted);padding:8px 0;">Tutto in pareggio! 🎉</p>`;
      } else {
        txnContainer.innerHTML = txns.map(t => {
          const isMe = t.from === EventoApp._currentUserId || t.to === EventoApp._currentUserId;
          return `
            <div class="txn-item" ${isMe ? 'style="background:rgba(59,130,246,0.05);border-radius:8px;padding:10px 8px;"' : ''}>
              <div class="txn-text">
                <b>${Utils.escapeHtml(userNames[t.from] || t.from)}</b>
                → <b>${Utils.escapeHtml(userNames[t.to] || t.to)}</b>
                ${isMe ? '<span style="font-size:11.5px;font-weight:700;color:var(--accent);"> (Tu)</span>' : ''}
              </div>
              <div class="txn-amount">${Utils.formatAmount(t.amount, currency)}</div>
            </div>`;
        }).join('');
      }
    }

    // Pagamenti manuali (già pagato) — rimane senza titolo, si aggiorna silenziosamente
    const settledContainer = document.getElementById('settledList');
    const payments = EventoApp._payments;

    if (settledContainer) {
      if (payments.length === 0) {
        settledContainer.innerHTML = '';
      } else {
        settledContainer.innerHTML = payments.map(p => {
          const fromName = userNames[p.from_user] || '?';
          const toName   = userNames[p.to_user]   || '?';
          return `
            <div class="settled-item">
              <div class="settled-info">
                <div class="settled-text"><b>${Utils.escapeHtml(fromName)}</b> → <b>${Utils.escapeHtml(toName)}</b></div>
                <div class="settled-meta">${p.method ? Utils.escapeHtml(p.method) : ''}${p.note ? ' · ' + Utils.escapeHtml(p.note) : ''}</div>
              </div>
              <div class="settled-amount">${Utils.formatAmount(p.amount, currency)}</div>
            </div>`;
        }).join('');
      }
    }

    // Pagamenti tra utenti (movimenti tipo 'transfer' = Mov. cassa) — SEMPRE VISIBILE
    const transferPayments = EventoApp._expenses.filter(e => e.type === 'transfer');
    const cassaList    = document.getElementById('cassaList');

    if (cassaList) {
      if (transferPayments.length === 0) {
        cassaList.innerHTML = `<p style="font-size:16.5px;color:var(--text-muted);padding:8px 0;">Nessuno</p>`;
      } else {
        cassaList.innerHTML = transferPayments
          .sort((a, b) => new Date(b.date) - new Date(a.date))
          .map(t => {
            const fromName = userNames[t.paid_by]  || '?';
            const toName   = userNames[t.paid_for] || '?';
            return `
            <div class="settled-item" style="cursor:pointer;" onclick="EventoApp.editExpense('${t.id}')">
              <div class="settled-info">
                <div class="settled-text">
                  <b>${Utils.escapeHtml(fromName)}</b>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align:middle;margin:0 2px;">
                    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                  </svg>
                  <b>${Utils.escapeHtml(toName)}</b>
                </div>
                <div class="settled-meta">${Utils.escapeHtml(t.title || 'Mov. cassa')} · ${Utils.formatDate(t.date)}</div>
              </div>
              <div class="settled-amount">${Utils.formatAmount(t.amount, currency)}</div>
            </div>`;
          }).join('');
      }
    }
  },

  // ─── NUOVA / MODIFICA SPESA ───────────────────────────────
  newExpense() {
    window.location.href = `/spesa.html?event=${EventoApp._eventId}`;
  },

  // Apre direttamente la pagina di modifica con tutti i campi editabili
  editExpense(expenseId) {
    window.location.href = `/spesa.html?event=${EventoApp._eventId}&id=${expenseId}&mode=view`;
  },

  // ─── MODIFICA / ELIMINA PAGAMENTO ─────────────────────────
  _editingPaymentId: null,

  editPayment(paymentId) {
    const pay = EventoApp._payments.find(p => p.id === paymentId);
    if (!pay) return;
    EventoApp._editingPaymentId = paymentId;

    const users   = EventoApp._users;
    const methods = PaymentMethods.getEnabled();

    const fromSel = document.getElementById('settleFrom');
    const toSel   = document.getElementById('settleTo');
    const methSel = document.getElementById('settleMethod');

    fromSel.innerHTML = users.map(u =>
      `<option value="${u.id}" ${u.id === pay.from_user ? 'selected' : ''}>${Utils.escapeHtml(u.name)}</option>`
    ).join('');
    toSel.innerHTML = users.map(u =>
      `<option value="${u.id}" ${u.id === pay.to_user ? 'selected' : ''}>${Utils.escapeHtml(u.name)}</option>`
    ).join('');
    methSel.innerHTML = methods.map(m =>
      `<option value="${Utils.escapeHtml(m.id)}" ${m.id === pay.method ? 'selected' : ''}>${Utils.escapeHtml(m.label)}</option>`
    ).join('');

    document.getElementById('settleAmount').value = parseFloat(pay.amount).toFixed(2);
    document.getElementById('settleNote').value   = pay.note || '';

    // Modalità modifica: titolo + bottoni
    const title = document.getElementById('settleTitle');
    if (title) title.textContent = 'Modifica pagamento';
    const confirmBtn = document.getElementById('settleConfirmBtn');
    if (confirmBtn) confirmBtn.textContent = 'Salva modifiche';
    const delBtn = document.getElementById('settleDeleteBtn');
    if (delBtn) delBtn.style.display = '';

    EventoApp.openModal('modalSettlePayment');
  },

  async deletePayment() {
    const paymentId = EventoApp._editingPaymentId;
    if (!paymentId) return;
    if (!confirm('Eliminare questo pagamento?')) return;
    try {
      await DB.payments.delete(paymentId);
      EventoApp.closeModal('modalSettlePayment');
      EventoApp._editingPaymentId = null;
      await EventoApp._persistAndSync();
      Utils.toast('Pagamento eliminato', 'success');
    } catch (e) {
      Utils.toast('Errore eliminazione', 'error');
    }
  },

  // ─── AGGIUNGI PARTECIPANTE ────────────────────────────────
  async deleteParticipant(userId, userName) {
    const hasExpenses = EventoApp._expenses.some(
      e => e.paid_by === userId || (e.participants || []).includes(userId)
    );
    const msg = hasExpenses
      ? `Eliminare "${userName}"?\n\nAttenzione: questo partecipante ha spese associate. Eliminandolo le sue spese rimarranno nel sistema ma senza utente assegnato (da gestire manualmente).\n\nContinuare?`
      : `Eliminare "${userName}" dall'evento?`;

    if (!confirm(msg)) return;

    try {
      await DB.users.delete(userId);
      await DB.pending.add({ type: 'delete_user', payload: { userId, eventId: EventoApp._eventId } });
      if (Utils.isOnline()) Sync.push().catch(() => {});
      Utils.toast(`${userName} eliminato`, 'success');
      await EventoApp.loadAll();
    } catch (err) {
      Utils.toast('Errore eliminazione: ' + err.message, 'error');
    }
  },

  showAddUser() {
    EventoApp.closeEventMenu();
    // Limite partecipanti (License.js — 15 in Base, 50 in Pro). Blocchiamo
    // prima di apparire il modal, come per Crea/Unisciti evento in app.js.
    if (typeof License !== 'undefined' && !License.canAddParticipant(EventoApp._users.length)) {
      Utils.toast(License.msgMaxParticipants(), 'error', 4500);
      return;
    }
    document.getElementById('newUserName').value = '';
    EventoApp.openModal('modalAddUser');
    setTimeout(() => document.getElementById('newUserName').focus(), 300);
  },

  async addUser() {
    const name = document.getElementById('newUserName').value.trim();
    if (!Utils.required(name, 'Nome')) return;

    const exists = EventoApp._users.some(u => u.name.toLowerCase() === name.toLowerCase());
    if (exists) { Utils.toast('Nome già presente', 'error'); return; }

    // Limite partecipanti (License.js — 15 in Base, 50 in Pro). Solo il
    // creatore può arrivare qui (la voce di menu è nascosta agli altri,
    // vedi _renderHero), quindi il limite applicato è quello di QUESTO
    // device, come in fase di creazione evento.
    if (typeof License !== 'undefined' && !License.canAddParticipant(EventoApp._users.length)) {
      Utils.toast(License.msgMaxParticipants(), 'error', 4500);
      return;
    }

    try {
      const user = await DB.users.save({ event_id: EventoApp._eventId, name });
      await DB.pending.add({ type: 'create_user', payload: { user } });
      if (Utils.isOnline()) Sync.push().catch(() => {});
      EventoApp.closeModal('modalAddUser');
      await EventoApp.loadAll();
      Utils.toast(`${name} aggiunto!`, 'success');
    } catch (e) {
      Utils.toast('Errore aggiunta partecipante', 'error');
    }
  },

  // ─── REGISTRA PAGAMENTO ───────────────────────────────────
  showSettlePayment(fromId, toId, amount) {
    EventoApp._editingPaymentId = null;
    const users = EventoApp._users;
    const methods = PaymentMethods.getEnabled();

    const fromSel = document.getElementById('settleFrom');
    const toSel   = document.getElementById('settleTo');
    const methSel = document.getElementById('settleMethod');

    fromSel.innerHTML = users.map(u =>
      `<option value="${u.id}" ${u.id === fromId ? 'selected' : ''}>${Utils.escapeHtml(u.name)}</option>`
    ).join('');
    toSel.innerHTML = users.map(u =>
      `<option value="${u.id}" ${u.id === toId ? 'selected' : ''}>${Utils.escapeHtml(u.name)}</option>`
    ).join('');
    methSel.innerHTML = methods.map(m =>
      `<option value="${Utils.escapeHtml(m.id)}">${Utils.escapeHtml(m.label)}</option>`
    ).join('');

    document.getElementById('settleAmount').value = amount ? amount.toFixed(2) : '';
    document.getElementById('settleNote').value = '';

    // Modalità creazione
    const title = document.getElementById('settleTitle');
    if (title) title.textContent = 'Registra pagamento';
    const confirmBtn = document.getElementById('settleConfirmBtn');
    if (confirmBtn) confirmBtn.textContent = 'Conferma pagamento';
    const delBtn = document.getElementById('settleDeleteBtn');
    if (delBtn) delBtn.style.display = 'none';

    EventoApp.openModal('modalSettlePayment');
  },

  async confirmSettlePayment() {
    const fromId = document.getElementById('settleFrom').value;
    const toId   = document.getElementById('settleTo').value;
    const amount = parseFloat(document.getElementById('settleAmount').value);
    const method = document.getElementById('settleMethod').value;
    const note   = document.getElementById('settleNote').value.trim();

    if (!fromId || !toId)     { Utils.toast('Seleziona utenti', 'error'); return; }
    if (fromId === toId)      { Utils.toast('Mittente e destinatario uguali', 'error'); return; }
    if (!amount || amount <= 0) { Utils.toast('Importo non valido', 'error'); return; }

    const editingId = EventoApp._editingPaymentId;

    try {
      const base = { event_id: EventoApp._eventId, from_user: fromId, to_user: toId, amount, method, note };
      if (editingId) {
        const existing = await DB.payments.getById(editingId);
        await DB.payments.save({ ...existing, ...base, id: editingId, synced: false, updated_at: Utils.now() });
      } else {
        await DB.payments.save({ ...base, date: Utils.today() });
      }
      EventoApp.closeModal('modalSettlePayment');
      EventoApp._editingPaymentId = null;
      await EventoApp._persistAndSync();
      Utils.toast(editingId ? 'Pagamento aggiornato!' : 'Pagamento registrato!', 'success');
    } catch (e) {
      Utils.toast('Errore salvataggio pagamento', 'error');
    }
  },

  // ─── PERSISTENZA + SYNC AUTOMATICA ────────────────────────
  // Spinge i dati locali su Supabase, ricarica dal server e aggiorna la UI.
  async _persistAndSync() {
    try {
      if (Utils.isOnline()) {
        await Sync.push();
        await Sync.pullEvent(EventoApp._eventId);
      }
    } catch (e) {
      console.warn('[Evento] persistAndSync:', e.message);
    } finally {
      await EventoApp.loadAll();
    }
  },

  // ─── CONDIVIDI ────────────────────────────────────────────
  async copyCode() {
    const code = EventoApp._event?.code;
    if (code) await Utils.copyToClipboard(code);
  },

  shareEventCode() {
    EventoApp.closeEventMenu();
    const ev  = EventoApp._event;
    if (!ev) return;
    const msg = `Entra in "${ev.title}" su WeGo!\n\nCodice: ${ev.code}\n\nApri WeGo e tocca "Unisciti a un evento".`;
    if (navigator.share) {
      navigator.share({ title: 'WeGo — ' + ev.title, text: msg }).catch(() => {});
    } else {
      Utils.copyToClipboard(ev.code);
    }
  },

  shareViaWhatsApp() {
    EventoApp.closeEventMenu();
    const ev = EventoApp._event;
    if (!ev) return;
    const msg = `Entra in "${ev.title}" su WeGo!\n\nCodice: *${ev.code}*\n\nApri WeGo e tocca "Unisciti a un evento".`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  },

  shareInviteWhatsApp(personName) {
    const ev = EventoApp._event;
    if (!ev) return;
    const msg = `Ciao ${personName}! Ti invito su WeGo per "${ev.title}".\n\nCodice: *${ev.code}*\n\nApri WeGo e tocca "Unisciti a un evento".`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  },

  // ─── MENU ─────────────────────────────────────────────────
  toggleMenu() {
    const menu = document.getElementById('eventMenu');
    EventoApp._menuOpen = !EventoApp._menuOpen;
    menu.style.display = EventoApp._menuOpen ? 'block' : 'none';
  },

  closeEventMenu() {
    const menu = document.getElementById('eventMenu');
    if (menu) menu.style.display = 'none';
    EventoApp._menuOpen = false;
  },

  // ─── ELIMINA EVENTO (solo creatore) ───────────────────────
  confirmDeleteEvent() {
    EventoApp.closeEventMenu();
    const ev = EventoApp._event;
    if (!ev) return;

    // Doppia verifica lato JS
    const session = DB.sessions.get(EventoApp._eventId);
    const currentUserName = session?.userName || '';
    const isCreator = ev.created_by && currentUserName &&
                      ev.created_by.toLowerCase() === currentUserName.toLowerCase();

    if (!isCreator) {
      Utils.toast('Solo il creatore può eliminare l\'evento', 'error');
      return;
    }

    if (!confirm(
      `⚠️ Eliminare l'evento "${ev.title}"?\n\n` +
      `Tutti i dati (spese, partecipanti, pagamenti) verranno rimossi dal dispositivo.\n\n` +
      `Questa operazione non può essere annullata.`
    )) return;

    EventoApp._doDeleteEvent();
  },

  async _doDeleteEvent() {
    try {
      await DB.events.delete(EventoApp._eventId);
      DB.sessions.remove(EventoApp._eventId);
      localStorage.removeItem('wego_last_event_id');
      Utils.toast('Evento eliminato', 'success');
      setTimeout(() => { window.location.href = '/index.html'; }, 800);
    } catch(e) {
      Utils.toast('Errore eliminazione', 'error');
    }
  },

  // ─── LIGHTBOX FOTO ───────────────────────────────────────
  async openLightbox(expenseId, isPhotoOwner, e) {
    e.stopPropagation(); // non aprire la pagina modifica spesa

    const lb         = document.getElementById('photoLightbox');
    const img        = document.getElementById('lightboxImg');
    const deleteWrap = document.getElementById('lightboxDeleteWrap');
    const noPhoto    = document.getElementById('lightboxNoPhoto');

    // Reset stato
    img.src = '';
    img.style.display = 'none';
    deleteWrap.style.display = 'none';
    noPhoto.style.display = 'none';

    // Apri lightbox
    lb.style.display = 'flex';

    // Carica foto dal DB locale
    const photo = await DB.photos.getByExpense(expenseId);

    if (photo?.data) {
      img.src = photo.data;
      img.style.display = '';
      // Bottone elimina solo a chi ha CREATO il movimento
      if (isPhotoOwner) {
        deleteWrap.style.display = '';
        deleteWrap.dataset.expenseId = expenseId;
      }
    } else {
      // Foto non disponibile su questo device
      noPhoto.style.display = '';
    }
  },

  closeLightbox() {
    const lb = document.getElementById('photoLightbox');
    if (lb) lb.style.display = 'none';
    const img = document.getElementById('lightboxImg');
    if (img) img.src = '';
  },

  async deleteLightboxPhoto(e) {
    e.stopPropagation();
    const deleteWrap = document.getElementById('lightboxDeleteWrap');
    const expenseId  = deleteWrap.dataset.expenseId;
    if (!expenseId) return;

    // Doppio controllo lato app (oltre al bottone già nascosto a chi non
    // ha creato il movimento): non fidarsi solo dello stato della UI.
    const expense = await DB.expenses.getById(expenseId);
    if (!expense || expense.created_by !== EventoApp._currentUserId) {
      Utils.toast('Solo chi ha creato il movimento può eliminare la foto', 'error');
      return;
    }

    if (!confirm('Eliminare la foto? L\'operazione non è reversibile.')) return;

    try {
      // Soft: segna la foto come eliminata e DA PROPAGARE al server (vedi
      // Sync.push) — un hard delete locale perderebbe la cancellazione se
      // il device fosse offline in questo momento.
      await DB.photos.markDeleted(expenseId);

      // Aggiorna has_photo sulla spesa locale
      expense.has_photo  = false;
      expense.synced     = false;
      expense.updated_at = Utils.now();
      await DB.expenses.save(expense);

      if (Utils.isOnline()) Sync.push().catch(() => {});

      Utils.toast('Foto eliminata', 'success');
      EventoApp.closeLightbox();
      await EventoApp.loadAll();
    } catch (err) {
      Utils.toast('Errore eliminazione foto', 'error');
    }
  },

  // ─── NAVIGAZIONE ──────────────────────────────────────────
  goHome(e) {
    if (e) e.preventDefault();
    // Pulisce il last event così index.html mostra la lista
    localStorage.removeItem('wego_last_event_id');
    window.location.href = '/index.html';
  },

  // ─── CONDIVIDI RIEPILOGO ──────────────────────────────────
  async shareRiepilogo() {
    EventoApp.closeEventMenu();
    const ev       = EventoApp._event;
    const users    = EventoApp._users;
    const expenses = EventoApp._expenses.filter(e => !e.deleted);
    const payments = EventoApp._payments || [];
    const cur      = ev?.currency || 'EUR';

    const usersMap = Object.fromEntries(users.map(u => [u.id, u.name]));
    const balances = {};
    users.forEach(u => { balances[u.id] = 0; });

    expenses.filter(e => e.type !== 'transfer').forEach(exp => {
      const amount = parseFloat(exp.amount) || 0;
      const nPart  = (exp.participants || []).length || 1;
      const share  = amount / nPart;
      if (exp.paid_by) balances[exp.paid_by] = (balances[exp.paid_by] || 0) + amount;
      (exp.participants || []).forEach(uid => {
        balances[uid] = (balances[uid] || 0) - share;
      });
    });
    payments.forEach(p => {
      balances[p.from_user] = (balances[p.from_user] || 0) + parseFloat(p.amount);
      balances[p.to_user]   = (balances[p.to_user]   || 0) - parseFloat(p.amount);
    });

    const txs    = Utils.calculateMinimalTransactions(balances, usersMap);
    const totale = expenses
      .filter(e => e.type !== 'transfer')
      .reduce((s, e) => s + parseFloat(e.amount), 0);

    let text = '📊 Riepilogo WeGo — ' + (ev?.title || 'Evento') + '\n';
    text += 'Totale: ' + Utils.formatAmount(totale, cur) + ' · ' + expenses.length + ' spese\n\n';

    if (txs.length === 0) {
      text += '✅ Tutti i conti sono in pareggio!\n';
    } else {
      text += '💸 Da saldare:\n';
      txs.forEach(tx => {
        text += '  ' + tx.fromName + ' → ' + tx.toName + ': ' + Utils.formatAmount(tx.amount, cur) + '\n';
      });
    }
    text += '\nCodice evento: ' + (ev?.code || '—');

    Utils.share({ title: 'WeGo — ' + ev?.title, text });
  },


  // ─── MODAL ────────────────────────────────────────────────
  openModal(id)  { document.getElementById(id)?.classList.add('open'); },
  closeModal(id) { document.getElementById(id)?.classList.remove('open'); },

  // ─── SYNC ─────────────────────────────────────────────────
  // Tap manuale sull'icona di aggiornamento: è l'UNICO punto in cui
  // mostriamo un popup sullo stato di sincronizzazione (3 secondi, vedi
  // Utils.toast). Le sincronizzazioni automatiche (_syncQuiet, sotto)
  // restano sempre silenziose: aggiornano solo il puntino di stato.
  async syncNow() {
    try {
      if (!Utils.isOnline()) { Utils.toast('Nessuna connessione', 'error'); return; }
      await Sync.push();
      await Sync.pullEvent(EventoApp._eventId);
      await EventoApp.loadAll();

      // Messaggio in base allo stato REALE dell'evento dopo il ciclo di
      // sync appena concluso (non un generico "Sincronizzato" sempre
      // uguale): se è ancora gated e non abilitato, niente è stato
      // davvero inviato al server, quindi lo diciamo chiaramente.
      const ev = EventoApp._event;
      if (ev && ev.gated && !ev.sync_allowed) {
        Utils.toast('Questo evento non è sincronizzato sul server: richiede l\'autorizzazione dell\'amministratore per essere abilitato.', 'info', 3000);
      } else {
        Utils.toast('Sincronizzato', 'success', 2000);
      }
    } catch (e) {
      Utils.toast('Errore sync', 'error');
    }
  },

  async _syncQuiet() {
    try {
      await Sync.push();
      await Sync.pullEvent(EventoApp._eventId);
      await EventoApp.loadAll();
    } catch (e) {
      console.warn('[Evento] Quiet sync failed:', e);
    }
  }
};

window.EventoApp = EventoApp;
