// ═══════════════════════════════════════════════════════════════
// WeGo — spesa.js v1.5
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

    // Carica chiavi.json dal server (sovrascrive sempre supabase/fcm locali se presente)
    Utils.applyTheme(Utils.getConfig('theme', 'dark'));
    Utils.loadRemoteConfig().catch(() => {}); // background: non blocca i dati locali

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

    // Punto 9: sincronizza campo importo visibile (expenseAmount2) con quello
    // nascosto (expenseAmount) usato dal resto del JS, e aggiorna il simbolo valuta
    const amountVisible = document.getElementById('expenseAmount2');
    const amountHidden  = document.getElementById('expenseAmount');
    if (amountVisible && amountHidden) {
      amountVisible.addEventListener('input', () => {
        amountHidden.value = amountVisible.value;
        SpesaApp._updateSharePreview();
      });
    }
    const cur2 = document.getElementById('currencySymbol2');
    const cur1 = document.getElementById('currencySymbol');
    if (cur2 && cur1) cur2.textContent = cur1.textContent;

    // Modalità modifica
    if (SpesaApp._expenseId) {
      await SpesaApp._loadExistingExpense();
      const delBtn = document.getElementById('deleteBtn');
      if (delBtn) delBtn.style.display = '';
    }

    // Focus titolo
    setTimeout(() => document.getElementById('expenseTitle').focus(), 300);

    // Listener importo nascosto per aggiornare preview quota (usato da altri path)
    document.getElementById('expenseAmount').addEventListener('input', SpesaApp._updateSharePreview);

    // Punto 10: avvio GPS automatico se il permesso era già concesso
    // (evita popup inaspettato: controlla prima lo stato del permesso)
    SpesaApp._tryAutoGps();
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

  // Avvia il GPS automaticamente se il permesso era già stato concesso.
  // Non mostra nessun popup inaspettato: controlla lo stato prima.
  async _tryAutoGps() {
    // Non sovrascrivere una posizione già caricata (es. in modalità modifica)
    if (SpesaApp._location) return;
    if (SpesaApp._gettingGps) return;
    if (!navigator.geolocation) return;

    try {
      if (navigator.permissions) {
        const status = await navigator.permissions.query({ name: 'geolocation' });
        if (status.state !== 'granted') return; // aspetta che l'utente tocchi manualmente
      }
      // Permesso già concesso: rileva in silenzio
      await SpesaApp.getLocation();
    } catch (_) {
      // Silenziosa: se fallisce l'utente può toccare manualmente
    }
  },

  // Helper condiviso: aggiorna l'UI della sezione posizione (testo + link Maps + bottone X)
  _setLocationUI(location) {
    const text      = document.getElementById('locationText');
    const clearBtn  = document.getElementById('locationClear');
    const mapsLink  = document.getElementById('locationMapsLink');

    if (location) {
      const label = location.address || `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`;
      text.textContent = label;
      text.classList.remove('placeholder', 'ph');
      if (clearBtn) clearBtn.style.display = '';
      // Aggiorna link Google Maps
      if (mapsLink) {
        mapsLink.href = `https://www.google.com/maps?q=${location.lat},${location.lng}`;
        mapsLink.style.display = '';
      }
    } else {
      text.textContent = 'Tocca per rilevare posizione';
      text.classList.add('placeholder', 'ph');
      if (clearBtn) clearBtn.style.display = 'none';
      if (mapsLink) mapsLink.style.display = 'none';
    }
  },

  async getLocation() {
    if (SpesaApp._gettingGps) return;
    SpesaApp._gettingGps = true;

    const text = document.getElementById('locationText');
    text.textContent = 'Rilevamento in corso…';
    text.classList.remove('placeholder', 'ph');

    try {
      const pos = await Utils.getCurrentPosition();
      SpesaApp._location = { lat: pos.lat, lng: pos.lng, address: '' };

      text.textContent = 'Indirizzo in caricamento…';

      const address = await Utils.reverseGeocode(pos.lat, pos.lng);
      SpesaApp._location.address = address;

      SpesaApp._setLocationUI(SpesaApp._location);
    } catch (err) {
      SpesaApp._location = null;
      text.textContent = 'Impossibile rilevare posizione';
      text.classList.add('placeholder', 'ph');
      document.getElementById('locationClear').style.display = 'none';
      const mapsLink = document.getElementById('locationMapsLink');
      if (mapsLink) mapsLink.style.display = 'none';

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
    SpesaApp._setLocationUI(null);
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
    // Aggiorna anche il campo importo visibile
    const amountVis = document.getElementById('expenseAmount2');
    if (amountVis) amountVis.value = expense.amount;
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
      SpesaApp._setLocationUI(expense.location);
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

      // Sincronizzazione automatica (push + pull) se online
      if (Utils.isOnline()) {
        try {
          await Sync.push();
          await Sync.pullEvent(SpesaApp._eventId);
        } catch (e) {
          console.warn('[SpesaApp] sync dopo salvataggio:', e.message);
        }
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

  // ─── ELIMINA MOVIMENTO ────────────────────────────────────
  async deleteExpense() {
    if (!SpesaApp._expenseId) return;
    if (!confirm('Eliminare questo movimento?')) return;

    const delBtn = document.getElementById('deleteBtn');
    if (delBtn) { delBtn.disabled = true; }

    try {
      await DB.expenses.delete(SpesaApp._expenseId);   // soft-delete (synced=false)
      await DB.photos.delete(SpesaApp._expenseId);

      // Sincronizzazione automatica
      if (Utils.isOnline()) {
        try {
          await Sync.push();
          await Sync.pullEvent(SpesaApp._eventId);
        } catch (e) {
          console.warn('[SpesaApp] sync dopo eliminazione:', e.message);
        }
      }

      Utils.toast('Movimento eliminato', 'success', 2000);
      setTimeout(() => SpesaApp.goBack(), 400);
    } catch (e) {
      console.error('[SpesaApp] delete error:', e);
      Utils.toast('Errore nell\'eliminazione', 'error');
      if (delBtn) { delBtn.disabled = false; }
    }
  },

  // ─── NAVIGAZIONE ──────────────────────────────────────────
  goBack() {
    window.location.href = `/evento.html?id=${SpesaApp._eventId}`;
  }
};

window.SpesaApp = SpesaApp;
