// ═══════════════════════════════════════════════════════════════
// WeGo — app.js v2.12
// Logica principale pagina Home (index.html)
// v2.12: card evento — avatar mostra il CREATORE invece dell'identità
//        locale dell'utente; classe ev-card--linked per gli eventi non
//        creati da me (sfondo arancione, vedi index.html)
// v2.11: messaggio sync aggregato aggiornato (richiede autorizzazione)
// v2.10: syncNow() non dichiara più "Sincronizzato" se restano eventi
//        gated non abilitati (vedi sotto)
// v2.9:  sincronizzazione selettiva per eventi esterni — vedi createEvent()
//        e _eventCardHtml() per il badge "in attesa di sincronizzazione"
// ═══════════════════════════════════════════════════════════════

const App = {

  // ─── STATO ────────────────────────────────────────────────
  _events:       [],
  _pendingPhoto: null,
  _pendingEditPhoto: null,   // foto nuova per modifica evento (null = invariata)
  _editingEventId: null,
  _invitees:     [],   // lista nomi partecipanti aggiuntivi nel modal crea evento

  // ─── INIT ─────────────────────────────────────────────────
  async init() {
    console.log('[App] WeGo v2.12 init');

    // Tema: già applicato dall'inline script nell'<head>, ma ripetiamo
    // qui per sicurezza nel caso in cui lo script inline non sia ancora eseguito
    Utils.applyTheme(Utils.getConfig('theme', 'dark'));

    // loadRemoteConfig gira in background: non blocca il caricamento dei dati locali.
    // I dati (spese, eventi) sono in IndexedDB e devono essere disponibili subito.
    Utils.loadRemoteConfig().catch(() => {});

    await App._registerSW();

    // Apertura IndexedDB: priorità assoluta è mostrare i dati locali (offline-first).
    // Se per qualunque motivo l'apertura fallisce, non blocchiamo tutto il resto
    // dell'init: mostriamo comunque la UI (anche se vuota) invece di restare
    // bloccati su "Caricamento…".
    try {
      await DB.open();
    } catch (e) {
      console.error('[App] DB.open failed:', e);
      Utils.toast('Errore database locale', 'error');
    }

    // ── Redirect automatico all'ultimo evento aperto ──────
    const lastEventId = localStorage.getItem('wego_last_event_id');
    if (lastEventId) {
      // Verifica che l'evento esista ancora localmente
      try {
        const ev = await DB.events.getById(lastEventId);
        if (ev) {
          window.location.href = `/evento.html?id=${lastEventId}`;
          return; // interrompi init, stiamo navigando via
        } else {
          localStorage.removeItem('wego_last_event_id');
        }
      } catch(e) {
        localStorage.removeItem('wego_last_event_id');
      }
    }

    // Carica SEMPRE gli eventi dal database locale, indipendentemente dallo
    // stato della connessione: il lavoro offline ha priorità. La sincronizzazione
    // con il server avviene solo DOPO, e solo se si è online (vedi sotto).
    await App.loadEvents();
    App._initNetworkMonitor();

    if (Utils.isOnline()) {
      App._syncQuiet();
    }

    if (typeof Notifications !== 'undefined') {
      Notifications.init().catch(() => {});
    }

    navigator.serviceWorker?.addEventListener('message', (e) => {
      if (e.data?.type === 'NOTIFICATION_CLICK' || e.data?.type === 'BACKGROUND_SYNC') {
        App._syncQuiet();
      }
    });

    App._checkSWUpdate();
  },

  // ─── SERVICE WORKER ───────────────────────────────────────
  async _registerSW() {
    if (!('serviceWorker' in navigator)) return;
    try {
      await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      // Attende che il SW sia ATTIVO (non solo "installing"): pushManager
      // richiede una registration con worker attivo, altrimenti la
      // sottoscrizione alle notifiche push fallisce silenziosamente.
      window._swRegistration = await navigator.serviceWorker.ready;
      console.log('[SW] Pronto:', window._swRegistration.scope);
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
          Utils.toast('Aggiornamento disponibile — ricarica la pagina', 'info', 6000);
        }
      });
    });
  },

  // ─── NETWORK MONITOR ──────────────────────────────────────
  _initNetworkMonitor() {
    const dot = document.getElementById('connDot');
    const update = () => {
      const online = Utils.isOnline();
      if (dot) dot.style.background = online ? 'var(--green)' : 'var(--red)';
      if (online) App._syncQuiet();
    };
    window.addEventListener('online',  update);
    window.addEventListener('offline', update);
    update();
  },

  // ─── LOAD EVENTS ──────────────────────────────────────────
  async loadEvents() {
    try {
      App._events = await DB.events.getAll();
      App._events.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    } catch (e) {
      console.error('[App] loadEvents error:', e);
      Utils.toast('Errore nel caricamento degli eventi', 'error');
      App._events = App._events || [];
    }
    // Esegue SEMPRE il render, anche in caso di errore nel passo precedente:
    // mostrare la lista (anche se vuota/parziale) è sempre meglio di restare
    // bloccati sulla schermata di caricamento.
    try {
      await App._render();
      document.addEventListener('click', App.closeAllCardMenus, { once: false });
    } catch (e) {
      console.error('[App] render error:', e);
    }
  },

  // Elimina evento dal menu tre punti della card
  async confirmDeleteFromMenu(eventId, eventTitle, e) {
    e.stopPropagation();
    App.closeAllCardMenus();
    if (!confirm(`Eliminare l'evento "${eventTitle}"?\n\nQuesta azione eliminerà TUTTI i dati (spese, partecipanti) dal server. Non è reversibile.`)) return;
    try {
      await DB.events.delete(eventId);
      DB.sessions.remove(eventId);
      await DB.pending.add({ type: 'delete_event', payload: { eventId } });
      if (Utils.isOnline()) Sync.push().catch(() => {});
      Utils.toast('Evento eliminato', 'success');
      await App.loadEvents();
    } catch (err) {
      Utils.toast('Errore eliminazione: ' + err.message, 'error');
    }
  },

  // ─── RENDER ───────────────────────────────────────────────
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

  async _eventCardHtml(ev) {
    const session  = DB.sessions.get(ev.id);
    const userName = session?.userName;

    // Determina se l'utente corrente è il creatore (proprietario) dell'evento
    const isOwner = ev.created_by && userName &&
      ev.created_by.toLowerCase() === userName.toLowerCase();

    // Carica utenti per contatori
    let users = [];
    let connectedCount = 0;
    try {
      users = await DB.users.getByEvent(ev.id);
      // "Connessi" = utenti che hanno effettuato il join almeno una volta
      // (joined_at sincronizzato dal server, visibile da TUTTI i device —
      // non solo dal device su cui è avvenuto il join).
      connectedCount = users.filter(u => !!u.joined_at).length;
    } catch(e) {}

    const totalUsers = users.length;

    // Foto thumb
    const thumbHtml = ev.photo
      ? `<img src="${ev.photo}" alt="" />`
      : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
           <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
           <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
         </svg>`;

    // Avatar piccoli
    const avatarsHtml = users.slice(0, 4).map(u => {
      const idx = Utils.avatarColorIndex(u.name);
      return `<div class="avatar avatar-${idx}" title="${Utils.escapeHtml(u.name)}">${Utils.initials(u.name)}</div>`;
    }).join('');

    // Badge proprietario
    const ownerBadge = isOwner
      ? `<span style="font-size:10.5px;font-weight:700;color:var(--green);background:rgba(16,185,129,0.12);padding:1px 6px;border-radius:999px;letter-spacing:0.2px;">✦ mio</span>`
      : '';

    // Badge sincronizzazione in attesa (evento "gated" non ancora abilitato)
    const pendingSyncBadge = (ev.gated && !ev.sync_allowed)
      ? `<span class="ev-badge-amber" title="Resta solo su questo telefono finché non viene abilitata la sincronizzazione">In attesa di sync</span>`
      : '';

    // Avatar utente corrente: più grande se proprietario
    // Mostra l'iniziale del CREATORE dell'evento (non la propria identità in
    // quell'evento) — per gli eventi creati da me coincide comunque con la
    // mia, per quelli collegati identifica subito chi l'ha creato.
    const creatorName = ev.created_by || userName || '';
    const creatorIdx  = creatorName ? Utils.avatarColorIndex(creatorName) : 0;
    const userAvatarHtml = creatorName
      ? `<div class="avatar avatar-${creatorIdx} ${isOwner ? 'ev-card__avatar--owner' : 'avatar--sm'}" style="flex-shrink:0;" title="${isOwner ? 'Sei tu' : 'Creato da ' + Utils.escapeHtml(creatorName)}">${Utils.initials(creatorName)}</div>`
      : '';

    return `
    <div class="ev-card-wrap">
    <div class="ev-card ${isOwner ? 'ev-card--owned' : 'ev-card--linked'}" onclick="App.openEvent('${ev.id}')">
      <div class="ev-card__top">
        <div class="ev-card__thumb">${thumbHtml}</div>
        <div class="ev-card__info">
          <div style="display:flex;align-items:center;gap:6px;">
            <div class="ev-card__title" style="margin-bottom:0;min-width:0;">${Utils.escapeHtml(ev.title)}</div>
            ${userAvatarHtml}
          </div>
          <div class="ev-card__meta" style="margin-top:3px;">
            <span class="ev-code">${ev.code}</span>
            ${ownerBadge}
            ${pendingSyncBadge}
            <span class="ev-meta-txt">· ${Utils.timeAgo(ev.updated_at)}</span>
          </div>
        </div>
      </div>
      <div class="ev-card__bottom">
        <div class="ev-stat">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
          </svg>
          <span class="ev-stat__val">${totalUsers}</span> partecipanti
        </div>
        <div class="ev-stat" style="margin-left:12px;">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          <span class="ev-stat__val">${connectedCount}</span> connessi
        </div>
        <div class="ev-avatars">${avatarsHtml}</div>
        <button
          onclick="App.leaveEvent('${ev.id}','${Utils.escapeHtml(ev.title).replace(/'/g,"\\'")}',event)"
          style="margin-left:8px;background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:11.5px;padding:2px 4px;border-radius:4px;opacity:0.65;"
          title="Scollegati dall'evento">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- Menu tre punti -->
    <button class="ev-card__menu-btn" onclick="App.toggleCardMenu('${ev.id}',event)" title="Opzioni evento">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
      </svg>
    </button>
    <div class="ev-ctx-menu" data-eid="${ev.id}">
      <button class="ev-ctx-item" onclick="App.showEditEvent('${ev.id}',event)" ${!isOwner ? 'disabled' : ''}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
        Modifica evento
        ${!isOwner ? '<span style="font-size:10.5px;color:var(--text-muted);margin-left:auto;">(solo creatore)</span>' : ''}
      </button>
      <div class="ev-ctx-divider"></div>
      <button class="ev-ctx-item danger" onclick="App.confirmDeleteFromMenu('${ev.id}','${Utils.escapeHtml(ev.title).replace(/'/g,"\\'")}',event)" ${!isOwner ? 'disabled' : ''}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
          <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
        </svg>
        Elimina evento
        ${!isOwner ? '<span style="font-size:10.5px;color:var(--text-muted);margin-left:auto;">(solo creatore)</span>' : ''}
      </button>
    </div>
    </div>`;
  },

  // ─── NAVIGAZIONE ──────────────────────────────────────────
  openEvent(eventId) {
    localStorage.setItem('wego_last_event_id', eventId);
    window.location.href = `/evento.html?id=${eventId}`;
  },

  // ─── SCOLLEGATI DA EVENTO ─────────────────────────────────
  async leaveEvent(eventId, eventTitle, e) {
    e.stopPropagation(); // non aprire l'evento
    if (!confirm(
      `Scollegarsi da "${eventTitle}"?\n\n` +
      `L'evento verrà rimosso da questo dispositivo. Potrai riunirti in futuro con il codice.\n\n` +
      `I dati (spese, pagamenti) rimangono su Supabase.`
    )) return;

    try {
      // 0. Identifica l'utente di QUESTO device su questo evento, prima di
      // rimuovere la sessione: serve per pulire il suo stato "connesso"
      // anche sul server (altrimenti gli altri device continuerebbero a
      // vederlo come connesso anche dopo che si è scollegato).
      const session  = DB.sessions.get(eventId);
      const myUserId = session?.userId || null;
      const myUserSnapshot = myUserId ? await DB.users.getById(myUserId) : null;

      // 1. Rimuove sessione locale
      DB.sessions.remove(eventId);

      // 2. Rimuove tutti i dati locali (hard delete: non propaga su Supabase)
      const users = await DB.users.getByEvent(eventId);
      for (const u of users) await DB.users.delete(u.id);

      const expenses = await DB.expenses.getByEvent(eventId);
      for (const ex of expenses) {
        await DB.photos.delete(ex.id);
        await DB.expenses.hardDelete(ex.id);
      }

      const payments = await DB.payments.getByEvent(eventId);
      for (const p of payments) await DB.payments.delete(p.id);

      // 3. Rimuove l'evento (hard delete locale)
      await DB.events.delete(eventId);

      if (localStorage.getItem('wego_last_event_id') === eventId) {
        localStorage.removeItem('wego_last_event_id');
      }

      // 4. Pulisce lo stato "connesso" sul server per questo utente
      // specifico (il record locale è già stato eliminato sopra, quindi
      // qui usiamo solo lo snapshot preso all'inizio).
      if (myUserSnapshot) {
        const clearedUser = { ...myUserSnapshot, joined_at: null };
        try {
          if (Utils.isOnline()) {
            await SupabaseClient.users.update(clearedUser);
          } else {
            await DB.pending.add({ type: 'clear_joined', payload: { user: clearedUser } });
          }
        } catch (err2) {
          // Best-effort: se il PATCH diretto fallisce, accoda per ritentare
          await DB.pending.add({ type: 'clear_joined', payload: { user: clearedUser } }).catch(() => {});
        }
      }

      Utils.toast('Scollegato dall\'evento', 'success');
      await App.loadEvents();
    } catch (err) {
      console.error('[App] leaveEvent error:', err);
      Utils.toast('Errore nello scollegamento', 'error');
    }
  },

  // ─── MENU TRE PUNTI SU CARD EVENTO ────────────────────────
  toggleCardMenu(eventId, e) {
    e.stopPropagation();
    // Chiudi tutti i menu aperti
    document.querySelectorAll('.ev-ctx-menu.open').forEach(m => {
      if (m.dataset.eid !== eventId) m.classList.remove('open');
    });
    const menu = document.querySelector(`.ev-ctx-menu[data-eid="${eventId}"]`);
    if (menu) menu.classList.toggle('open');
  },

  closeAllCardMenus() {
    document.querySelectorAll('.ev-ctx-menu.open').forEach(m => m.classList.remove('open'));
  },

  // ─── MODIFICA EVENTO ───────────────────────────────────────
  async showEditEvent(eventId, e) {
    e.stopPropagation();
    App.closeAllCardMenus();
    const ev = await DB.events.getById(eventId);
    if (!ev) { Utils.toast('Evento non trovato', 'error'); return; }

    App._editingEventId = eventId;
    App._pendingEditPhoto = null;

    document.getElementById('editEventTitle').value = ev.title || '';
    document.getElementById('editEventDesc').value  = ev.description || '';

    // Mostra foto attuale se presente
    const photoName   = document.getElementById('editEventPhotoName');
    const photoPreview = document.getElementById('editEventPhotoPreview');
    const photoImg    = document.getElementById('editEventPhotoImg');
    if (ev.photo) {
      photoName.textContent = 'Foto attuale';
      photoImg.src = ev.photo;
      photoPreview.style.display = '';
    } else {
      photoName.textContent = 'Nessuna';
      photoPreview.style.display = 'none';
      photoImg.src = '';
    }

    App.openModal('modalEditEvent');
  },

  pickEditEventPhoto() {
    document.getElementById('editEventPhotoInput').click();
  },

  async onEditEventPhotoChange(input) {
    const file = input.files[0];
    if (!file) return;
    try {
      const compressed = await Utils.compressImage(file, 1200);
      App._pendingEditPhoto = compressed;
      const img  = document.getElementById('editEventPhotoImg');
      const name = document.getElementById('editEventPhotoName');
      const prev = document.getElementById('editEventPhotoPreview');
      img.src = compressed;
      prev.style.display = '';
      name.textContent = file.name;
    } catch { Utils.toast('Errore caricamento foto', 'error'); }
  },

  clearEditEventPhoto() {
    App._pendingEditPhoto = '';  // stringa vuota = rimuovi foto
    document.getElementById('editEventPhotoImg').src = '';
    document.getElementById('editEventPhotoPreview').style.display = 'none';
    document.getElementById('editEventPhotoName').textContent = 'Nessuna';
  },

  async saveEditEvent() {
    const title = document.getElementById('editEventTitle').value.trim();
    const desc  = document.getElementById('editEventDesc').value.trim();
    if (!Utils.required(title, 'Titolo evento')) return;

    const btn = document.querySelector('#modalEditEvent .btn--primary');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvataggio…'; }

    try {
      const ev = await DB.events.getById(App._editingEventId);
      if (!ev) throw new Error('Evento non trovato');

      ev.title = title;
      ev.description = desc;
      if (App._pendingEditPhoto !== null) {
        ev.photo = App._pendingEditPhoto || null;  // '' → null (rimozione)
      }
      ev.synced = false;
      ev.updated_at = Utils.now();
      await DB.events.save(ev);

      await DB.pending.add({ type: 'update_event', payload: { event: ev } });
      if (Utils.isOnline()) Sync.push().catch(() => {});

      App.closeModal('modalEditEvent');
      Utils.toast('Evento aggiornato', 'success');
      await App.loadEvents();
    } catch (err) {
      Utils.toast('Errore salvataggio: ' + err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Salva modifiche'; }
    }
  },

  changeUser() {
    Utils.toast('Apri un evento per cambiare utente', 'info');
  },

  // ─── MODAL HELPERS ────────────────────────────────────────
  openModal(id) {
    document.getElementById(id)?.classList.add('open');
  },
  closeModal(id) {
    document.getElementById(id)?.classList.remove('open');
  },

  // ─── CREA EVENTO ──────────────────────────────────────────
  showCreateEvent() {
    document.getElementById('newEventTitle').value    = '';
    document.getElementById('newEventDesc').value     = '';
    document.getElementById('newEventPhotoName').textContent = 'Nessuna';
    document.getElementById('inviteNewName').value    = '';
    App._pendingPhoto = null;

    // Precompila nickname: prima da impostazioni (default_nickname), poi da ultimo uso (nickname)
    const savedNick = Utils.getConfig('default_nickname', '') || Utils.getConfig('nickname', '');
    document.getElementById('newEventNickname').value = savedNick;

    // Inizializza lista invitati
    App._invitees = [];
    App._renderInviteList();

    App.openModal('modalCreateEvent');
    setTimeout(() => document.getElementById('newEventTitle').focus(), 300);
  },

  // ── Gestione lista invitati ──────────────────────────────
  addInvitee() {
    const input = document.getElementById('inviteNewName');
    const name  = input.value.trim();
    if (!name) return;

    // Evita duplicati (case-insensitive)
    const nickname = document.getElementById('newEventNickname').value.trim();
    const allNames = [nickname, ...App._invitees].map(n => n.toLowerCase());
    if (allNames.includes(name.toLowerCase())) {
      Utils.toast('Nome già presente', 'error');
      return;
    }

    App._invitees.push(name);
    input.value = '';
    App._renderInviteList();
    input.focus();
  },

  removeInvitee(idx) {
    App._invitees.splice(idx, 1);
    App._renderInviteList();
  },

  _renderInviteList() {
    const container = document.getElementById('inviteList');
    if (!container) return;

    const nickname = document.getElementById('newEventNickname').value.trim() || '(tu)';
    const allPeople = [{ name: nickname, isCreator: true }, ...App._invitees.map(n => ({ name: n, isCreator: false }))];

    container.innerHTML = allPeople.map((p, i) => `
      <div class="invite-item">
        <div class="invite-item__name">${Utils.escapeHtml(p.name)}</div>
        ${p.isCreator ? `<span class="invite-item__badge">Tu (creatore)</span>` : `
          <button class="btn btn--icon" onclick="App.removeInvitee(${i - 1})" title="Rimuovi"
            style="width:22px;height:22px;color:var(--text-muted);">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        `}
        <button class="invite-item__share" onclick="App.shareViaWhatsApp('${Utils.escapeHtml(p.name).replace(/'/g,"\\'")}', null)"
          title="Condividi via WhatsApp">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
        </button>
      </div>
    `).join('');
  },

  // Aggiorna il nome del creatore nella lista quando cambia il campo nickname
  _syncCreatorInList() {
    App._renderInviteList();
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

    if (!Utils.required(title,    'Titolo evento')) return;
    if (!Utils.required(nickname, 'Nickname'))      return;

    const btn = document.querySelector('#modalCreateEvent .btn--primary');
    btn.disabled    = true;
    btn.textContent = 'Creazione…';

    try {
      // ── SINCRONIZZAZIONE SELETTIVA EVENTI ESTERNI ──────────
      // Se questo device NON ha il codice "dispositivo proprietario"
      // configurato (Impostazioni → Avanzate), l'evento nasce "gated":
      // resta solo locale finché un admin non abilita il suo codice da
      // admin.html. Il device proprietario non cambia comportamento:
      // sincronizzazione automatica come sempre.
      const isOwnerDevice = Utils.getConfig('owner_device', false) === true;

      const event = await DB.events.save({
        title,
        description: desc,
        photo:       App._pendingPhoto,
        created_by:  nickname,
        gated:       !isOwnerDevice
      });

      // Crea utente creatore (joined_at = ora: sta usando l'app in questo momento)
      const creator = await DB.users.save({ event_id: event.id, name: nickname, joined_at: Utils.now() });
      DB.sessions.set(event.id, creator.id, creator.name);

      // Crea gli utenti aggiuntivi (invitati). Vengono raccolti insieme al
      // creatore nello stesso pending op 'create_event' (vedi sotto) invece
      // che in pending separati: così la sincronizzazione li crea tutti in
      // ordine garantito, dopo che l'evento esiste su Supabase. Prima questi
      // utenti restavano solo nel database locale del creatore e non
      // venivano mai inviati a Supabase: un altro device che si univa con
      // il codice vedeva quindi solo il creatore.
      const inviteeUsers = [];
      for (const invName of App._invitees) {
        const invitee = await DB.users.save({ event_id: event.id, name: invName });
        inviteeUsers.push(invitee);
      }

      await DB.pending.add({
        type: 'create_event',
        payload: { event, user: creator, users: [creator, ...inviteeUsers] }
      });

      // Evento gated: registra anche il codice su sp_sync_status, così
      // admin.html lo mostra nella lista "in attesa" anche prima che tu
      // lo segnali manualmente. Operazione separata e sempre eseguita
      // (vedi Sync._pendingEventId), non blocca mai la creazione locale.
      if (event.gated) {
        await DB.pending.add({
          type: 'register_sync_request',
          payload: { code: event.code, title: event.title, createdBy: nickname }
        });
      }

      if (Utils.isOnline()) Sync.push().catch(() => {});

      // Salva nickname per riutilizzo futuro (sia con la chiave usata da impostazioni che quella legacy)
      Utils.setConfig('default_nickname', nickname);
      Utils.setConfig('nickname', nickname);

      App.closeModal('modalCreateEvent');

      // Salva come ultimo evento e naviga direttamente
      localStorage.setItem('wego_last_event_id', event.id);

      if (event.gated) {
        Utils.toast(`Evento "${title}" creato — resterà solo su questo telefono finché non viene abilitata la sincronizzazione.`, 'info', 5000);
        setTimeout(() => {
          App._showShareCode(event.code, event.title, event.id, true);
        }, 400);
      } else {
        Utils.toast(`Evento "${title}" creato!`, 'success');
        // Mostra codice poi naviga
        setTimeout(() => {
          App._showShareCode(event.code, event.title, event.id);
        }, 400);
      }

    } catch (e) {
      console.error('[App] createEvent error:', e);
      Utils.toast('Errore nella creazione evento', 'error');
    } finally {
      btn.disabled    = false;
      btn.textContent = 'Crea evento';
    }
  },

  _showShareCode(code, title, eventId, gated = false) {
    const msg = gated
      ? `Entra in "${title}" su WeGo!\n\nCodice: ${code}\n\nApri WeGo e tocca "Unisciti a un evento".\n\n(Nota: questo evento non è ancora sincronizzato sul server — funziona solo tra device che hanno già il codice)`
      : `Entra in "${title}" su WeGo!\n\nCodice: ${code}\n\nApri WeGo e tocca "Unisciti a un evento".`;
    const confirmMsg = gated
      ? `Evento creato! ✅\n\nCodice: ${code}\n\nResterà solo su questo telefono finché non abiliti la sincronizzazione (vedi Impostazioni) o me lo segnali. Vuoi condividere comunque il codice ora?`
      : `Evento creato! ✅\n\nCodice: ${code}\n\nVuoi condividere il codice ora?`;
    if (confirm(confirmMsg)) {
      if (navigator.share) {
        navigator.share({ title: 'WeGo — ' + title, text: msg }).catch(() => {});
      } else {
        Utils.copyToClipboard(code);
      }
    }
    // Naviga all'evento
    if (eventId) {
      setTimeout(() => { window.location.href = `/evento.html?id=${eventId}`; }, 600);
    }
  },

  // ─── CONDIVIDI VIA WHATSAPP ───────────────────────────────
  shareViaWhatsApp(personName, eventCode) {
    // Se non abbiamo ancora il codice (siamo nel modal pre-creazione), usiamo solo il messaggio generico
    if (!eventCode) {
      // Cerca se c'è già un evento in corso (dopo la creazione)
      const lastId = localStorage.getItem('wego_last_event_id');
      if (lastId) {
        DB.events.getById(lastId).then(ev => {
          if (ev) App._sendWhatsApp(personName, ev.code, ev.title);
        });
      } else {
        Utils.toast('Crea prima l\'evento per ottenere il codice', 'info');
      }
      return;
    }
    App._sendWhatsApp(personName, eventCode, '');
  },

  _sendWhatsApp(personName, code, title) {
    const msg = title
      ? `Ciao ${personName}! Ti invito su WeGo per "${title}".\n\nCodice: *${code}*\n\nApri WeGo e tocca "Unisciti a un evento".`
      : `Ciao ${personName}! Ti invito su WeGo.\n\nCodice: *${code}*\n\nApri WeGo e tocca "Unisciti a un evento".`;
    const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  },

  // Metodo pubblico per condividere da card evento (dopo creazione)
  shareEventToWhatsApp(eventId, personName) {
    DB.events.getById(eventId).then(ev => {
      if (ev) App._sendWhatsApp(personName, ev.code, ev.title);
    });
  },

  // ─── UNISCITI ─────────────────────────────────────────────
  showJoinEvent() {
    document.getElementById('joinEventCode').value = '';
    document.getElementById('joinEventResult').classList.add('hidden');
    App.openModal('modalJoinEvent');
    setTimeout(() => document.getElementById('joinEventCode').focus(), 300);
  },

  async joinEvent() {
    const code = document.getElementById('joinEventCode').value.trim().toUpperCase();
    if (!code) { Utils.toast('Inserisci il codice evento', 'error'); return; }

    const btn = document.querySelector('#modalJoinEvent .btn--primary');
    btn.disabled    = true;
    btn.textContent = 'Ricerca…';

    try {
      let event = null;

      // Cerca in locale
      const localEvents = await DB.events.getAll();
      event = localEvents.find(e => e.code === code);

      // Cerca su Supabase se non trovato localmente
      if (!event && Utils.isOnline()) {
        if (!SupabaseClient.isConfigured()) {
          Utils.toast('Supabase non configurato — impossibile cercare online', 'error');
        } else {
          try {
            // Cerca evento per codice
            const remoteEvent = await SupabaseClient.events.findByCode(code);
            if (remoteEvent) {
              event = await DB.events.save({ ...remoteEvent, synced: true });
              // Scarica anche gli utenti dell'evento
              const remoteUsers = await SupabaseClient.users.getByEvent(remoteEvent.id);
              if (Array.isArray(remoteUsers)) {
                for (const u of remoteUsers) await DB.users.save({ ...u, synced: true });
              }
            }
          } catch(e) {
            console.warn('[App] joinEvent Supabase error:', e);
            Utils.toast('Errore connessione Supabase: ' + e.message, 'error');
          }
        }
      }

      if (!event) {
        Utils.toast('Evento non trovato', 'error');
        return;
      }

      // Mostra info evento e selezione utente
      const users = await DB.users.getByEvent(event.id);
      const infoEl = document.getElementById('joinEventInfo');
      infoEl.innerHTML = `
        <div style="font-size:16.5px;font-weight:700;color:var(--text-primary);margin-bottom:4px;">${Utils.escapeHtml(event.title)}</div>
        <div style="font-size:13px;color:var(--text-muted);">${users.length} partecipanti · Codice: ${event.code}</div>`;

      const select = document.getElementById('joinUserSelect');
      select.innerHTML = `<option value="">— seleziona —</option>` +
        users.map(u => `<option value="${u.id}">${Utils.escapeHtml(u.name)}</option>`).join('');

      // Salva evento per il confirm
      App._joiningEvent = event;
      document.getElementById('joinEventResult').classList.remove('hidden');

    } catch (e) {
      console.error('[App] joinEvent error:', e);
      Utils.toast('Errore nella ricerca', 'error');
    } finally {
      btn.disabled    = false;
      btn.textContent = 'Cerca evento';
    }
  },

  async confirmJoin() {
    const select  = document.getElementById('joinUserSelect');
    const userId  = select.value;
    const userName = select.options[select.selectedIndex]?.text;

    if (!userId) { Utils.toast('Seleziona chi sei', 'error'); return; }

    const event = App._joiningEvent;
    DB.sessions.set(event.id, userId, userName);
    localStorage.setItem('wego_last_event_id', event.id);

    // Segna il join anche sul record utente (sincronizzato sul server):
    // senza questo, solo questo device sa che ha fatto il join, e gli
    // altri device continuano a vederlo come "non connesso".
    try {
      const userRec = await DB.users.getById(userId);
      if (userRec && !userRec.joined_at) {
        userRec.joined_at = Utils.now();
        userRec.synced    = false;
        await DB.users.save(userRec);
        if (Utils.isOnline()) Sync.push().catch(() => {});
      }
    } catch (e) {
      console.warn('[App] Impossibile salvare joined_at:', e.message);
    }

    App.closeModal('modalJoinEvent');
    Utils.toast(`Benvenuto, ${userName}!`, 'success');

    setTimeout(() => { window.location.href = `/evento.html?id=${event.id}`; }, 400);
  },

  // ─── SYNC ─────────────────────────────────────────────────
  async syncNow() {
    const btn = document.getElementById('syncBtn');
    if (btn) btn.style.animation = 'spin 0.8s linear infinite';
    try {
      if (!Utils.isOnline()) { Utils.toast('Nessuna connessione', 'error'); return; }
      await Sync.push();
      await Sync.pull();
      await App.loadEvents();

      // Come in evento.js: non diciamo "Sincronizzato" se almeno uno degli
      // eventi presenti su questo device è ancora "gated" e non abilitato
      // — altrimenti il messaggio sarebbe impreciso (niente è stato
      // davvero inviato al server per quell'evento).
      let pendingCount = 0;
      try {
        const allEvents = await DB.events.getAll();
        pendingCount = allEvents.filter(e => e.gated && !e.sync_allowed).length;
      } catch (e) {}

      if (pendingCount > 0) {
        Utils.toast(
          pendingCount === 1
            ? '1 evento non è sincronizzato: richiede l\'autorizzazione dell\'amministratore.'
            : `${pendingCount} eventi non sono sincronizzati: richiedono l'autorizzazione dell'amministratore.`,
          'info', 3000
        );
      } else {
        Utils.toast('Sincronizzato', 'success', 2000);
      }
    } catch (e) {
      Utils.toast('Errore sync', 'error');
    } finally {
      if (btn) btn.style.animation = '';
    }
  },

  async _syncQuiet() {
    try {
      await Sync.push();
      await Sync.pull();
      await App.loadEvents();
    } catch (e) {
      console.warn('[App] Quiet sync failed:', e);
    }
  }
};

window.App = App;
