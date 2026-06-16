// ═══════════════════════════════════════════════════════════════
// WeGo — app.js v1.0
// Logica principale pagina Home (index.html)
// ═══════════════════════════════════════════════════════════════

const App = {

  // ─── STATO ────────────────────────────────────────────────
  _events:       [],
  _pendingPhoto: null,

  // ─── INIT ─────────────────────────────────────────────────
  async init() {
    console.log('[App] WeGo v1.0 init');

    // Applica tema salvato
    const theme = Utils.getConfig('theme', 'dark');
    Utils.applyTheme(theme);

    // Registra Service Worker
    await App._registerSW();

    // Inizializza DB
    await DB.open();

    // Carica eventi
    await App.loadEvents();

    // Monitor connessione
    App._initNetworkMonitor();

    // Sync all'avvio se online
    if (Utils.isOnline()) {
      App._syncQuiet();
    }

    // Gestione notifiche click (dal SW)
    navigator.serviceWorker?.addEventListener('message', (e) => {
      if (e.data?.type === 'NOTIFICATION_CLICK' || e.data?.type === 'BACKGROUND_SYNC') {
        App._syncQuiet();
      }
    });

    // Check aggiornamento SW
    App._checkSWUpdate();
  },

  // ─── SERVICE WORKER ───────────────────────────────────────
  async _registerSW() {
    if (!('serviceWorker' in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      console.log('[SW] Registered:', reg.scope);
      window._swRegistration = reg;
    } catch (e) {
      console.warn('[SW] Registration failed:', e);
    }
  },

  _checkSWUpdate() {
    if (!window._swRegistration) return;
    window._swRegistration.addEventListener('updatefound', () => {
      const newWorker = window._swRegistration.installing;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // Nuova versione disponibile
          Utils.toast('Aggiornamento disponibile — ricarica la pagina', 'info', 6000);
        }
      });
    });
  },

  // ─── NETWORK MONITOR ──────────────────────────────────────
  _initNetworkMonitor() {
    const indicator = document.getElementById('connectionIndicator');

    const update = () => {
      const online = Utils.isOnline();
      if (indicator) {
        indicator.style.background = online ? 'var(--accent-green)' : 'var(--accent-red)';
        indicator.title = online ? 'Connesso' : 'Offline';
      }
      if (online) {
        App._syncQuiet();
      }
    };

    window.addEventListener('online',  update);
    window.addEventListener('offline', update);
    update();
  },

  // ─── LOAD EVENTS ──────────────────────────────────────────
  async loadEvents() {
    try {
      App._events = await DB.events.getAll();
      // Ordina per data più recente
      App._events.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
      App._render();
    } catch (e) {
      console.error('[App] loadEvents error:', e);
      Utils.toast('Errore nel caricamento degli eventi', 'error');
    }
  },

  // ─── RENDER ───────────────────────────────────────────────
  _render() {
    const hasEvents = App._events.length > 0;

    if (!hasEvents) {
      Utils.show('welcomeScreen');
      Utils.hide('eventsScreen');
      return;
    }

    Utils.hide('welcomeScreen');
    Utils.show('eventsScreen');

    // Aggiorna contatore
    const countEl = document.getElementById('eventsCount');
    if (countEl) countEl.textContent = `${App._events.length} event${App._events.length === 1 ? 'o' : 'i'}`;

    // Nickname corrente (prende il primo evento attivo)
    App._renderCurrentUser();

    // Lista eventi
    App._renderEventList();
  },

  _renderCurrentUser() {
    const sessions = DB.sessions.getAll();
    const firstSession = Object.values(sessions)[0];
    const nameEl   = document.getElementById('currentUserName');
    const avatarEl = document.getElementById('currentUserAvatar');

    if (firstSession && nameEl) {
      nameEl.textContent = firstSession.userName || 'Sconosciuto';
      if (avatarEl) {
        const idx = Utils.avatarColorIndex(firstSession.userName);
        avatarEl.className = `avatar avatar-${idx}`;
        avatarEl.textContent = Utils.initials(firstSession.userName);
      }
    }
  },

  _renderEventList() {
    const container = document.getElementById('eventsList');
    if (!container) return;

    if (App._events.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 00-3-3.87"/>
              <path d="M16 3.13a4 4 0 010 7.75"/>
            </svg>
          </div>
          <p class="empty-state__title">Nessun evento</p>
          <p class="empty-state__desc">Crea un nuovo evento o unisciti a uno esistente con il codice condiviso.</p>
        </div>`;
      return;
    }

    container.innerHTML = App._events.map(ev => App._eventCardHtml(ev)).join('');
  },

  async _eventCardHtml(ev) {
    const session = DB.sessions.get(ev.id);
    const userName = session?.userName;
    const userIdx  = userName ? Utils.avatarColorIndex(userName) : 0;

    // Conta spese non sincronizzate
    const allExp   = await DB.expenses.getByEvent(ev.id);
    const expCount = allExp.filter(e => !e.deleted).length;
    const unsynced = allExp.filter(e => !e.synced && !e.deleted).length;

    return `
    <div class="card card--interactive" style="margin-bottom:10px;" onclick="App.openEvent('${Utils.escapeHtml(ev.id)}')">
      <div style="display:flex;align-items:flex-start;gap:12px;">
        ${ev.photo
          ? `<div style="width:48px;height:48px;border-radius:var(--radius-md);background:url(${ev.photo}) center/cover;flex-shrink:0;"></div>`
          : `<div style="width:48px;height:48px;border-radius:var(--radius-md);background:var(--bg-input);display:flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--text-muted);">
               <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                 <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
                 <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
               </svg>
             </div>`
        }
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px;">
            <span style="font-size:16px;font-weight:700;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${Utils.escapeHtml(ev.title)}</span>
            ${unsynced > 0 ? `<span class="badge badge--amber">${unsynced} da sync</span>` : ''}
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <code style="font-size:11px;color:var(--accent-blue);background:rgba(59,130,246,0.1);padding:2px 7px;border-radius:4px;font-weight:700;letter-spacing:1px;">${Utils.escapeHtml(ev.code)}</code>
            <span class="text-sm text-muted">${expCount} spes${expCount === 1 ? 'a' : 'e'}</span>
            <span class="text-sm text-muted">· ${Utils.timeAgo(ev.updated_at)}</span>
          </div>
        </div>
        ${userName
          ? `<div class="avatar avatar-${userIdx} avatar--sm" title="Sei ${userName}">${Utils.initials(userName)}</div>`
          : ''}
      </div>
    </div>`;
  },

  // ─── CARICA EVENTO HTML (con promise rendering) ────────────
  async _renderEventListAsync() {
    const container = document.getElementById('eventsList');
    if (!container) return;

    if (App._events.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
            </svg>
          </div>
          <p class="empty-state__title">Nessun evento</p>
          <p class="empty-state__desc">Crea un nuovo evento o unisciti a uno esistente con il codice condiviso.</p>
        </div>`;
      return;
    }

    const cards = await Promise.all(App._events.map(ev => App._eventCardHtml(ev)));
    container.innerHTML = cards.join('');
  },

  // Override render per usare async
  async _render() {
    const hasEvents = App._events.length > 0;

    if (!hasEvents) {
      Utils.show('welcomeScreen');
      Utils.hide('eventsScreen');
      return;
    }

    Utils.hide('welcomeScreen');
    Utils.show('eventsScreen');

    const countEl = document.getElementById('eventsCount');
    if (countEl) countEl.textContent = `${App._events.length} event${App._events.length === 1 ? 'o' : 'i'}`;

    App._renderCurrentUser();
    await App._renderEventListAsync();
  },

  // ─── NAVIGAZIONE ──────────────────────────────────────────
  openEvent(eventId) {
    window.location.href = `/evento.html?id=${eventId}`;
  },

  goToActiveRiepilogo(e) {
    e.preventDefault();
    if (App._events.length === 0) {
      Utils.toast('Nessun evento attivo', 'info');
      return;
    }
    if (App._events.length === 1) {
      window.location.href = `/riepilogo.html?event=${App._events[0].id}`;
      return;
    }
    // Se ci sono più eventi, apre il primo o mostra selezione
    window.location.href = `/riepilogo.html?event=${App._events[0].id}`;
  },

  // ─── MODAL HELPERS ────────────────────────────────────────
  openModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('open');
  },

  closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('open');
  },

  // ─── CREA EVENTO ──────────────────────────────────────────
  showCreateEvent() {
    document.getElementById('newEventTitle').value = '';
    document.getElementById('newEventDesc').value  = '';
    document.getElementById('newEventNickname').value = '';
    document.getElementById('newEventPhotoName').textContent = 'Nessuna foto';
    App._pendingPhoto = null;
    App.closeModal('modalJoinEvent');
    App.openModal('modalCreateEvent');
    setTimeout(() => document.getElementById('newEventTitle').focus(), 300);
  },

  pickEventPhoto() {
    document.getElementById('newEventPhotoInput').click();
  },

  async onEventPhotoChange(input) {
    const file = input.files[0];
    if (!file) return;
    try {
      App._pendingPhoto = await Utils.compressImage(file, 800);
      document.getElementById('newEventPhotoName').textContent = file.name;
    } catch {
      Utils.toast('Errore nel caricamento foto', 'error');
    }
  },

  async createEvent() {
    const title    = document.getElementById('newEventTitle').value.trim();
    const desc     = document.getElementById('newEventDesc').value.trim();
    const nickname = document.getElementById('newEventNickname').value.trim();

    if (!Utils.required(title, 'Titolo evento')) return;
    if (!Utils.required(nickname, 'Nickname')) return;

    const btn = document.querySelector('#modalCreateEvent .btn--primary');
    btn.disabled = true;
    btn.textContent = 'Creazione…';

    try {
      // Salva evento in locale
      const event = await DB.events.save({
        title,
        description: desc,
        photo: App._pendingPhoto,
        created_by: nickname
      });

      // Crea utente creatore
      const user = await DB.users.save({
        event_id: event.id,
        name:     nickname
      });

      // Associa device a questo utente
      DB.sessions.set(event.id, user.id, user.name);

      // Accoda per sync
      await DB.pending.add({
        type:    'create_event',
        payload: { event, user }
      });

      // Sync se online
      if (Utils.isOnline()) {
        Sync.push().catch(() => {});
      }

      App.closeModal('modalCreateEvent');
      await App.loadEvents();

      Utils.toast(`Evento "${title}" creato!`, 'success');

      // Mostra codice da condividere
      setTimeout(() => {
        App._showShareCode(event.code, event.title);
      }, 400);

    } catch (e) {
      console.error('[App] createEvent error:', e);
      Utils.toast('Errore nella creazione evento', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Crea evento';
    }
  },

  _showShareCode(code, title) {
    const msg = `Entra in "${title}" su WeGo con il codice:\n\n${code}`;
    if (confirm(`Evento creato! Codice: ${code}\n\nVuoi condividere il codice con i partecipanti?`)) {
      Utils.share({ title: 'WeGo — Unisciti all\'evento', text: msg });
    }
  },

  // ─── UNISCITI A EVENTO ────────────────────────────────────
  showJoinEvent() {
    document.getElementById('joinEventCode').value = '';
    Utils.hide('joinEventResult');
    App.closeModal('modalCreateEvent');
    App.openModal('modalJoinEvent');
    setTimeout(() => document.getElementById('joinEventCode').focus(), 300);
  },

  async joinEvent() {
    const code = document.getElementById('joinEventCode').value.trim().toUpperCase();
    if (!code) {
      Utils.toast('Inserisci il codice evento', 'error');
      return;
    }

    const btn = document.querySelector('#modalJoinEvent .btn--primary');
    btn.disabled = true;
    btn.textContent = 'Ricerca…';

    try {
      // Prima cerca in locale
      let event = await DB.events.getByCode(code);

      // Se non trovato, cerca su Supabase
      if (!event && Utils.isOnline()) {
        event = await Sync.findEventByCode(code);
        if (event) {
          // Scarica evento e utenti
          await Sync.pullEvent(event.id);
          event = await DB.events.getByCode(code);
        }
      }

      if (!event) {
        Utils.toast('Evento non trovato. Controlla il codice.', 'error');
        Utils.hide('joinEventResult');
        return;
      }

      // Carica utenti evento
      const users = await DB.users.getByEvent(event.id);

      // Mostra risultato
      const infoEl = document.getElementById('joinEventInfo');
      infoEl.innerHTML = `
        <div style="font-size:16px;font-weight:700;color:var(--text-primary);margin-bottom:4px;">${Utils.escapeHtml(event.title)}</div>
        <div style="font-size:13px;color:var(--text-muted);">${users.length} partecipant${users.length === 1 ? 'e' : 'i'}</div>
      `;

      const select = document.getElementById('joinUserSelect');
      select.innerHTML = '<option value="">— seleziona il tuo nome —</option>';
      users.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.id;
        opt.textContent = u.name;
        select.appendChild(opt);
      });

      // Salva eventId per il confirm
      select.dataset.eventId = event.id;

      Utils.show('joinEventResult');

    } catch (e) {
      console.error('[App] joinEvent error:', e);
      Utils.toast('Errore nella ricerca', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Cerca evento';
    }
  },

  async confirmJoinEvent() {
    const select  = document.getElementById('joinUserSelect');
    const userId  = select.value;
    const eventId = select.dataset.eventId;

    if (!userId) {
      Utils.toast('Seleziona il tuo nome', 'error');
      return;
    }

    const user = await DB.users.getById(userId);
    if (!user) return;

    DB.sessions.set(eventId, userId, user.name);
    App.closeModal('modalJoinEvent');
    await App.loadEvents();
    Utils.toast(`Benvenuto, ${user.name}!`, 'success');
  },

  // ─── CAMBIO UTENTE ────────────────────────────────────────
  async changeUser() {
    const sessions = DB.sessions.getAll();
    const list = document.getElementById('chooseUserList');
    list.innerHTML = '';

    for (const [eventId, session] of Object.entries(sessions)) {
      const event   = await DB.events.getById(eventId);
      const users   = await DB.users.getByEvent(eventId);
      if (!event) continue;

      const header = document.createElement('div');
      header.style.cssText = 'font-size:12px;color:var(--text-muted);font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin:16px 0 8px;';
      header.textContent = event.title;
      list.appendChild(header);

      users.forEach(u => {
        const btn = document.createElement('button');
        const idx = Utils.avatarColorIndex(u.name);
        const isActive = session.userId === u.id;
        btn.className = 'btn btn--ghost btn--full';
        btn.style.cssText = `display:flex;align-items:center;gap:10px;justify-content:flex-start;margin-bottom:6px;${isActive ? 'border-color:var(--accent-blue);color:var(--accent-blue);' : ''}`;
        btn.innerHTML = `
          <div class="avatar avatar-${idx} avatar--sm">${Utils.initials(u.name)}</div>
          <span>${Utils.escapeHtml(u.name)}</span>
          ${isActive ? '<svg style="margin-left:auto;width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
        `;
        btn.onclick = () => {
          DB.sessions.set(eventId, u.id, u.name);
          App.closeModal('modalChooseUser');
          App._renderCurrentUser();
          Utils.toast(`Ora sei ${u.name}`, 'success', 2000);
        };
        list.appendChild(btn);
      });
    }

    App.openModal('modalChooseUser');
  },

  // ─── SYNC ─────────────────────────────────────────────────
  async syncNow() {
    const btn = document.getElementById('syncBtn');
    if (btn) {
      btn.style.animation = 'spin 0.8s linear infinite';
      btn.disabled = true;
    }

    try {
      if (!Utils.isOnline()) {
        Utils.toast('Nessuna connessione internet', 'error');
        return;
      }
      await Sync.push();
      await Sync.pull();
      await App.loadEvents();
      Utils.toast('Sincronizzazione completata', 'success');
    } catch (e) {
      Utils.toast('Errore di sincronizzazione', 'error');
    } finally {
      if (btn) {
        btn.style.animation = '';
        btn.disabled = false;
      }
    }
  },

  async _syncQuiet() {
    try {
      if (!Utils.isOnline()) return;
      await Sync.push();
      await Sync.pull();
      await App.loadEvents();
    } catch (e) {
      console.warn('[App] Quiet sync failed:', e);
    }
  }
};

// Esporta globale
window.App = App;
