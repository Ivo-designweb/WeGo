// ═══════════════════════════════════════════════════════════════
// WeGo — riepilogo.js v1.4
// Logica pagina riepilogo saldi multi-evento
// ═══════════════════════════════════════════════════════════════

const RiepilogoApp = {

  // ─── STATO ────────────────────────────────────────────────
  _events:      [],
  _activeId:    null,
  _event:       null,
  _users:       [],
  _expenses:    [],
  _payments:    [],
  _balances:    {},
  _tab:         'saldi',
  _filterUser:  null,

  // ─── INIT ─────────────────────────────────────────────────
  async init() {
    // Carica chiavi.json dal server (sovrascrive sempre supabase/fcm locali se presente)
    await Utils.loadRemoteConfig();

    Utils.applyTheme(Utils.getConfig('theme', 'dark'));
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    await DB.open();

    // Leggi evento dalla URL (opzionale)
    const params = new URLSearchParams(window.location.search);
    const urlEvent = params.get('event');

    // Carica tutti gli eventi del device
    RiepilogoApp._events = await DB.events.getAll();
    RiepilogoApp._events.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

    if (RiepilogoApp._events.length === 0) {
      RiepilogoApp._renderEmpty();
      return;
    }

    // Attiva l'evento dalla URL o il più recente
    const target = urlEvent
      ? RiepilogoApp._events.find(e => e.id === urlEvent)
      : RiepilogoApp._events[0];

    RiepilogoApp._activeId = target?.id || RiepilogoApp._events[0].id;

    // Network monitor
    const dot = document.getElementById('connDot');
    window.addEventListener('online',  () => { if (dot) dot.style.background = 'var(--green)'; RiepilogoApp._syncQuiet(); });
    window.addEventListener('offline', () => { if (dot) dot.style.background = 'var(--red)'; });

    await RiepilogoApp.loadEvent(RiepilogoApp._activeId);
    if (Utils.isOnline()) RiepilogoApp._syncQuiet();
  },

  // ─── CARICA EVENTO ────────────────────────────────────────
  async loadEvent(eventId) {
    RiepilogoApp._activeId = eventId;
    RiepilogoApp._event    = await DB.events.getById(eventId);
    RiepilogoApp._users    = await DB.users.getByEvent(eventId);
    const allExp           = await DB.expenses.getByEvent(eventId);
    RiepilogoApp._expenses = allExp.filter(e => !e.deleted);
    RiepilogoApp._payments = await DB.payments.getByEvent(eventId);
    RiepilogoApp._filterUser = null;

    RiepilogoApp._calcBalances();
    RiepilogoApp._renderSelector();
    RiepilogoApp._renderHero();
    RiepilogoApp._renderTab(RiepilogoApp._tab);
  },

  // ─── CALCOLA SALDI ────────────────────────────────────────
  _calcBalances() {
    RiepilogoApp._balances = Utils.calculateBalances(
      RiepilogoApp._expenses,
      RiepilogoApp._users
    );
    // Applica pagamenti già effettuati
    for (const p of RiepilogoApp._payments) {
      RiepilogoApp._balances[p.from_user] = (RiepilogoApp._balances[p.from_user] || 0) + p.amount;
      RiepilogoApp._balances[p.to_user]   = (RiepilogoApp._balances[p.to_user]   || 0) - p.amount;
    }
  },

  // ─── RENDER SELECTOR ──────────────────────────────────────
  _renderSelector() {
    const container = document.getElementById('eventSelector');
    container.innerHTML = RiepilogoApp._events.map(ev => `
      <button class="ev-pill ${ev.id === RiepilogoApp._activeId ? 'active' : ''}"
        onclick="RiepilogoApp.loadEvent('${ev.id}')">
        <span class="ev-pill__dot"></span>
        ${Utils.escapeHtml(ev.title)}
      </button>
    `).join('');
  },

  // ─── RENDER HERO ──────────────────────────────────────────
  _renderHero() {
    const expenses  = RiepilogoApp._expenses.filter(e => e.type !== 'transfer');
    const totale    = expenses.reduce((s, e) => s + parseFloat(e.amount), 0);
    const nPers     = RiepilogoApp._users.length;
    const proCapite = nPers > 0 ? totale / nPers : 0;
    const nPag      = RiepilogoApp._payments.length;
    const cur       = RiepilogoApp._event?.currency || 'EUR';

    document.getElementById('heroAmount').textContent   = Utils.formatAmount(totale, cur);
    document.getElementById('heroMeta').textContent     =
      `${RiepilogoApp._event?.title || '—'} · codice ${RiepilogoApp._event?.code || '—'}`;
    document.getElementById('statSpese').textContent        = expenses.length;
    document.getElementById('statPartecipanti').textContent = nPers;
    document.getElementById('statMedia').textContent        = Utils.formatAmount(proCapite, cur);
    document.getElementById('statPagamenti').textContent    = nPag;
  },

  // ─── SWITCH TAB ───────────────────────────────────────────
  switchTab(tab) {
    RiepilogoApp._tab = tab;
    ['saldi', 'dasaldare', 'spese', 'saldati'].forEach(t => {
      const btn   = document.getElementById(`tab${t.charAt(0).toUpperCase() + t.slice(1)}`);
      const panel = document.getElementById(`panel${t.charAt(0).toUpperCase() + t.slice(1)}`);
      if (btn)   btn.classList.toggle('active', t === tab);
      if (panel) panel.style.display = t === tab ? '' : 'none';
    });
    // Fix nomi panel (camelCase)
    ['Saldi','Dasaldare','Spese','Saldati'].forEach(p => {
      const el = document.getElementById(`panel${p}`);
      if (el) el.style.display = p.toLowerCase() === tab ? '' : 'none';
      const btn = document.getElementById(`tab${p}`);
      if (btn) btn.classList.toggle('active', p.toLowerCase() === tab);
    });
    RiepilogoApp._renderTab(tab);
  },

  _renderTab(tab) {
    if (tab === 'saldi')     RiepilogoApp._renderSaldi();
    if (tab === 'dasaldare') RiepilogoApp._renderDaSaldare();
    if (tab === 'spese')     RiepilogoApp._renderSpese();
    if (tab === 'saldati')   RiepilogoApp._renderSaldati();
  },

  // ─── TAB: SALDI ───────────────────────────────────────────
  _renderSaldi() {
    const users    = RiepilogoApp._users;
    const balances = RiepilogoApp._balances;
    const cur      = RiepilogoApp._event?.currency || 'EUR';
    const session  = DB.sessions.get(RiepilogoApp._activeId);

    // Trova max assoluto per barra proporzionale
    const maxAbs = Math.max(...users.map(u => Math.abs(balances[u.id] || 0)), 0.01);

    const container = document.getElementById('saldiList');
    if (users.length === 0) {
      container.innerHTML = '<div class="riepilogo-empty">Nessun partecipante</div>';
      return;
    }

    // Ordina: chi deve di più prima
    const sorted = [...users].sort((a, b) =>
      (balances[a.id] || 0) - (balances[b.id] || 0)
    );

    const expenses = RiepilogoApp._expenses.filter(e => e.type !== 'transfer');
    const totale   = expenses.reduce((s, e) => s + parseFloat(e.amount), 0);

    container.innerHTML = sorted.map(u => {
      const bal     = balances[u.id] || 0;
      const pos     = bal > 0.01;
      const neg     = bal < -0.01;
      const idx     = Utils.avatarColorIndex(u.name);
      const isMe    = u.id === session?.userId;
      const paidAmt = expenses.filter(e => e.paid_by === u.id)
                              .reduce((s, e) => s + parseFloat(e.amount), 0);
      const paidPct = totale > 0 ? Math.round(paidAmt / totale * 100) : 0;
      const barW    = Math.round(Math.abs(bal) / maxAbs * 100);
      const barColor = pos ? 'var(--green)' : neg ? 'var(--red)' : 'var(--border-strong)';

      return `
      <div class="saldo-row">
        <div class="avatar avatar-${idx} avatar--sm">${Utils.initials(u.name)}</div>
        <div class="saldo-row__info">
          <div class="saldo-row__name">
            ${Utils.escapeHtml(u.name)}
            ${isMe ? '<span class="badge badge--blue" style="margin-left:5px;">Tu</span>' : ''}
          </div>
          <div class="saldo-row__detail">
            Pagato ${Utils.formatAmount(paidAmt, cur)} (${paidPct}%)
          </div>
          <div class="saldo-row__bar-wrap">
            <div class="saldo-row__bar" style="width:${barW}%;background:${barColor};"></div>
          </div>
        </div>
        <div class="saldo-row__amount" style="color:${pos ? 'var(--green)' : neg ? 'var(--red)' : 'var(--text-muted)'};">
          ${pos ? '+' : ''}${Utils.formatAmount(bal, cur)}
        </div>
      </div>`;
    }).join('');
  },

  // ─── TAB: DA SALDARE ──────────────────────────────────────
  _renderDaSaldare() {
    const usersMap   = Object.fromEntries(RiepilogoApp._users.map(u => [u.id, u.name]));
    const txs        = Utils.calculateMinimalTransactions(RiepilogoApp._balances, usersMap);
    const session    = DB.sessions.get(RiepilogoApp._activeId);
    const cur        = RiepilogoApp._event?.currency || 'EUR';
    const container  = document.getElementById('daSaldareList');
    const emptyEl    = document.getElementById('daSaldareEmpty');

    if (txs.length === 0) {
      container.innerHTML = '';
      emptyEl.style.display = '';
      return;
    }
    emptyEl.style.display = 'none';

    container.innerHTML = txs.map(tx => {
      const fromIdx   = Utils.avatarColorIndex(tx.fromName);
      const toIdx     = Utils.avatarColorIndex(tx.toName);
      const iMustPay  = tx.from === session?.userId;
      const iReceive  = tx.to   === session?.userId;

      return `
      <div class="tx-card ${iMustPay ? 'mine' : iReceive ? 'mine-receive' : ''}">
        <div class="tx-card__row1">
          <div class="avatar avatar-${fromIdx} avatar--sm">${Utils.initials(tx.fromName)}</div>
          <div class="tx-arrow">
            <div class="tx-arrow__line"></div>
          </div>
          <div class="avatar avatar-${toIdx} avatar--sm">${Utils.initials(tx.toName)}</div>
        </div>
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;">
          <span style="font-weight:600;color:${iMustPay ? 'var(--red)' : 'var(--text-primary)'};">
            ${iMustPay ? 'Tu' : Utils.escapeHtml(tx.fromName)}
          </span>
          deve pagare a
          <span style="font-weight:600;color:${iReceive ? 'var(--green)' : 'var(--text-primary)'};">
            ${iReceive ? 'Te' : Utils.escapeHtml(tx.toName)}
          </span>
        </div>
        <div class="tx-card__row2">
          <span class="tx-card__amount ${iReceive ? 'receive' : ''}">${Utils.formatAmount(tx.amount, cur)}</span>
          <button class="btn btn--success btn--sm"
            onclick="RiepilogoApp.showRegisterPayment('${tx.from}','${tx.to}',${tx.amount})">
            Segna pagato
          </button>
        </div>
      </div>`;
    }).join('');
  },

  // ─── TAB: SPESE ───────────────────────────────────────────
  _renderSpese() {
    const users   = RiepilogoApp._users;
    const cur     = RiepilogoApp._event?.currency || 'EUR';

    // Filtri utente
    const filterWrap = document.getElementById('filterUsers');
    filterWrap.innerHTML = users.map(u => {
      const idx = Utils.avatarColorIndex(u.name);
      return `<button class="ev-pill ${RiepilogoApp._filterUser === u.id ? 'active' : ''}"
        onclick="RiepilogoApp.filterExpenses('${u.id}')">
        <div class="avatar avatar-${idx}" style="width:14px;height:14px;font-size:7px;">${Utils.initials(u.name)}</div>
        ${Utils.escapeHtml(u.name)}
      </button>`;
    }).join('');

    // Filtra spese
    let expenses = [...RiepilogoApp._expenses];
    if (RiepilogoApp._filterUser) {
      expenses = expenses.filter(e =>
        e.paid_by === RiepilogoApp._filterUser ||
        (e.participants || []).includes(RiepilogoApp._filterUser)
      );
    }
    expenses.sort((a, b) => b.date.localeCompare(a.date));

    const usersMap  = Object.fromEntries(users.map(u => [u.id, u.name]));
    const container = document.getElementById('speseTableWrap');

    if (expenses.length === 0) {
      container.innerHTML = '<div class="riepilogo-empty">Nessuna spesa</div>';
      return;
    }

    const rows = expenses.map(e => {
      const payerName = usersMap[e.paid_by] || '?';
      const isTransfer = e.type === 'transfer';
      const nPart      = isTransfer ? '—' : (e.participants?.length || 0);
      const share      = (!isTransfer && e.participants?.length > 0)
        ? Utils.formatAmount(e.amount / e.participants.length, cur)
        : '—';

      return `<tr>
        <td>
          <div style="font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100px;">
            ${isTransfer ? '<span class="badge badge--purple" style="margin-right:3px;">→</span>' : ''}
            ${Utils.escapeHtml(e.title)}
          </div>
          <div style="font-size:10px;color:var(--text-muted);">${Utils.formatDate(e.date)}</div>
        </td>
        <td>
          <div class="avatar avatar-${Utils.avatarColorIndex(payerName)} avatar--sm"
            style="display:inline-flex;" title="${Utils.escapeHtml(payerName)}">
            ${Utils.initials(payerName)}
          </div>
        </td>
        <td style="color:var(--text-muted);">${isTransfer ? '—' : nPart}</td>
        <td style="color:var(--text-muted);font-size:11px;">${share}</td>
        <td>${Utils.formatAmount(e.amount, cur)}</td>
      </tr>`;
    }).join('');

    const totale = expenses
      .filter(e => e.type !== 'transfer')
      .reduce((s, e) => s + parseFloat(e.amount), 0);

    container.innerHTML = `
      <table class="spese-table">
        <thead>
          <tr>
            <th>Spesa</th>
            <th>Chi</th>
            <th style="text-align:center;">Pers.</th>
            <th>Pro capite</th>
            <th>Importo</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr>
            <td colspan="4" style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">Totale</td>
            <td style="font-size:14px;font-weight:800;color:var(--text-primary);">${Utils.formatAmount(totale, cur)}</td>
          </tr>
        </tfoot>
      </table>`;
  },

  filterExpenses(userId) {
    RiepilogoApp._filterUser = userId;
    // Aggiorna bottone "Tutti"
    document.getElementById('filterAll')?.classList.toggle('active', !userId);
    RiepilogoApp._renderSpese();
  },

  // ─── TAB: SALDATI ─────────────────────────────────────────
  _renderSaldati() {
    const payments  = RiepilogoApp._payments;
    const usersMap  = Object.fromEntries(RiepilogoApp._users.map(u => [u.id, u.name]));
    const cur       = RiepilogoApp._event?.currency || 'EUR';
    const container = document.getElementById('saldatiList');
    const emptyEl   = document.getElementById('saldatiEmpty');

    if (payments.length === 0) {
      container.innerHTML = '';
      emptyEl.style.display = '';
      return;
    }
    emptyEl.style.display = 'none';

    const sorted = [...payments].sort((a, b) =>
      new Date(b.created_at) - new Date(a.created_at)
    );

    container.innerHTML = sorted.map(p => {
      const fromName = usersMap[p.from_user] || '?';
      const toName   = usersMap[p.to_user]   || '?';
      const method   = PaymentMethods.getById(p.method).label;
      const fromIdx  = Utils.avatarColorIndex(fromName);
      const toIdx    = Utils.avatarColorIndex(toName);

      return `
      <div class="settled-item">
        <div class="settled-item__check">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <div class="settled-item__body">
          <div class="settled-item__desc" style="display:flex;align-items:center;gap:5px;">
            <div class="avatar avatar-${fromIdx} avatar--sm">${Utils.initials(fromName)}</div>
            <span>${Utils.escapeHtml(fromName)}</span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2.5">
              <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
            </svg>
            <div class="avatar avatar-${toIdx} avatar--sm">${Utils.initials(toName)}</div>
            <span>${Utils.escapeHtml(toName)}</span>
          </div>
          <div class="settled-item__meta">
            ${Utils.formatDate(p.date)} · ${method}
            ${p.note ? ` · ${Utils.escapeHtml(p.note)}` : ''}
          </div>
        </div>
        <div class="settled-item__amount">${Utils.formatAmount(p.amount, cur)}</div>
      </div>`;
    }).join('');
  },

  // ─── REGISTRA PAGAMENTO ───────────────────────────────────
  showRegisterPayment(fromId = null, toId = null, amount = null) {
    const users   = RiepilogoApp._users;
    const methods = PaymentMethods.getEnabled();
    const session = DB.sessions.get(RiepilogoApp._activeId);

    const fromSel = document.getElementById('payFrom');
    const toSel   = document.getElementById('payTo');
    const methSel = document.getElementById('payMethod');

    fromSel.innerHTML = users.map(u =>
      `<option value="${u.id}" ${u.id === (fromId || session?.userId) ? 'selected' : ''}>${Utils.escapeHtml(u.name)}</option>`
    ).join('');
    toSel.innerHTML = users.map(u =>
      `<option value="${u.id}" ${u.id === toId ? 'selected' : ''}>${Utils.escapeHtml(u.name)}</option>`
    ).join('');
    methSel.innerHTML = methods.map(m =>
      `<option value="${m.id}">${Utils.escapeHtml(m.label)}</option>`
    ).join('');

    document.getElementById('payAmount').value = amount ? amount.toFixed(2) : '';
    document.getElementById('payDate').value   = Utils.today();
    document.getElementById('payNote').value   = '';

    RiepilogoApp.openModal('modalPayment');
  },

  async confirmPayment() {
    const fromId = document.getElementById('payFrom').value;
    const toId   = document.getElementById('payTo').value;
    const amount = Utils.parseAmount(document.getElementById('payAmount').value);
    const method = document.getElementById('payMethod').value;
    const date   = document.getElementById('payDate').value || Utils.today();
    const note   = document.getElementById('payNote').value.trim();

    if (fromId === toId) { Utils.toast('Mittente e destinatario devono essere diversi', 'error'); return; }
    if (amount <= 0)     { Utils.toast('Inserisci un importo valido', 'error'); return; }

    await DB.payments.save({
      event_id:  RiepilogoApp._activeId,
      from_user: fromId,
      to_user:   toId,
      amount,
      method,
      note,
      date
    });

    RiepilogoApp.closeModal('modalPayment');
    await RiepilogoApp.loadEvent(RiepilogoApp._activeId);
    Utils.toast('Pagamento registrato', 'success');
    if (Utils.isOnline()) Sync.push().catch(() => {});
  },

  // ─── CONDIVIDI RIEPILOGO ──────────────────────────────────
  async shareRiepilogo() {
    const ev       = RiepilogoApp._event;
    const usersMap = Object.fromEntries(RiepilogoApp._users.map(u => [u.id, u.name]));
    const txs      = Utils.calculateMinimalTransactions(RiepilogoApp._balances, usersMap);
    const cur      = ev?.currency || 'EUR';
    const totale   = RiepilogoApp._expenses
      .filter(e => e.type !== 'transfer')
      .reduce((s, e) => s + parseFloat(e.amount), 0);

    let text = `📊 Riepilogo WeGo — ${ev?.title || 'Evento'}\n`;
    text += `Totale: ${Utils.formatAmount(totale, cur)} · ${RiepilogoApp._expenses.length} spese\n\n`;

    if (txs.length === 0) {
      text += '✅ Tutti i conti sono in pareggio!\n';
    } else {
      text += '💸 Da saldare:\n';
      txs.forEach(tx => {
        text += `  ${tx.fromName} → ${tx.toName}: ${Utils.formatAmount(tx.amount, cur)}\n`;
      });
    }

    text += `\nCodice evento: ${ev?.code || '—'}`;

    Utils.share({ title: `WeGo — ${ev?.title}`, text });
  },

  // ─── EMPTY STATE ──────────────────────────────────────────
  _renderEmpty() {
    document.getElementById('eventSelector').innerHTML =
      '<span style="font-size:12px;color:var(--text-muted);padding:6px 0;">Nessun evento</span>';
    document.getElementById('heroAmount').textContent = '—';
    document.getElementById('heroMeta').textContent   = 'Nessun evento trovato';
    document.getElementById('saldiList').innerHTML =
      '<div class="riepilogo-empty">Torna alla home e crea o unisciti a un evento.</div>';
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
      await Sync.push();
      if (RiepilogoApp._activeId) await Sync.pullEvent(RiepilogoApp._activeId);
      await RiepilogoApp.loadEvent(RiepilogoApp._activeId);
      Utils.toast('Sincronizzato', 'success', 2000);
    } catch { Utils.toast('Errore sync', 'error'); }
    finally  { if (icon) icon.style.animation = ''; }
  },

  async _syncQuiet() {
    try {
      await Sync.push();
      if (RiepilogoApp._activeId) await Sync.pullEvent(RiepilogoApp._activeId);
      await RiepilogoApp.loadEvent(RiepilogoApp._activeId);
    } catch (e) { console.warn('[Riepilogo] Quiet sync:', e); }
  }
};

window.RiepilogoApp = RiepilogoApp;
