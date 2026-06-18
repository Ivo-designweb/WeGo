// ═══════════════════════════════════════════════════════════════
// WeGo — payments.js v1.0
// Gestione metodi di pagamento configurabili
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
