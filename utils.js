// ═══════════════════════════════════════════════════════════════
// WeGo — utils.js v1.4
// Funzioni di utilità condivise da tutti i moduli
// v1.4: NUOVA calculateCassaComune() — saldo informativo "Cassa Comune"
//       per utente, SEPARATO dal saldo normale (calculateBalances, mai
//       toccata): per ogni utente è la somma di tutti i movimenti
//       "+Cassiere" dove lui è il cassiere (paid_by) MENO la somma di
//       tutte le spese marcate col nuovo flag expenses.is_cassa_comune
//       dove lui ha pagato (paid_by) — vedi spesa.html/spesa.js v2.7 e
//       situazione.md. Le previsioni sono escluse (mai spesa reale).
//       Usata da evento.js _renderSaldi() per mostrare "(Cassa Comune:
//       …)" accanto al saldo di un utente, solo se diverso da zero.
// v1.3: calculateBalances() — nuovo ramo per il tipo 'cashier'
//       ("+Cassiere", spesa.html/spesa.js): si comporta come una spesa
//       normale (paid_by = "A" il cassiere, participants = "Da" chi
//       versa, importo diviso tra loro) ma con il segno OPPOSTO —
//       il cassiere riceve quindi va in debito (-importo), chi versa
//       va in credito (+quota) — vedi situazione.md
// ═══════════════════════════════════════════════════════════════

const Utils = {

  // ─── CONFIGURAZIONE CENTRALIZZATA (chiavi.json) ────────────
  /**
   * Chiavi di connessione gestite centralmente tramite chiavi.json
   * (caricato dal server, generato da admin.html). Non includono
   * preferenze locali del device come tema o valuta.
   */
  REMOTE_CONFIG_KEYS: [
    'supabase_url', 'supabase_anon_key',
    'fcm_api_key', 'fcm_project_id', 'fcm_sender_id', 'fcm_app_id', 'fcm_vapid_key'
  ],

  /**
   * Stato dell'ultimo caricamento di chiavi.json.
   * status: 'loading' | 'loaded' | 'missing' | 'error'
   */
  _remoteConfigInfo: { status: 'loading', exportedAt: null },

  /**
   * Carica chiavi.json dal server e, se valido, sovrascrive SEMPRE
   * le chiavi di connessione locali (supabase_url, supabase_anon_key, fcm_*).
   * Se il file non è raggiungibile o non è valido, non modifica nulla:
   * resta attiva l'eventuale configurazione locale salvata da admin.html
   * come configurazione di emergenza per questo solo device.
   * Va chiamata (e attesa) all'inizio di ogni pagina, prima di usare SupabaseClient.
   */
  async loadRemoteConfig() {
    Utils._remoteConfigInfo = { status: 'loading', exportedAt: null };
    try {
      const res = await fetch('/chiavi.json', { cache: 'no-store' });
      if (!res.ok) {
        Utils._remoteConfigInfo = { status: 'missing', exportedAt: null };
        console.warn('[Config] chiavi.json non trovato sul server (HTTP ' + res.status + ') — uso eventuale configurazione locale del device.');
        return false;
      }
      const data = await res.json();
      if (!data || !data._wego_config_version) {
        throw new Error('chiavi.json non valido (manca _wego_config_version)');
      }
      Utils.REMOTE_CONFIG_KEYS.forEach(k => {
        if (data[k]) Utils.setConfig(k, data[k]);
      });
      Utils._remoteConfigInfo = { status: 'loaded', exportedAt: data._exported_at || null };
      return true;
    } catch (e) {
      Utils._remoteConfigInfo = { status: 'error', exportedAt: null };
      console.warn('[Config] Errore caricamento chiavi.json:', e.message, '— uso eventuale configurazione locale del device.');
      return false;
    }
  },

  // ─── ID GENERATION ──────────────────────────────────────────
  /**
   * Genera un ID evento breve leggibile: ABC-123456
   */
  generateEventCode() {
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const nums    = '0123456789';
    const prefix  = Array.from({length:3}, () => letters[Math.floor(Math.random()*letters.length)]).join('');
    const suffix  = Array.from({length:6}, () => nums[Math.floor(Math.random()*nums.length)]).join('');
    return `${prefix}-${suffix}`;
  },

  /**
   * Genera UUID v4
   */
  uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  },

  /**
   * Genera un device ID persistente
   */
  getDeviceId() {
    let id = localStorage.getItem('wego_device_id');
    if (!id) {
      id = `dev_${Utils.uuid()}`;
      localStorage.setItem('wego_device_id', id);
    }
    return id;
  },

  // ─── CURRENCY ───────────────────────────────────────────────
  /**
   * Formatta un importo con simbolo valuta
   */
  formatAmount(amount, currency = null) {
    const cur = currency || Utils.getConfig('currency') || 'EUR';
    const symbols = { EUR: '€', USD: '$', GBP: '£', CHF: 'CHF', JPY: '¥' };
    const sym = symbols[cur] || cur;
    const n = parseFloat(amount) || 0;
    // Formato italiano: punto come separatore delle migliaia, virgola
    // come separatore decimale, sempre 2 decimali (es. 1.234,56) — prima
    // mancava la divisione delle migliaia (solo "1234,56"). Raggruppamento
    // fatto A MANO (non con toLocaleString('it-IT')): i dati locale di
    // it-IT in JS NON raggruppano i numeri a 4 cifre (1000-9999, es.
    // "1234,56" senza punto — pensato per gli anni), che invece per un
    // importo in euro va raggruppato come tutti gli altri ("1.234,56").
    const isNeg = n < 0;
    const parts = Math.abs(n).toFixed(2).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const formatted = (isNeg ? '-' : '') + parts[0] + ',' + parts[1];
    // Posizionamento simbolo
    if (cur === 'EUR' || cur === 'CHF') {
      return `${formatted} ${sym}`;
    }
    return `${sym} ${formatted}`;
  },

  /**
   * Converte una stringa importo in float
   */
  parseAmount(str) {
    if (!str) return 0;
    return parseFloat(str.toString().replace(',', '.').replace(/[^\d.]/g, '')) || 0;
  },

  // ─── DATE & TIME ────────────────────────────────────────────
  /**
   * Formatta una data ISO in stringa leggibile
   */
  formatDate(isoString, options = {}) {
    if (!isoString) return '—';
    const d = new Date(isoString);
    if (isNaN(d)) return '—';
    const defaults = { day: '2-digit', month: 'short', year: 'numeric' };
    return d.toLocaleDateString('it-IT', { ...defaults, ...options });
  },

  /**
   * Formatta data+ora
   */
  formatDateTime(isoString) {
    if (!isoString) return '—';
    const d = new Date(isoString);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('it-IT', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  },

  /**
   * Etichetta leggibile per un'intestazione di gruppo data
   * (usata per raggruppare i movimenti per giorno in evento.html).
   * Accetta sia date ISO 'YYYY-MM-DD' sia, come fallback, una stringa
   * già formattata (in tal caso viene restituita invariata).
   * Restituisce "Oggi", "Ieri" oppure la data estesa in italiano.
   */
  formatDateLabel(dateStr) {
    if (!dateStr) return '—';

    const isIso = /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
    const d = isIso ? new Date(dateStr + 'T00:00:00') : new Date(dateStr);

    if (isNaN(d)) return dateStr; // già una stringa formattata: la mostriamo così com'è

    const startOfDay = (date) => { const x = new Date(date); x.setHours(0, 0, 0, 0); return x; };
    const today  = startOfDay(new Date());
    const target = startOfDay(d);
    const diffDays = Math.round((today - target) / 86400000);

    if (diffDays === 0) return 'Oggi';
    if (diffDays === 1) return 'Ieri';

    return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });
  },

  /**
   * Oggi in formato ISO date
   */
  today() {
    return new Date().toISOString().split('T')[0];
  },

  /**
   * Ora corrente ISO
   */
  now() {
    return new Date().toISOString();
  },

  /**
   * Quanto tempo fa (es. "2 ore fa")
   */
  timeAgo(isoString) {
    if (!isoString) return '';
    const diff = Date.now() - new Date(isoString).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'ora';
    if (mins < 60) return `${mins} min fa`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} ora${hrs > 1 ? 'e' : ''} fa`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days} giorno${days > 1 ? 'i' : ''} fa`;
    return Utils.formatDate(isoString);
  },

  // ─── CONFIG ─────────────────────────────────────────────────
  /**
   * Legge un valore di configurazione
   */
  getConfig(key, defaultValue = null) {
    try {
      const cfg = JSON.parse(localStorage.getItem('wego_config') || '{}');
      return key in cfg ? cfg[key] : defaultValue;
    } catch { return defaultValue; }
  },

  /**
   * Scrive un valore di configurazione
   */
  setConfig(key, value) {
    try {
      const cfg = JSON.parse(localStorage.getItem('wego_config') || '{}');
      cfg[key] = value;
      localStorage.setItem('wego_config', JSON.stringify(cfg));
    } catch (e) { console.warn('Config write error:', e); }
  },

  /**
   * Legge tutta la configurazione
   */
  getAllConfig() {
    try {
      return JSON.parse(localStorage.getItem('wego_config') || '{}');
    } catch { return {}; }
  },

  // ─── AVATAR ─────────────────────────────────────────────────
  /**
   * Iniziali da un nome
   */
  initials(name = '') {
    return name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
  },

  /**
   * Colore avatar deterministico basato sul nome
   */
  avatarColorIndex(name = '') {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return Math.abs(hash) % 8;
  },

  /**
   * Crea HTML di un avatar
   */
  avatarHtml(name, size = '') {
    const idx = Utils.avatarColorIndex(name);
    const cls = `avatar avatar-${idx}${size ? ` avatar--${size}` : ''}`;
    return `<div class="${cls}">${Utils.initials(name)}</div>`;
  },

  // ─── TOAST ──────────────────────────────────────────────────
  toast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const icons = {
      success: `<svg class="toast__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>`,
      error:   `<svg class="toast__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
      info:    `<svg class="toast__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r=".5" fill="currentColor"/></svg>`,
    };

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.innerHTML = `${icons[type] || icons.info}<span class="toast__message">${Utils.escapeHtml(message)}</span>`;
    container.appendChild(toast);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => toast.classList.add('show'));
    });

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  // ─── DOM HELPERS ────────────────────────────────────────────
  /**
   * Escape HTML per prevenire XSS
   */
  escapeHtml(str) {
    if (!str) return '';
    return str.toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  /**
   * Mostra/nasconde elemento
   */
  show(id) { const el = document.getElementById(id); if (el) el.classList.remove('hidden'); },
  hide(id) { const el = document.getElementById(id); if (el) el.classList.add('hidden'); },
  toggle(id) { const el = document.getElementById(id); if (el) el.classList.toggle('hidden'); },

  /**
   * Applica il tema
   */
  applyTheme(theme = 'dark') {
    document.documentElement.setAttribute('data-theme', theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      'content', theme === 'dark' ? '#0F172A' : '#F8FAFC'
    );
  },

  // ─── GPS ────────────────────────────────────────────────────
  /**
   * Ottiene posizione GPS corrente
   */
  getCurrentPosition(options = {}) {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocalizzazione non supportata'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        pos => resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        }),
        err => reject(err),
        { timeout: 8000, maximumAge: 60000, enableHighAccuracy: true, ...options }
      );
    });
  },

  /**
   * Reverse geocoding via Nominatim (OpenStreetMap, gratuito)
   */
  async reverseGeocode(lat, lng) {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=it`;
      const res = await fetch(url, { headers: { 'Accept-Language': 'it' } });
      const data = await res.json();
      const a = data.address || {};
      // Compone un indirizzo breve
      const parts = [
        a.road || a.pedestrian || a.footway,
        a.house_number,
        a.village || a.town || a.city || a.municipality
      ].filter(Boolean);
      return parts.join(', ') || data.display_name?.split(',').slice(0, 2).join(',') || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    } catch {
      return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    }
  },

  /**
   * Geocodifica DIRETTA (testo → coordinate), opposta a reverseGeocode()
   * qui sopra — stesso servizio (Nominatim/OpenStreetMap, nessuna API
   * key). Usata da spesa.js quando l'utente scrive un indirizzo a mano
   * nel campo posizione: prova a risolverlo in coordinate reali, così
   * quel movimento può comunque comparire come pin nella Mappa del tab
   * Riepilogo e avere un link "Apri su Maps" preciso. Se Nominatim non
   * trova corrispondenze (indirizzo troppo vago, inventato, o solo in
   * parte scritto) torna null: il chiamante mantiene il testo così
   * com'è, senza coordinate — comportamento già esistente, invariato.
   * limit=1: ci basta il risultato migliore, non un elenco.
   */
  async geocodeAddress(text) {
    if (!text || !text.trim()) return null;
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(text.trim())}&format=json&limit=1&accept-language=it`;
      const res = await fetch(url, { headers: { 'Accept-Language': 'it' } });
      const data = await res.json();
      if (Array.isArray(data) && data.length && data[0].lat && data[0].lon) {
        return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      }
      return null;
    } catch {
      return null;
    }
  },

  /**
   * Crea link a Google Maps / Apple Maps
   */
  mapsUrl(lat, lng, label = '') {
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isIOS) {
      return label
        ? `maps://maps.apple.com/?q=${encodeURIComponent(label)}&ll=${lat},${lng}`
        : `maps://maps.apple.com/?ll=${lat},${lng}`;
    }
    return `https://www.google.com/maps?q=${lat},${lng}`;
  },

  // ─── PHOTO ──────────────────────────────────────────────────
  /**
   * Comprime un'immagine File in base64 (max width/height configurabile)
   */
  compressImage(file, maxDimension = 1200, quality = 0.82) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let { width, height } = img;
          if (width > maxDimension || height > maxDimension) {
            if (width > height) { height = height * maxDimension / width; width = maxDimension; }
            else                { width = width * maxDimension / height;  height = maxDimension; }
          }
          canvas.width = Math.round(width);
          canvas.height = Math.round(height);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  // ─── NETWORK ────────────────────────────────────────────────
  isOnline() { return navigator.onLine; },

  // ─── VALIDATIONS ────────────────────────────────────────────
  required(value, label = 'Campo') {
    if (!value || value.toString().trim() === '') {
      Utils.toast(`${label} è obbligatorio`, 'error');
      return false;
    }
    return true;
  },

  // ─── COPY TO CLIPBOARD ──────────────────────────────────────
  async copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      Utils.toast('Copiato negli appunti!', 'success', 2000);
      return true;
    } catch {
      // Fallback
      const el = document.createElement('textarea');
      el.value = text;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.focus();
      el.select();
      try {
        document.execCommand('copy');
        Utils.toast('Copiato negli appunti!', 'success', 2000);
        return true;
      } catch {
        Utils.toast('Impossibile copiare', 'error');
        return false;
      } finally {
        document.body.removeChild(el);
      }
    }
  },

  // ─── SHARE ──────────────────────────────────────────────────
  async share(data) {
    if (navigator.share) {
      try {
        await navigator.share(data);
        return true;
      } catch (e) {
        if (e.name !== 'AbortError') {
          Utils.copyToClipboard(data.text || data.url || '');
        }
        return false;
      }
    } else {
      Utils.copyToClipboard(data.text || data.url || '');
      return false;
    }
  },

  // ─── DEBT CALCULATION ───────────────────────────────────────
  /**
   * Calcola i debiti minimali tra utenti
   * @param {Object} balances - { userId: importo } (+ credito, - debito)
   * @param {Object} userNames - { userId: nome }
   * @returns {Array} - [{from, fromName, to, toName, amount}]
   */
  calculateMinimalTransactions(balances, userNames = {}) {
    const creditors = [];
    const debtors = [];

    for (const [userId, balance] of Object.entries(balances)) {
      const amount = parseFloat(balance.toFixed(2));
      if (amount > 0.01)       creditors.push({ userId, amount });
      else if (amount < -0.01) debtors.push({ userId, amount: -amount });
    }

    creditors.sort((a, b) => b.amount - a.amount);
    debtors.sort((a, b) => b.amount - a.amount);

    const transactions = [];

    let ci = 0, di = 0;
    while (ci < creditors.length && di < debtors.length) {
      const c = creditors[ci];
      const d = debtors[di];
      const amount = Math.min(c.amount, d.amount);

      if (amount > 0.01) {
        transactions.push({
          from:     d.userId,
          fromName: userNames[d.userId] || d.userId,
          to:       c.userId,
          toName:   userNames[c.userId] || c.userId,
          amount:   parseFloat(amount.toFixed(2))
        });
      }

      c.amount -= amount;
      d.amount -= amount;

      if (c.amount < 0.01) ci++;
      if (d.amount < 0.01) di++;
    }

    return transactions;
  },

  /**
   * Calcola il saldo di ogni utente per un evento
   * @param {Array} expenses - lista spese
   * @param {Array} users    - lista utenti [{id, name}]
   * @returns {Object} - { userId: balance }
   */
  calculateBalances(expenses, users) {
    const balances = {};
    users.forEach(u => { balances[u.id] = 0; });

    for (const exp of expenses) {
      if (exp.deleted) continue;

      // Movimento cassa (trasferimento diretto tra utenti)
      if (exp.type === 'transfer') {
        balances[exp.paid_by]  = (balances[exp.paid_by]  || 0) + parseFloat(exp.amount);
        balances[exp.paid_for] = (balances[exp.paid_for] || 0) - parseFloat(exp.amount);
        continue;
      }

      // "+Cassiere": funziona esattamente come una spesa (paid_by = "A"
      // il cassiere, participants = "Da" chi versa, importo diviso tra
      // loro) ma con il segno OPPOSTO rispetto a una spesa normale —
      // il cassiere INCASSA quindi va in debito (-importo, dovrà
      // restituirlo/spenderlo per il gruppo), chi versa va in credito
      // (+quota, ha tirato fuori soldi di tasca propria).
      if (exp.type === 'cashier') {
        const cashierParts = exp.participants || [];
        if (cashierParts.length === 0) continue;
        const cashierShare = parseFloat(exp.amount) / cashierParts.length;
        balances[exp.paid_by] = (balances[exp.paid_by] || 0) - parseFloat(exp.amount);
        cashierParts.forEach(uid => {
          balances[uid] = (balances[uid] || 0) + cashierShare;
        });
        continue;
      }

      // Spesa normale
      const participants = exp.participants || [];
      if (participants.length === 0) continue;

      const share = parseFloat(exp.amount) / participants.length;

      // Chi ha pagato ottiene credito
      balances[exp.paid_by] = (balances[exp.paid_by] || 0) + parseFloat(exp.amount);

      // I partecipanti devono la loro quota
      participants.forEach(uid => {
        balances[uid] = (balances[uid] || 0) - share;
      });
    }

    return balances;
  },

  /**
   * Calcola il saldo "Cassa Comune" per ogni utente (v1.4) — un dato
   * PURAMENTE INFORMATIVO, separato dal saldo normale (calculateBalances,
   * mai modificata da questa funzione): rappresenta quanta cassa comune
   * un utente ha ancora "in mano" come cassiere.
   *
   * Per ogni utente è: somma di tutti i movimenti "+Cassiere" (type:
   * 'cashier') dove lui è il cassiere (paid_by) — l'INTERO importo
   * incassato, non diviso — MENO la somma di tutte le spese (type:
   * 'expense') marcate col flag is_cassa_comune dove lui ha pagato
   * (paid_by) — anche qui l'intero importo, non la quota.
   *
   * Esempio: Pippo incassa 200€ come cassiere (4 persone, 50€ a testa),
   * poi paga una spesa di 80€ con le stesse 4 persone marcandola "Uso
   * Cassa Comune" → Cassa Comune di Pippo = 200 - 80 = 120€. Gli altri 3
   * partecipanti hanno Cassa Comune = 0 (non sono mai stati cassiere né
   * hanno mai pagato col flag).
   *
   * Le previsioni (is_forecast) sono sempre escluse, come per il saldo
   * normale: non sono mai cassa reale.
   *
   * @param {Array} expenses - lista movimenti (spese/cassiere/trasf.)
   * @param {Array} users    - lista utenti [{id, name}]
   * @returns {Object} - { userId: importo } (può essere negativo se è
   *                      stato speso più di quanto incassato come cassiere)
   */
  calculateCassaComune(expenses, users) {
    const cassa = {};
    users.forEach(u => { cassa[u.id] = 0; });

    for (const exp of expenses) {
      if (exp.deleted || exp.is_forecast) continue;
      if (!exp.paid_by) continue;

      if (exp.type === 'cashier') {
        cassa[exp.paid_by] = (cassa[exp.paid_by] || 0) + (parseFloat(exp.amount) || 0);
      } else if (exp.type === 'expense' && exp.is_cassa_comune) {
        cassa[exp.paid_by] = (cassa[exp.paid_by] || 0) - (parseFloat(exp.amount) || 0);
      }
    }

    return cassa;
  }
};

// Espone globale
window.Utils = Utils;
