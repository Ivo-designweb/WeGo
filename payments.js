// ═══════════════════════════════════════════════════════════════
// WeGo — payments.js v1.4
// Gestione metodi di pagamento configurabili + categorie di spesa
// v1.4: +8 nuove icone a colori (set Icons8 free): letto,
//       dormire-nel-letto, cane, gatto, guida-turistica, strada,
//       dogana, autostrada — 50 icone a colori in totale. Il default
//       di Alloggio passa da 'bed' (contorno) a 'letto' (a colori):
//       era l'unica delle 6 categorie di default rimasta col vecchio
//       stile per mancanza di un'icona adatta, ora risolta.
// v1.3: NUOVE 42 icone a colori (PNG, set Icons8 free — vedi Crediti
//       in impostazioni.html v7.4) selezionate dal cliente, gestite da
//       ExpenseCategoryIcons.IMAGES. svg() ora distingue automaticamente
//       un'icona-immagine (IMAGES) da un'icona-contorno (PATHS, il
//       vecchio set v1.2) e restituisce <img> o <svg> di conseguenza —
//       nessuna rottura per categorie che avessero già un'icona del
//       vecchio set. Il selettore icone (LIST) ora mostra le 42 nuove
//       a colori + le sole 2 icone a contorno rimaste in uso di
//       default (bed/dots, per Alloggio e Altro: nessuna icona a
//       colori disponibile per questi due concetti). Nuovi default:
//       Cibo→ciotola-di-riso, Trasporti→trasporti, Ingressi→biglietto,
//       Souvenir→regalo (Alloggio e Altro invariati).
// v1.2: NUOVA ExpenseCategoryIcons (~50 icone SVG scelte tra cui
//       assegnare una tipologia di spesa) + campo "icon" su ogni
//       categoria (default e personalizzate) + nuovi metodi
//       ExpenseCategories.setIcon()/rename() — ora anche le categorie
//       di default (Cibo, Trasporti, ecc.) sono rinominabili e
//       possono cambiare icona da Impostazioni (prima solo
//       abilita/disabilita). Vedi impostazioni.html v7.3.
// v1.1: aggiunto ExpenseCategories — stesso identico pattern di
//       PaymentMethods, per il campo "Tipo" nel form spesa (vedi
//       spesa.html/spesa.js) e la gestione in Impostazioni
// ═══════════════════════════════════════════════════════════════

const PaymentMethods = {

  // ─── DEFAULT ──────────────────────────────────────────────
  DEFAULTS: [
    { id: 'contanti',   label: 'Contanti',   icon: 'cash',     enabled: true },
    { id: 'carta',      label: 'Carta',       icon: 'card',     enabled: true },
    { id: 'bancomat',   label: 'Bancomat',    icon: 'card',     enabled: true },
    { id: 'prepagata',  label: 'Prepagata',   icon: 'card',     enabled: true },
    { id: 'paypal',     label: 'PayPal',      icon: 'paypal',   enabled: true },
    { id: 'bonifico',   label: 'Bonifico',    icon: 'bank',     enabled: false },
    { id: 'satispay',   label: 'Satispay',    icon: 'mobile',   enabled: false },
    { id: 'altro',      label: 'Altro',       icon: 'other',    enabled: true  }
  ],

  // ─── LEGGI METODI ATTIVI ──────────────────────────────────
  getEnabled() {
    const saved = Utils.getConfig('payment_methods');
    if (!saved) return PaymentMethods.DEFAULTS.filter(m => m.enabled);

    // Merge: mantiene eventuali metodi custom aggiunti
    const merged = PaymentMethods.DEFAULTS.map(d => {
      const s = saved.find(s => s.id === d.id);
      return s ? { ...d, ...s } : d;
    });

    // Aggiungi metodi custom non presenti nei default
    const customMethods = saved.filter(s => !PaymentMethods.DEFAULTS.some(d => d.id === s.id));
    return [...merged, ...customMethods].filter(m => m.enabled);
  },

  getAll() {
    const saved = Utils.getConfig('payment_methods');
    if (!saved) return [...PaymentMethods.DEFAULTS];

    const merged = PaymentMethods.DEFAULTS.map(d => {
      const s = saved.find(s => s.id === d.id);
      return s ? { ...d, ...s } : d;
    });
    const custom = saved.filter(s => !PaymentMethods.DEFAULTS.some(d => d.id === s.id));
    return [...merged, ...custom];
  },

  // ─── SALVA METODI ─────────────────────────────────────────
  save(methods) {
    Utils.setConfig('payment_methods', methods);
  },

  // ─── ABILITA / DISABILITA ─────────────────────────────────
  toggle(id) {
    const all = PaymentMethods.getAll();
    const method = all.find(m => m.id === id);
    if (method) method.enabled = !method.enabled;
    PaymentMethods.save(all);
    return method;
  },

  enable(id) {
    const all = PaymentMethods.getAll();
    const method = all.find(m => m.id === id);
    if (method) { method.enabled = true; PaymentMethods.save(all); }
  },

  disable(id) {
    const all = PaymentMethods.getAll();
    const method = all.find(m => m.id === id);
    if (method) { method.enabled = false; PaymentMethods.save(all); }
  },

  // ─── AGGIUNGI CUSTOM ──────────────────────────────────────
  addCustom(label) {
    if (!label || label.trim() === '') return null;
    const all = PaymentMethods.getAll();
    const id  = label.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    if (all.some(m => m.id === id)) {
      Utils.toast('Metodo già esistente', 'error');
      return null;
    }
    const method = { id, label: label.trim(), icon: 'other', enabled: true, custom: true };
    all.push(method);
    PaymentMethods.save(all);
    return method;
  },

  removeCustom(id) {
    const all = PaymentMethods.getAll().filter(m => !(m.custom && m.id === id));
    PaymentMethods.save(all);
  },

  // ─── OTTIENI METODO PER ID ────────────────────────────────
  getById(id) {
    return PaymentMethods.getAll().find(m => m.id === id) ||
      { id, label: id, icon: 'other', enabled: true };
  },

  // ─── HTML ICONE ───────────────────────────────────────────
  iconSvg(iconType) {
    const icons = {
      cash: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/>
        <path d="M6 12h.01M18 12h.01"/>
      </svg>`,
      card: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
      </svg>`,
      paypal: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M7 11C7 8.24 8.88 6 12 6h3c2.76 0 5 2.24 5 5s-2.24 5-5 5h-1l-1 4H9l.5-2"/>
        <path d="M4 15C4 12.24 5.88 10 9 10h2"/>
      </svg>`,
      bank: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 22h18M6 18v-7m4 7v-7m4 7v-7m4 7v-7M12 2L2 9h20L12 2z"/>
      </svg>`,
      mobile: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>
      </svg>`,
      other: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/>
        <line x1="8" y1="12" x2="16" y2="12"/>
      </svg>`
    };
    return icons[iconType] || icons.other;
  },

  /**
   * Genera HTML badge metodo pagamento
   */
  badgeHtml(methodId) {
    const method = PaymentMethods.getById(methodId);
    return `<span class="pay-method">
      ${PaymentMethods.iconSvg(method.icon)}
      ${Utils.escapeHtml(method.label)}
    </span>`;
  },

  /**
   * Genera <select> con metodi abilitati
   */
  selectHtml(selectedId = 'contanti', elementId = 'paymentMethod') {
    const methods = PaymentMethods.getEnabled();
    const options = methods.map(m =>
      `<option value="${Utils.escapeHtml(m.id)}" ${m.id === selectedId ? 'selected' : ''}>${Utils.escapeHtml(m.label)}</option>`
    ).join('');
    return `<select class="form-select" id="${elementId}" name="${elementId}">${options}</select>`;
  }
};

window.PaymentMethods = PaymentMethods;

// ═══════════════════════════════════════════════════════════════
// ExpenseCategories — categorie di spesa (campo "Tipo" in spesa.html)
// Stesso identico pattern di PaymentMethods qui sopra: lista di default
// modificabile da Impostazioni → Categorie spesa (abilita/disabilita,
// aggiungi/rimuovi personalizzate). Facoltativo: a differenza dei metodi
// di pagamento, una spesa può non avere nessuna categoria.
// ═══════════════════════════════════════════════════════════════

// ─── ICONE CATEGORIE SPESA (v1.2) ────────────────────────────
// ~50 icone SVG stroke (stesso stile di PaymentMethods.iconSvg sopra)
// tra cui scegliere per ogni categoria — vedi Impostazioni →
// Categorie spesa → matita di modifica (impostazioni.html).
const ExpenseCategoryIcons = {

  // Elenco mostrato nel selettore icone (v1.3): le 42 icone a colori
  // scelte dal cliente (set Icons8 free, vedi Crediti in
  // impostazioni.html), seguite dalle uniche 2 icone a contorno del
  // vecchio set ancora usate di default — 'bed' (Alloggio) e 'dots'
  // (Altro) — per cui non era disponibile un'icona a colori adatta.
  LIST: [
    'trasporti','auto','camion','navetta','aeroporto','benzinaio','parchimetro','strada','autostrada','dogana','guida-turistica',
    'ciotola-di-riso','cono-gelato','cupcake','caffe-espresso','bar','birra','vino-e-bicchiere','cocktail','champagne',
    'biglietto','museo','monastero','arena','palloncini-da-party',
    'letto','dormire-nel-letto',
    'cane','gatto',
    'regalo','cartellino-del-prezzo','scarpe-da-ginnastica','maglione','occhiali','anello-di-diamanti',
    'apri-libro','cappello-di-laurea','chitarra','stereo-portatile','tv',
    'farmaceutico','pillole','ombrello',
    'manutenzione','consegna','banconote','pagato','batteria-carica','ricerca','cassetta-postale-chiusa-bandiera-giu',
    'dots'
  ],

  // Icone A COLORI (PNG, set Icons8 free — https://icons8.com, vedi
  // Crediti in impostazioni.html) — file in root del progetto,
  // struttura piatta come tutto il resto dell'app.
  IMAGES: {
    trasporti: 'caticon-trasporti.png',
    auto: 'caticon-auto.png',
    camion: 'caticon-camion.png',
    navetta: 'caticon-navetta.png',
    aeroporto: 'caticon-aeroporto.png',
    benzinaio: 'caticon-benzinaio.png',
    parchimetro: 'caticon-parchimetro.png',
    'ciotola-di-riso': 'caticon-ciotola-di-riso.png',
    'cono-gelato': 'caticon-cono-gelato.png',
    cupcake: 'caticon-cupcake.png',
    'caffe-espresso': 'caticon-caffe-espresso.png',
    bar: 'caticon-bar.png',
    birra: 'caticon-birra.png',
    'vino-e-bicchiere': 'caticon-vino-e-bicchiere.png',
    cocktail: 'caticon-cocktail.png',
    champagne: 'caticon-champagne.png',
    biglietto: 'caticon-biglietto.png',
    museo: 'caticon-museo.png',
    monastero: 'caticon-monastero.png',
    arena: 'caticon-arena.png',
    'palloncini-da-party': 'caticon-palloncini-da-party.png',
    regalo: 'caticon-regalo.png',
    'cartellino-del-prezzo': 'caticon-cartellino-del-prezzo.png',
    'scarpe-da-ginnastica': 'caticon-scarpe-da-ginnastica.png',
    maglione: 'caticon-maglione.png',
    occhiali: 'caticon-occhiali.png',
    'anello-di-diamanti': 'caticon-anello-di-diamanti.png',
    'apri-libro': 'caticon-apri-libro.png',
    'cappello-di-laurea': 'caticon-cappello-di-laurea.png',
    chitarra: 'caticon-chitarra.png',
    'stereo-portatile': 'caticon-stereo-portatile.png',
    tv: 'caticon-tv.png',
    farmaceutico: 'caticon-farmaceutico.png',
    pillole: 'caticon-pillole.png',
    ombrello: 'caticon-ombrello.png',
    manutenzione: 'caticon-manutenzione.png',
    consegna: 'caticon-consegna.png',
    banconote: 'caticon-banconote.png',
    pagato: 'caticon-pagato.png',
    'batteria-carica': 'caticon-batteria-carica.png',
    ricerca: 'caticon-ricerca.png',
    'cassetta-postale-chiusa-bandiera-giu': 'caticon-cassetta-postale-chiusa-bandiera-giu.png',
    strada: 'caticon-strada.png',
    autostrada: 'caticon-autostrada.png',
    dogana: 'caticon-dogana.png',
    'guida-turistica': 'caticon-guida-turistica.png',
    letto: 'caticon-letto.png',
    'dormire-nel-letto': 'caticon-dormire-nel-letto.png',
    cane: 'caticon-cane.png',
    gatto: 'caticon-gatto.png'
  },

  PATHS: {
    food:        '<path d="M6 2v7a2 2 0 002 2 2 2 0 002-2V2M6 2v20M10 2v6M18 2c-1.5 0-3 2-3 5s1 5 1 5v10"/>',
    burger:      '<path d="M3 10c0-3.5 4-6 9-6s9 2.5 9 6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="4" y1="14" x2="20" y2="14"/><path d="M3 17a2 2 0 002 2h14a2 2 0 002-2"/>',
    pizza:       '<path d="M12 2L2 20h20L12 2z"/><circle cx="12" cy="12" r="1"/><circle cx="9" cy="16" r="1"/><circle cx="15" cy="16" r="1"/>',
    coffee:      '<path d="M4 8h13v6a5 5 0 01-5 5H9a5 5 0 01-5-5V8z"/><path d="M17 9h2a2 2 0 010 4h-2"/><path d="M8 2c0 1-1 1-1 2s1 1 1 2M12 2c0 1-1 1-1 2s1 1 1 2"/>',
    drink:       '<path d="M4 4h16l-8 9v7"/><line x1="8" y1="20" x2="16" y2="20"/><line x1="12" y1="13" x2="12" y2="20"/>',
    beer:        '<path d="M5 8h11v11a2 2 0 01-2 2H7a2 2 0 01-2-2V8z"/><path d="M16 10h2a2 2 0 012 2v3a2 2 0 01-2 2h-2"/><line x1="5" y1="12" x2="16" y2="12"/>',
    icecream:    '<path d="M12 21L7 10h10L12 21z"/><path d="M7 10a5 5 0 0110 0"/>',
    car:         '<path d="M3 13l2-6a2 2 0 012-2h10a2 2 0 012 2l2 6"/><path d="M3 13v4a1 1 0 001 1h1a1 1 0 001-1v-1h12v1a1 1 0 001 1h1a1 1 0 001-1v-4H3z"/><circle cx="7.5" cy="17" r="1.5"/><circle cx="16.5" cy="17" r="1.5"/>',
    bus:         '<rect x="3" y="4" width="18" height="13" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><circle cx="7" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>',
    train:       '<rect x="5" y="3" width="14" height="13" rx="3"/><line x1="5" y1="10" x2="19" y2="10"/><circle cx="9" cy="13" r="1"/><circle cx="15" cy="13" r="1"/><path d="M8 16l-3 5M16 16l3 5"/>',
    plane:       '<path d="M21 16v-2l-8-5V4a2 2 0 00-4 0v5l-8 5v2l8-2.5V19l-3 2v2l5-1.5 5 1.5v-2l-3-2v-5.5l8 2.5z"/>',
    ship:        '<path d="M3 15h18l-2 5H5l-2-5z"/><path d="M6 15V6h5l4 4v5"/><line x1="12" y1="2" x2="12" y2="6"/>',
    taxi:        '<rect x="9" y="4" width="6" height="3" rx="1"/><path d="M3 13l2-6a2 2 0 012-2h10a2 2 0 012 2l2 6"/><path d="M3 13v4a1 1 0 001 1h1a1 1 0 001-1v-1h12v1a1 1 0 001 1h1a1 1 0 001-1v-4H3z"/><circle cx="7.5" cy="17" r="1.5"/><circle cx="16.5" cy="17" r="1.5"/>',
    fuel:        '<path d="M4 21V7a2 2 0 012-2h6a2 2 0 012 2v14"/><line x1="3" y1="21" x2="15" y2="21"/><path d="M14 10h2a2 2 0 012 2v5a1.5 1.5 0 003 0V9l-3-3"/><line x1="6" y1="9" x2="12" y2="9"/>',
    parking:     '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 16V7h4a3 3 0 010 6H9"/>',
    bike:        '<circle cx="6" cy="17" r="3.5"/><circle cx="18" cy="17" r="3.5"/><path d="M6 17l4-8h5l3 8"/><path d="M10 9h4M10 9L8 5h3"/>',
    walk:        '<circle cx="13" cy="4" r="1.5"/><path d="M9 21l2-6 2 2 2 6"/><path d="M11 15l-2-4 3-3 3 2 3-1"/>',
    home:        '<path d="M4 11l8-7 8 7"/><path d="M6 9.5V20a1 1 0 001 1h4v-6h2v6h4a1 1 0 001-1V9.5"/>',
    bed:         '<path d="M3 18v-7a2 2 0 012-2h14a2 2 0 012 2v7"/><path d="M3 18v3M21 18v3"/><path d="M3 13V9a2 2 0 012-2h4a2 2 0 012 2v4"/><line x1="11" y1="13" x2="21" y2="13"/>',
    tent:        '<path d="M12 3l9 18H3L12 3z"/><path d="M8 21l4-11 4 11"/>',
    key:         '<circle cx="7" cy="15" r="4"/><path d="M10 12l10-10"/><path d="M17 5l2 2M20 2l2 2"/>',
    building:    '<rect x="5" y="3" width="14" height="18" rx="1"/><line x1="5" y1="9" x2="19" y2="9"/><line x1="5" y1="14" x2="19" y2="14"/><line x1="10" y1="3" x2="10" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/>',
    museum:      '<path d="M3 9l9-6 9 6"/><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="21" x2="20" y2="21"/><line x1="6" y1="9" x2="6" y2="19"/><line x1="10" y1="9" x2="10" y2="19"/><line x1="14" y1="9" x2="14" y2="19"/><line x1="18" y1="9" x2="18" y2="19"/>',
    ticket:      '<path d="M3 8a2 2 0 012-2h14a2 2 0 012 2v2a2 2 0 000 4v2a2 2 0 01-2 2H5a2 2 0 01-2-2v-2a2 2 0 000-4V8z"/><line x1="10" y1="6" x2="10" y2="18" stroke-dasharray="2 2"/>',
    theatre:     '<path d="M4 4c4 0 4 4 8 4s4-4 8-4"/><path d="M4 4v6a8 8 0 0016 0V4"/><circle cx="9" cy="10" r="1"/><circle cx="15" cy="10" r="1"/>',
    movie:       '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M3 7l3-4h4l-3 4M11 7l3-4h4l-3 4"/>',
    music:       '<circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/><path d="M9 18V4l12-2v14"/>',
    camera:      '<rect x="3" y="7" width="18" height="13" rx="2"/><circle cx="12" cy="13.5" r="4"/><path d="M8 7l1.5-3h5L16 7"/>',
    'map-pin':   '<path d="M12 21s7-7.5 7-12a7 7 0 10-14 0c0 4.5 7 12 7 12z"/><circle cx="12" cy="9" r="2.3"/>',
    mountain:    '<path d="M3 20l6-11 4 6 2-3 6 8H3z"/><circle cx="18" cy="6" r="2"/>',
    'umbrella-beach': '<path d="M12 3a9 9 0 019 9H3a9 9 0 019-9z"/><line x1="12" y1="3" x2="12" y2="21"/><path d="M12 21c-2 0-3-1-3-2"/>',
    swim:        '<path d="M3 17c1.5 1.5 3 1.5 4.5 0s3-1.5 4.5 0 3 1.5 4.5 0 3-1.5 4.5 0"/><path d="M3 21c1.5 1.5 3 1.5 4.5 0s3-1.5 4.5 0 3 1.5 4.5 0 3-1.5 4.5 0"/><circle cx="16" cy="6" r="2"/><path d="M4 14l6-3 3 2 4-4"/>',
    ski:         '<path d="M4 20l14-16M2 21l4-4M18 5l4-4"/><path d="M8 16l3 3M13 11l3 3"/>',
    ball:        '<circle cx="12" cy="12" r="9"/><path d="M12 8l3.5 2.5-1.3 4H9.8l-1.3-4L12 8z"/><path d="M12 3v5M4.5 9l4.3 1.5M6 19l3.8-4.5M18 19l-3.8-4.5M19.5 9l-4.3 1.5"/>',
    gym:         '<rect x="2" y="9" width="3" height="6" rx="1"/><rect x="19" y="9" width="3" height="6" rx="1"/><rect x="5" y="7" width="2.5" height="10" rx="1"/><rect x="16.5" y="7" width="2.5" height="10" rx="1"/><line x1="7.5" y1="12" x2="16.5" y2="12"/>',
    'shopping-bag': '<path d="M6 8h12l1 12a2 2 0 01-2 2H7a2 2 0 01-2-2L6 8z"/><path d="M9 8V6a3 3 0 016 0v2"/>',
    gift:        '<rect x="3" y="9" width="18" height="12" rx="1"/><line x1="3" y1="13" x2="21" y2="13"/><line x1="12" y1="9" x2="12" y2="21"/><path d="M12 9C10 9 8 7.5 8 5.5A2.5 2.5 0 0112.5 4C12.5 6.5 12 9 12 9zM12 9c2 0 4-1.5 4-3.5A2.5 2.5 0 0011.5 4c0 2.5.5 5 .5 5z"/>',
    book:        '<path d="M4 4.5A2.5 2.5 0 016.5 2H20v17H6.5A2.5 2.5 0 004 21.5v-17z"/><path d="M20 19H6.5a2.5 2.5 0 00-2.5 2.5"/>',
    medicine:    '<path d="M8.5 15.5l7-7a3.5 3.5 0 10-5-5l-7 7a3.5 3.5 0 005 5z"/><line x1="9" y1="9" x2="15" y2="15"/>',
    hospital:    '<rect x="3" y="3" width="18" height="18" rx="3"/><line x1="12" y1="7" x2="12" y2="17"/><line x1="7" y1="12" x2="17" y2="12"/>',
    phone:       '<rect x="6" y="2" width="12" height="20" rx="2"/><line x1="11" y1="18" x2="13" y2="18"/>',
    wifi:        '<path d="M2 8.5a16 16 0 0120 0"/><path d="M5 12a11 11 0 0114 0"/><path d="M8.5 15.5a6 6 0 017 0"/><circle cx="12" cy="19" r="1"/>',
    laundry:     '<rect x="3" y="2" width="18" height="20" rx="2"/><circle cx="12" cy="13" r="6"/><circle cx="12" cy="13" r="3"/><circle cx="7" cy="5" r="0.8"/><circle cx="10" cy="5" r="0.8"/>',
    pet:         '<circle cx="7" cy="8" r="2"/><circle cx="12" cy="6" r="2"/><circle cx="17" cy="8" r="2"/><path d="M8 15c0-2.5 2-4 4-4s4 1.5 4 4-2 4-4 4-4-1.5-4-4z"/>',
    baby:        '<circle cx="12" cy="10" r="6"/><circle cx="12" cy="10" r="2.3"/><path d="M12 16v3a2 2 0 002 2"/>',
    toy:         '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="8.5" cy="8.5" r="1.2"/><circle cx="15.5" cy="8.5" r="1.2"/><circle cx="8.5" cy="15.5" r="1.2"/><circle cx="15.5" cy="15.5" r="1.2"/><circle cx="12" cy="12" r="1.2"/>',
    briefcase:   '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2"/><line x1="3" y1="13" x2="21" y2="13"/>',
    tools:       '<path d="M14.5 3.5a4.5 4.5 0 00-6 5.8L3 15v3h3l5.7-5.7a4.5 4.5 0 005.8-6l-3 3-2-2z"/>',
    wallet:      '<path d="M3 7a2 2 0 012-2h13a1 1 0 011 1v2"/><rect x="3" y="7" width="18" height="13" rx="2"/><circle cx="16" cy="14" r="1.5"/>',
    bank:        '<path d="M3 10l9-6 9 6"/><line x1="4" y1="10" x2="20" y2="10"/><line x1="5" y1="20" x2="19" y2="20"/><line x1="6" y1="10" x2="6" y2="18"/><line x1="10" y1="10" x2="10" y2="18"/><line x1="14" y1="10" x2="14" y2="18"/><line x1="18" y1="10" x2="18" y2="18"/>',
    insurance:   '<path d="M12 3l7 3v6c0 5-3.5 7.5-7 9-3.5-1.5-7-4-7-9V6l7-3z"/><path d="M9 12l2 2 4-4"/>',
    party:       '<path d="M4 21l6-14 10 10-14 6-2-2z"/><circle cx="17" cy="4" r="1"/><circle cx="20" cy="8" r="1"/><circle cx="14" cy="3" r="1"/>',
    dots:        '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>'
  },

  /** Markup di un'icona (currentColor per lo stroke, per ereditare il
   * colore dal contenitore) — <img> se è un'icona a colori (IMAGES),
   * altrimenti <svg> a contorno (PATHS, vecchio set v1.2). */
  svg(iconId, size = 16) {
    if (ExpenseCategoryIcons.IMAGES[iconId]) {
      return `<img src="/${ExpenseCategoryIcons.IMAGES[iconId]}" width="${size}" height="${size}" alt="" style="object-fit:contain;" />`;
    }
    const d = ExpenseCategoryIcons.PATHS[iconId] || ExpenseCategoryIcons.PATHS.dots;
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  }
};

window.ExpenseCategoryIcons = ExpenseCategoryIcons;

const ExpenseCategories = {

  DEFAULTS: [
    { id: 'cibo',       label: 'Cibo',       enabled: true, icon: 'ciotola-di-riso' },
    { id: 'trasporti',  label: 'Trasporti',  enabled: true, icon: 'trasporti'       },
    { id: 'alloggio',   label: 'Alloggio',   enabled: true, icon: 'letto'           },
    { id: 'ingressi',   label: 'Ingressi',   enabled: true, icon: 'biglietto'       },
    { id: 'souvenir',   label: 'Souvenir',   enabled: true, icon: 'regalo'          },
    { id: 'altro',      label: 'Altro',      enabled: true, icon: 'dots'            }
  ],

  getEnabled() {
    const saved = Utils.getConfig('expense_categories');
    if (!saved) return ExpenseCategories.DEFAULTS.filter(c => c.enabled);

    const merged = ExpenseCategories.DEFAULTS.map(d => {
      const s = saved.find(s => s.id === d.id);
      return s ? { ...d, ...s } : d;
    });
    const custom = saved.filter(s => !ExpenseCategories.DEFAULTS.some(d => d.id === s.id));
    return [...merged, ...custom].filter(c => c.enabled);
  },

  getAll() {
    const saved = Utils.getConfig('expense_categories');
    if (!saved) return [...ExpenseCategories.DEFAULTS];

    const merged = ExpenseCategories.DEFAULTS.map(d => {
      const s = saved.find(s => s.id === d.id);
      return s ? { ...d, ...s } : d;
    });
    const custom = saved.filter(s => !ExpenseCategories.DEFAULTS.some(d => d.id === s.id));
    return [...merged, ...custom];
  },

  save(categories) {
    Utils.setConfig('expense_categories', categories);
  },

  toggle(id) {
    const all = ExpenseCategories.getAll();
    const cat = all.find(c => c.id === id);
    if (cat) cat.enabled = !cat.enabled;
    ExpenseCategories.save(all);
    return cat;
  },

  // ─── RINOMINA / CAMBIA ICONA (v1.2) ──────────────────────
  // A differenza di toggle()/removeCustom(), questi due funzionano
  // anche sulle categorie di DEFAULT (non solo custom): la label/icona
  // scelta viene salvata come override nella lista utente (stesso
  // meccanismo di merge già usato da getAll()/getEnabled()).
  rename(id, label) {
    if (!label || label.trim() === '') return null;
    const all = ExpenseCategories.getAll();
    const cat = all.find(c => c.id === id);
    if (cat) { cat.label = label.trim(); ExpenseCategories.save(all); }
    return cat;
  },

  setIcon(id, iconId) {
    const all = ExpenseCategories.getAll();
    const cat = all.find(c => c.id === id);
    if (cat) { cat.icon = iconId; ExpenseCategories.save(all); }
    return cat;
  },

  addCustom(label, icon = 'dots') {
    if (!label || label.trim() === '') return null;
    const all = ExpenseCategories.getAll();
    const id  = label.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    if (all.some(c => c.id === id)) {
      Utils.toast('Categoria già esistente', 'error');
      return null;
    }
    const cat = { id, label: label.trim(), enabled: true, icon, custom: true };
    all.push(cat);
    ExpenseCategories.save(all);
    return cat;
  },

  removeCustom(id) {
    const all = ExpenseCategories.getAll().filter(c => !(c.custom && c.id === id));
    ExpenseCategories.save(all);
  },

  getById(id) {
    return ExpenseCategories.getAll().find(c => c.id === id) ||
      { id, label: id, enabled: true, icon: 'dots' };
  },

  /** Markup SVG dell'icona di una categoria (per id o oggetto categoria già risolto). */
  iconSvg(catOrId, size = 16) {
    const cat = typeof catOrId === 'string' ? ExpenseCategories.getById(catOrId) : catOrId;
    return ExpenseCategoryIcons.svg((cat && cat.icon) || 'dots', size);
  },

  /** <select> con le categorie abilitate, con opzione vuota iniziale (facoltativo). */
  selectHtml(selectedId = '', elementId = 'expenseCategory') {
    const cats = ExpenseCategories.getEnabled();
    const options = '<option value="">—</option>' + cats.map(c =>
      `<option value="${Utils.escapeHtml(c.id)}" ${c.id === selectedId ? 'selected' : ''}>${Utils.escapeHtml(c.label)}</option>`
    ).join('');
    return `<select class="form-select" id="${elementId}" name="${elementId}">${options}</select>`;
  }
};

window.ExpenseCategories = ExpenseCategories;
