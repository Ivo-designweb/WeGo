# WeGo — Documento di Stato Progetto
**Versione corrente: v3.8 (v3.3 per spesa.html/spesa.js) — Aggiornato: 21 giugno 2026**

---

## 1. Descrizione del progetto

**WeGo** è una PWA (Progressive Web App) in HTML/JavaScript puro che gira su telefono (Android e iOS) e permette di condividere spese, registrare movimenti di cassa e calcolare i saldi tra un gruppo di utenti — simile a Splid ma più estesa.

**Produttore software:** Ivo Taffarel — ivotaffarel@gmail.com
**Repository GitHub:** https://github.com/Ivo-designweb/WeGo (privato)
**Deploy live:** https://wegoivo.vercel.app
**Deploy flow:** upload manuale dei file su GitHub (drag&drop su "Add file → Upload files") → Vercel rileva il push e pubblica da solo (30-90 secondi)
**Backend database:** Supabase (free tier — PostgreSQL)
**Push notifications:** Web Push (VAPID) — **lato client pronto, lato server NON ancora deployato** (vedi §11)
**Funzionamento offline:** IndexedDB locale + sincronizzazione automatica nei momenti previsti (vedi §4)

---

## 2. Stack tecnologico

| Componente | Tecnologia | Note |
|---|---|---|
| Frontend | HTML5 + JavaScript puro | Nessun framework, nessun build step |
| Stile | CSS custom con variabili | Design system dark/light, font base aumentato del 15% (v3.0) |
| Database locale | IndexedDB (`wego_db`) | Offline-first, 7 store (incluso `pending`) |
| Database remoto | Supabase (PostgreSQL) | Tabelle prefissate `sp_` |
| Sincronizzazione | REST API Supabase | Push + Pull bidirezionale, momenti precisi (vedi §4) |
| Push notifications | Web Push API (VAPID) | Client pronto; serve Edge Function Supabase non ancora deployata |
| Hosting | Vercel | HTTPS automatico, no build, deploy da GitHub |
| Service Worker | sw.js v3.8 | Cache offline, Network-First per HTML/JS/CSS con fallback cache; `/api/*` sempre escluso dalla cache |
| Mappe | Link esterno Google Maps | Coordinate GPS salvate |
| Pannello admin | admin.html v1.7 | Password verificata **lato server** (vedi §5, §11) — non più nel codice sorgente |
| Funzioni serverless | Vercel `/api/*.js` (Node, **nuovo in v3.7**) | `admin-login.js`, `owner-verify.js`, `sync-status.js` — unico modo per nascondere segreti su un sito statico |

---

## 3. Struttura file — tutto in ROOT (struttura piatta)

**IMPORTANTE:** tutti i file sono nella cartella radice del repository.
Non esistono sottocartelle `js/` o `css/`. Ogni path nei file HTML usa `/nomefile.js`.
(Nota: `admin.html` aveva ancora i path vecchi `/css/style.css` e `/js/...` — **corretto in v1.6**, prima la pagina si caricava completamente rotta, senza stile e senza funzionare.)

```
/  (root)
├── index.html          v3.8   Home: lista eventi, crea/unisciti
├── evento.html          v3.8  Pagina evento: tab Movimenti / Saldi / Partecipanti
├── spesa.html            v3.3 Registrazione / visualizzazione movimento
├── impostazioni.html    v3.8   Impostazioni: tema, metodi pagamento, dispositivo proprietario, link Admin
├── admin.html           v1.7   Pannello admin/debug — password verificata lato server + gestione sync esterni
├── sw.js                v3.8   Service Worker (CACHE_NAME: wego-v3.8) — esclude /api/* dalla cache
├── manifest.json        v3.8   PWA manifest
├── vercel.json                 Header Cache-Control must-revalidate su tutti i file
├── style.css            v1.4   Design system globale (font +15% rispetto a v1.3)
├── app.js                v2.10 Logica home: eventi, crea/unisciti, gating sync, menu tre punti
├── evento.js             v2.11 Logica pagina evento: movimenti, saldi, partecipanti, ricerca, puntino sync
├── spesa.js               v2.1 Logica form registrazione/visualizzazione movimento
├── sync.js                v1.5 Sincronizzazione bidirezionale locale ↔ Supabase + gating eventi esterni
├── supabase.js            v1.4 Client REST Supabase (tutte le entity + push subscriptions + sp_sync_status)
├── db.js                  v1.3 IndexedDB wrapper (events con gated/sync_allowed, users, expenses, photos, payments, pending, sessions)
├── utils.js               v1.2 Funzioni condivise (formatAmount, formatDateLabel, formatDateTime, applyTheme, GPS, share…)
├── payments.js            v1.0 Metodi di pagamento (lista configurabile, default + custom)
├── notifications.js      v1.1 Web Push: registrazione + salvataggio sottoscrizione su Supabase
├── api/                        Funzioni serverless Vercel (NUOVO in v3.7 — vedi §5bis)
│   ├── admin-login.js          Verifica password admin contro env var ADMIN_PASSWORD
│   ├── owner-verify.js         Verifica codice dispositivo proprietario contro env var OWNER_DEVICE_SECRET
│   └── sync-status.js          Lista/abilita/disabilita codici evento esterni (sp_sync_status)
└── icon*.png                  Icone PWA (72, 96, 128, 144, 152, 192, 384, 512 px)

supabase-function/  (NON sul sito — va deployata separatamente su Supabase, vedi §11)
├── send-push-notification/index.ts   Edge Function: invia Web Push ai partecipanti di un evento
└── NOTIFICHE-SETUP.md                Guida passo-passo al deploy
```

---

## 4. Architettura e flusso dati

```
Browser (IndexedDB locale) — OFFLINE-FIRST: il lavoro offline ha SEMPRE priorità
    │
    ├── Al caricamento pagina: legge SEMPRE da IndexedDB e mostra i dati
    │   immediatamente, indipendentemente dallo stato della connessione
    │   (vedi fix v3.0/app.js, evento.js: DB.open() in try/catch, loadEvents()
    │   chiama sempre _render() anche in caso di errore parziale)
    │
    ├── Sincronizzazione (push + pull) avviene SOLO in questi momenti:
    │     1. Avvio app / apertura evento, SE già online
    │     2. Tap sull'icona di sync (manuale)
    │     3. Dopo inserimento/modifica di un movimento o pagamento
    │     4. Ricarica manuale della pagina
    │     5. Rientro della connessione (evento 'online' del browser)
    │
    └── Ogni pull riuscito (pullEvent) aggiorna anche last_sync_at
        dell'utente di QUESTO device per QUESTO evento (vedi sotto)

IndexedDB store:
  events    → record evento (id, title, code, created_by, currency, photo, synced)
  users     → partecipanti (id, event_id, name, active, joined_at, last_sync_at, synced)
  expenses  → spese/movimenti (id, event_id, type, amount, paid_by, paid_for, participants[],
              date, location, has_photo, created_by, synced, deleted)
  photos    → foto base64 (id = "photo_"+expenseId, data) — solo locale, mai sincronizzate
  payments  → pagamenti manuali registrati (id, event_id, from_user, to_user, amount, method)
  pending   → operazioni da sincronizzare (id, type, payload, created_at, retries)
  sessions  → "chi sono io" per evento, SOLO locale (localStorage, key: eventId →
              {userId, userName}) — NON rappresenta più lo stato "connesso" (vedi sotto)

Supabase tabelle (prefisso sp_):
  sp_events, sp_users (+joined_at, +last_sync_at), sp_expenses, sp_payments (+deleted),
  sp_push_subscriptions (nuova, per Web Push)
  NB: le foto NON sono mai inviate a Supabase (restano solo sul device del proprietario)
```

### ⚠️ Concetto importante: "connesso" ≠ sessione locale
Fino a v3.0 lo stato "connesso"/"N connessi" si basava su `DB.sessions` (solo `localStorage`,
quindi visibile solo sul device dove è avvenuto il join). **Bug**: ogni device vedeva connesso
solo se stesso. **Fix**: introdotto `users.joined_at` (sincronizzato su Supabase). "Connesso" ora
= `!!user.joined_at`, vero per tutti i device. Vedi §6 per i dettagli del fix.

### 🔒 Sincronizzazione selettiva eventi esterni (NUOVO v3.7)
Dalla v3.7 non tutti gli eventi vengono sincronizzati automaticamente:

- **Dispositivo proprietario**: in Impostazioni → Avanzate, Ivo inserisce un codice segreto
  (verificato da `/api/owner-verify.js` contro la env var `OWNER_DEVICE_SECRET`, mai nel
  codice). Se attivo, `Utils.getConfig('owner_device')` è `true` su quel device.
- **Alla creazione di un evento** (`App.createEvent`): se il device NON è proprietario,
  l'evento nasce con `gated:true` e `sync_allowed:false` (vedi `db.js` → `events.save()`).
  Resta SOLO nell'IndexedDB locale: `Sync.push()` salta tutte le operazioni collegate a quel
  evento (`_isEventSyncAllowed`/`_pendingEventId`), tranne la registrazione informativa del
  codice su `sp_sync_status` (operazione `register_sync_request`, sempre eseguita).
- **Abilitazione**: da `admin.html` (sezione "Sincronizzazione eventi esterni"), Ivo vede in
  automatico i codici registrati e può abilitarli/disabilitarli con un tap, oppure inserire un
  codice ricevuto a voce/WhatsApp. La scrittura passa da `/api/sync-status.js`, che verifica la
  password admin lato server prima di toccare il database.
- **Propagazione**: ad ogni `Sync.push()`, `_refreshGatedEvents()` controlla lo stato remoto
  per ogni evento gated e aggiorna `sync_allowed` di conseguenza — appena abilitato, tutta la
  coda `pending` + i dati non sincronizzati accumulati offline (utenti, spese, pagamenti)
  vengono inviati nello stesso ciclo, senza bisogno di logica di "recupero" dedicata.
- **Disabilitazione**: blocca solo i FUTURI invii — non elimina mai dati già presenti sul server.
- **Protezione scelta**: solo a livello applicativo (non Row Level Security sul database) —
  decisione esplicita dell'utente per mantenere la cosa semplice; la anon key Supabase ha
  comunque accesso INSERT/UPDATE pubblico su tutte le tabelle, come già prima di questa modifica.
- **UI (evento.html)**: niente più banner persistente (rimosso in v3.8 perché restava visibile anche
  dopo l'abilitazione). Ora un **puntino** accanto all'icona di aggiornamento in header: assente per
  gli eventi non gated, **giallo** se in attesa, **verde** se abilitato — aggiornato silenziosamente
  ad ogni sync (manuale o automatica). Il **popup testuale** "non ancora sincronizzato" appare SOLO
  al tap manuale sull'icona di sync (`EventoApp.syncNow()`), mai sulle sync automatiche (`_syncQuiet()`,
  avvio pagina, evento online, dopo scrittura). La voce di menu "Richiedi sincronizzazione"
  (`EventoApp.shareSyncRequest()`, condivisione WhatsApp/sistema del codice) è visibile solo per
  eventi ancora in attesa, nel menu ☰ in alto.
- **Messaggio "Sincronizzato" impreciso (fix v3.8)**: sia in `evento.js` (`syncNow`) che in `app.js`
  (`syncNow`) il messaggio generico veniva mostrato anche quando l'evento/gli eventi non erano
  davvero stati inviati al server perché ancora `gated`. Corretto: ora il messaggio riflette lo
  stato reale dopo il ciclo di sync appena concluso.
- Il campo `created_by` (già esistente) non cambia: il creatore originale dell'evento resta
  sempre visibile anche dopo l'abilitazione.


### Tipi pending (coda sync)
| Tipo | Quando viene creato | Nota |
|---|---|---|
| `create_event` | Salvataggio nuovo evento (utenti iniziali in `payload.users`) | Ora marca anche gli utenti come `synced` dopo successo |
| `update_event` | Modifica di un evento esistente | **Fix v3.x**: ora chiama `markSynced()` dopo successo (prima il badge "DA SYNC" restava acceso per sempre) |
| `delete_event` | Eliminazione di un evento | |
| `create_user` | Aggiunta partecipante da evento aperto | Ora marca l'utente come `synced` dopo successo |
| `delete_user` | Eliminazione di un partecipante | |
| `clear_joined` | **Nuovo**: bottone "Scollegati" (home) | Pulisce `joined_at` sul server per l'utente che si scollega, così gli altri device lo vedono tornare "non connesso" |
| `register_sync_request` | **Nuovo v3.7**: creazione evento da device non proprietario | Registra il codice su `sp_sync_status` per la lista automatica in admin.html; NON crea l'evento sul server, sempre eseguita anche se l'evento è gated |

Le spese, i pagamenti e ora anche gli **utenti** (per `joined_at`/`last_sync_at`) si sincronizzano
direttamente via `getUnsyced()` + `_syncExpense()`/`_syncPayment()`/`_syncUser()`, senza passare
dalla coda `pending` (usano il flag `synced: false`).

---

## 5. Funzionalità implementate (stato a v3.6)

### Home (index.html / app.js)
- Lista eventi con card; **avatar proprietario a sinistra del titolo** (era a destra e copriva i tre puntini — fix: rimosso `flex:1` dal titolo che lo spingeva comunque a destra anche col nuovo ordine nel DOM)
- Menu tre punti: Modifica evento, Elimina evento, **Scollegati** (ora pulisce anche `joined_at` sul server)
- **Badge "DA SYNC" rimosso** dalla lista eventi (non era richiesto)
- Conteggio "N connessi" basato su `joined_at` sincronizzato (non più solo locale)
- Init rafforzato per l'offline: `DB.open()` non blocca il resto, `loadEvents()` mostra sempre la UI

### Evento (evento.html / evento.js)
- Tre tab: **Movimenti**, **Saldi**, **Partecipanti**
- **Testata fissa**: "Sei in credito/debito di…" + TOTALE/SPESE/PRO CAPITE restano sempre visibili durante lo scroll dei movimenti (fix: `.app-shell` con altezza vincolata, non solo `min-height`)
- **Importo credito/debito**: grassetto, verde se a credito, rosso se a debito
- **Barra di ricerca** sulla stessa riga della testata: cerca su descrizione/note/data dei movimenti, lente per eseguire, X per azzerare
- **Barra fissa in basso** (`.fab-bar`) col bottone + (30% più grande), sempre visibile
- Icona foto nei movimenti: +50% (15px, niente più sfondo a pillola)
- **Tab Saldi:** "Già pagato"/empty-state rimossi; sezione **"Pagamenti tra utenti"** (ex "Pagamenti registrati") sempre visibile, mostra "Nessuno" se non ci sono movimenti di cassa
- **Tab Partecipanti:**
  - Saldo individuale → sostituito con **"Versato"/"Incassato"**: `(spese pagate + mov. cassa in uscita) − mov. cassa in entrata`. Se negativo, mostra il valore assoluto in blu con etichetta "Incassato"
  - Riga di stato connessione su **una sola riga**: `● Connesso` + badge blu con data/ora ultima sync (es. `21 giugno 26 - 17:07`, senza parentesi, font 9.5px, mai a capo) — oppure `○ Non ancora connesso` + bottone WhatsApp "Invita" (mostrato solo se NON connesso)
  - Font di "Connesso"/"Non ancora connesso": 12.5px (-10,7% rispetto al default)
- Font generale di movimenti/partecipanti/saldi: +15% rispetto alla baseline storica

### Registrazione movimento (spesa.html / spesa.js)
- Header: freccia ← per uscire (non più "X"); bottoni **Modifica**/**Elimina** (solo in sola lettura) e **Salva** (solo in nuovo/modifica) contestuali nell'header
- **Titolo pagina**: SOLO il nome dell'evento (es. "Sardegna 26") nei casi "nuova spesa" e "sola lettura"; **"Modifica - {evento}"** solo quando si preme il bottone Modifica per un movimento esistente
- DATA + METODO su una riga compatta; campo data allargato (175px) e font ridotto per non tagliare l'anno su Chrome
- PAGA: etichetta breve inline col select
- Note + bottone Salva affiancati (note più stretta)
- Foto cliccabile → lightbox a schermo intero con bottone elimina (solo in modifica)
- **Fix scroll fantasma**: `html`/`body`/`.app-shell`/`.page-content` avevano TUTTI un'altezza minima forzata a tutto il viewport (`min-height:100dvh`), che su Chrome Android (barra indirizzi dinamica) creava scroll anche a contenuto corto. Rimossa la forzatura a ogni livello: la pagina è alta esattamente quanto il suo contenuto

### Impostazioni (impostazioni.html)
- Tema chiaro/scuro persistente, applicato senza flash
- Metodi di pagamento configurabili
- Forza aggiornamento (pulisce cache SW)
- **Nuova sezione "Avanzate"** → link al Pannello amministratore (`admin.html`)
- **NUOVO v3.7 — "Dispositivo proprietario"**: inserimento codice segreto (verificato da
  `/api/owner-verify.js`) che rende questo device "proprietario": i suoi nuovi eventi sono
  sempre sincronizzati di default, come prima della v3.7
- **Fix**: `window._swRegistration` ora viene impostato correttamente (mancava, faceva fallire in silenzio l'abilitazione delle notifiche push da questa pagina)

### Pannello Admin (admin.html) — **NUOVO ACCESSO, PRIMA IRRAGGIUNGIBILE**
- Prima non esisteva alcun link nell'app per arrivarci (solo URL diretto)
- Path CSS/JS corretti (puntavano a `/css/style.css` e `/js/...`, inesistenti: pagina completamente rotta)
- **Gate password** all'apertura: dalla v3.7 verificata da `/api/admin-login.js` contro la
  env var Vercel `ADMIN_PASSWORD` — **non più in chiaro nel codice sorgente** (prima era
  `AdminGate.PASSWORD = 'wego-admin-2026'`, solo deterrente). Bottone "Esci" per terminare la sessione
- Contiene: stato sistema (Supabase/SW), **schema SQL completo** da copiare nel Supabase SQL Editor, test diagnostici
- **NUOVO v3.7 — sezione "Sincronizzazione eventi esterni"**: lista automatica dei codici
  evento registrati (in attesa o già abilitati) + campo per abilitare manualmente un codice
  ricevuto a voce/WhatsApp. Scrittura sempre tramite `/api/sync-status.js` (password admin
  verificata lato server)

---

## 6. Fix critici applicati (storia, in ordine cronologico)

| Versione | Fix |
|---|---|
| v1.2 | `formatDateLabel()` mancante in `utils.js`: bloccava il rendering della lista movimenti |
| v2.0 | `utils.js` caricato da `js/utils.js` invece della root: path sbagliato dopo ristrutturazione |
| v2.1 | Invitati al momento della creazione evento non sincronizzati su Supabase |
| v2.3 | `riepilogo.html`/`riepilogo.js` eliminati; struttura piatta (tutto in root) |
| v2.4 | `loadRemoteConfig()` bloccava l'init con `await`; SW da Cache-First a Network-First |
| v2.5 | `users.delete`/`events.delete` aggiunti in `supabase.js`; handler `delete_user`/`delete_event` |
| v2.6→v3.0 | Riprogettazione UI spesa/evento (vedi §5), font +15% globale |
| v3.0 | **Bug avatar home**: `flex:1` sul titolo evento spingeva l'avatar a destra anche se messo prima nel DOM (per titoli corti il box del titolo si allargava comunque). Fix: rimosso `flex:1`, lasciato solo `min-width:0` |
| v3.0 | **Bug "DA SYNC" permanente**: `update_event` in `sync.js` non chiamava mai `markSynced()` dopo un push riuscito → il badge restava acceso per sempre anche dopo modifiche salvate correttamente. Stesso bug presente (e corretto) anche in `create_event`/`create_user` per gli utenti |
| v3.1-3.3 | **Scroll fantasma in spesa.html**: causa reale = `min-height:100dvh` forzato su `html`, `body`, `.app-shell` (non solo `.app-shell` come pensato inizialmente). Su Chrome Android crea scroll anche a contenuto corto. Risolto a tutti i livelli |
| v3.x | **Bug "N connessi" sempre 1**: basato su `DB.sessions`, dato locale al browser, mai sincronizzato. Introdotto `users.joined_at` (sincronizzato), self-heal automatico per utenti creati prima del fix |
| v3.x | **Notifiche push mai arrivate**: 3 bug concreti — (1) token push creato ma il salvataggio server-side era commentato nel codice (mai implementato); (2) `window._swRegistration` non impostato in `impostazioni.html`; (3) registrazione SW in `evento.html` non aspettava `serviceWorker.ready` prima di usare `pushManager`. Tutti i 3 corretti lato client; **manca ancora il deploy della Edge Function lato server** (vedi §11) |
| v3.6 | `admin.html`: path CSS/JS rotti (`/css/`, `/js/` inesistenti) + nessun accesso dall'app + nessuna password → tutti risolti |
| v3.7 | **Password admin in chiaro nel codice**: spostata su `/api/admin-login.js` + env var Vercel `ADMIN_PASSWORD`. Introdotta sincronizzazione selettiva eventi esterni (`gated`/`sync_allowed` su `events`, tabella `sp_sync_status`, gestione da `admin.html`) |
| v3.8 | **Banner sync persistente**: in `evento.html` restava visibile anche dopo l'abilitazione → rimosso, sostituito da un puntino di stato + popup solo su tap manuale. **Messaggio "Sincronizzato" impreciso**: mostrato anche se l'evento era ancora `gated` e non abilitato (sia in `evento.js` che in `app.js`) → corretto |

---

## 7. Regole di versioning

- **Versione globale** (`index.html` title + `manifest.json` + `sw.js` CACHE_NAME): incrementa di +0.1 ad ogni sessione di sviluppo che tocca file "di controllo" dell'app
- **Versioni interne file JS/HTML**: incrementano separatamente nel commento di intestazione / `<title>`
- **Eccezione**: per iterazioni rapide di debug/correzione su richiesta esplicita dell'utente, la versione **non** va aggiornata (è stato chiesto più volte in questa sessione) — usare il buon senso: se l'utente non specifica, default è aggiornare
- **Service Worker**: il CACHE_NAME deve cambiare ad ogni modifica per invalidare la cache su tutti i device
- **impostazioni.html**: aggiornare sempre la stringa "Versione X.X" nella sezione Informazioni
- **Tema**: lo script inline nell'`<head>` legge da `localStorage.getItem("wego_config")` e applica `data-theme` prima del caricamento dei CSS

---

## 8. Design system

- **Font base:** aumentato del 15% in tutta l'app a partire da v3.0 (tutti i `font-size` di `style.css` e degli stili inline nelle pagine/JS sono stati ricalcolati con incremento ≥15%, es. 12px→14px, 14px→16.5px, 16px→18.5px)
- **Eccezioni successive** (v3.6, su richiesta esplicita): testo "Connesso"/"Non ancora connesso" e badge data/ora in Partecipanti ridotti del 10-14% rispetto al nuovo standard, per evitare che vadano a capo
- **Palette dark:** bg `#0F172A`, card `#1E293B`, accent blu `#3B82F6`, green `#10B981`, red `#EF4444`
- **Palette light:** bg `#F1F5F9`, card `#FFFFFF`
- **Badge blu "ultima connessione":** `#2563EB` sfondo, testo bianco, pillola arrotondata
- **Header:** 52–56px sticky
- **Border radius:** sm 6px, md 8px, lg 10px, xl 14px
- **Avatars:** dimensioni variabili; 8 colori deterministici basati sul nome
- **Chip partecipanti:** selezionati = sfondo `var(--accent)` + testo bianco; non selezionati = grigi opacity 0.5
- **Card evento proprietario:** bordo verde, badge "✦ mio", avatar a sinistra del titolo
- **Bottoni:** sm 26px, default 34px, lg 42px, xl 48px
- **FAB (bottone +):** dentro una barra fissa in basso (`.fab-bar`), non più fluttuante isolato

---

## 9. Dipendenze tra file JS (ordine di caricamento nei tag `<script>`)

```
utils.js          ← nessuna dipendenza, primo sempre
db.js             ← dipende da utils.js
supabase.js       ← dipende da utils.js
sync.js           ← dipende da db.js, supabase.js, utils.js
notifications.js  ← dipende da utils.js, supabase.js (per il salvataggio server-side)
payments.js       ← dipende da utils.js
app.js            ← dipende da tutti (solo index.html)
evento.js         ← dipende da tutti tranne app.js
spesa.js          ← dipende da utils, db, supabase, sync, payments
```

---

## 10. Come riprendere lo sviluppo

1. Caricare questo `situazione.md` come file di progetto in Claude
2. Recuperare i file sorgenti aggiornati da GitHub (https://github.com/Ivo-designweb/WeGo) — sono la fonte di verità, più aggiornati degli eventuali allegati di progetto
3. Indicare il punto/bug/funzionalità da modificare; specificare se la versione va aggiornata o no per quella sessione
4. Claude aggiorna la versione del file HTML/JS coinvolto +0.1 e, se necessario, sw.js CACHE_NAME + manifest.json + index.html in coerenza
5. Dopo aver ricevuto i file: caricarli su GitHub (Add file → Upload files → sovrascrive automaticamente i file con lo stesso nome → Commit) → Vercel pubblica da solo

**Versione attuale:** v3.8 (v3.3 per spesa.html/spesa.js)
**Service Worker cache:** `wego-v3.8`

---

## 11. Cose da fare / lavori futuri — PRIORITÀ

### ⚠️ Da completare TU (richiede accesso al progetto Supabase/Vercel, non eseguibile da Claude)
- [ ] **Eseguire le migrazioni SQL non ancora confermate**: `sp_users.joined_at`, `sp_users.last_sync_at`, tabella `sp_push_subscriptions`, **tabella `sp_sync_status` (NUOVA v3.7)**. Schema completo sempre disponibile in Admin → Schema SQL. **Senza queste colonne/tabelle, le funzioni "connesso multi-device", "ultima sincronizzazione" e "sincronizzazione selettiva eventi esterni" falliranno silenziosamente** (la app non si rompe, ma quei campi non si aggiorneranno mai sul server)
- [ ] **NUOVO v3.7 — Impostare 2 variabili d'ambiente su Vercel** (Project → Settings → Environment Variables), poi rideployare:
  - `ADMIN_PASSWORD` → la password vera del pannello admin (sostituisce quella che prima era in chiaro nel codice)
  - `OWNER_DEVICE_SECRET` → il codice segreto da inserire UNA VOLTA in Impostazioni → Avanzate sui tuoi device, per marcarli come "proprietario" (eventi sempre sincronizzati)
- [ ] **NUOVO v3.7 — Verificare che Vercel rilevi la cartella `/api/`** come funzioni serverless dopo il primo upload (dovrebbe essere automatico, nessuna configurazione aggiuntiva in `vercel.json` richiesta per il runtime Node di default)
- [ ] **Deployare la Edge Function** `supabase-function/send-push-notification/` per far funzionare davvero le notifiche push (lato client è pronto da v3.x, ma senza questo pezzo server-side nessuna notifica arriva). Istruzioni complete in `supabase-function/NOTIFICHE-SETUP.md`: generare chiavi VAPID, `supabase secrets set`, `supabase functions deploy`, configurare 2 Database Webhook (sp_expenses + sp_payments → Insert → Edge Function)

### Idee non ancora implementate
- [ ] `offline.html` — pagina mostrata dal SW quando si è offline e la pagina non è in cache
- [ ] Archiviazione evento (flag `archived`)
- [ ] Gestione conflitti di merge (attuale: last-write-wins su `updated_at`)
- [ ] Grafici statistici per evento (torta per categoria, trend temporale)
- [ ] Esportazione riepilogo in PDF
- [ ] Supporto multi-valuta per spesa singola con conversione
- [ ] Risoluzione spese orfane dopo eliminazione partecipante
- [ ] Sync bidirezionale della foto (attualmente solo locale sul device del proprietario)
- [ ] Verificare se serve un heartbeat periodico per "connesso" oltre al semplice `joined_at` (attualmente "connesso" = ha fatto il join almeno una volta e non si è scollegato esplicitamente; non è una presenza realtime minuto-per-minuto)
- [ ] **Hardening sincronizzazione selettiva (v3.7)**: attualmente il blocco è solo a livello app (scelta esplicita dell'utente, per semplicità). Se in futuro servisse una protezione vincolante anche lato database, si può attivare Row Level Security su `sp_events` con una policy che richiede la presenza del codice in `sp_sync_status` con `enabled=true` prima di un INSERT — già predisposto un commento nello schema SQL (`supabase.js`)

---

## 12. Note per Claude su questa sessione di sviluppo

- L'utente lavora **da mobile** (Chrome Android), testa modifiche reali sul deploy live, e fa debug iterativo: a volte segnala un sintomo ("scrolla ancora", "appare ancora a destra") che richiede di **verificare il codice riga per riga** prima di concludere che sia un problema di deploy — più volte in questa sessione un bug "rimasto" si è rivelato un secondo problema distinto non ancora coperto dal fix precedente (es. lo scroll aveva 2 cause sovrapposte; l'avatar aveva una causa CSS diversa da quella inizialmente sospettata)
- Quando l'utente dice "non occorre aggiornare la versione" è per quella specifica sessione/richiesta di debug rapido, non una regola permanente
- L'utente preferisce che si chiedano chiarimenti su ambiguità di business logic (es. formula saldi/contributi) PRIMA di implementare, con esempi numerici concreti se possibile
- Schema SQL sempre mantenuto retrocompatibile con `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, mai modifiche distruttive
