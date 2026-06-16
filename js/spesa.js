// ═══════════════════════════════════════════════════════════════
// WeGo — spesa.js v1.0
// Logica pagina inserimento / modifica spesa
// ═══════════════════════════════════════════════════════════════

const SpesaApp = {

  // ─── STATO ────────────────────────────────────────────────
  _eventId:      null,
  _expenseId:    null,   // null = nuova spesa
  _event:        null,
  _users:        [],
  _type:         'expense',   // 'expense' | 'transfer'
  _location:     null,        // { lat, lng, address }
  _photo:        null,        // base64
  _gettingGps:   false,
  _selectedPart: new Set(),   // userId selezionati come partecipanti

  // ─── INIT ─────────────────────────────────────────────────
  async init() {
    const params = new URLSearchParams(window.location.search);
    SpesaApp._eventId   = params.get('event');
    SpesaApp._expenseId = params.get('id') || null;

    if (!SpesaApp._eventId) {
      Utils.toast('Evento non specificato', 'error');
      setTimeout(() => window.location.href = '/index.html', 1200);
      return;
    }

    Utils.applyTheme(Utils.getConfig('theme', 'dark'));
    await DB.open();

    // Carica dati
    SpesaApp._event = await DB.events.getById(SpesaApp._eventId);
    SpesaApp._users = await DB.users.getByEvent(SpesaApp._eventId);

    if (!SpesaApp._event) {
      Utils.toast('Evento non trovato', 'error');
      setTimeout(() => window.location.href = '/index.html', 1200);
      return;
    }

    // Imposta valuta
    SpesaApp._setCurrencySymbol();

    // Popola metodi pagamento
    SpesaApp._buildMethodSelect();

    // Imposta data odierna
    document.getElementById('expenseDate').value = Utils.today();

    // Popola select pagante
    SpesaApp._buildUserSelects();

    // Partecipanti: default tutti
    SpesaApp._selectedPart = new Set(SpesaApp._users.map(u => u.id));
    SpesaApp._buildParticipantsGrid();

    // Utente corrente come pagante di default
    const session = DB.sessions.get(SpesaApp._eventId);
    if (session?.userId) {
      const sel = document.getElementById('expensePaidBy');
      if (sel) sel.value = session.userId;
      const tFrom = document.getElementById('transferFrom');
      if (tFrom) tFrom.value = session.userId;
    }

    // Modalità modifica
    if (SpesaApp._expenseId) {
      await SpesaApp._loadExistingExpense();
    }

    // Focus titolo
    setTimeout(() => document.getElementById('expenseTitle').focus(), 300);

    // Listener importo per aggiornare preview quota
    document.getElementById('expenseAmount').addEventListener('input', SpesaApp._updateSharePreview);
  },

  // ─── VALUTA ───────────────────────────────────────────────
  _setCurrencySymbol() {
    const cur = SpesaApp._event?.currency || Utils.getConfig('currency') || 'EUR';
    const symbols = { EUR: '€', USD: '$', GBP: '£', CHF: 'CHF', JPY: '¥' };
    const symEl = document.getElementById('currencySymbol');
    if (symEl) symEl.textContent = symbols[cur] || cur;
  },

  // ─── POPOLA SELECT METODI ─────────────────────────────────
  _buildMethodSelect() {
    const sel     = document.getElementById('expenseMethod');
    const methods = PaymentMethods.getEnabled();
    sel.innerHTML = methods.map(m =>
      `<option value="${Utils.escapeHtml(m.id)}">${Utils.escapeHtml(m.label)}</option>`
    ).join('');
  },

  // ─── POPOLA SELECT UTENTI ─────────────────────────────────
  _buildUserSelects() {
    const users = SpesaApp._users;
    const opts  = users.map(u =>
      `<option value="${u.id}">${Utils.escapeHtml(u.name)}</option>`
    ).join('');

    document.getElementById('expensePaidBy').innerHTML = opts;
    document.getElementById('transferFrom').innerHTML  = opts;
    document.getElementById('transferTo').innerHTML    = opts;

    // Default transferTo: secondo utente (o primo se solo uno)
    if (users.length >= 2) {
      document.getElementById('transferTo').value = users[1].id;
    }
  },

  // ─── PARTECIPANTI GRID ────────────────────────────────────
  _buildParticipantsGrid() {
    const grid = document.getElementById('participantsGrid');
    if (!grid) return;

    grid.innerHTML = SpesaApp._users.map(u => {
      const idx      = Utils.avatarColorIndex(u.name);
      const selected = SpesaApp._selectedPart.has(u.id);
      return `
      <button class="chip ${selected ? 'selected' : ''}" id="chip_${u.id}"
        onclick="SpesaApp.toggleParticipant('${u.id}')">
        <div class="avatar avatar-${idx} avatar--sm">${Utils.initials(u.name)}</div>
        ${Utils.escapeHtml(u.name)}
      </button>`;
    }).join('');

    SpesaApp._updateSharePreview();
  },

  toggleParticipant(userId) {
    if (SpesaApp._selectedPart.has(userId)) {
      SpesaApp._selectedPart.delete(userId);
    } else {
      SpesaApp._selectedPart.add(userId);
    }
    const chip = document.getElementById(`chip_${userId}`);
    if (chip) chip.classList.toggle('selected', SpesaApp._selectedPart.has(userId));
    SpesaApp._updateSharePreview();
  },

  selectAllParticipants() {
    SpesaApp._users.forEach(u => {
      SpesaApp._selectedPart.add(u.id);
      document.getElementById(`chip_${u.id}`)?.classList.add('selected');
    });
    SpesaApp._updateSharePreview();
  },

  deselectAllParticipants() {
    SpesaApp._selectedPart.clear();
    SpesaApp._users.forEach(u => {
      document.getElementById(`chip_${u.id}`)?.classList.remove('selected');
    });
    SpesaApp._updateSharePreview();
  },

  _updateSharePreview() {
    const preview = document.getElementById('sharePreview');
    if (!preview) return;
    const amount = Utils.parseAmount(document.getElementById('expenseAmount')?.value);
    const count  = SpesaApp._selectedPart.size;
    if (amount > 0 && count > 0) {
      const share = amount / count;
      preview.textContent = `${Utils.formatAmount(share)} a persona · ${count} person${count === 1 ? 'a' : 'e'}`;
    } else if (count === 0) {
      preview.textContent = 'Seleziona almeno un partecipante';
      preview.style.color = 'var(--accent-red)';
      return;
    } else {
      preview.textContent = `${count} person${count === 1 ? 'a' : 'e'} selezionat${count === 1 ? 'a' : 'e'}`;
    }
    preview.style.color = 'var(--text-muted)';
  },

  // ─── TIPO SPESA ───────────────────────────────────────────
  setType(type) {
    SpesaApp._type = type;

    const btnExp  = document.getElementById('typeExpense');
    const btnTr   = document.getElementById('typeTransfer');
    const secExp  = document.getElementById('sectionExpense');
    const secTr   = document.getElementById('sectionTransfer');
    const pageTitle = document.getElementById('pageTitle');

    btnExp.classList.toggle('active',          type === 'expense');
    btnTr.classList.toggle('active-transfer',  type === 'transfer');
    btnTr.classList.toggle('active',           false);
    secExp.style.display  = type === 'expense'  ? '' : 'none';
    secTr.style.display   = type === 'transfer' ? '' : 'none';

    if (pageTitle) {
      pageTitle.textContent = type === 'expense'
        ? (SpesaApp._expenseId ? 'Modifica spesa' : 'Nuova spesa')
        : 'Movimento cassa';
    }
  },

  // ─── GPS ──────────────────────────────────────────────────
  async getLocation() {
    if (SpesaApp._gettingGps) return;
    SpesaApp._gettingGps = true;

    const text = document.getElementById('locationText');
    text.textContent = 'Rilevamento in corso…';
    text.classList.remove('placeholder');

    try {
      const pos = await Utils.getCurrentPosition();
      SpesaApp._location = { lat: pos.lat, lng: pos.lng, address: '' };

      text.textContent = 'Indirizzo in caricamento…';

      // Reverse geocoding
      const address = await Utils.reverseGeocode(pos.lat, pos.lng);
      SpesaApp._location.address = address;

      text.textContent = address;
      document.getElementById('locationClear').style.display = '';
    } catch (err) {
      text.textContent = 'Impossibile rilevare posizione';
      text.classList.add('placeholder');

      if (err.code === 1) {
        Utils.toast('Permesso posizione negato. Abilitalo nelle impostazioni.', 'error', 4000);
      } else {
        Utils.toast('Posizione non disponibile', 'error');
      }
    } finally {
      SpesaApp._gettingGps = false;
    }
  },

  clearLocation(e) {
    e.stopPropagation();
    SpesaApp._location = null;
    const text = document.getElementById('locationText');
    text.textContent = 'Tocca per rilevare posizione GPS';
    text.classList.add('placeholder');
    document.getElementById('locationClear').style.display = 'none';
  },

  // ─── FOTO ─────────────────────────────────────────────────
  pickPhoto() {
    document.getElementById('photoInput').click();
  },

  async onPhotoChange(input) {
    const file = input.files[0];
    if (!file) return;
    try {
      const compressed = await Utils.compressImage(file, 1200);
      SpesaApp._photo = compressed;

      const preview = document.getElementById('photoPreviewImg');
      const wrap    = document.getElementById('photoPreviewWrap');
      const label   = document.getElementById('photoLabel');
      if (preview) preview.src = compressed;
      if (wrap)    wrap.style.display = '';
      if (label)   label.textContent  = 'Cambia foto';
    } catch {
      Utils.toast('Errore nel caricamento foto', 'error');
    }
  },

  removePhoto() {
    SpesaApp._photo = null;
    const wrap  = document.getElementById('photoPreviewWrap');
    const label = document.getElementById('photoLabel');
    const input = document.getElementById('photoInput');
    if (wrap)  wrap.style.display = 'none';
    if (label) label.textContent  = 'Aggiungi foto';
    if (input) input.value = '';
  },

  // ─── CARICA SPESA ESISTENTE ───────────────────────────────
  async _loadExistingExpense() {
    const expense = await DB.expenses.getById(SpesaApp._expenseId);
    if (!expense) {
      Utils.toast('Spesa non trovata', 'error');
      return;
    }

    document.getElementById('pageTitle').textContent =
      expense.type === 'transfer' ? 'Modifica movimento' : 'Modifica spesa';

    document.getElementById('expenseAmount').value = expense.amount;
    document.getElementById('expenseTitle').value  = expense.title;
    document.getElementById('expenseDate').value   = expense.date;
    document.getElementById('expenseNotes').value  = expense.notes || '';

    // Tipo
    SpesaApp.setType(expense.type || 'expense');

    // Metodo pagamento
    document.getElementById('expenseMethod').value = expense.payment_method || 'contanti';

    // Pagante
    if (expense.paid_by) {
      document.getElementById('expensePaidBy').value = expense.paid_by;
      document.getElementById('transferFrom').value  = expense.paid_by;
    }
    if (expense.paid_for) {
      document.getElementById('transferTo').value = expense.paid_for;
    }

    // Partecipanti
    if (expense.participants?.length > 0) {
      SpesaApp._selectedPart = new Set(expense.participants);
      SpesaApp._buildParticipantsGrid();
    }

    // Posizione
    if (expense.location) {
      SpesaApp._location = expense.location;
      const text = document.getElementById('locationText');
      text.textContent = expense.location.address || `${expense.location.lat}, ${expense.location.lng}`;
      text.classList.remove('placeholder');
      document.getElementById('locationClear').style.display = '';
    }

    // Foto
    const savedPhoto = await DB.photos.getByExpense(SpesaApp._expenseId);
    if (savedPhoto?.data) {
      SpesaApp._photo = savedPhoto.data;
      const preview = document.getElementById('photoPreviewImg');
      const wrap    = document.getElementById('photoPreviewWrap');
      const label   = document.getElementById('photoLabel');
      if (preview) preview.src = savedPhoto.data;
      if (wrap)    wrap.style.display = '';
      if (label)   label.textContent  = 'Cambia foto';
    }
  },

  // ─── VALIDAZIONE ──────────────────────────────────────────
  _validate() {
    const amount = Utils.parseAmount(document.getElementById('expenseAmount').value);
    const title  = document.getElementById('expenseTitle').value.trim();

    if (amount <= 0) {
      Utils.toast('Inserisci un importo valido', 'error');
      document.getElementById('expenseAmount').focus();
      return false;
    }
    if (!title) {
      Utils.toast('La descrizione è obbligatoria', 'error');
      document.getElementById('expenseTitle').focus();
      return false;
    }

    if (SpesaApp._type === 'expense' && SpesaApp._selectedPart.size === 0) {
      Utils.toast('Seleziona almeno un partecipante', 'error');
      return false;
    }

    if (SpesaApp._type === 'transfer') {
      const from = document.getElementById('transferFrom').value;
      const to   = document.getElementById('transferTo').value;
      if (from === to) {
        Utils.toast('Mittente e destinatario devono essere diversi', 'error');
        return false;
      }
    }

    return true;
  },

  // ─── SALVA ────────────────────────────────────────────────
  async save() {
    if (!SpesaApp._validate()) return;

    const saveBtn = document.getElementById('saveBtn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Salvataggio…'; }

    const session = DB.sessions.get(SpesaApp._eventId);

    try {
      const isTransfer = SpesaApp._type === 'transfer';
      const amount     = Utils.parseAmount(document.getElementById('expenseAmount').value);
      const title      = document.getElementById('expenseTitle').value.trim();
      const date       = document.getElementById('expenseDate').value || Utils.today();
      const method     = document.getElementById('expenseMethod').value;
      const notes      = document.getElementById('expenseNotes').value.trim();

      const paidBy = isTransfer
        ? document.getElementById('transferFrom').value
        : document.getElementById('expensePaidBy').value;

      const paidFor = isTransfer
        ? document.getElementById('transferTo').value
        : null;

      const participants = isTransfer
        ? []
        : Array.from(SpesaApp._selectedPart);

      const expenseData = {
        id:             SpesaApp._expenseId || undefined,
        event_id:       SpesaApp._eventId,
        type:           SpesaApp._type,
        title,
        amount,
        currency:       SpesaApp._event?.currency || Utils.getConfig('currency') || 'EUR',
        paid_by:        paidBy,
        paid_for:       paidFor,
        participants,
        payment_method: method,
        date,
        location:       SpesaApp._location,
        has_photo:      !!SpesaApp._photo,
        notes,
        created_by:     session?.userId || null,
        synced:         false
      };

      // Salva spesa
      const saved = await DB.expenses.save(expenseData);

      // Salva foto in locale
      if (SpesaApp._photo) {
        await DB.photos.save(saved.id, SpesaApp._photo);
      } else if (SpesaApp._expenseId) {
        // Rimozione foto se era presente
        await DB.photos.delete(SpesaApp._expenseId);
      }

      // Sync in background se online
      if (Utils.isOnline()) {
        Sync.push().catch(() => {});
      }

      Utils.toast(
        SpesaApp._expenseId ? 'Spesa aggiornata' : 'Spesa salvata',
        'success',
        2000
      );

      // Torna all'evento
      setTimeout(() => SpesaApp.goBack(), 400);

    } catch (e) {
      console.error('[SpesaApp] save error:', e);
      Utils.toast('Errore nel salvataggio', 'error');
    } finally {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Salva'; }
    }
  },

  // ─── NAVIGAZIONE ──────────────────────────────────────────
  goBack() {
    window.location.href = `/evento.html?id=${SpesaApp._eventId}`;
  }
};

window.SpesaApp = SpesaApp;
