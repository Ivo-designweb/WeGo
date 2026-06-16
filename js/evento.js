// ═══════════════════════════════════════════════════════════════
// WeGo — evento.js v1.0
// Logica pagina dettaglio evento
// ═══════════════════════════════════════════════════════════════

const EventoApp = {

  // ─── STATO ────────────────────────────────────────────────
  _eventId:    null,
  _event:      null,
  _users:      [],
  _expenses:   [],
  _payments:   [],
  _currentTab: 'spese',
  _currentUserId: null,
  _balances:   {},
  _menuOpen:   false,

  // ─── INIT ─────────────────────────────────────────────────
  async init() {
    // Leggi ID evento dalla URL
    const params = new URLSearchParams(window.location.search);
    EventoApp._eventId = params.get('id');

    if (!EventoApp._eventId) {
      Utils.toast('Evento non trovato', 'error');
      setTimeout(() => { window.location.href = '/index.html'; }, 1500);
      return;
    }

    // Applica tema
    Utils.applyTheme(Utils.getConfig('theme', 'dark'));

    // Registra SW
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    await DB.open();

    // Carica dati
    await EventoApp.loadAll();

    // Sessione utente corrente
    const session = DB.sessions.get(EventoApp._eventId);
    EventoApp._currentUserId = session?.userId || null;

    // Network monitor
    EventoApp._initNetwork();

    // Sync al caricamento
    if (Utils.isOnline()) EventoApp._syncQuiet();

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
      if (ind) ind.style.background = Utils.isOnline()
        ? 'var(--accent-green)' : 'var(--accent-red)';
      if (Utils.isOnline()) EventoApp._syncQuiet();
    };
    window.addEventListener('online',  update);
    window.addEventListener('offline', update);
    update();
  },

  // ─── CARICA TUTTI I DATI ──────────────────────────────────
  async loadAll() {
    EventoApp._event    = await DB.events.getById(EventoApp._eventId);
    EventoApp._users    = await DB.users.getByEvent(EventoApp._eventId);
    const allExp        = await DB.expenses.getByEvent(EventoApp._eventId);
    EventoApp._expenses = allExp.filter(e => !e.deleted);
    EventoApp._payments = await DB.payments.getByEvent(EventoApp._eventId);

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
    // Sottrai pagamenti già effettuati
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
    const titleEl = document.getElementById('headerTitle');
    if (titleEl) titleEl.textContent = ev.title;

    document.getElementById('eventTitle').textContent = ev.title;
    document.getElementById('eventCodeText').textContent = ev.code;

    // Foto
    const photoEl = document.getElementById('eventPhoto');
    if (ev.photo && photoEl) {
      photoEl.innerHTML = `<img src="${ev.photo}" alt="Foto evento" />`;
    }

    // Contatori tab
    const active = EventoApp._expenses.filter(e => !e.deleted);
    document.getElementById('tabSpeseCount').textContent =
      active.length ? `(${active.length})` : '';
    document.getElementById('tabPartCount').textContent =
      EventoApp._users.length ? `(${EventoApp._users.length})` : '';
  },

  // ─── SWITCH TAB ───────────────────────────────────────────
  switchTab(tab) {
    EventoApp._currentTab = tab;
    ['spese', 'partecipanti', 'saldi'].forEach(t => {
      document.getElementById(`tab${t.charAt(0).toUpperCase() + t.slice(1)}`)?.classList.toggle('active', t === tab);
      document.getElementById(`panel${t.charAt(0).toUpperCase() + t.slice(1)}`)
        && (document.getElementById(`panel${t.charAt(0).toUpperCase() + t.slice(1)}`).style.display = t === tab ? '' : 'none');
    });

    // Aggiusta nomi panel (capitalizzazione custom)
    document.getElementById('panelSpese').style.display          = tab === 'spese' ? '' : 'none';
    document.getElementById('panelPartecipanti').style.display   = tab === 'partecipanti' ? '' : 'none';
    document.getElementById('panelSaldi').style.display          = tab === 'saldi' ? '' : 'none';
    document.getElementById('tabSpese').classList.toggle('active',        tab === 'spese');
    document.getElementById('tabPartecipanti').classList.toggle('active', tab === 'partecipanti');
    document.getElementById('tabSaldi').classList.toggle('active',        tab === 'saldi');

    // FAB: nascondi su saldi/partecipanti (o adatta)
    const fab = document.getElementById('fabBtn');
    if (fab) {
      fab.style.display = tab === 'spese' ? '' : 'none';
    }

    EventoApp._renderTab(tab);
  },

  _renderTab(tab) {
    if (tab === 'spese')        EventoApp._renderSpese();
    if (tab === 'partecipanti') EventoApp._renderPartecipanti();
    if (tab === 'saldi')        EventoApp._renderSaldi();
  },

  // ─── RENDER SPESE ─────────────────────────────────────────
  _renderSpese() {
    const expenses = EventoApp._expenses;
    const users    = EventoApp._users;

    // Summary
    const totale = expenses.reduce((s, e) => s + parseFloat(e.amount), 0);
    const count  = expenses.length;
    document.getElementById('summaryTotal').textContent = Utils.formatAmount(totale);
    document.getElementById('summaryCount').textContent = count;
    document.getElementById('summaryAvg').textContent   =
      count > 0 ? Utils.formatAmount(totale / count) : '—';

    // La mia quota
    if (EventoApp._currentUserId) {
      const myBalance = EventoApp._balances[EventoApp._currentUserId] || 0;
      const banner = document.getElementById('myShareBanner');
      const text   = document.getElementById('myShareText');
      if (banner && text) {
        banner.style.display = '';
        if (myBalance > 0.01) {
          text.style.color  = 'var(--accent-green)';
          text.textContent  = `Devi ricevere ${Utils.formatAmount(myBalance)}`;
        } else if (myBalance < -0.01) {
          text.style.color  = 'var(--accent-red)';
          text.textContent  = `Devi pagare ${Utils.formatAmount(Math.abs(myBalance))}`;
        } else {
          text.style.color  = 'var(--text-muted)';
          text.textContent  = 'Sei in pareggio';
        }
      }
    }

    // Lista spese raggruppate per data
    const container = document.getElementById('expensesList');
    const emptyEl   = document.getElementById('expensesEmpty');

    if (expenses.length === 0) {
      container.innerHTML = '';
      emptyEl.style.display = '';
      return;
    }
    emptyEl.style.display = 'none';

    // Raggruppa per data
    const groups = {};
    expenses.forEach(e => {
      const d = e.date || Utils.today();
      if (!groups[d]) groups[d] = [];
      groups[d].push(e);
    });

    const sortedDates = Object.keys(groups).sort((a, b) => b.localeCompare(a));
    const usersMap    = Object.fromEntries(users.map(u => [u.id, u]));

    let html = '';
    for (const date of sortedDates) {
      const label = EventoApp._formatGroupDate(date);
      html += `<div class="date-group">
        <div class="date-group__label">${label}</div>
        ${groups[date].map(e => EventoApp._expenseItemHtml(e, usersMap)).join('')}
      </div>`;
    }

    container.innerHTML = html;
  },

  _formatGroupDate(dateStr) {
    const d     = new Date(dateStr + 'T00:00:00');
    const today = new Date(); today.setHours(0,0,0,0);
    const yest  = new Date(today); yest.setDate(yest.getDate() - 1);
    if (d.getTime() === today.getTime()) return 'Oggi';
    if (d.getTime() === yest.getTime())  return 'Ieri';
    return d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  },

  _expenseItemHtml(e, usersMap) {
    const payer     = usersMap[e.paid_by];
    const payerName = payer?.name || 'Sconosciuto';
    const payerIdx  = payer ? Utils.avatarColorIndex(payer.name) : 0;
    const isTransfer = e.type === 'transfer';
    const isMine    = e.paid_by === EventoApp._currentUserId;

    // Partecipanti (solo spese normali)
    let participantsHtml = '';
    if (!isTransfer && e.participants?.length > 0) {
      const names = e.participants
        .slice(0, 3)
        .map(uid => usersMap[uid]?.name || '?')
        .join(', ');
      const extra = e.participants.length > 3 ? ` +${e.participants.length - 3}` : '';
      participantsHtml = `<span class="text-sm text-muted">÷ ${names}${extra}</span>`;
    }

    // Transfer
    let transferHtml = '';
    if (isTransfer) {
      const toUser = usersMap[e.paid_for];
      transferHtml = `<span class="badge badge--purple">→ ${Utils.escapeHtml(toUser?.name || '?')}</span>`;
    }

    return `
    <div class="expense-item ${isTransfer ? 'transfer' : ''}"
         onclick="EventoApp.showExpenseDetail('${e.id}')">
      <div class="expense-item__row1">
        <div>
          ${isTransfer
            ? `<span class="badge badge--purple" style="margin-bottom:4px;display:inline-flex;">Movimento cassa</span><br>`
            : ''}
          <span class="expense-item__title">${Utils.escapeHtml(e.title)}</span>
        </div>
        <span class="expense-item__amount">${Utils.formatAmount(e.amount)}</span>
      </div>
      <div class="expense-item__row2">
        <div class="avatar avatar-${payerIdx} avatar--sm" title="${Utils.escapeHtml(payerName)}">${Utils.initials(payerName)}</div>
        <span class="text-sm" style="color:${isMine ? 'var(--accent-blue)' : 'var(--text-muted)'}">
          ${isMine ? 'Tu' : Utils.escapeHtml(payerName)}
        </span>
        ${PaymentMethods.badgeHtml(e.payment_method)}
        ${e.has_photo ? `<span class="photo-indicator" title="Foto scontrino disponibile">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
        </span>` : ''}
        ${e.location?.address ? `<span style="font-size:11px;color:var(--text-muted);display:flex;align-items:center;gap:3px;">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
          </svg>
          ${Utils.escapeHtml(e.location.address.split(',')[0])}
        </span>` : ''}
        ${participantsHtml}
        ${transferHtml}
      </div>
    </div>`;
  },

  // ─── RENDER PARTECIPANTI ──────────────────────────────────
  _renderPartecipanti() {
    const users   = EventoApp._users;
    const session = DB.sessions.get(EventoApp._eventId);

    // Utente corrente
    const curUser = users.find(u => u.id === session?.userId);
    const curIdx  = curUser ? Utils.avatarColorIndex(curUser.name) : 0;
    const curAv   = document.getElementById('currentUserAv');
    const curName = document.getElementById('currentUserCardName');
    if (curUser && curAv && curName) {
      curAv.className   = `avatar avatar-${curIdx}`;
      curAv.textContent = Utils.initials(curUser.name);
      curName.textContent = curUser.name;
    }

    // Lista utenti
    const container = document.getElementById('usersList');
    if (!container) return;

    const usersMap = Object.fromEntries(users.map(u => [u.id, u]));

    container.innerHTML = users.map(u => {
      const idx        = Utils.avatarColorIndex(u.name);
      const isMe       = u.id === session?.userId;
      const expCount   = EventoApp._expenses.filter(e =>
        e.paid_by === u.id || (e.participants || []).includes(u.id)
      ).length;
      const paidTotal  = EventoApp._expenses
        .filter(e => e.paid_by === u.id && e.type !== 'transfer')
        .reduce((s, e) => s + parseFloat(e.amount), 0);

      return `
      <div class="user-card" style="${isMe ? 'border-color:var(--accent-blue);' : ''}">
        <div class="avatar avatar-${idx}">${Utils.initials(u.name)}</div>
        <div class="user-card__info">
          <div class="user-card__name">
            ${Utils.escapeHtml(u.name)}
            ${isMe ? '<span class="badge badge--blue" style="margin-left:6px;">Tu</span>' : ''}
          </div>
          <div class="user-card__meta">
            ${expCount} spese · Pagato ${Utils.formatAmount(paidTotal)}
          </div>
        </div>
        <div class="user-card__balance">
          <span style="color:${(EventoApp._balances[u.id]||0) >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'};">
            ${(EventoApp._balances[u.id]||0) >= 0 ? '+' : ''}${Utils.formatAmount(EventoApp._balances[u.id]||0)}
          </span>
        </div>
      </div>`;
    }).join('');
  },

  // ─── RENDER SALDI ─────────────────────────────────────────
  _renderSaldi() {
    const users     = EventoApp._users;
    const balances  = EventoApp._balances;
    const usersMap  = Object.fromEntries(users.map(u => [u.id, u.name]));

    // Saldo per persona
    const balContainer = document.getElementById('balancesList');
    balContainer.innerHTML = users.map(u => {
      const bal = balances[u.id] || 0;
      const idx = Utils.avatarColorIndex(u.name);
      const positive = bal > 0.01;
      const negative = bal < -0.01;

      return `
      <div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--border);">
        <div class="avatar avatar-${idx} avatar--sm">${Utils.initials(u.name)}</div>
        <div style="flex:1;">
          <div style="font-size:14px;font-weight:600;color:var(--text-primary);">${Utils.escapeHtml(u.name)}</div>
          <div style="font-size:11px;color:var(--text-muted);">
            ${positive ? 'deve ricevere' : negative ? 'deve pagare' : 'in pareggio'}
          </div>
        </div>
        <div style="font-size:16px;font-weight:800;color:${positive ? 'var(--accent-green)' : negative ? 'var(--accent-red)' : 'var(--text-muted)'};">
          ${positive ? '+' : ''}${Utils.formatAmount(bal)}
        </div>
      </div>`;
    }).join('');

    // Transazioni minime
    const txContainer = document.getElementById('transactionsList');
    const transactions = Utils.calculateMinimalTransactions(balances, usersMap);

    if (transactions.length === 0) {
      txContainer.innerHTML = `
        <div style="text-align:center;padding:20px;color:var(--accent-green);font-weight:600;">
          ✓ Tutti i conti sono in pareggio!
        </div>`;
    } else {
      txContainer.innerHTML = transactions.map(tx => {
        const fromIdx = Utils.avatarColorIndex(tx.fromName);
        const toIdx   = Utils.avatarColorIndex(tx.toName);
        const isMyDebt = tx.from === EventoApp._currentUserId;

        return `
        <div class="card" style="margin-bottom:8px;${isMyDebt ? 'border-color:var(--accent-red);' : ''}">
          <div style="display:flex;align-items:center;gap:10px;">
            <div class="avatar avatar-${fromIdx} avatar--sm">${Utils.initials(tx.fromName)}</div>
            <div style="flex:1;">
              <div style="font-size:13px;color:var(--text-muted);">deve pagare a</div>
              <div style="font-size:15px;font-weight:700;color:var(--text-primary);">
                ${Utils.escapeHtml(tx.fromName)} → ${Utils.escapeHtml(tx.toName)}
              </div>
            </div>
            <div class="avatar avatar-${toIdx} avatar--sm">${Utils.initials(tx.toName)}</div>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-top:10px;">
            <span style="font-size:20px;font-weight:800;color:var(--accent-red);">${Utils.formatAmount(tx.amount)}</span>
            <button class="btn btn--success btn--sm" onclick="EventoApp.showSettlePayment('${tx.from}','${tx.to}',${tx.amount})">
              Segna come pagato
            </button>
          </div>
        </div>`;
      }).join('');
    }

    // Pagamenti effettuati
    const settledContainer = document.getElementById('settledList');
    const settledEmpty     = document.getElementById('settledEmpty');
    const payments = EventoApp._payments;

    if (payments.length === 0) {
      settledContainer.innerHTML = '';
      settledEmpty.style.display = '';
    } else {
      settledEmpty.style.display = 'none';
      settledContainer.innerHTML = payments.map(p => {
        const fromU = usersMap[p.from_user] || '?';
        const toU   = usersMap[p.to_user]   || '?';
        const fromIdx = Utils.avatarColorIndex(fromU);
        const toIdx   = Utils.avatarColorIndex(toU);
        return `
        <div style="display:flex;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid var(--border);">
          <div class="avatar avatar-${fromIdx} avatar--sm">${Utils.initials(fromU)}</div>
          <div style="flex:1;">
            <div style="font-size:14px;font-weight:600;color:var(--text-primary);">
              ${Utils.escapeHtml(fromU)} → ${Utils.escapeHtml(toU)}
            </div>
            <div style="font-size:11px;color:var(--text-muted);">
              ${Utils.formatDate(p.date)} · ${PaymentMethods.getById(p.method).label}
              ${p.note ? ` · ${Utils.escapeHtml(p.note)}` : ''}
            </div>
          </div>
          <span style="font-size:15px;font-weight:700;color:var(--accent-green);">
            ${Utils.formatAmount(p.amount)}
          </span>
        </div>`;
      }).join('');
    }
  },

  // ─── DETTAGLIO SPESA ──────────────────────────────────────
  async showExpenseDetail(expenseId) {
    const expense  = EventoApp._expenses.find(e => e.id === expenseId);
    if (!expense) return;

    const usersMap = Object.fromEntries(EventoApp._users.map(u => [u.id, u]));
    const payer    = usersMap[expense.paid_by];
    const payerIdx = payer ? Utils.avatarColorIndex(payer.name) : 0;
    const isTransfer = expense.type === 'transfer';
    const toUser   = isTransfer ? usersMap[expense.paid_for] : null;
    const canEdit  = expense.paid_by === EventoApp._currentUserId ||
                     expense.created_by === EventoApp._currentUserId;

    // Foto locale
    let photoHtml = '';
    const photo   = await DB.photos.getByExpense(expenseId);
    if (photo?.data) {
      photoHtml = `
        <div style="margin-bottom:16px;">
          <img src="${photo.data}" alt="Scontrino"
            style="width:100%;border-radius:var(--radius-md);max-height:220px;object-fit:cover;" />
        </div>`;
    }

    // Partecipanti
    let participantsHtml = '';
    if (!isTransfer && expense.participants?.length > 0) {
      const sharePerPerson = expense.amount / expense.participants.length;
      participantsHtml = `
        <div style="margin-top:16px;">
          <div class="section-title" style="margin-bottom:8px;">Divisione</div>
          ${expense.participants.map(uid => {
            const u = usersMap[uid];
            if (!u) return '';
            const idx = Utils.avatarColorIndex(u.name);
            return `
            <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);">
              <div class="avatar avatar-${idx} avatar--sm">${Utils.initials(u.name)}</div>
              <span style="flex:1;font-size:14px;color:var(--text-primary);">${Utils.escapeHtml(u.name)}</span>
              <span style="font-size:14px;font-weight:700;color:var(--text-primary);">${Utils.formatAmount(sharePerPerson)}</span>
            </div>`;
          }).join('')}
        </div>`;
    }

    const content = document.getElementById('expenseDetailContent');
    content.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">
        <div>
          ${isTransfer
            ? `<span class="badge badge--purple" style="margin-bottom:8px;display:inline-flex;">Movimento cassa</span><br>`
            : ''}
          <h2 style="font-size:20px;font-weight:800;color:var(--text-primary);letter-spacing:-0.4px;">
            ${Utils.escapeHtml(expense.title)}
          </h2>
        </div>
        <span style="font-size:24px;font-weight:800;color:var(--text-primary);letter-spacing:-0.5px;">
          ${Utils.formatAmount(expense.amount)}
        </span>
      </div>

      ${photoHtml}

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
        <div style="background:var(--bg-input);border-radius:var(--radius-md);padding:10px;">
          <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px;">Data</div>
          <div style="font-size:14px;font-weight:600;color:var(--text-primary);">${Utils.formatDate(expense.date)}</div>
        </div>
        <div style="background:var(--bg-input);border-radius:var(--radius-md);padding:10px;">
          <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px;">Metodo</div>
          <div style="font-size:14px;font-weight:600;color:var(--text-primary);">${PaymentMethods.getById(expense.payment_method).label}</div>
        </div>
        <div style="background:var(--bg-input);border-radius:var(--radius-md);padding:10px;">
          <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px;">
            ${isTransfer ? 'Da' : 'Pagato da'}
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            <div class="avatar avatar-${payerIdx} avatar--sm">${Utils.initials(payer?.name || '?')}</div>
            <span style="font-size:14px;font-weight:600;color:var(--text-primary);">${Utils.escapeHtml(payer?.name || '?')}</span>
          </div>
        </div>
        ${isTransfer && toUser ? `
        <div style="background:var(--bg-input);border-radius:var(--radius-md);padding:10px;">
          <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px;">A</div>
          <div style="display:flex;align-items:center;gap:6px;">
            <div class="avatar avatar-${Utils.avatarColorIndex(toUser.name)} avatar--sm">${Utils.initials(toUser.name)}</div>
            <span style="font-size:14px;font-weight:600;color:var(--text-primary);">${Utils.escapeHtml(toUser.name)}</span>
          </div>
        </div>` : ''}
      </div>

      ${expense.location ? `
      <div style="margin-bottom:12px;">
        <a href="${Utils.mapsUrl(expense.location.lat, expense.location.lng, expense.location.address)}"
           target="_blank" rel="noopener"
           style="display:flex;align-items:center;gap:8px;padding:10px;background:var(--bg-input);border-radius:var(--radius-md);color:var(--accent-blue);text-decoration:none;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
          </svg>
          <span style="font-size:13px;font-weight:600;">${Utils.escapeHtml(expense.location.address || 'Vedi posizione')}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-left:auto;">
            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
            <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
        </a>
      </div>` : ''}

      ${expense.notes ? `
      <div style="margin-bottom:12px;padding:10px;background:var(--bg-input);border-radius:var(--radius-md);">
        <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px;">Note</div>
        <div style="font-size:14px;color:var(--text-primary);">${Utils.escapeHtml(expense.notes)}</div>
      </div>` : ''}

      ${participantsHtml}

      ${canEdit ? `
      <div style="display:flex;gap:10px;margin-top:20px;">
        <button class="btn btn--ghost" style="flex:1;" onclick="EventoApp.editExpense('${expense.id}')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
          Modifica
        </button>
        <button class="btn btn--danger" style="flex:1;" onclick="EventoApp.deleteExpense('${expense.id}')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
          </svg>
          Elimina
        </button>
      </div>` : ''}
    `;

    EventoApp.openModal('modalExpenseDetail');
  },

  // ─── NUOVA SPESA ──────────────────────────────────────────
  newExpense() {
    window.location.href = `/spesa.html?event=${EventoApp._eventId}`;
  },

  editExpense(expenseId) {
    EventoApp.closeModal('modalExpenseDetail');
    window.location.href = `/spesa.html?event=${EventoApp._eventId}&id=${expenseId}`;
  },

  async deleteExpense(expenseId) {
    if (!confirm('Eliminare questa spesa?')) return;
    await DB.expenses.delete(expenseId);
    EventoApp.closeModal('modalExpenseDetail');
    await EventoApp.loadAll();
    Utils.toast('Spesa eliminata', 'success');
    if (Utils.isOnline()) Sync.push().catch(() => {});
  },

  // ─── AGGIUNGI UTENTE ──────────────────────────────────────
  showAddUser() {
    EventoApp.closeEventMenu();
    document.getElementById('newUserName').value = '';
    EventoApp.openModal('modalAddUser');
    setTimeout(() => document.getElementById('newUserName').focus(), 300);
  },

  async addUser() {
    const name = document.getElementById('newUserName').value.trim();
    if (!Utils.required(name, 'Nome')) return;

    // Controlla duplicati
    const exists = EventoApp._users.some(u => u.name.toLowerCase() === name.toLowerCase());
    if (exists) { Utils.toast('Partecipante già presente', 'error'); return; }

    const user = await DB.users.save({ event_id: EventoApp._eventId, name });
    await DB.pending.add({ type: 'create_user', payload: { user } });

    EventoApp.closeModal('modalAddUser');
    await EventoApp.loadAll();
    Utils.toast(`${name} aggiunto`, 'success');
    if (Utils.isOnline()) Sync.push().catch(() => {});
  },

  // ─── CAMBIA UTENTE CORRENTE ───────────────────────────────
  changeCurrentUser() {
    const users = EventoApp._users;
    const list  = document.getElementById('switchUserList');
    list.innerHTML = users.map(u => {
      const idx    = Utils.avatarColorIndex(u.name);
      const isMe   = u.id === EventoApp._currentUserId;
      return `
      <button class="btn btn--ghost btn--full" style="display:flex;align-items:center;gap:10px;justify-content:flex-start;margin-bottom:6px;${isMe ? 'border-color:var(--accent-blue);color:var(--accent-blue);' : ''}"
        onclick="EventoApp.setCurrentUser('${u.id}','${Utils.escapeHtml(u.name)}')">
        <div class="avatar avatar-${idx} avatar--sm">${Utils.initials(u.name)}</div>
        <span>${Utils.escapeHtml(u.name)}</span>
        ${isMe ? '<svg style="margin-left:auto;width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
      </button>`;
    }).join('');
    EventoApp.openModal('modalSwitchUser');
  },

  setCurrentUser(userId, userName) {
    EventoApp._currentUserId = userId;
    DB.sessions.set(EventoApp._eventId, userId, userName);
    EventoApp.closeModal('modalSwitchUser');
    EventoApp._calcBalances();
    EventoApp._renderAll();
    Utils.toast(`Ora sei ${userName}`, 'success', 2000);
  },

  // ─── REGISTRA PAGAMENTO ───────────────────────────────────
  showSettlePayment(fromId = null, toId = null, amount = null) {
    const users = EventoApp._users;
    const methods = PaymentMethods.getEnabled();

    const fromSel   = document.getElementById('settleFrom');
    const toSel     = document.getElementById('settleTo');
    const methodSel = document.getElementById('settleMethod');
    const amtInput  = document.getElementById('settleAmount');
    const noteInput = document.getElementById('settleNote');

    fromSel.innerHTML   = users.map(u => `<option value="${u.id}" ${u.id === fromId ? 'selected' : ''}>${Utils.escapeHtml(u.name)}</option>`).join('');
    toSel.innerHTML     = users.map(u => `<option value="${u.id}" ${u.id === toId ? 'selected' : ''}>${Utils.escapeHtml(u.name)}</option>`).join('');
    methodSel.innerHTML = methods.map(m => `<option value="${m.id}">${Utils.escapeHtml(m.label)}</option>`).join('');

    if (amount) amtInput.value = amount.toFixed(2);
    noteInput.value = '';

    EventoApp.openModal('modalSettlePayment');
  },

  async confirmSettlePayment() {
    const fromId = document.getElementById('settleFrom').value;
    const toId   = document.getElementById('settleTo').value;
    const amount = Utils.parseAmount(document.getElementById('settleAmount').value);
    const method = document.getElementById('settleMethod').value;
    const note   = document.getElementById('settleNote').value.trim();

    if (fromId === toId) { Utils.toast('Mittente e destinatario devono essere diversi', 'error'); return; }
    if (amount <= 0)     { Utils.toast('Inserisci un importo valido', 'error'); return; }

    await DB.payments.save({
      event_id:  EventoApp._eventId,
      from_user: fromId,
      to_user:   toId,
      amount,
      method,
      note,
      date: Utils.today()
    });

    EventoApp.closeModal('modalSettlePayment');
    await EventoApp.loadAll();
    Utils.toast('Pagamento registrato', 'success');
    if (Utils.isOnline()) Sync.push().catch(() => {});

    // Notifica
    const fromUser = EventoApp._users.find(u => u.id === fromId);
    const toUser   = EventoApp._users.find(u => u.id === toId);
    Notifications.notifySettled(fromUser?.name || '?', toUser?.name || '?', amount, EventoApp._event?.title || '');
  },

  // ─── CONDIVIDI CODICE ─────────────────────────────────────
  shareEventCode() {
    EventoApp.closeEventMenu();
    const code = EventoApp._event?.code;
    const title = EventoApp._event?.title;
    Utils.share({
      title: `WeGo — ${title}`,
      text:  `Unisciti all'evento "${title}" su WeGo con il codice: ${code}`
    });
  },

  copyCode() {
    Utils.copyToClipboard(EventoApp._event?.code || '');
  },

  // ─── MENU EVENTO ──────────────────────────────────────────
  toggleEventMenu() {
    const menu = document.getElementById('eventMenu');
    EventoApp._menuOpen = !EventoApp._menuOpen;
    menu.style.display = EventoApp._menuOpen ? 'block' : 'none';
  },

  closeEventMenu() {
    document.getElementById('eventMenu').style.display = 'none';
    EventoApp._menuOpen = false;
  },

  // ─── ELIMINA EVENTO ───────────────────────────────────────
  confirmDeleteEvent() {
    EventoApp.closeEventMenu();
    if (!confirm(`Eliminare l'evento "${EventoApp._event?.title}"?\nTutti i dati locali verranno rimossi.`)) return;
    EventoApp._doDeleteEvent();
  },

  async _doDeleteEvent() {
    await DB.events.delete(EventoApp._eventId);
    DB.sessions.remove(EventoApp._eventId);
    Utils.toast('Evento eliminato', 'success');
    setTimeout(() => { window.location.href = '/index.html'; }, 800);
  },

  // ─── NAVIGAZIONE ──────────────────────────────────────────
  goToRiepilogo() {
    window.location.href = `/riepilogo.html?event=${EventoApp._eventId}`;
  },

  // ─── MODAL ────────────────────────────────────────────────
  openModal(id) {
    document.getElementById(id)?.classList.add('open');
  },
  closeModal(id) {
    document.getElementById(id)?.classList.remove('open');
  },

  // ─── SYNC ─────────────────────────────────────────────────
  async syncNow() {
    const icon = document.getElementById('syncIcon');
    if (icon) icon.style.animation = 'spin 0.8s linear infinite';
    try {
      if (!Utils.isOnline()) { Utils.toast('Nessuna connessione', 'error'); return; }
      Sync._showBar('Sincronizzazione…');
      await Sync.push();
      await Sync.pullEvent(EventoApp._eventId);
      await EventoApp.loadAll();
      Utils.toast('Sincronizzato', 'success', 2000);
    } catch (e) {
      Utils.toast('Errore sync', 'error');
    } finally {
      if (icon) icon.style.animation = '';
      Sync._hideBar();
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
