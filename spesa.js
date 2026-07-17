// ═══════════════════════════════════════════════════════════════
// WeGo — spesa.js v3.1
// Logica pagina inserimento / modifica spesa
// v3.1: campo "Tipo" (categoria spesa) — sostituito il vecchio <select>
//       nativo con un bottone che apre un modal a schermo intero
//       (richiesta cliente: le <option> HTML non possono contenere
//       icone). Il modal mostra ogni categoria con la sua icona a 60px
//       (spesa.html v4.0, stesse ExpenseCategories/ExpenseCategoryIcons
//       di payments.js v1.4). Il valore selezionato resta in un
//       <input type="hidden" id="expenseCategory">, stesso id di
//       prima: save() e _loadExistingExpense() non cambiano nella
//       sostanza. Vedi _initCategoryPicker() (ex _buildCategorySelect()),
//       openCategoryPicker(), selectCategory(), _refreshCategoryTrigger().
// v3.0: select "Tipo" (categoria spesa) — per una spesa NUOVA ora parte
//       preselezionata su "Cibo" invece che vuota (richiesta cliente,
//       vedi payments.js v1.2/impostazioni.html v7.3 per le icone
//       categoria). In modifica di una spesa già esistente non cambia
//       nulla: _loadExistingExpense() imposta subito dopo il valore
//       reale salvato (anche se vuoto) — vedi _buildCategorySelect().
// v2.9: campo posizione ora EDITABILE liberamente (richiesta cliente) —
//       prima era un <span> di sola visualizzazione, si riempiva SOLO
//       via GPS e l'intera barra rilevava una nuova posizione al tocco.
//       Ora è un vero <input> (spesa.html v3.9): si riempie da solo col
//       GPS come prima (_tryAutoGps invariata), ma toccandolo si può
//       scrivere/modificare un indirizzo libero in qualsiasi momento —
//       nuovo movimento o modifica, GPS attivo o spento. Il
//       rilevamento GPS è ora un'azione esplicita su un bottoncino 📍
//       dedicato (prima l'intera barra). NUOVO onLocationTextInput():
//       ad ogni modifica manuale del testo, le coordinate lat/lng
//       vengono azzerate (esplicitamente richiesto: l'indirizzo scritto
//       a mano è indipendente dalla posizione reale) — quel movimento
//       non genera più un pin nella Mappa del tab Riepilogo (richiede
//       coordinate reali) e il link "Apri su Maps" passa da coordinate
//       a ricerca testuale (_updateMapsLink(), nuova, fattorizzata da
//       _setLocationUI()).
// v2.8: saveExpense()/deleteExpense() NON aspettano più Sync.push()/
//       pullEvent() prima di mostrare il messaggio di successo e
//       tornare alla pagina evento (richiesta cliente: "meno
//       impattante") — si salva/elimina solo in locale e si torna
//       SUBITO indietro; la sincronizzazione vera e propria parte da
//       sola qualche secondo dopo, silenziosa, quando la pagina evento
//       si ricarica (vedi EventoApp._syncQuiet()/Sync.scheduleQuietSync()
//       in evento.js v2.28 / sync.js v2.1).
// v2.7: NUOVO flag "Uso Cassa Comune" (solo tipo "Spesa") — indica che
//       quella spesa è stata pagata con la cassa comune raccolta da un
//       movimento "+Cassiere", invece che di tasca propria. Toggle a
//       destra dell'Importo, etichetta+interruttore "mini" (meno della
//       metà del font importo), di default spento — si nasconde/forza
//       spento passando a "Trasf."/"+Cassiere", stesso schema di
//       "Previsione". Nuovo campo expenses.is_cassa_comune (db.js v1.9,
//       supabase.js v1.12). Usato SOLO da Utils.calculateCassaComune()
//       (saldo informativo "Cassa Comune" nei Saldi, evento.js) — non
//       influisce in alcun modo sul saldo normale.
// v2.6: FIX CRITICO — in modifica (e solo in modifica, mai in una spesa
//       nuova) la riga "Previsione" e la riga "Tipo" perdevano il loro
//       layout flex: setType() impostava "el.style.display = ''" per
//       mostrarle, ma quell'istruzione RIMUOVE solo la proprietà
//       "display" dallo style inline, senza ripristinarla — il browser
//       ricadeva sul default per un <div> ("block") invece di "flex",
//       perché queste due righe (diversamente da "sectionExpense"/
//       "sectionTransfer", che sono ".form-card" → block di default)
//       hanno "display:flex" SOLO nello style inline scritto in
//       spesa.html. Risultato: interruttore "Previsione" e select
//       "Tipo" disallineati (troppo a sinistra) solo quando si apriva
//       un movimento esistente. Ora si ripristina esplicitamente
//       "flex" invece di "''".
// v2.5: NUOVO terzo tipo "+Cassiere" (setType('cashier')) — usa la
//       STESSA sezione/i campi della Spesa (paid_by + participants[])
//       ma con etichette invertite: "A:" (chi riceve, ex "Paga:") e
//       "Da *" (chi versa e si divide l'importo, ex "Divide tra *").
//       Saldo calcolato da Utils.calculateBalances() con segno OPPOSTO
//       a una spesa normale (vedi utils.js v1.3): il cassiere va in
//       debito, chi versa va in credito. GPS/Foto/Tipo/Previsione
//       nascosti come per "Trasf.". FIX: il checkbox nativo
//       dell'interruttore "Previsione" in _activateViewMode() veniva
//       reso parzialmente visibile (opacity 0.8 sovrascriveva lo
//       opacity:0 di .toggle input via CSS), apparendo "fuori posto"
//       quando si apriva un movimento esistente — ora viene escluso
//       esplicitamente dal reset di opacità generico.
// v2.4: campo "Previsione" (toggle, solo tipo Spesa) — etichetta
//       Descrizione diventa "PREVISIONE" in arancione, "Divide tra"
//       disattivato (vedi toggleForecast/_setDivideTraEnabled);
//       campo "Tipo" (categoria, select da ExpenseCategories — vedi
//       payments.js); fix licenza foto: usa License.photoSyncAllowedForEvent()
//       invece di License.photoSyncAllowed() — un device Base collegato
//       a un evento ospitato da un creatore Pro può usare le foto SOLO
//       su quell'evento (vedi license.js v1.3)
// v2.3: licenza dispositivo (license.js) — nella versione Base il
//       bottone "Foto Scontrino" resta visibile ma disattivato (badge
//       PRO): pickPhoto() mostra l'avviso invece di apri il selettore
//       file, vedi _applyPhotoTierLock()
// v2.2: sincronizzazione foto movimenti — doppia compressione (alta
//       qualità locale + compatta per il sync), permesso di modifica
//       foto riservato al creatore del movimento, preservato created_by
//       originale in fase di modifica (prima veniva sovrascritto da chi
//       modificava per ultimo)
// ═══════════════════════════════════════════════════════════════

const SpesaApp = {

  // ─── STATO ────────────────────────────────────────────────
  _eventId:      null,
  _expenseId:    null,   // null = nuova spesa
  _viewMode:     false,  // true = sola lettura (aperto da lista movimenti)
  _event:        null,
  _users:        [],
  _type:         'expense',   // 'expense' | 'transfer' | 'cashier'
  _isForecast:   false,       // true = "Previsione" — non va divisa, non conta nei saldi
  _isCassaComune: false,      // true = "Uso Cassa Comune" — solo tipo "Spesa", vedi calculateCassaComune
  _location:     null,        // { lat, lng, address }
  _photo:        null,        // base64 — qualità alta, resta solo su questo device
  _photoSync:    null,        // base64 — versione compatta (max 900px/60%) sincronizzata
  _photoChanged: false,       // true se la foto è stata scattata/rimossa in questa sessione
  _isPhotoOwner: true,        // false = movimento creato da un altro: foto solo visualizzabile
  _originalCreatedBy: null,   // creatore originale del movimento (preservato in fase di modifica)
  _gettingGps:   false,
  _selectedPart: new Set(),   // userId selezionati come partecipanti

  // ─── INIT ─────────────────────────────────────────────────
  async init() {
    const params = new URLSearchParams(window.location.search);
    SpesaApp._eventId   = params.get('event');
    SpesaApp._expenseId = params.get('id') || null;
    SpesaApp._viewMode  = params.get('mode') === 'view' && !!SpesaApp._expenseId;

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

    // Titolo pagina con nome evento (es. "Nuova spesa - Sardegna 26")
    SpesaApp._setPageTitle('Nuova spesa');

    // Popola metodi pagamento
    SpesaApp._buildMethodSelect();

    // Popola categorie di spesa (Tipo)
    SpesaApp._initCategoryPicker();

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

    // Licenza (license.js): nella versione Base il bottone foto resta
    // visibile ma disattivato, con etichetta "PRO", per far sapere che la
    // funzione esiste — vedi _applyPhotoTierLock() e pickPhoto().
    SpesaApp._applyPhotoTierLock();

    // Modalità modifica / sola lettura
    if (SpesaApp._expenseId) {
      await SpesaApp._loadExistingExpense();
      const delBtn = document.getElementById('deleteBtn');
      if (delBtn) delBtn.style.display = '';

      if (SpesaApp._viewMode) {
        SpesaApp._activateViewMode();
        return; // non serve GPS né focus sul titolo
      }
    }

    // Focus titolo
    setTimeout(() => document.getElementById('expenseTitle').focus(), 300);

    // Listener importo nascosto per aggiornare preview quota (usato da altri path)
    document.getElementById('expenseAmount').addEventListener('input', SpesaApp._updateSharePreview);

    // GPS automatico solo in modalità nuova spesa o modifica (non view)
    SpesaApp._tryAutoGps();
  },

  // ─── MODALITÀ SOLA LETTURA ────────────────────────────────
  async _activateViewMode() {
    // Disabilita tutti i campi e bottoni del form
    document.querySelectorAll(
      '.form-input,.form-select,.form-textarea,input,select,textarea,.type-btn,.chip,.btn--primary,.photo-thumb__rm,#deleteBtn,.loc-bar,.photo-add-btn'
    ).forEach(el => {
      el.disabled = true;
      el.style.pointerEvents = 'none';
      el.style.opacity = '0.8';
    });

    // FIX: la riga sopra impostava opacity:0.8 inline anche sulla
    // checkbox NATIVA dell'interruttore "Previsione" (#forecastToggle,
    // selettore generico "input") — quella checkbox va invece SEMPRE
    // mantenuta invisibile (opacity:0, vedi style.css ".toggle input"),
    // perché l'aspetto dell'interruttore è disegnato dal solo
    // ".toggle-slider" accanto. Lo stile inline ha priorità sulla
    // classe CSS, quindi la checkbox "ricompariva" sovrapposta allo
    // slider, fuori posizione, ogni volta che si apriva un movimento
    // esistente. La ripristiniamo qui, subito dopo il reset generico.
    document.querySelectorAll('.toggle input').forEach(el => {
      el.style.opacity = '0';
    });

    // Nasconde saveBtn (header) e saveSpeaBtn (accanto alle note)
    const saveBtn     = document.getElementById('saveBtn');
    const saveSpeaBtn = document.getElementById('saveSpeaBtn');
    const deleteBtn   = document.getElementById('deleteBtn');
    if (saveBtn)     saveBtn.style.display     = 'none';
    if (saveSpeaBtn) saveSpeaBtn.style.display = 'none';
    if (deleteBtn)   deleteBtn.style.display   = 'none';

    // Determina se l'utente corrente può modificare/eliminare
    const session     = DB.sessions.get(SpesaApp._eventId);
    const currentId   = session?.userId;
    const expense     = await DB.expenses.getById(SpesaApp._expenseId);
    const eventRec    = SpesaApp._event;
    const creatorName = eventRec?.created_by || '';

    const isExpenseOwner = expense?.created_by === currentId;
    const currentName    = session?.userName || '';
    const isEventCreator = creatorName && currentName &&
      creatorName.toLowerCase() === currentName.toLowerCase();
    const canEdit = isExpenseOwner || isEventCreator;

    // Mostra bottoni Modifica ed Elimina nell'header
    const editBtn = document.getElementById('headerEditBtn');
    const delBtn  = document.getElementById('headerDeleteBtn');
    if (editBtn) {
      editBtn.style.display = '';
      editBtn.disabled      = !canEdit;
      if (!canEdit) editBtn.style.opacity = '0.4';
    }
    if (delBtn) {
      delBtn.style.display = '';
      delBtn.disabled      = !canEdit;
      if (!canEdit) delBtn.style.opacity = '0.4';
    }
  },

  // Entra in modalità modifica dalla vista sola lettura
  enterEditMode() {
    window.location.href =
      `/spesa.html?event=${SpesaApp._eventId}&id=${SpesaApp._expenseId}`;
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

  // ─── POPOLA SELECT CATEGORIE (TIPO) ───────────────────────
  // Facoltativo: la prima opzione è sempre vuota ("—"). Lista gestita da
  // Impostazioni → Categorie spesa (vedi payments.js → ExpenseCategories,
  // stesso pattern dei metodi di pagamento).
  // Impostazioni → Categorie spesa (vedi payments.js → ExpenseCategories,
  // stesso pattern dei metodi di pagamento).
  // v3.1: rinominata da _buildCategorySelect() — non popola più un
  // <select>, ma imposta il valore iniziale nel campo nascosto e
  // aggiorna il bottone "trigger" — vedi openCategoryPicker() per il
  // modal con l'elenco a icone grandi.
  _initCategoryPicker() {
    const hidden = document.getElementById('expenseCategory');
    if (!hidden || typeof ExpenseCategories === 'undefined') return;
    // v3.0: per una spesa NUOVA il default è "Cibo" (se ancora abilitata,
    // altrimenti resta vuoto) — in modifica di una spesa esistente questo
    // valore iniziale viene subito sovrascritto da _loadExistingExpense()
    // col valore reale salvato, incluso vuoto se non aveva categoria.
    const isNew = !SpesaApp._expenseId;
    const cats  = ExpenseCategories.getEnabled();
    const defaultId = (isNew && cats.some(c => c.id === 'cibo')) ? 'cibo' : '';
    hidden.value = defaultId;
    SpesaApp._refreshCategoryTrigger();
  },

  // Aggiorna l'icona/etichetta mostrate sul bottone "Tipo" in base al
  // valore corrente del campo nascosto #expenseCategory.
  _refreshCategoryTrigger() {
    const id    = document.getElementById('expenseCategory')?.value || '';
    const icon  = document.getElementById('expenseCategoryTriggerIcon');
    const label = document.getElementById('expenseCategoryTriggerLabel');
    if (!icon || !label) return;
    if (!id) {
      icon.innerHTML = '';
      label.textContent = '—';
      return;
    }
    const cat = ExpenseCategories.getById(id);
    icon.innerHTML = ExpenseCategories.iconSvg(cat, 21);
    label.textContent = cat.label;
  },

  // Apre il modal con l'elenco delle categorie abilitate, icona 60px +
  // descrizione per ogni voce (richiesta cliente) — tocco su una voce
  // = selezione immediata e chiusura.
  openCategoryPicker() {
    const list = document.getElementById('categoryPickerList');
    if (!list || typeof ExpenseCategories === 'undefined') return;
    const currentId = document.getElementById('expenseCategory')?.value || '';
    const cats = ExpenseCategories.getEnabled();
    const noneRow = `
      <div class="category-picker-item ${currentId === '' ? 'selected' : ''}" onclick="SpesaApp.selectCategory('')">
        <span class="category-picker-item__icon">${ExpenseCategoryIcons.svg('dots', 60)}</span>
        <span class="category-picker-item__label">Nessuna categoria</span>
        <svg class="category-picker-item__check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </div>`;
    const rows = cats.map(c => `
      <div class="category-picker-item ${currentId === c.id ? 'selected' : ''}" onclick="SpesaApp.selectCategory('${c.id}')">
        <span class="category-picker-item__icon">${ExpenseCategories.iconSvg(c, 60)}</span>
        <span class="category-picker-item__label">${Utils.escapeHtml(c.label)}</span>
        <svg class="category-picker-item__check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </div>`).join('');
    list.innerHTML = noneRow + rows;
    SpesaApp.openModal('modalCategoryPicker');
  },

  selectCategory(id) {
    const hidden = document.getElementById('expenseCategory');
    if (hidden) hidden.value = id;
    SpesaApp._refreshCategoryTrigger();
    SpesaApp.closeModal('modalCategoryPicker');
  },

  openModal(id)  { document.getElementById(id)?.classList.add('open'); },
  closeModal(id) { document.getElementById(id)?.classList.remove('open'); },

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

  // ─── TITOLO PAGINA: nome evento, con prefisso "Modifica" solo
  // quando si sta davvero modificando una spesa esistente (premuto il
  // bottone "Modifica" dalla vista di sola lettura). Per nuova spesa e
  // per la sola visualizzazione resta solo il nome dell'evento, su
  // un'unica riga, senza testo ridondante.
  _setPageTitle(base) {
    const pageTitle = document.getElementById('pageTitle');
    if (!pageTitle) return;
    const evTitle = SpesaApp._event?.title || base;
    const isEditingExisting = !!SpesaApp._expenseId && !SpesaApp._viewMode;
    pageTitle.textContent = isEditingExisting ? `Modifica - ${evTitle}` : evTitle;
  },

  // ─── TIPO SPESA ───────────────────────────────────────────
  setType(type) {
    SpesaApp._type = type;

    const btnExp  = document.getElementById('typeExpense');
    const btnTr   = document.getElementById('typeTransfer');
    const btnCash = document.getElementById('typeCashier');
    const secExp  = document.getElementById('sectionExpense');
    const secTr   = document.getElementById('sectionTransfer');

    btnExp.classList.toggle('active',          type === 'expense');
    btnTr.classList.toggle('active-transfer',  type === 'transfer');
    btnTr.classList.toggle('active',           false);
    if (btnCash) btnCash.classList.toggle('active-cashier', type === 'cashier');

    // "+Cassiere" usa la STESSA sezione della Spesa (paid_by + participants),
    // solo con le etichette invertite (vedi sotto) — non quella di Trasf.
    secExp.style.display  = (type === 'expense' || type === 'cashier') ? '' : 'none';
    secTr.style.display   = type === 'transfer' ? '' : 'none';

    // Etichette "Paga:"/"Divide tra *" → "A:"/"Da *" per "+Cassiere": è
    // il cassiere che RICEVE (campo "A", ex paid_by) mentre gli altri
    // utenti VERSANO e si dividono l'importo (campo "Da *", ex
    // participants) — stesso identico meccanismo della Spesa, solo
    // segno del saldo invertito (vedi utils.js calculateBalances).
    const paidByLabel    = document.getElementById('paidByLabel');
    const divideTraLabel = document.getElementById('divideTraLabel');
    if (paidByLabel)    paidByLabel.textContent    = type === 'cashier' ? 'A:'     : 'Paga:';
    if (divideTraLabel) divideTraLabel.textContent = type === 'cashier' ? 'Da *'   : 'Divide tra *';

    // Nascondi GPS e foto per Trasf./+Cassiere: non pertinenti, non sono
    // uno scontrino/spesa reale.
    const gpsCard   = document.getElementById('locationBar')?.closest('.form-card');
    const photoCard = document.getElementById('photoInput')?.closest('.form-card');
    if (gpsCard)   gpsCard.style.display   = type === 'expense' ? '' : 'none';
    if (photoCard) photoCard.style.display = type === 'expense' ? '' : 'none';

    // Previsione e Tipo: solo per "Spesa", non per "Trasf."/"+Cassiere"
    // (un trasferimento o un versamento al cassiere sono cassa reale,
    // non una previsione/categoria di spesa).
    // FIX: questi due elementi hanno "display:flex" SOLO nello style
    // inline scritto in spesa.html (nessuna classe CSS lo definisce, a
    // differenza di "sectionExpense"/"sectionTransfer" che sono
    // ".form-card", display:block di default). Impostare
    // "el.style.display = ''" rimuove la sola proprietà "display"
    // dallo stile inline SENZA ripristinarla: il browser ricade sul
    // default per un <div>, cioè "block" — non "flex". Risultato: la
    // riga perdeva il layout flex (etichetta/nota/interruttore non più
    // allineati correttamente, interruttore "troppo a sinistra" invece
    // che a filo destro) ogni volta che setType() veniva eseguito —
    // cioè SOLO in modifica (in una spesa nuova questa funzione non
    // viene mai chiamata, la riga resta intatta col suo style
    // originale). Ora ripristiniamo esplicitamente "flex" invece di "''".
    const forecastRow = document.getElementById('forecastRow');
    const categoryRow = document.getElementById('categoryRow');
    const cassaComuneRow = document.getElementById('cassaComuneRow');
    if (forecastRow) forecastRow.style.display = type === 'expense' ? 'flex' : 'none';
    if (categoryRow) categoryRow.style.display = type === 'expense' ? 'flex' : 'none';
    if (cassaComuneRow) cassaComuneRow.style.display = type === 'expense' ? 'flex' : 'none';
    if (type !== 'expense' && SpesaApp._isForecast) {
      // Si passa a Trasf./+Cassiere con Previsione attiva: la disattiviamo,
      // non avrebbe senso lasciarla "appesa" su un movimento di cassa.
      const toggle = document.getElementById('forecastToggle');
      if (toggle) toggle.checked = false;
      SpesaApp.toggleForecast(false);
    }
    if (type !== 'expense' && SpesaApp._isCassaComune) {
      // Stesso ragionamento di "Previsione": "Uso Cassa Comune" ha senso
      // solo per una "Spesa" reale, non per Trasf./+Cassiere.
      const cassaToggle = document.getElementById('cassaComuneToggle');
      if (cassaToggle) cassaToggle.checked = false;
      SpesaApp.toggleCassaComune(false);
    }

    SpesaApp._setPageTitle(
      type === 'expense'  ? (SpesaApp._expenseId ? 'Modifica spesa' : 'Nuova spesa') :
      type === 'cashier'  ? (SpesaApp._expenseId ? 'Modifica versamento' : 'Nuovo versamento cassiere') :
      'Trasferimento'
    );
  },

  // ─── PREVISIONE ───────────────────────────────────────────
  // Spesa futura: non va divisa né conteggiata nei saldi/totali da
  // dividere (vedi evento.js), solo evidenziata a parte. Cambia solo
  // l'etichetta del campo Descrizione (in PREVISIONE, grassetto e
  // arancione) e disattiva "Divide tra" — "Paga" resta attivo perché
  // serve a sapere DI CHI è la previsione (colonna "Prev." nei Saldi).
  toggleForecast(checked) {
    SpesaApp._isForecast = checked;

    const label = document.getElementById('descLabel');
    if (label) {
      label.textContent = checked ? 'PREVISIONE' : 'Descrizione *';
      label.style.fontWeight = checked ? '800' : '';
      label.style.color      = checked ? 'var(--amber)' : '';
    }

    SpesaApp._setDivideTraEnabled(!checked);
  },

  // Disattiva visivamente (dim + non cliccabile) la sezione "Divide tra"
  // senza nasconderla — resta comunque chiaro chi sono i partecipanti
  // dell'evento, solo non selezionabili mentre la spesa è "Previsione".
  _setDivideTraEnabled(enabled) {
    const wrap    = document.getElementById('divideTraWrap');
    const grid    = document.getElementById('participantsGrid');
    const preview = document.getElementById('sharePreview');
    [wrap, grid, preview].forEach(el => {
      if (!el) return;
      el.style.opacity       = enabled ? '' : '0.4';
      el.style.pointerEvents = enabled ? '' : 'none';
    });
  },

  // ─── USO CASSA COMUNE ───────────────────────────────────────
  // Flag poco usato (solo tipo "Spesa"): indica che questa spesa è
  // stata pagata con la cassa comune raccolta da un movimento
  // "+Cassiere", invece che di tasca propria. Non cambia in alcun modo
  // il form (a differenza di "Previsione"): è solo un dato salvato e
  // letto da Utils.calculateCassaComune() per il saldo informativo
  // "Cassa Comune" nei Saldi (evento.js).
  toggleCassaComune(checked) {
    SpesaApp._isCassaComune = checked;
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

  // Helper condiviso: aggiorna l'UI della sezione posizione (input + link Maps + bottone X)
  _setLocationUI(location) {
    const text     = document.getElementById('locationText');
    const clearBtn = document.getElementById('locationClear');

    if (location && (location.address || typeof location.lat === 'number')) {
      const label = location.address || `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`;
      text.value = label;
      if (clearBtn) clearBtn.style.display = '';
    } else {
      text.value = '';
      if (clearBtn) clearBtn.style.display = 'none';
    }
    SpesaApp._updateMapsLink(location);
  },

  // Link "Apri su Google Maps" — NUOVO v2.9: se abbiamo coordinate reali
  // usa quelle (come sempre), altrimenti (indirizzo scritto a mano,
  // senza GPS) fa una ricerca testuale — funziona comunque, anche se
  // meno preciso di una coordinata esatta.
  _updateMapsLink(location) {
    const mapsLink = document.getElementById('locationMapsLink');
    if (!mapsLink) return;
    if (location && typeof location.lat === 'number' && typeof location.lng === 'number') {
      mapsLink.href = `https://www.google.com/maps?q=${location.lat},${location.lng}`;
      mapsLink.style.display = '';
    } else if (location && location.address) {
      mapsLink.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location.address)}`;
      mapsLink.style.display = '';
    } else {
      mapsLink.style.display = 'none';
    }
  },

  // v2.9: l'utente sta scrivendo/modificando il campo a mano (sia su un
  // nuovo movimento sia in modifica, con GPS attivo o spento): il testo
  // resta subito quello scritto, indipendente dalla posizione GPS reale
  // (richiesta cliente) — le coordinate si azzerano SUBITO (fallback:
  // link "Apri su Maps" a ricerca testuale, nessun pin sulla Mappa).
  //
  // AGGIUNTA: prova poi a RISOLVERE quell'indirizzo in coordinate vere
  // tramite Nominatim/OpenStreetMap (stesso servizio già usato per la
  // geocodifica inversa, Utils.geocodeAddress() in utils.js — nessuna
  // API key). Se trova una corrispondenza, il movimento torna ad avere
  // coordinate reali (compare di nuovo come pin sulla Mappa, link Maps
  // preciso) SENZA toccare il testo scritto dall'utente, che resta
  // quello. Se non trova nulla (indirizzo vago/incompleto/inventato),
  // resta testo libero senza coordinate — comportamento identico a
  // prima, nessuna regressione.
  //
  // Debounce di 900ms (rispetto della policy d'uso di Nominatim, max
  // ~1 richiesta/secondo — non ha senso geocodificare ad ogni tasto
  // comunque, l'indirizzo è incompleto mentre si scrive) + un numero di
  // sequenza (_geocodeSeq) per scartare risposte "vecchie" se l'utente
  // continua a scrivere: solo l'ultimo tentativo in ordine di tempo può
  // aggiornare le coordinate.
  onLocationTextInput() {
    const text  = document.getElementById('locationText');
    const value = text.value.trim();

    if (SpesaApp._geocodeTimer) clearTimeout(SpesaApp._geocodeTimer);
    SpesaApp._geocodeSeq = (SpesaApp._geocodeSeq || 0) + 1;

    if (value) {
      SpesaApp._location = { lat: null, lng: null, address: value };
      const clearBtn = document.getElementById('locationClear');
      if (clearBtn) clearBtn.style.display = '';

      const mySeq = SpesaApp._geocodeSeq;
      SpesaApp._geocodeTimer = setTimeout(async () => {
        const coords = await Utils.geocodeAddress(value);
        // Scartata se nel frattempo l'utente ha scritto altro (sequenza
        // superata) o ha cancellato/cambiato del tutto il campo.
        if (mySeq !== SpesaApp._geocodeSeq) return;
        if (!coords) return;
        if (!SpesaApp._location || SpesaApp._location.address !== value) return;

        SpesaApp._location.lat = coords.lat;
        SpesaApp._location.lng = coords.lng;
        SpesaApp._updateMapsLink(SpesaApp._location);
      }, 900);
    } else {
      SpesaApp._location = null;
      const clearBtn = document.getElementById('locationClear');
      if (clearBtn) clearBtn.style.display = 'none';
    }
    SpesaApp._updateMapsLink(SpesaApp._location);
  },

  async getLocation() {
    if (SpesaApp._gettingGps) return;
    SpesaApp._gettingGps = true;

    const text = document.getElementById('locationText');
    text.disabled = true;
    text.value = '';
    text.placeholder = 'Rilevamento in corso…';

    try {
      const pos = await Utils.getCurrentPosition();
      SpesaApp._location = { lat: pos.lat, lng: pos.lng, address: '' };

      text.placeholder = 'Indirizzo in caricamento…';

      const address = await Utils.reverseGeocode(pos.lat, pos.lng);
      SpesaApp._location.address = address;

      SpesaApp._setLocationUI(SpesaApp._location);
    } catch (err) {
      SpesaApp._location = null;
      text.placeholder = 'Impossibile rilevare posizione';
      document.getElementById('locationClear').style.display = 'none';
      SpesaApp._updateMapsLink(null);

      if (err.code === 1) {
        Utils.toast('Permesso posizione negato. Abilitalo nelle impostazioni.', 'error', 4000);
      } else {
        Utils.toast('Posizione non disponibile', 'error');
      }
    } finally {
      text.disabled = false;
      if (!SpesaApp._location) text.placeholder = 'Tocca per rilevare, o scrivi un indirizzo';
      SpesaApp._gettingGps = false;
    }
  },

  clearLocation(e) {
    e.stopPropagation();
    SpesaApp._location = null;
    SpesaApp._setLocationUI(null);
    document.getElementById('locationText').placeholder = 'Tocca per rilevare, o scrivi un indirizzo';
  },

  // ─── FOTO ─────────────────────────────────────────────────
  pickPhoto() {
    // Licenza (license.js): versione Base = foto movimento non
    // disponibile, A MENO che questo specifico evento non sia ospitato
    // da un creatore con versione Pro (vedi License.photoSyncAllowedForEvent —
    // fix: un device Base collegato a un evento Pro può comunque usare le
    // foto, solo su quell'evento). Il bottone resta visibile (per far
    // sapere che la funzione esiste) ma cliccandolo mostra solo l'avviso.
    if (typeof License !== 'undefined' && !License.photoSyncAllowedForEvent(SpesaApp._event)) {
      Utils.toast(License.msgPhotoLocked(), 'info');
      return;
    }
    if (!SpesaApp._isPhotoOwner) return; // difesa, il bottone è già nascosto
    document.getElementById('photoInput').click();
  },

  // Bottone foto visibile ma "disattivato" (dimmed + etichetta PRO) per i
  // device in versione Base — non lo nascondiamo: deve restare visibile
  // perché l'utente sappia che la funzione esiste con la versione Pro.
  // Eccezione: se QUESTO evento è ospitato da un creatore Pro, il bottone
  // resta normale anche per un device Base (vedi pickPhoto sopra).
  _applyPhotoTierLock() {
    if (typeof License === 'undefined' || License.photoSyncAllowedForEvent(SpesaApp._event)) return;
    const btn = document.getElementById('photoPickBtn');
    if (!btn || btn.querySelector('.badge--amber')) return;
    btn.classList.add('btn--pro-locked');
    btn.insertAdjacentHTML('beforeend', ' <span class="badge badge--amber" style="margin-left:4px;vertical-align:middle;">PRO</span>');
  },

  async onPhotoChange(input) {
    const file = input.files[0];
    if (!file) return;
    try {
      // Due versioni dalla stessa foto originale:
      // - "alta qualità" (1200px/82%, comportamento di sempre): resta SOLO
      //   su questo device, mai inviata al server.
      // - "compatta" (max 900px/qualità 60%, ~30-50KB): è quella che viene
      //   sincronizzata su server e altri device (vedi sync.js).
      const [compressed, compact] = await Promise.all([
        Utils.compressImage(file, 1200),
        Utils.compressImage(file, 900, 0.6)
      ]);
      SpesaApp._photo        = compressed;
      SpesaApp._photoSync    = compact;
      SpesaApp._photoChanged = true;

      const preview = document.getElementById('photoPreviewImg');
      const wrap    = document.getElementById('photoPreviewWrap');
      const label   = document.getElementById('photoLabel');
      if (preview) preview.src = compressed;
      if (wrap)    wrap.style.display = 'block';
      if (label)   label.textContent  = 'Cambia foto';
    } catch {
      Utils.toast('Errore nel caricamento foto', 'error');
    }
  },

  removePhoto() {
    if (!SpesaApp._isPhotoOwner) return; // difesa, il bottone è già nascosto
    SpesaApp._photo        = null;
    SpesaApp._photoSync    = null;
    SpesaApp._photoChanged = true;
    const wrap  = document.getElementById('photoPreviewWrap');
    const label = document.getElementById('photoLabel');
    const input = document.getElementById('photoInput');
    if (wrap)    wrap.style.display = 'none';
    if (label) label.textContent  = 'Aggiungi foto';
    if (input) input.value = '';
  },

  // ─── LIGHTBOX FOTO (spesa.html) ───────────────────────────
  openPhotoLightbox() {
    if (!SpesaApp._photo) return;
    const lb      = document.getElementById('spesaPhotoLightbox');
    const img     = document.getElementById('spesaLightboxImg');
    const delWrap = document.getElementById('spesaLightboxDeleteWrap');
    if (!lb || !img) return;
    img.src = SpesaApp._photo;
    lb.style.display = 'flex';
    // Bottone elimina: solo in edit mode (non in view mode) e solo a chi
    // ha creato il movimento.
    if (delWrap) delWrap.style.display = (SpesaApp._viewMode || !SpesaApp._isPhotoOwner) ? 'none' : '';
  },

  closePhotoLightbox() {
    const lb  = document.getElementById('spesaPhotoLightbox');
    const img = document.getElementById('spesaLightboxImg');
    if (lb)  lb.style.display = 'none';
    if (img) img.src = '';
  },

  removeLightboxPhoto(e) {
    if (e) e.stopPropagation();
    SpesaApp.removePhoto();
    SpesaApp.closePhotoLightbox();
  },

  // ─── CARICA SPESA ESISTENTE ───────────────────────────────
  async _loadExistingExpense() {
    const expense = await DB.expenses.getById(SpesaApp._expenseId);
    if (!expense) {
      Utils.toast('Spesa non trovata', 'error');
      return;
    }

    SpesaApp._setPageTitle(
      expense.type === 'transfer' ? 'Modifica movimento' : 'Modifica spesa'
    );

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

    // Categoria (Tipo) — v3.1: campo nascosto + refresh del bottone trigger
    const catHidden = document.getElementById('expenseCategory');
    if (catHidden) catHidden.value = expense.category || '';
    SpesaApp._refreshCategoryTrigger();

    // Previsione
    if (expense.is_forecast) {
      const toggle = document.getElementById('forecastToggle');
      if (toggle) toggle.checked = true;
      SpesaApp.toggleForecast(true);
    }

    // Uso Cassa Comune
    if (expense.is_cassa_comune) {
      const cassaToggle = document.getElementById('cassaComuneToggle');
      if (cassaToggle) cassaToggle.checked = true;
      SpesaApp.toggleCassaComune(true);
    }

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
      SpesaApp._photo     = savedPhoto.data;
      SpesaApp._photoSync = savedPhoto.sync_data || null;
      const preview = document.getElementById('photoPreviewImg');
      const wrap    = document.getElementById('photoPreviewWrap');
      const label   = document.getElementById('photoLabel');
      if (preview) preview.src = savedPhoto.data;
      if (wrap)    wrap.style.display = 'block';
      if (label)   label.textContent  = 'Cambia foto';
    }

    // Permesso foto: SOLO chi ha CREATO il movimento può cambiarla o
    // eliminarla — anche se l'evento permette ad altri (es. il creatore
    // dell'evento) di modificare il resto del movimento. Non si applica
    // se il movimento non ha ancora una foto: chiunque possa modificare
    // il movimento può aggiungerne una.
    const session = DB.sessions.get(SpesaApp._eventId);
    SpesaApp._originalCreatedBy = expense.created_by || null;
    SpesaApp._isPhotoOwner = !SpesaApp._photo || expense.created_by === (session?.userId || null);
    if (SpesaApp._photo && !SpesaApp._isPhotoOwner) {
      SpesaApp._lockPhotoControls();
    }
  },

  // Nasconde i controlli di modifica/rimozione foto (la miniatura resta
  // visibile e cliccabile per vederla a schermo intero) — usato quando il
  // movimento ha già una foto creata da un'altra persona.
  _lockPhotoControls() {
    const pickBtn = document.getElementById('photoPickBtn');
    const rmBtn   = document.querySelector('.photo-thumb__rm');
    if (pickBtn) pickBtn.style.display = 'none';
    if (rmBtn)   rmBtn.style.display   = 'none';
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

    if ((SpesaApp._type === 'expense' || SpesaApp._type === 'cashier') && !SpesaApp._isForecast && SpesaApp._selectedPart.size === 0) {
      Utils.toast(
        SpesaApp._type === 'cashier' ? 'Seleziona almeno chi versa ("Da")' : 'Seleziona almeno un partecipante',
        'error'
      );
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
      const isCashier  = SpesaApp._type === 'cashier';
      const amount     = Utils.parseAmount(document.getElementById('expenseAmount').value);
      const title      = document.getElementById('expenseTitle').value.trim();
      const date       = document.getElementById('expenseDate').value || Utils.today();
      const method     = document.getElementById('expenseMethod').value;
      const category   = document.getElementById('expenseCategory')?.value || null;
      const notes      = document.getElementById('expenseNotes').value.trim();

      const paidBy = isTransfer
        ? document.getElementById('transferFrom').value
        : document.getElementById('expensePaidBy').value; // per "+Cassiere": campo "A" (il cassiere)

      const paidFor = isTransfer
        ? document.getElementById('transferTo').value
        : null;

      // Previsione: non va divisa, quindi nessun partecipante anche se la
      // griglia ne ha ancora alcuni selezionati da prima del toggle.
      // "+Cassiere": i partecipanti sono il campo "Da" (chi versa e si
      // divide l'importo) — stesso meccanismo della Spesa, mai forzato a [].
      const participants = (isTransfer || SpesaApp._isForecast)
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
        // Categoria (Tipo) e Previsione: solo per il tipo "Spesa" — per
        // Trasf./+Cassiere restano sempre null/false anche se la select
        // categoria avesse ancora un valore residuo da prima del cambio
        // tipo (la riga è nascosta, ma il valore selezionato resterebbe
        // nel DOM finché non si ricarica la pagina).
        category:       (isTransfer || isCashier) ? null : category,
        is_forecast:    (!isTransfer && !isCashier) && SpesaApp._isForecast,
        // "Uso Cassa Comune": stesso schema di "Previsione" — solo per
        // "Spesa", sempre false per Trasf./+Cassiere (la riga è
        // nascosta/forzata spenta in setType(), questo è il rinforzo
        // finale al salvataggio).
        is_cassa_comune: (!isTransfer && !isCashier) && SpesaApp._isCassaComune,
        date,
        location:       SpesaApp._location,
        has_photo:      !!SpesaApp._photo,
        notes,
        // Preserva il creatore ORIGINALE quando si modifica un movimento
        // esistente — altrimenti chi modifica per ultimo (es. il creatore
        // dell'evento che corregge una spesa di un altro) ne diventerebbe
        // il "proprietario", rompendo il controllo permessi sulla foto.
        created_by:     SpesaApp._expenseId
          ? (SpesaApp._originalCreatedBy ?? session?.userId ?? null)
          : (session?.userId || null),
        synced:         false
      };

      // Salva spesa
      const saved = await DB.expenses.save(expenseData);

      // Foto: la tocchiamo SOLO se è stata davvero cambiata in questa
      // sessione (nuova foto scattata, o rimossa) — se non l'hai toccata,
      // lasciamo intatto il record esistente: niente re-upload inutile,
      // niente reset del flag "synced" già sincronizzato.
      if (SpesaApp._photoChanged) {
        if (SpesaApp._photo) {
          await DB.photos.save(saved.id, SpesaApp._photo, {
            sync_data:  SpesaApp._photoSync,
            created_by: expenseData.created_by,
            synced:     false,
            updated_at: Utils.now()
          });
        } else if (SpesaApp._expenseId) {
          // Soft: segna come eliminata e DA PROPAGARE al server (vedi
          // Sync.push) — un hard delete locale perderebbe la
          // cancellazione se il device fosse offline in questo momento.
          await DB.photos.markDeleted(SpesaApp._expenseId);
        }
      }

      // Sincronizzazione (NUOVO v3.9): non blocca più qui — si salva
      // solo in locale e si torna SUBITO alla pagina evento. La sync
      // vera e propria (push + pull) parte da sola qualche secondo dopo,
      // silenziosa, quando EventoApp.init() richiama _syncQuiet() al
      // ricaricamento della pagina evento (vedi Sync.scheduleQuietSync()
      // in sync.js v2.1 e EventoApp._syncQuiet() in evento.js v2.28) —
      // così l'utente è libero di continuare a lavorare (aggiungere
      // un'altra spesa, aprire Impostazioni, ecc.) senza restare in
      // attesa della rete. Se il device è offline, il salvataggio resta
      // comunque in locale (synced:false) e verrà ripreso al prossimo
      // giro utile, come già accadeva prima.

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

      // Sincronizzazione differita (v3.9) — vedi commento in saveExpense()
      // qui sopra: non si aspetta più qui, parte da sola al ritorno
      // sulla pagina evento.

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
