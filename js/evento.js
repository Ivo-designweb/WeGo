// ═══════════════════════════════════════════════════════════════
// WeGo — evento.js v1.6
// Logica pagina dettaglio evento
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

  // ─── INIT ─────────────────────────────────────────────────
  async init() {
    const params = new URLSearchParams(window.location.search);
    EventoApp._eventId = params.get('id');

    if (!EventoApp._eventId) {
      Utils.toast('Evento non trovato', 'error');
      setTimeout(() => { window.location.href = '/index.html'; }, 1500);
      return;
    }

    Utils.applyTheme(Utils.getConfig('theme', 'dark'));

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    await DB.open();

    // Salva come ultimo evento aperto
    localStorage.setItem('wego_last_event_id', EventoApp._eventId);

    await EventoApp.loadAll();

    const session = DB.sessions.get(EventoApp._eventId);
    EventoApp._currentUserId = session?.userId || null;

    EventoApp._initNetwork();

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
      if (ind) ind.style.background = Utils.isOnline() ? 'var(--green)' : 'var(--red)';
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

    // Mostra bottone elimina solo al creatore
    const session = DB.sessions.get(EventoApp._eventId);
    const currentUserName = session?.userName || '';
    const isCreator = ev.created_by && currentUserName &&
                      ev.created_by.toLowerCase() === currentUserName.toLowerCase();

    const deleteBtn = document.getElementById('ctxDeleteBtn');
    if (deleteBtn) deleteBtn.style.display = isCreator ? '' : 'none';

    // Contatori tab
    const active = EventoApp._expenses.filter(e => !e.deleted);
    const countSpeseEl = document.getElementById('tabSpeseCount');
    const countPartEl  = document.getElementById('tabPartCount');
    if (countSpeseEl) countSpeseEl.textContent = active.length ? `(${active.length})` : '';
    if (countPartEl)  countPartEl.textContent  = EventoApp._users.length ? `(${EventoApp._users.length})` : '';
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

    const fab = document.getElementById('fabBtn');
    if (fab) fab.style.display = tab === 'spese' ? '' : 'none';

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
    const currency = EventoApp._event?.currency || 'EUR';

    const totale = expenses.reduce((s, e) => s + parseFloat(e.amount || 0), 0);
    const count  = expenses.length;

    document.getElementById('summaryTotal').textContent = Utils.formatAmount(totale, currency);
    document.getElementById('summaryCount').textContent = count;
    document.getElementById('summaryAvg').textContent   =
      count > 0 && users.length > 0
        ? Utils.formatAmount(totale / users.length, currency)
        : '—';

    // Quota personale
    const myQuotaEl   = document.getElementById('myQuota');
    const myQuotaText = document.getElementById('myQuotaText');
    if (EventoApp._currentUserId && myQuotaEl) {
      const myBal = EventoApp._balances[EventoApp._currentUserId] || 0;
      myQuotaText.textContent = myBal >= 0
        ? `Sei in credito di ${Utils.formatAmount(myBal, currency)}`
        : `Devi ${Utils.formatAmount(Math.abs(myBal), currency)}`;
      myQuotaEl.style.display = '';
    }

    // Raggruppa per data
    const container = document.getElementById('expenseList');
    if (!container) return;

    if (expenses.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding:30px 0;">
          <p class="empty-state__title">Nessuna spesa</p>
          <p class="empty-state__desc">Tocca + per aggiungere la prima spesa.</p>
        </div>`;
      return;
    }

    const grouped = {};
    for (const exp of expenses) {
      const day = exp.date || Utils.formatDate(exp.created_at);
      if (!grouped[day]) grouped[day] = [];
      grouped[day].push(exp);
    }

    const userMap = {};
    users.forEach(u => { userMap[u.id] = u; });

    let html = '';
    for (const [day, exps] of Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0]))) {
      html += `<div class="exp-group-date">${Utils.formatDateLabel(day)}</div>`;
      for (const exp of exps) {
        const payer    = userMap[exp.paid_by];
        const payerIdx = payer ? Utils.avatarColorIndex(payer.name) : 0;
        const payerInit = payer ? Utils.initials(payer.name) : '?';
        const isMyExp  = exp.paid_by === EventoApp._currentUserId;
        const syncBadge = exp.synced === false ? `<span class="exp-badge exp-badge--sync">sync</span>` : '';
        const photoBadge = exp.has_photo ? `<span class="exp-badge">📷</span>` : '';
        const gpsBadge   = exp.location_lat ? `<span class="exp-badge">📍</span>` : '';
        const methodBadge = exp.payment_method ? `<span class="exp-badge">${Utils.escapeHtml(exp.payment_method)}</span>` : '';
        const transferBadge = exp.type === 'transfer' ? `<span class="exp-badge">trasferimento</span>` : '';

        html += `
          <div class="exp-item" onclick="EventoApp.showExpenseDetail('${exp.id}')">
            <div class="exp-avatar">
              <div class="avatar avatar-${payerIdx} avatar--sm" title="${payer ? Utils.escapeHtml(payer.name) : '?'}">${payerInit}</div>
            </div>
            <div class="exp-info">
              <div class="exp-title">${Utils.escapeHtml(exp.title)}</div>
              <div class="exp-meta">
                ${payer ? `<span class="exp-meta-txt">${Utils.escapeHtml(payer.name)}</span>` : ''}
                ${transferBadge}${photoBadge}${gpsBadge}${methodBadge}${syncBadge}
              </div>
            </div>
            <div class="exp-amount">
              <div class="exp-amount__val">${Utils.formatAmount(parseFloat(exp.amount || 0), currency)}</div>
              ${isMyExp ? `<div class="exp-amount__lbl" style="color:var(--green);">tu</div>` : ''}
            </div>
          </div>`;
      }
    }
    container.innerHTML = html;
  },

  // ─── RENDER PARTECIPANTI ──────────────────────────────────
  _renderPartecipanti() {
    const container = document.getElementById('partecipantiList');
    if (!container) return;

    const currency = EventoApp._event?.currency || 'EUR';
    const sessions = DB.sessions.getAll();

    let html = '';
    for (const user of EventoApp._users) {
      const idx       = Utils.avatarColorIndex(user.name);
      const bal       = EventoApp._balances[user.id] || 0;
      const balColor  = bal > 0 ? 'var(--green)' : bal < 0 ? 'var(--red)' : 'var(--text-muted)';
      const balText   = bal > 0
        ? `+${Utils.formatAmount(bal, currency)}`
        : Utils.formatAmount(bal, currency);
      const isMe      = user.id === EventoApp._currentUserId;
      const hasJoined = Object.values(sessions).some(s => s.userId === user.id);

      html += `
        <div class="part-item" ${isMe ? 'style="background:rgba(59,130,246,0.05);border-radius:8px;padding:10px 8px;"' : ''}>
          <div class="avatar avatar-${idx}">${Utils.initials(user.name)}</div>
          <div class="part-info">
            <div class="part-name">
              ${Utils.escapeHtml(user.name)}
              ${isMe ? '<span style="font-size:9px;font-weight:700;color:var(--accent);background:rgba(59,130,246,0.1);padding:1px 5px;border-radius:999px;margin-left:5px;">Tu</span>' : ''}
            </div>
            <div class="part-sub">
              ${hasJoined ? '● Connesso' : '○ Non ancora connesso'}
              <button onclick="EventoApp.shareInviteWhatsApp('${Utils.escapeHtml(user.name).replace(/'/g,"\\'")}');event.stopPropagation();"
                style="margin-left:8px;background:#25D366;border:none;border-radius:4px;padding:1px 6px;cursor:pointer;display:inline-flex;align-items:center;gap:3px;font-size:9px;font-weight:700;color:#fff;">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="white">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                Invita
              </button>
            </div>
          </div>
          <div class="part-balance" style="color:${balColor};">${balText}</div>
        </div>`;
    }

    container.innerHTML = html || '<p style="color:var(--text-muted);font-size:13px;padding:16px 0;">Nessun partecipante.</p>';
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
        txnContainer.innerHTML = `<p style="font-size:12px;color:var(--text-muted);padding:8px 0;">Tutto in pareggio! 🎉</p>`;
      } else {
        txnContainer.innerHTML = txns.map(t => {
          const isMe = t.from === EventoApp._currentUserId || t.to === EventoApp._currentUserId;
          return `
            <div class="txn-item" ${isMe ? 'style="background:rgba(59,130,246,0.05);border-radius:8px;padding:10px 8px;"' : ''}>
              <div class="txn-text">
                <b>${Utils.escapeHtml(userNames[t.from] || t.from)}</b>
                → <b>${Utils.escapeHtml(userNames[t.to] || t.to)}</b>
                ${isMe ? '<span style="font-size:9px;font-weight:700;color:var(--accent);"> (Tu)</span>' : ''}
              </div>
              <div class="txn-amount">${Utils.formatAmount(t.amount, currency)}</div>
            </div>`;
        }).join('');
      }
    }

    // Pagamenti effettuati
    const settledContainer = document.getElementById('settledList');
    const settledEmpty     = document.getElementById('settledEmpty');
    const payments = EventoApp._payments;

    if (settledContainer) {
      if (payments.length === 0) {
        settledContainer.innerHTML = '';
        if (settledEmpty) settledEmpty.style.display = '';
      } else {
        if (settledEmpty) settledEmpty.style.display = 'none';
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

    // Bottone registra pagamento
    const saldiPanel = document.getElementById('panelSaldi');
    if (saldiPanel && !saldiPanel.querySelector('.btn--settle')) {
      const btn = document.createElement('button');
      btn.className = 'btn btn--ghost btn--full btn--settle';
      btn.style.marginTop = '16px';
      btn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Registra pagamento`;
      btn.onclick = () => EventoApp.showSettlePayment();
      saldiPanel.appendChild(btn);
    }
  },

  // ─── DETTAGLIO SPESA ──────────────────────────────────────
  async showExpenseDetail(expenseId) {
    const expense  = EventoApp._expenses.find(e => e.id === expenseId);
    if (!expense) return;

    const users    = EventoApp._users;
    const currency = EventoApp._event?.currency || 'EUR';
    const userMap  = {};
    users.forEach(u => { userMap[u.id] = u; });

    const payer   = userMap[expense.paid_by];
    const canEdit = expense.paid_by === EventoApp._currentUserId;

    // Partecipanti
    const partIds   = expense.participants || [];
    const partNames = partIds.map(id => userMap[id]?.name || '?');
    const quota     = partIds.length > 0 ? parseFloat(expense.amount) / partIds.length : 0;
    const participantsHtml = partIds.length > 0 ? `
      <div style="margin-bottom:12px;">
        <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:6px;">
          Diviso tra ${partIds.length} (${Utils.formatAmount(quota, currency)} cad.)
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:5px;">
          ${partIds.map(id => {
            const u = userMap[id];
            if (!u) return '';
            const idx = Utils.avatarColorIndex(u.name);
            return `<span style="display:inline-flex;align-items:center;gap:4px;background:var(--bg-input);padding:3px 8px;border-radius:999px;font-size:11px;">
              <span class="avatar avatar-${idx}" style="width:16px;height:16px;font-size:7px;">${Utils.initials(u.name)}</span>
              ${Utils.escapeHtml(u.name)}
            </span>`;
          }).join('')}
        </div>
      </div>` : '';

    const content = document.getElementById('expenseDetailContent');
    content.innerHTML = `
      <div style="margin-bottom:14px;">
        <div style="font-size:17px;font-weight:700;color:var(--text-primary);margin-bottom:4px;">${Utils.escapeHtml(expense.title)}</div>
        <div style="font-size:26px;font-weight:800;color:var(--text-primary);letter-spacing:-0.5px;margin-bottom:8px;">
          ${Utils.formatAmount(parseFloat(expense.amount || 0), currency)}
        </div>
        <div style="font-size:12px;color:var(--text-muted);">
          Pagato da <b>${payer ? Utils.escapeHtml(payer.name) : '?'}</b>
          · ${expense.date || Utils.formatDate(expense.created_at)}
          ${expense.payment_method ? ' · ' + Utils.escapeHtml(expense.payment_method) : ''}
        </div>
      </div>

      ${expense.location_lat ? `
      <div style="margin-bottom:12px;">
        <a href="${Utils.mapsUrl(expense.location_lat, expense.location_lng, expense.location_address)}"
           target="_blank" rel="noopener"
           style="display:flex;align-items:center;gap:8px;padding:10px;background:var(--bg-input);border-radius:var(--r-md);color:var(--accent);text-decoration:none;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
          </svg>
          <span style="font-size:12px;font-weight:600;">${Utils.escapeHtml(expense.location_address || 'Vedi posizione')}</span>
        </a>
      </div>` : ''}

      ${expense.notes ? `
      <div style="margin-bottom:12px;padding:10px;background:var(--bg-input);border-radius:var(--r-md);">
        <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px;">Note</div>
        <div style="font-size:13px;color:var(--text-primary);">${Utils.escapeHtml(expense.notes)}</div>
      </div>` : ''}

      ${participantsHtml}

      ${canEdit ? `
      <div style="display:flex;gap:10px;margin-top:16px;">
        <button class="btn btn--ghost" style="flex:1;" onclick="EventoApp.editExpense('${expense.id}')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
          Modifica
        </button>
        <button class="btn btn--danger" style="flex:1;" onclick="EventoApp.deleteExpense('${expense.id}')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
          </svg>
          Elimina
        </button>
      </div>` : ''}
    `;

    EventoApp.openModal('modalExpenseDetail');
  },

  // ─── NUOVA / MODIFICA SPESA ───────────────────────────────
  newExpense() {
    window.location.href = `/spesa.html?event=${EventoApp._eventId}`;
  },

  editExpense(expenseId) {
    EventoApp.closeModal('modalExpenseDetail');
    window.location.href = `/spesa.html?event=${EventoApp._eventId}&id=${expenseId}`;
  },

  async deleteExpense(expenseId) {
    if (!confirm('Eliminare questa spesa?')) return;
    EventoApp.closeModal('modalExpenseDetail');
    try {
      await DB.expenses.softDelete(expenseId);
      await DB.pending.add({ type: 'delete_expense', payload: { id: expenseId, event_id: EventoApp._eventId } });
      if (Utils.isOnline()) Sync.push().catch(() => {});
      await EventoApp.loadAll();
      Utils.toast('Spesa eliminata', 'success');
    } catch (e) {
      Utils.toast('Errore eliminazione', 'error');
    }
  },

  // ─── AGGIUNGI PARTECIPANTE ────────────────────────────────
  showAddUser() {
    EventoApp.closeEventMenu();
    document.getElementById('newUserName').value = '';
    EventoApp.openModal('modalAddUser');
    setTimeout(() => document.getElementById('newUserName').focus(), 300);
  },

  async addUser() {
    const name = document.getElementById('newUserName').value.trim();
    if (!Utils.required(name, 'Nome')) return;

    const exists = EventoApp._users.some(u => u.name.toLowerCase() === name.toLowerCase());
    if (exists) { Utils.toast('Nome già presente', 'error'); return; }

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
    const users = EventoApp._users;
    const methods = PaymentsModule.getEnabled();

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
      `<option value="${m}">${m}</option>`
    ).join('');

    if (amount) document.getElementById('settleAmount').value = amount.toFixed(2);
    document.getElementById('settleNote').value = '';

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

    try {
      const payment = await DB.payments.save({
        event_id:  EventoApp._eventId,
        from_user: fromId,
        to_user:   toId,
        amount,
        method,
        note,
        date: Utils.today()
      });
      await DB.pending.add({ type: 'create_payment', payload: { payment } });
      if (Utils.isOnline()) Sync.push().catch(() => {});
      EventoApp.closeModal('modalSettlePayment');
      await EventoApp.loadAll();
      Utils.toast('Pagamento registrato!', 'success');
    } catch (e) {
      Utils.toast('Errore registrazione pagamento', 'error');
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

  // ─── NAVIGAZIONE ──────────────────────────────────────────
  goHome(e) {
    if (e) e.preventDefault();
    // Pulisce il last event così index.html mostra la lista
    localStorage.removeItem('wego_last_event_id');
    window.location.href = '/index.html';
  },

  goToRiepilogo() {
    EventoApp.closeEventMenu();
    window.location.href = `/riepilogo.html?event=${EventoApp._eventId}`;
  },

  // ─── MODAL ────────────────────────────────────────────────
  openModal(id)  { document.getElementById(id)?.classList.add('open'); },
  closeModal(id) { document.getElementById(id)?.classList.remove('open'); },

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
