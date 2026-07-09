// ═══════════════════════════════════════════════════════════════
// WeGo — evento.js v2.29
// Logica pagina dettaglio evento
// v2.29: Mappa del tab Riepilogo — sostituita l'icona Leaflet di
//        default (segnaposto blu generico, "sembrava incompleta") con
//        un'icona "moneta" custom (_riepilogoCoinIcon(), L.divIcon —
//        riusa l'IDENTICA moneta SVG già usata per "Uso Cassa Comune"
//        in _renderSpese(), coerenza visiva). Click su un pin ora porta
//        DIRETTAMENTE alla spesa nella LISTA del tab Movimenti
//        (_goToExpenseInList(): switchTab('spese') + scrollIntoView +
//        evidenziazione breve), non più alla pagina di modifica — tolto
//        il popup intermedio che c'era prima, un passaggio in meno.
//        Nuovo attributo data-expense-id su ogni riga .exp_item in
//        _renderSpese() (prima il click era gestito solo via onclick
//        inline, niente per selezionare una riga specifica da fuori).
// v2.28: _syncQuiet() ora usa Sync.scheduleQuietSync() (sync.js v2.1)
//        invece di await diretto a Sync.push()/pullEvent() — la sync
//        silenziosa (al caricamento pagina, al ritorno online, e di
//        fatto anche subito dopo un salvataggio spesa, dato che
//        spesa.js torna su questa pagina) parte 5s dopo l'ultima
//        chiamata invece che subito, senza bloccare nulla. syncNow()
//        (tap manuale sull'icona) annulla prima una eventuale sync
//        differita in sospeso (Sync.cancelQuietSync()) per evitare un
//        secondo giro superfluo pochi secondi dopo.
// v2.27: NUOVO 4° criterio "Mappa" nel tab Riepilogo (evento.html v6.7)
//        — mappa incorporata OpenStreetMap/Leaflet (vendorizzata in
//        locale, nessuna API key) con un pin per ogni spesa con
//        posizione GPS salvata (_riepilogoMappaExpenses(): solo tipo
//        'expense', esclude Previsioni — Trasf./Cassiere non hanno mai
//        GPS) + bottone "Apri tutte le posizioni in Google Maps" (link
//        diretto multi-tappa, nessuna API key). Nuove funzioni:
//        _riepilogoMappaExpenses(), _renderRiepilogoMappa(),
//        _configureLeafletIcons(). _renderRiepilogo() ora smista subito
//        su questo ramo separato quando mode==='mappa' (non è una
//        suddivisione della torta, è una vista diversa).
// v2.26: FIX grafico Riepilogo — "Per Partecipante" ora include anche i
//        Trasferimenti (non solo le spese), nuova
//        _riepilogoPartecipanteMovements(); "Data"/"Tipo spesa" restano
//        solo spese reali (invariato). Bottone Excel rinominato "Esporta
//        Movimenti in Excel" + icona dedicata (evento.html v6.5) +
//        richiesta conferma (confirm() nativo) PRIMA di generare il
//        file, in cima a exportRiepilogoExcel().
// v2.25: NUOVO bottone "Esporta in Excel" nel tab Riepilogo (evento.html
//        v6.4) — exportRiepilogoExcel() genera un .xlsx con ExcelJS
//        (vendorizzato in locale, exceljs.min.js, nessuna dipendenza
//        esterna/CDN per restare offline-capable — vedi sw.js precache).
//        Un rigo per movimento (Titolo, Tipologia [Spesa/Trasf./
//        Cassiere], Importo, Valuta, Da, Data, Creato il, poi 2 colonne
//        "Versato"/"Quota" per ogni partecipante), riga TOTALE con
//        formule SUM che devono coincidere con Saldi/EventoApp._balances
//        (stessa logica di Utils.calculateBalances() riapplicata riga
//        per riga — vedi _riepilogoMovementDeltas()). Include SEMPRE
//        Trasferimenti e "+Cassiere" (a differenza del grafico a torta
//        qui sopra, che li esclude) — solo le Previsioni sono escluse,
//        stessa base di _balances. Condivisione via Web Share API
//        (file) se supportata dal browser/OS, altrimenti download
//        diretto del file.
// v2.24: NUOVO 4° tab "Riepilogo" (evento.html v6.3) — grafico a torta
//        (CSS conic-gradient, nessuna libreria) delle sole spese reali
//        (stesso filtro dei 4 totali Movimenti: esclude Previsioni,
//        Trasferimenti, "+Cassiere" — vedi _riepilogoRealExpenses()),
//        suddivisibile con 3 chip per Partecipante (chi ha pagato,
//        stesso colore avatar usato ovunque), Data (giorno esatto,
//        Utils.formatDateLabel) o Tipo spesa (ExpenseCategories, le
//        spese senza categoria confluiscono in "Senza categoria").
//        Nuove funzioni: setRiepilogoGroup(), _renderRiepilogo(),
//        _riepilogoRealExpenses(). switchTab()/_renderTab() estesi per
//        includere il nuovo tab.
// v2.23: FIX coerenza — shareRiepilogo() (richiamabile da Saldi o dal
//        menu "⋮") non ricalcola più i saldi da zero con una propria
//        copia della logica: ora usa direttamente EventoApp._balances
//        (la stessa fonte di _renderSaldi()) passata a
//        Utils.calculateMinimalTransactions(), esattamente come
//        "Transazioni minime" in Saldi — UNA SOLA fonte di verità per
//        i saldi/"da saldare" in tutta l'app.
// v2.22: shareRiepilogo() (riepilogo testuale condivisibile) reso
//        COERENTE con i 4 totali della tab Movimenti (v2.21, vedi
//        sotto): "Totale" nel testo condiviso non sottrae più
//        "+Cassiere" — ora è completamente escluso, come in
//        _renderSpese(). "X spese" non cambia (già escludeva
//        Trasf./"+Cassiere"/Previsione). I saldi/"Da saldare" nel testo
//        NON sono toccati: "+Cassiere" continua a contare lì come
//        sempre (segno opposto).
// v2.21: 4 totali in alto nei Movimenti — "+Cassiere" ORA COMPLETAMENTE
//        ESCLUSO da Totale/Spese/Pro capite (_renderSpese()): prima il
//        suo importo veniva SOTTRATTO, ora non viene più né sommato né
//        sottratto, semplicemente ignorato in questi 3 totali (resta
//        invece conteggiato come sempre nei saldi/Versato-Incassato,
//        _calcBalances()/_calcUserContribution(), MAI toccati). "Spese"
//        non mostra più un importo: ora il NUMERO di registrazioni di
//        spesa reale (esclude Trasf./"+Cassiere"/Previsione). "Pro
//        capite" resta una formula su importi (spese reali ÷
//        partecipanti), solo calcolata internamente — non cambia.
//        shareRiepilogo() (riepilogo testuale condivisibile) NON
//        toccato in questa sessione: continua a sottrarre "+Cassiere"
//        dal totale come prima — vedi situazione.md.
// v2.20: NUOVO saldo informativo "Cassa Comune" nella tab Saldi (vedi
//        utils.js v1.4 calculateCassaComune(), spesa.html/spesa.js v2.7
//        flag "Uso Cassa Comune") — _calcBalances() lo calcola in
//        EventoApp._cassaComune SENZA toccare il saldo normale
//        (_balances, calcolato come sempre); _renderSaldi() lo mostra
//        sulla stessa riga del Saldo, subito alla sua sinistra, in
//        formato "(Cassa Comune: +120,00 €)" — SOLO se diverso da zero
//        per quel partecipante (per la maggior parte sarà 0 e non
//        comparirà nulla).
// v2.19: RIMOSSA la sincronizzazione selettiva eventi esterni (gating —
//        vedi app.js v2.18/sync.js v2.0): rimosso il puntino "syncGateDot"
//        in header (sempre verde, non aveva più senso), il controllo
//        "gated" in syncNow() (sempre "Sincronizzato"). La voce di menu
//        "Richiedi sincronizzazione" diventa "Passa a Pro"
//        (EventoApp.goToRequestPro(), apre la richiesta "soluzione
//        completa" già presente in Impostazioni), visibile solo se questo
//        device non è già Pro — al posto di shareSyncRequest() (rimossa).
// v2.18: FIX — _calcUserContribution() (Versato/Incassato in
//        Partecipanti) includeva per errore anche le spese
//        "Previsione" nel totale "Versato": ora le esclude sempre
//        (`if (exp.is_forecast) continue;`), come già accade per i
//        saldi/totali. NUOVO: badge ambra "(Prev. Xx€)" accanto al
//        saldo di ogni partecipante in Partecipanti, quando ha almeno
//        una previsione a suo nome — stesso calcolo già usato per la
//        colonna "Prev." nei Saldi, ora anche qui.
// v2.17: NUOVO terzo tipo movimento "+Cassiere" (type:'cashier', vedi
//        spesa.html/spesa.js v2.5): si comporta come una spesa normale
//        (paid_by = "A" il cassiere, participants = "Da" chi versa,
//        diviso tra loro) ma con il segno OPPOSTO nei saldi (vedi
//        utils.js v1.3 calculateBalances) — il cassiere va in debito,
//        chi versa va in credito. Considerato come un movimento
//        normale anche nei 4 totali di Movimenti: il suo importo viene
//        SOTTRATTO da "Spese"/"Totale"/"Pro capite" invece che
//        sommato (è cassa che rientra nel gruppo, non una spesa reale —
//        evita il doppio conteggio quando il cassiere la spenderà poi
//        per una spesa vera). Stesso trattamento nel riepilogo
//        condivisibile (shareRiepilogo) e nel calcolo "Versato"/
//        "Incassato" (_calcUserContribution): chi versa conta come
//        "transfersOut" (la propria quota), il cassiere come
//        "transfersIn" (l'intero importo) — stesso schema già usato
//        per "Trasf.". Badge verde "cassiere" nell'elenco movimenti,
//        analogo a quello arancione "previsione". NON compare in
//        "Pagamenti tra utenti" (quella sezione assume una coppia
//        singola Da→A, qui "Da" può essere più persone).
// v2.16: campo "Previsione" — escluso da _calcBalances() (mai diviso/
//        conteggiato nei saldi); 4 totali in alto (Totale/Previsione/
//        Spese/Pro capite, Pro capite invariato: Spese ÷ partecipanti);
//        colonna "Prev." nei Saldi (solo se > 0 per quell'utente,
//        somma delle previsioni dove è "Paga"); badge "previsione"
//        nell'elenco movimenti
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
  _riepilogoGroupBy: 'partecipante', // 'partecipante' | 'data' | 'tipo' — NUOVO v2.24

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
    // Le spese "Previsione" non vanno mai divise né conteggiate nei saldi
    // (vedi spesa.js toggleForecast() e situazione.md) — escluse qui,
    // PRIMA di passare l'elenco a Utils.calculateBalances. I trasferimenti
    // non sono affetti: is_forecast è sempre false per quel tipo.
    const balanceableExpenses = EventoApp._expenses.filter(e => !e.is_forecast);
    EventoApp._balances = Utils.calculateBalances(
      balanceableExpenses,
      EventoApp._users
    );
    // Cassa Comune (v2.20): saldo PURAMENTE INFORMATIVO per utente,
    // calcolato a parte — non influisce in alcun modo su _balances sopra
    // (vedi utils.js calculateCassaComune()). Mostrato in _renderSaldi()
    // solo per chi ha un valore diverso da zero.
    EventoApp._cassaComune = Utils.calculateCassaComune(
      balanceableExpenses,
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

    // Voce di menu "Passa a Pro": visibile solo se questo device NON è
    // già Pro (non avrebbe senso proporla a chi ha già la soluzione
    // completa attiva) — sostituisce la vecchia "Richiedi sincronizzazione"
    // (gating eventi esterni, rimosso in questa versione).
    const ctxProBtn = document.getElementById('ctxPassaProBtn');
    if (ctxProBtn) ctxProBtn.style.display = (typeof License !== 'undefined' && License.isPro()) ? 'none' : '';
  },

  // ─── PASSA A PRO ────────────────────────────────────────────
  // Naviga a Impostazioni e apre direttamente il modal "Richiedi
  // soluzione completa" (stesso flusso già presente lì — vedi
  // SettingsApp.showRequestPro() in impostazioni.html).
  goToRequestPro() {
    window.location.href = '/impostazioni.html?openRequestPro=1';
  },

  // ─── SWITCH TAB ───────────────────────────────────────────
  switchTab(tab) {
    EventoApp._currentTab = tab;

    ['spese', 'partecipanti', 'saldi', 'riepilogo'].forEach(t => {
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
    if (tab === 'riepilogo')    EventoApp._renderRiepilogo();
  },

  // ─── RIEPILOGO (grafico a torta) — v2.24, esteso v2.26 ─────
  // Stessa definizione di "spesa reale" usata dai 4 totali in Movimenti
  // (_renderSpese()): tipo 'expense' e non "Previsione". Esclude quindi
  // sempre Trasferimenti, "+Cassiere" e Previsioni. Usata dai criteri
  // "Data" e "Tipo spesa" (non ha senso raggruppare un trasferimento per
  // categoria/tipo spesa, e "+Cassiere" resta escluso ovunque nel grafico
  // come già deciso in origine).
  _riepilogoRealExpenses() {
    return EventoApp._expenses.filter(e => (e.type || 'expense') === 'expense' && !e.is_forecast);
  },

  // "Per Partecipante" (v2.26): a differenza di sopra, include ANCHE i
  // Trasferimenti — richiesta cliente: chi ha inviato un trasferimento
  // (paid_by) deve comparire nel grafico esattamente come chi ha pagato
  // una spesa, con l'intero importo attribuito a lui. "+Cassiere" resta
  // escluso (non richiesto, e nel modello dati il "pagatore" è il
  // cassiere che INCASSA — includerlo confonderebbe "chi ha versato").
  _riepilogoPartecipanteMovements() {
    return EventoApp._expenses.filter(e => {
      const t = e.type || 'expense';
      return (t === 'expense' || t === 'transfer') && !e.is_forecast;
    });
  },

  // "Mappa" (NUOVO v2.27): solo spese reali con posizione GPS salvata.
  // Trasferimenti/"+Cassiere" non hanno mai 'location' (il rilevamento
  // GPS è disponibile solo per il tipo 'expense' — vedi spesa.js
  // _updateTypeUI(), gpsCard nascosta per gli altri tipi), quindi sono
  // già esclusi di fatto dal filtro su e.location; le Previsioni sono
  // escluse esplicitamente per coerenza col resto del tab Riepilogo.
  _riepilogoMappaExpenses() {
    return EventoApp._expenses.filter(e =>
      (e.type || 'expense') === 'expense' &&
      !e.is_forecast &&
      e.location &&
      typeof e.location.lat === 'number' &&
      typeof e.location.lng === 'number'
    );
  },

  // Icona "moneta" per i pin spesa — NUOVO v7.2: prima usava l'icona
  // Leaflet di default (il classico segnaposto blu), che per il
  // cliente "sembrava incompleta". Sostituita con un L.divIcon che
  // riusa l'IDENTICA moneta SVG già usata altrove nell'app per "Uso
  // Cassa Comune" (vedi _renderSpese() più sopra: cerchio oro #FBBF24,
  // bordo #92400E, simbolo €) — qui ha senso su OGNI pin, dato che la
  // Mappa mostra solo spese (mai trasferimenti/cassiere, che non hanno
  // mai GPS — vedi _riepilogoMappaExpenses()). Creata una sola volta e
  // riusata (cache su EventoApp._riepilogoMoneyIcon).
  _riepilogoCoinIcon() {
    if (EventoApp._riepilogoMoneyIcon) return EventoApp._riepilogoMoneyIcon;
    EventoApp._riepilogoMoneyIcon = L.divIcon({
      className: 'riepilogo-mappa-coin-icon',
      html: `
        <svg width="30" height="38" viewBox="0 0 30 38" xmlns="http://www.w3.org/2000/svg">
          <path d="M15 37C15 37 28 22.5 28 14C28 6.8 22.2 1 15 1C7.8 1 2 6.8 2 14C2 22.5 15 37 15 37Z"
                fill="#FBBF24" stroke="#92400E" stroke-width="1.6"/>
          <circle cx="15" cy="14" r="8.2" fill="none" stroke="#92400E" stroke-width="1" opacity="0.55"/>
          <text x="15" y="18.6" text-anchor="middle" font-size="12.5" font-weight="800" fill="#92400E" font-family="Arial,sans-serif">&#8364;</text>
        </svg>`,
      iconSize:    [30, 38],
      iconAnchor:  [15, 37],
      popupAnchor: [0, -34]
    });
    return EventoApp._riepilogoMoneyIcon;
  },

  // Click su un pin — NUOVO v7.2 (richiesta cliente): porta alla spesa
  // cliccata nella LISTA del tab Movimenti (non alla pagina di
  // modifica), evidenziandola brevemente. Lo scroll è immediato: al
  // rientro nel tab 'spese', switchTab() → _renderTab() → _renderSpese()
  // sono tutte chiamate sincrone, la riga esiste già nel DOM quando
  // arriviamo qui sotto.
  _goToExpenseInList(expenseId) {
    EventoApp.switchTab('spese');
    const row = document.querySelector(`.exp-item[data-expense-id="${expenseId}"]`);
    if (!row) return;
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.classList.add('exp-item--highlight');
    setTimeout(() => row.classList.remove('exp-item--highlight'), 2200);
  },

  _renderRiepilogoMappa() {
    const emptyEl   = document.getElementById('riepilogoMappaEmpty');
    const contentEl = document.getElementById('riepilogoMappaContent');
    const countEl   = document.getElementById('riepilogoMappaCount');
    const mapElId   = 'riepilogoMappaEl';
    const googleBtn = document.getElementById('riepilogoMappaGoogleBtn');

    if (typeof L === 'undefined') {
      if (emptyEl) { emptyEl.style.display = ''; emptyEl.textContent = 'Mappa non disponibile (libreria non caricata).'; }
      if (contentEl) contentEl.style.display = 'none';
      return;
    }

    const points = EventoApp._riepilogoMappaExpenses();

    if (!points.length) {
      if (emptyEl)   emptyEl.style.display   = '';
      if (contentEl) contentEl.style.display = 'none';
      return;
    }
    if (emptyEl)   emptyEl.style.display   = 'none';
    if (contentEl) contentEl.style.display = '';
    if (countEl)   countEl.textContent = points.length === 1
      ? '1 spesa con posizione GPS'
      : `${points.length} spese con posizione GPS`;

    // (icona moneta creata pigramente da _riepilogoCoinIcon() sotto)

    // Lazy-init: la mappa Leaflet viene creata una sola volta (un
    // secondo L.map() sullo stesso elemento genera un errore) e poi
    // riusata/aggiornata ad ogni cambio di dati o cambio tab.
    if (!EventoApp._riepilogoLeafletMap) {
      const map = L.map(mapElId, { attributionControl: true, zoomControl: true });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
      }).addTo(map);
      EventoApp._riepilogoLeafletMap = map;
      EventoApp._riepilogoLeafletMarkers = L.layerGroup().addTo(map);
    }

    const map     = EventoApp._riepilogoLeafletMap;
    const markers = EventoApp._riepilogoLeafletMarkers;
    markers.clearLayers();

    const bounds = [];
    points.forEach(exp => {
      const { lat, lng } = exp.location;
      bounds.push([lat, lng]);
      // Click sul pin → porta DIRETTO alla spesa nella lista Movimenti
      // (richiesta cliente, vedi _goToExpenseInList() sopra) — niente
      // più popup intermedio: il titolo/importo si vedono subito
      // arrivando sulla riga evidenziata, un passaggio in meno.
      L.marker([lat, lng], {
        icon:  EventoApp._riepilogoCoinIcon(),
        title: exp.title || 'Spesa' // tooltip nativo al passaggio (desktop)
      })
        .on('click', () => EventoApp._goToExpenseInList(exp.id))
        .addTo(markers);
    });

    // La mappa potrebbe essere stata creata mentre il tab era nascosto
    // (display:none) — Leaflet calcola le dimensioni solo quando il
    // container è visibile, quindi invalidateSize() + fitBounds() vanno
    // rimandati al frame successivo.
    requestAnimationFrame(() => {
      map.invalidateSize();
      if (bounds.length === 1) {
        map.setView(bounds[0], 15);
      } else {
        map.fitBounds(bounds, { padding: [24, 24] });
      }
    });

    // Bottone "Apri tutte le posizioni in Google Maps" — link diretto
    // multi-tappa (Indicazioni), nessuna API key richiesta, stesso
    // pattern già usato in spesa.html per una singola posizione.
    if (googleBtn) {
      const path = points.map(exp => `${exp.location.lat},${exp.location.lng}`).join('/');
      googleBtn.href = `https://www.google.com/maps/dir/${path}`;
    }
  },

  setRiepilogoGroup(mode) {
    EventoApp._riepilogoGroupBy = mode;
    ['Partecipante', 'Data', 'Tipo', 'Mappa'].forEach(cap => {
      const chip = document.getElementById(`riepChip${cap}`);
      if (chip) chip.classList.toggle('selected', cap.toLowerCase() === mode);
    });
    EventoApp._renderRiepilogo();
  },

  _renderRiepilogo() {
    const mode = EventoApp._riepilogoGroupBy || 'partecipante';

    // "Mappa" (v2.27) è una vista completamente diversa (Leaflet, non
    // torta) — ramo separato, non tocca buckets/donut/legenda sotto.
    const emptyElChart = document.getElementById('riepilogoEmpty');
    const chartWrapEl  = document.getElementById('riepilogoChartWrap');
    const mappaWrapEl  = document.getElementById('riepilogoMappaWrap');
    if (mode === 'mappa') {
      if (emptyElChart) emptyElChart.style.display = 'none';
      if (chartWrapEl)  chartWrapEl.style.display  = 'none';
      if (mappaWrapEl)  mappaWrapEl.style.display  = '';
      EventoApp._renderRiepilogoMappa();
      return;
    }
    if (mappaWrapEl) mappaWrapEl.style.display = 'none';

    // Stessa palette usata per gli avatar (.avatar-0…7 in style.css) —
    // coerenza visiva col resto dell'app, specialmente per "Partecipante"
    // dove ogni fetta usa lo stesso colore dell'avatar di quella persona.
    const AVATAR_COLORS = ['#3B82F6','#10B981','#8B5CF6','#F59E0B','#EF4444','#06B6D4','#EC4899','#84CC16'];
    const currency = EventoApp._event?.currency || 'EUR';
    const users    = EventoApp._users;
    const userMap  = {};
    users.forEach(u => { userMap[u.id] = u; });

    // v2.26: "Partecipante" usa spese+trasferimenti, "Data"/"Tipo spesa"
    // restano solo spese reali (vedi commenti sopra) — il totale mostrato
    // al centro della torta cambia di conseguenza in base al criterio
    // selezionato, sempre coerente con le fette che lo compongono.
    const movements = mode === 'partecipante'
      ? EventoApp._riepilogoPartecipanteMovements()
      : EventoApp._riepilogoRealExpenses();
    const total = movements.reduce((s, e) => s + parseFloat(e.amount || 0), 0);

    const totalEl   = document.getElementById('riepilogoTotal');
    const emptyEl   = document.getElementById('riepilogoEmpty');
    const chartWrap = document.getElementById('riepilogoChartWrap');

    if (totalEl) totalEl.textContent = Utils.formatAmount(total, currency);

    if (!movements.length || total <= 0) {
      if (emptyEl)   emptyEl.style.display   = '';
      if (chartWrap) chartWrap.style.display = 'none';
      return;
    }
    if (emptyEl)   emptyEl.style.display   = 'none';
    if (chartWrap) chartWrap.style.display = '';

    // Raggruppamento per bucket in base al criterio selezionato
    const buckets = {}; // key -> { key, label, amount }
    for (const exp of movements) {
      const amount = parseFloat(exp.amount || 0);
      let key, label;

      if (mode === 'data') {
        key   = exp.date || Utils.formatDate(exp.created_at);
        label = Utils.formatDateLabel(key);
      } else if (mode === 'tipo') {
        key   = exp.category || '__none__';
        label = exp.category ? ExpenseCategories.getById(exp.category).label : 'Senza categoria';
      } else { // 'partecipante' — chi ha pagato la spesa O inviato il
               // trasferimento (paid_by in entrambi i casi)
        key   = exp.paid_by || '__none__';
        label = userMap[exp.paid_by] ? userMap[exp.paid_by].name : 'Sconosciuto';
      }

      if (!buckets[key]) buckets[key] = { key, label, amount: 0 };
      buckets[key].amount += amount;
    }

    // Fette ordinate per importo decrescente (più leggibile in legenda)
    let groups = Object.values(buckets).sort((a, b) => b.amount - a.amount);
    groups = groups.map((g, i) => {
      let color;
      if (mode === 'partecipante') {
        const u = userMap[g.key];
        color = AVATAR_COLORS[u ? Utils.avatarColorIndex(u.name) : 0];
      } else {
        color = AVATAR_COLORS[i % AVATAR_COLORS.length];
      }
      return { ...g, color };
    });

    // Torta CSS (conic-gradient) — niente SVG/librerie esterne
    const donut = document.getElementById('riepilogoDonut');
    if (donut) {
      if (groups.length === 1) {
        donut.style.background = groups[0].color;
      } else {
        let cursor = 0;
        const stops = groups.map(g => {
          const pct   = (g.amount / total) * 100;
          const start = cursor;
          cursor += pct;
          return `${g.color} ${start}% ${cursor}%`;
        });
        donut.style.background = `conic-gradient(${stops.join(', ')})`;
      }
    }

    // Legenda
    const legend = document.getElementById('riepilogoLegend');
    if (legend) {
      legend.innerHTML = groups.map(g => {
        const pct = ((g.amount / total) * 100).toFixed(1);
        return `
          <div class="riepilogo-legend__row">
            <span class="riepilogo-legend__swatch" style="background:${g.color};"></span>
            <span class="riepilogo-legend__label">${Utils.escapeHtml(g.label)}</span>
            <span class="riepilogo-legend__pct">${pct}%</span>
            <span class="riepilogo-legend__amount">${Utils.formatAmount(g.amount, currency)}</span>
          </div>`;
      }).join('');
    }
  },

  // ─── ESPORTA RIEPILOGO IN EXCEL — NUOVO v2.25 ──────────────
  // Per ogni movimento (riga) calcola l'impatto sul saldo di ciascun
  // utente scomposto in "Versato" (credito, positivo) e "Quota" (debito,
  // negativo) — STESSA identica logica di Utils.calculateBalances(), solo
  // applicata riga per riga invece che in accumulo, così la riga TOTALE
  // (somma per colonna) torna sempre esattamente uguale a
  // EventoApp._balances / tab Saldi.
  _riepilogoMovementDeltas(m) {
    const type   = m.type || 'expense';
    const amount = parseFloat(m.amount) || 0;
    const pos = {}, neg = {}; // pos = Versato (credito), neg = Quota (debito)

    if (type === 'transfer') {
      if (m.paid_by)  pos[m.paid_by]  = (pos[m.paid_by]  || 0) + amount;
      if (m.paid_for) neg[m.paid_for] = (neg[m.paid_for] || 0) - amount;
    } else if (type === 'cashier') {
      const parts = m.participants || [];
      if (m.paid_by) neg[m.paid_by] = (neg[m.paid_by] || 0) - amount;
      if (parts.length) {
        const share = amount / parts.length;
        parts.forEach(uid => { pos[uid] = (pos[uid] || 0) + share; });
      }
    } else { // 'expense'
      const parts = m.participants || [];
      if (m.paid_by) pos[m.paid_by] = (pos[m.paid_by] || 0) + amount;
      if (parts.length) {
        const share = amount / parts.length;
        parts.forEach(uid => { neg[uid] = (neg[uid] || 0) - share; });
      }
    }
    return { pos, neg };
  },

  async exportRiepilogoExcel() {
    if (typeof ExcelJS === 'undefined') {
      Utils.toast('Libreria Excel non disponibile — riprova dopo aver aggiornato l\'app', 'error');
      return;
    }

    // Conferma PRIMA di generare il file (v2.26) — stesso pattern di
    // SettingsApp.forceUpdate() in impostazioni.html.
    if (!confirm('Esportare tutti i movimenti dell\'evento in un file Excel?')) return;

    const btn = document.getElementById('btnExportRiepilogo');
    if (btn) { btn.style.opacity = '0.5'; btn.style.pointerEvents = 'none'; }
    Utils.toast('Preparazione file Excel…', 'info', 2500);

    try {
      const ev    = EventoApp._event;
      const users = EventoApp._users;
      const cur   = ev?.currency || 'EUR';
      const userMap = {};
      users.forEach(u => { userMap[u.id] = u; });

      // Tutti i movimenti reali: spese + trasferimenti + "+Cassiere" —
      // SOLO le Previsioni sono escluse (stessa base di _calcBalances()/
      // Saldi). A differenza del grafico a torta qui sopra (che esclude
      // Trasf./Cassiere), l'export deve mostrarli tutti perché l'utente
      // ha chiesto esplicitamente la colonna "Tipologia" per distinguerli.
      const movements = EventoApp._expenses
        .filter(e => !e.is_forecast)
        .slice()
        .sort((a, b) => {
          const da = a.date || a.created_at || '';
          const db = b.date || b.created_at || '';
          return da < db ? -1 : da > db ? 1 : 0;
        });

      if (!movements.length) {
        Utils.toast('Nessun movimento da esportare', 'info');
        return;
      }

      const wb = new ExcelJS.Workbook();
      wb.creator = 'WeGo';
      wb.created = new Date();
      const ws = wb.addWorksheet('Riepilogo', {
        views: [{ state: 'frozen', ySplit: 3 }],
        pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
      });

      const FIXED_COLS = ['Titolo', 'Tipologia', 'Importo', 'Valuta', 'Da', 'Data', 'Creato il'];
      const nFixed  = FIXED_COLS.length;
      const nUsers  = users.length;
      const totalCols = nFixed + nUsers * 2;

      // ── Riga 1: titolo evento + data esportazione ──
      ws.mergeCells(1, 1, 1, totalCols);
      const titleCell = ws.getCell(1, 1);
      titleCell.value = (ev?.title || 'Evento') + ' — Riepilogo movimenti — ' + Utils.formatDate(Utils.now());
      titleCell.font = { bold: true, size: 14, color: { argb: 'FF1F2937' } };
      titleCell.alignment = { horizontal: 'left', vertical: 'middle' };
      ws.getRow(1).height = 26;

      // ── Righe 2-3: intestazioni (colonne fisse unite in verticale,
      //    una coppia di colonne "Versato"/"Quota" per ogni partecipante) ──
      const HEAD_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
      const HEAD_FONT = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10.5 };
      const SUB_FILL  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B5B7E' } };
      const SUB_FONT  = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
      const THIN = { style: 'thin', color: { argb: 'FFCBD5E1' } };
      const BORDER_ALL = { top: THIN, bottom: THIN, left: THIN, right: THIN };

      FIXED_COLS.forEach((label, i) => {
        const col = i + 1;
        const c2 = ws.getCell(2, col);
        c2.value = label; c2.font = HEAD_FONT; c2.fill = HEAD_FILL;
        c2.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        c2.border = BORDER_ALL;
        const c3 = ws.getCell(3, col);
        c3.font = HEAD_FONT; c3.fill = HEAD_FILL; c3.border = BORDER_ALL;
      });

      users.forEach((u, ui) => {
        const col1 = nFixed + ui * 2 + 1;
        const col2 = col1 + 1;
        const nameCell = ws.getCell(2, col1);
        nameCell.value = u.name; nameCell.font = HEAD_FONT; nameCell.fill = HEAD_FILL;
        nameCell.alignment = { horizontal: 'center', vertical: 'middle' };
        nameCell.border = BORDER_ALL;
        ws.getCell(2, col2).fill = HEAD_FILL;
        ws.getCell(2, col2).border = BORDER_ALL;

        const versatoCell = ws.getCell(3, col1);
        versatoCell.value = 'Versato'; versatoCell.font = SUB_FONT; versatoCell.fill = SUB_FILL;
        versatoCell.alignment = { horizontal: 'center' }; versatoCell.border = BORDER_ALL;

        const quotaCell = ws.getCell(3, col2);
        quotaCell.value = 'Quota'; quotaCell.font = SUB_FONT; quotaCell.fill = SUB_FILL;
        quotaCell.alignment = { horizontal: 'center' }; quotaCell.border = BORDER_ALL;
      });

      // Merge DOPO aver impostato stile/valore su tutte le celle coinvolte
      FIXED_COLS.forEach((_, i) => ws.mergeCells(2, i + 1, 3, i + 1));
      users.forEach((u, ui) => {
        const col1 = nFixed + ui * 2 + 1;
        ws.mergeCells(2, col1, 2, col1 + 1);
      });

      // ── Righe dati: un rigo per movimento ──
      const TYPE_LABELS = { expense: 'Spesa', transfer: 'Trasf.', cashier: 'Cassiere' };
      const firstDataRow = 4;
      let r = firstDataRow;

      movements.forEach(m => {
        const type   = m.type || 'expense';
        const amount = parseFloat(m.amount) || 0;
        const row    = ws.getRow(r);

        row.getCell(1).value = m.title || (type === 'transfer' ? 'Trasferimento' : type === 'cashier' ? 'Versamento cassiere' : 'Spesa');
        row.getCell(2).value = TYPE_LABELS[type] || 'Spesa';
        row.getCell(2).alignment = { horizontal: 'center' };
        const impCell = row.getCell(3); impCell.value = amount; impCell.numFmt = '#,##0.00'; impCell.alignment = { horizontal: 'right' };
        row.getCell(4).value = m.currency || cur;
        row.getCell(4).alignment = { horizontal: 'center' };
        row.getCell(5).value = userMap[m.paid_by] ? userMap[m.paid_by].name : '—';
        row.getCell(6).value = m.date ? Utils.formatDate(m.date) : '–';
        row.getCell(6).alignment = { horizontal: 'center' };
        row.getCell(7).value = m.created_at ? Utils.formatDate(m.created_at) : '–';
        row.getCell(7).alignment = { horizontal: 'center' };

        const { pos, neg } = EventoApp._riepilogoMovementDeltas(m);
        users.forEach((u, ui) => {
          const col1 = nFixed + ui * 2 + 1;
          const col2 = col1 + 1;
          if (pos[u.id]) { const c = row.getCell(col1); c.value = pos[u.id]; c.numFmt = '#,##0.00'; c.alignment = { horizontal: 'right' }; }
          if (neg[u.id]) { const c = row.getCell(col2); c.value = neg[u.id]; c.numFmt = '#,##0.00'; c.alignment = { horizontal: 'right' }; }
        });

        for (let c = 1; c <= totalCols; c++) {
          row.getCell(c).border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } };
        }
        r++;
      });

      // ── Riga TOTALE: formule SUM, deve coincidere con Saldi ──
      const lastDataRow = r - 1;
      const totalsRow = ws.getRow(r);
      totalsRow.getCell(1).value = 'TOTALE';
      totalsRow.getCell(1).font = { bold: true };

      users.forEach((u, ui) => {
        const col1 = nFixed + ui * 2 + 1;
        const col2 = col1 + 1;
        const letter1 = ws.getColumn(col1).letter;
        const letter2 = ws.getColumn(col2).letter;
        const cell = totalsRow.getCell(col1);
        cell.value = { formula: `SUM(${letter1}${firstDataRow}:${letter2}${lastDataRow})` };
        cell.numFmt = '#,##0.00';
        cell.font = { bold: true };
        cell.alignment = { horizontal: 'right' };
      });
      totalsRow.eachCell({ includeEmpty: true }, (cell) => {
        cell.border = { top: { style: 'double', color: { argb: 'FF1E3A5F' } } };
        cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      });

      // ── Larghezze colonne ──
      ws.getColumn(1).width = 22;
      ws.getColumn(2).width = 11;
      ws.getColumn(3).width = 11;
      ws.getColumn(4).width = 8;
      ws.getColumn(5).width = 14;
      ws.getColumn(6).width = 11;
      ws.getColumn(7).width = 11;
      for (let i = 0; i < nUsers; i++) {
        ws.getColumn(nFixed + i * 2 + 1).width = 11;
        ws.getColumn(nFixed + i * 2 + 2).width = 11;
      }

      // ── Genera il file e condividi/scarica ──
      const buffer = await wb.xlsx.writeBuffer();
      const safeName = (ev?.title || 'evento').replace(/[^a-z0-9]+/gi, '_');
      const fileName = `WeGo_${safeName}_riepilogo.xlsx`;
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const file = new File([blob], fileName, { type: blob.type });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: 'WeGo — Riepilogo ' + (ev?.title || '') });
          return;
        } catch (e) {
          if (e.name === 'AbortError') return; // utente ha annullato la condivisione
          // altrimenti prosegue col download diretto sotto
        }
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = fileName;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 3000);
      Utils.toast('File Excel scaricato', 'success', 2500);

    } catch (e) {
      console.error('[Riepilogo] Errore export Excel:', e);
      Utils.toast('Errore nella generazione del file: ' + e.message, 'error');
    } finally {
      if (btn) { btn.style.opacity = ''; btn.style.pointerEvents = ''; }
    }
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

    // Le spese di tipo 'expense' si dividono in reali e "Previsione" (non
    // vanno divise né contano nei saldi/pro capite — vedi spesa.js
    // toggleForecast() e _renderSaldi() più sotto). I trasferimenti non
    // contano in nessuno dei 4 totali. "+Cassiere" (v5.8): ORA COMPLETAMENTE
    // ESCLUSO da Totale/Spese/Pro capite — prima il suo importo veniva
    // SOTTRATTO (era "cassa che rientra nel gruppo"), ora non viene più né
    // sommato né sottratto, semplicemente ignorato in questi 3 totali
    // (resta invece conteggiato come sempre nei saldi/Versato-Incassato).
    const expenseTypeOnly = expenses.filter(e => (e.type || 'expense') === 'expense');
    const forecastExpenses    = expenseTypeOnly.filter(e => e.is_forecast);
    const nonForecastExpenses = expenseTypeOnly.filter(e => !e.is_forecast);

    const forecastTotale = forecastExpenses.reduce((s, e) => s + parseFloat(e.amount || 0), 0);
    const speseTotale    = nonForecastExpenses.reduce((s, e) => s + parseFloat(e.amount || 0), 0);
    const totaleGenerale = speseTotale + forecastTotale;
    const count           = nonForecastExpenses.length;

    document.getElementById('summaryTotal').textContent    = Utils.formatAmount(totaleGenerale, currency);
    document.getElementById('summaryForecast').textContent = Utils.formatAmount(forecastTotale, currency);
    // "Spese" (v5.8): NON più un importo — ora il NUMERO di registrazioni
    // di spesa reale (esclude Trasf./"+Cassiere"/Previsione, già escluse
    // qui sopra in nonForecastExpenses). L'importo (speseTotale) resta
    // usato solo internamente per "Pro capite" qui sotto.
    document.getElementById('summarySpese').textContent    = String(count);
    // Pro capite: SOLO sulle spese reali (no previsioni, no cassiere) ÷
    // partecipanti — stessa identica formula di sempre.
    document.getElementById('summaryAvg').textContent =
      count > 0 && users.length > 0
        ? Utils.formatAmount(speseTotale / users.length, currency)
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
        kind:    (exp.type === 'transfer') ? 'transfer' : (exp.type === 'cashier') ? 'cashier' : 'expense',
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
        <div class="exp-item" data-expense-id="${m.id}" onclick="EventoApp.editExpense('${m.id}')">
          <div class="exp-avatar">
            <div class="avatar avatar-${idx} avatar--sm">${from ? Utils.initials(from.name) : '?'}</div>
          </div>
          <div class="exp-info">
            <div class="exp-title">${Utils.escapeHtml(m.data.title || 'Trasferimento')}</div>
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

    // ── "+CASSIERE" (versamento alla cassa comune) ──
    // Stessa forma dati di una spesa (paid_by = "A" il cassiere,
    // participants = "Da" chi versa) ma segno opposto nei saldi — vedi
    // utils.js calculateBalances(). Badge verde, analogo a quello
    // arancione "previsione".
    if (m.kind === 'cashier') {
      const cashierExp = m.data;
      const cashier    = userMap[cashierExp.paid_by];
      const cashierIdx = cashier ? Utils.avatarColorIndex(cashier.name) : 0;
      const cashierInit = cashier ? Utils.initials(cashier.name) : '?';
      const nDepositors = (cashierExp.participants || []).length;
      const syncBadge = cashierExp.synced === false ? `<span class="exp-badge exp-badge--sync">sync</span>` : '';
      const cashierBadge = `<span class="exp-badge" style="color:var(--green);background:rgba(16,185,129,0.12);">cassiere</span>`;
      return `
        <div class="exp-item" data-expense-id="${cashierExp.id}" onclick="EventoApp.editExpense('${cashierExp.id}')">
          <div class="exp-avatar">
            <div class="avatar avatar-${cashierIdx} avatar--sm" title="${cashier ? Utils.escapeHtml(cashier.name) : '?'}">${cashierInit}</div>
          </div>
          <div class="exp-info">
            <div class="exp-title">${Utils.escapeHtml(cashierExp.title || 'Versamento cassiere')}</div>
            <div class="exp-meta">
              ${cashierBadge}
              ${cashier ? `<span class="exp-meta-txt">A: ${Utils.escapeHtml(cashier.name)}</span>` : ''}
              ${nDepositors ? `<span class="exp-meta-txt">· versato da ${nDepositors}</span>` : ''}
              ${syncBadge}
            </div>
          </div>
          <div class="exp-amount">
            <div class="exp-amount__val" style="color:var(--green);">${amountStr}</div>
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
    // "Uso Cassa Comune": stessa moneta gialla del bottone "+Cassiere"
    // (spesa.html), subito a destra del metodo di pagamento — solo se il
    // flag è attivo su questa spesa (vedi spesa.js v2.7, utils.js v1.4).
    const cassaBadge = exp.is_cassa_comune
      ? `<span class="exp-badge exp-badge--cassa" title="Pagato con la Cassa Comune">
          <svg viewBox="0 0 24 24" width="13" height="13">
            <circle cx="12" cy="12" r="9.5" fill="#FBBF24" stroke="#92400E" stroke-width="1.3"/>
            <circle cx="12" cy="12" r="6.8" fill="none" stroke="#92400E" stroke-width="0.8" opacity="0.55"/>
            <text x="12" y="16.2" text-anchor="middle" font-size="10.5" font-weight="800" fill="#92400E" font-family="Arial,sans-serif">&#8364;</text>
          </svg>
        </span>`
      : '';
    // Previsione: piccolo richiamo visivo per distinguerla a colpo
    // d'occhio nell'elenco — stesso pattern del badge "pagamento" sopra.
    const forecastBadge = exp.is_forecast
      ? `<span class="exp-badge" style="color:var(--amber);background:rgba(245,158,11,0.12);">previsione</span>`
      : '';
    return `
      <div class="exp-item" data-expense-id="${exp.id}" onclick="EventoApp.editExpense('${exp.id}')">
        <div class="exp-avatar">
          <div class="avatar avatar-${payerIdx} avatar--sm" title="${payer ? Utils.escapeHtml(payer.name) : '?'}">${payerInit}</div>
        </div>
        <div class="exp-info">
          <div class="exp-title">${Utils.escapeHtml(exp.title)}</div>
          <div class="exp-meta">
            ${forecastBadge}
            ${payer ? `<span class="exp-meta-txt">${Utils.escapeHtml(payer.name)}</span>` : ''}
            ${nPart ? `<span class="exp-meta-txt">· diviso tra ${nPart}</span>` : ''}
            ${photoBadge}${gpsBadge}${methodBadge}${cassaBadge}${syncBadge}
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
      // FIX: le "Previsione" non devono mai contare in Versato/Incassato
      // (sono spese future, non reali — mostrate a parte come "(Prev. ...)"
      // accanto al saldo, vedi _renderPartecipanti()). Prima venivano
      // sommate qui dentro come una spesa reale qualsiasi.
      if (exp.is_forecast) continue;

      const amount = Number(exp.amount) || 0;
      if (exp.type === 'transfer') {
        if (exp.paid_by  === userId) transfersOut += amount;
        if (exp.paid_for === userId) transfersIn  += amount;
      } else if (exp.type === 'cashier') {
        // Chi versa ("Da", i participants) conta come "transfersOut" per
        // la propria quota; il cassiere ("A", paid_by) conta come
        // "transfersIn" per l'intero importo — stesso schema di "Trasf.",
        // solo che qui può versare più di una persona insieme.
        const parts = exp.participants || [];
        if (parts.length > 0 && parts.includes(userId)) {
          transfersOut += amount / parts.length;
        }
        if (exp.paid_by === userId) transfersIn += amount;
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

    // Previsioni per utente: somma delle spese "Previsione" dove l'utente
    // è "Paga" (paid_by) — mostrata a parte (badge ambra "(Prev. ...)")
    // accanto al saldo Versato/Incassato, che invece NON le include più
    // (vedi fix in _calcUserContribution() qui sopra). Stesso identico
    // calcolo già usato in _renderSaldi() per la colonna "Prev.".
    const forecastByUser = {};
    for (const exp of EventoApp._expenses) {
      if (!exp.is_forecast || !exp.paid_by) continue;
      forecastByUser[exp.paid_by] = (forecastByUser[exp.paid_by] || 0) + parseFloat(exp.amount || 0);
    }

    let html = '';
    for (const user of EventoApp._users) {
      const idx       = Utils.avatarColorIndex(user.name);
      const contrib    = EventoApp._calcUserContribution(user.id);
      const balColor   = contrib.isNetReceiver ? 'var(--accent)' : 'var(--green)';
      const balText    = Utils.formatAmount(contrib.amount, currency);
      const balLabel   = contrib.isNetReceiver ? 'Incassato' : 'Versato';
      const forecastAmount = forecastByUser[user.id] || 0;
      const forecastBadge  = forecastAmount > 0
        ? `<div style="font-size:11.5px;font-weight:700;color:var(--amber);white-space:nowrap;margin-bottom:1px;">(Prev. ${Utils.formatAmount(forecastAmount, currency)})</div>`
        : '';
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
            ${forecastBadge}
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

    // Previsioni per utente: somma delle spese "Previsione" dove l'utente
    // è impostato come "Paga" (paid_by) — solo informativo, NON entra nei
    // saldi (già esclude in _calcBalances). Mostrata solo per chi ha
    // almeno una previsione (> 0) — altrimenti niente, solo il saldo.
    const forecastByUser = {};
    for (const exp of EventoApp._expenses) {
      if (!exp.is_forecast || !exp.paid_by) continue;
      forecastByUser[exp.paid_by] = (forecastByUser[exp.paid_by] || 0) + parseFloat(exp.amount || 0);
    }
    const anyForecast = Object.values(forecastByUser).some(v => v > 0);
    const prevHeader = document.getElementById('balanceHeaderPrev');
    if (prevHeader) prevHeader.style.display = anyForecast ? '' : 'none';

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
      const prev  = forecastByUser[u.id] || 0;
      // Cassa Comune (v2.20): mostrata sulla stessa riga del Saldo,
      // subito alla sua sinistra, SOLO se diversa da zero per questo
      // partecipante (per la maggior parte sarà 0, niente da mostrare).
      const cassaRaw = Math.round((EventoApp._cassaComune?.[u.id] || 0) * 100) / 100;
      const showCassa = Math.abs(cassaRaw) >= 0.01;
      balHtml += `
        <div class="balance-item">
          <div class="avatar avatar-${idx} avatar--sm">${Utils.initials(u.name)}</div>
          <div class="balance-info">
            <div class="balance-name">${Utils.escapeHtml(u.name)}</div>
            <div class="balance-bar-wrap">
              <div class="balance-bar" style="width:${pct}%;background:${color};"></div>
            </div>
          </div>
          ${prev > 0 ? `<div class="balance-forecast">${Utils.formatAmount(prev, currency)}</div>` : ''}
          ${showCassa ? `<div class="balance-cassa">(Cassa Comune: ${cassaRaw > 0 ? '+' : ''}${Utils.formatAmount(cassaRaw, currency)})</div>` : ''}
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

    // Pagamenti tra utenti (movimenti tipo 'transfer' = Trasf.) — SEMPRE VISIBILE
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
                <div class="settled-meta">${Utils.escapeHtml(t.title || 'Trasferimento')} · ${Utils.formatDate(t.date)}</div>
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
    const ev    = EventoApp._event;
    const users = EventoApp._users;
    const cur   = ev?.currency || 'EUR';
    const usersMap = Object.fromEntries(users.map(u => [u.id, u.name]));

    // "Da saldare" (v2.23): ORA usa esattamente lo STESSO calcolo della
    // tab Saldi — EventoApp._balances (Utils.calculateBalances() +
    // pagamenti, già pronto da _calcBalances(), chiamata ad ogni
    // loadAll() indipendentemente dalla tab attiva) passato a
    // Utils.calculateMinimalTransactions(), TALE E QUALE a come fa
    // _renderSaldi() per "Transazioni minime". PRIMA questa funzione
    // ricalcolava i saldi da zero con una propria copia (quasi identica
    // ma duplicata) della logica — rischio di disallineamento se
    // Utils.calculateBalances() cambia in futuro. Ora c'è UNA SOLA fonte
    // di verità per i saldi/"da saldare" in tutta l'app, usata sia in
    // Saldi che qui (richiamabile da Saldi o dal menu "⋮" in alto).
    const balances = EventoApp._balances;
    const txs = Utils.calculateMinimalTransactions(balances, usersMap);

    // Totale (v5.9): coerente con i 4 totali della tab Movimenti —
    // "+Cassiere" completamente escluso (vedi _renderSpese()/§5duodecies).
    const realExpenses = EventoApp._expenses.filter(e =>
      e.type !== 'transfer' && e.type !== 'cashier' && !e.is_forecast
    );
    const totale = realExpenses.reduce((s, e) => s + parseFloat(e.amount), 0);

    let text = '📊 Riepilogo WeGo — ' + (ev?.title || 'Evento') + '\n';
    text += 'Totale: ' + Utils.formatAmount(totale, cur) + ' · ' + realExpenses.length + ' spese\n\n';

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
      Sync.cancelQuietSync(); // evita un secondo giro superfluo 5s dopo
      await Sync.push();
      await Sync.pullEvent(EventoApp._eventId);
      await EventoApp.loadAll();
      Utils.toast('Sincronizzato', 'success', 2000);
    } catch (e) {
      Utils.toast('Errore sync', 'error');
    }
  },

  // Chiamata al caricamento pagina, al ritorno online, e (indirettamente)
  // subito dopo il ritorno da un salvataggio spesa in spesa.js (che ora
  // non chiama più Sync direttamente — vedi spesa.js v3.9): l'utente ha
  // già salvato in locale e sta già guardando la pagina evento, la sync
  // vera e propria con il server parte da sola 5s dopo, silenziosa
  // (nessun blocco, nessun popup — vedi Sync.scheduleQuietSync() in
  // sync.js v2.1). Il refresh dell'interfaccia (loadAll) avviene solo a
  // sync completata, tramite il callback onDone.
  async _syncQuiet() {
    Sync.scheduleQuietSync(EventoApp._eventId, 5000, async () => {
      await EventoApp.loadAll();
    });
  }
};

window.EventoApp = EventoApp;
