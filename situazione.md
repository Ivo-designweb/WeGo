# WeGo — Documento di Stato Progetto
**Versione corrente: v4.7 (v3.5 per spesa.html/spesa.js) — Aggiornato: 25 giugno 2026**

---

## 1. Descrizione del progetto

**WeGo** è una PWA (Progressive Web App) in HTML/JavaScript puro che gira su telefono (Android e iOS) e permette di condividere spese, registrare movimenti di cassa e calcolare i saldi tra un gruppo di utenti — simile a Splid ma più estesa.

**Produttore software:** Ivo Taffarel — ivotaffarel@gmail.com
**Repository GitHub:** https://github.com/Ivo-designweb/WeGo (privato)
**Deploy live:** https://wegoivo.vercel.app
**Deploy flow:** upload manuale dei file su GitHub (drag&drop su "Add file → Upload files") → Vercel rileva il push e pubblica da solo (30-90 secondi)
**Backend database:** Supabase (free tier — PostgreSQL)
**Push notifications:** Web Push (VAPID) — **lato client e lato server completati e deployati** (Edge Function `send-push-notification` pubblicata, Database Webhook su sp_expenses/sp_payments collegati, chiavi VAPID configurate). Vedi §6/§11 per i fix applicati durante l'attivazione (mismatch chiave VAPID, webhook con errore `supabase_functions`).
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
| Push notifications | Web Push API (VAPID) | Client + Edge Function `send-push-notification` deployata e funzionante (v4.0) |
| Hosting | Vercel | HTTPS automatico, no build, deploy da GitHub |
| Service Worker | sw.js v4.3 | Cache offline, Network-First per HTML/JS/CSS con fallback cache; `/api/*` sempre escluso dalla cache |
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
├── index.html          v4.7   Home: lista eventi, crea/unisciti, badge "Pro N" vicino al logo
├── evento.html          v4.7  Pagina evento: tab Movimenti / Saldi / Partecipanti
├── spesa.html            v3.5 Registrazione / visualizzazione movimento, foto sincronizzata
├── impostazioni.html    v4.7   Impostazioni: tema, metodi pagamento, dispositivo proprietario, licenza Base/Pro, link Admin
├── admin.html           v1.8   Pannello admin/debug — password verificata lato server + gestione sync esterni + licenza Pro
├── sw.js                v4.7   Service Worker (CACHE_NAME: wego-v4.7) — esclude /api/* dalla cache
├── manifest.json        v4.7   PWA manifest
├── vercel.json                 Header Cache-Control must-revalidate su tutti i file
├── style.css            v1.5   Design system globale (font +15% rispetto a v1.3; v1.5 classe .btn--pro-locked)
├── app.js                v2.15 Logica home: eventi, crea/unisciti, gating sync, licenza Base/Pro completa (Fasi 1-4), avatar creatore, card colorate
├── evento.js             v2.15 Logica pagina evento: movimenti, saldi, partecipanti, ricerca, puntino sync, foto, limite partecipanti, gate downgrade
├── spesa.js               v2.3 Logica form registrazione/visualizzazione movimento, doppia compressione foto, blocco foto Base
├── license.js             v1.2 Gestione completa livello dispositivo Base/Pro: limiti, richiesta/verifica abilitazione, schermata bloccante di downgrade, badge "Pro N"
├── sync.js                v1.8 Sincronizzazione bidirezionale locale ↔ Supabase + gating eventi esterni + foto movimenti (disattivata in versione Base) + verifica periodica licenza
├── supabase.js            v1.8 Client REST Supabase — MODIFICA SICUREZZA: request() su sync_status/device_license passa da /api/*, non più scrittura diretta anon
├── db.js                  v1.6 IndexedDB wrapper (events con gated/sync_allowed/is_mine, users, expenses, photos con sync_data/synced, payments, pending, sessions)
├── utils.js               v1.2 Funzioni condivise (formatAmount, formatDateLabel, formatDateTime, applyTheme, GPS, share, getDeviceId…)
├── payments.js            v1.0 Metodi di pagamento (lista configurabile, default + custom)
├── notifications.js      v1.2 Web Push: registrazione + salvataggio sottoscrizione su Supabase (fix mismatch chiave VAPID)
├── api/                        Funzioni serverless Vercel (NUOVO in v3.7 — vedi §5bis e §5quater)
│   ├── admin-login.js          Verifica password admin contro env var ADMIN_PASSWORD
│   ├── owner-verify.js         Verifica codice dispositivo proprietario contro env var OWNER_DEVICE_SECRET
│   ├── sync-status.js          v2 — Lista/abilita/disabilita/registra codici evento esterni (sp_sync_status), ora con SUPABASE_SERVICE_KEY
│   └── device-license.js       v2 — Lista/abilita/disabilita/registra licenze Pro per dispositivo (sp_device_license), ora con SUPABASE_SERVICE_KEY
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

### ⚠️ Concetto importante: il bottone "Salva" in Admin NON aggiorna `chiavi.json`
Tutti i campi delle sezioni Supabase/Notifiche (FCM-VAPID) in `admin.html` — quando premi
**Salva** — scrivono SOLO nel `localStorage` del browser che hai usato in quel momento per
aprire Admin. Non toccano in alcun modo il file `chiavi.json` sul server. Dato che **ogni**
pagina dell'app (compresa Admin stessa) richiama `Utils.loadRemoteConfig()` ad ogni apertura,
che rifetcha `chiavi.json` con `cache:'no-store'` e sovrascrive silenziosamente i valori locali,
qualunque modifica fatta col solo "Salva" viene persa al primo refresh — su QUALUNQUE device,
incluso quello con cui l'hai salvata. Per rendere permanente un cambiamento a una di queste
chiavi (Supabase URL/anon key, VAPID, FCM…): **Salva** (in Admin) → **Backup configurazione →
Esporta configurazione** → sostituire `chiavi.json` nel repo col file esportato → push su
GitHub → attendere il redeploy Vercel. Scoperto e risolto in v4.0 per la VAPID public key
(vedi tabella fix sotto), ma vale per ogni campo di quelle due sezioni.

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
  dopo l'abilitazione). Un **puntino** accanto all'icona di aggiornamento in header, **sempre visibile**
  (stesso schema colori del puntino di connessione, NIENTE giallo dalla v3.9): **verde** = sincronizzato
  (evento non gated, oppure gated ma abilitato), **rosso** = NON sincronizzato (gated e non ancora
  abilitato) — aggiornato silenziosamente ad ogni sync (manuale o automatica). Il **popup testuale**
  "non sincronizzato, richiede l'autorizzazione dell'amministratore" appare SOLO al tap manuale
  sull'icona di sync (`EventoApp.syncNow()`), mai sulle sync automatiche (`_syncQuiet()`, avvio pagina,
  evento online, dopo scrittura). La voce di menu "Richiedi sincronizzazione"
  (`EventoApp.shareSyncRequest()`, condivisione WhatsApp/sistema del codice) è visibile solo per
  eventi ancora in attesa, nel menu ☰ in alto.
- **Messaggio "Sincronizzato" impreciso (fix v3.8)**: sia in `evento.js` (`syncNow`) che in `app.js`
  (`syncNow`) il messaggio generico veniva mostrato anche quando l'evento/gli eventi non erano
  davvero stati inviati al server perché ancora `gated`. Corretto: ora il messaggio riflette lo
  stato reale dopo il ciclo di sync appena concluso.
- **Sblocco retroattivo (fix v3.9)**: `gated` viene fissato SOLO al momento della creazione
  dell'evento (in base a `Utils.getConfig('owner_device')` in quel preciso istante). Se Ivo creava
  eventi di test SUL SUO device PRIMA di aver attivato "Dispositivo proprietario" in Impostazioni,
  quegli eventi restavano permanentemente `gated:true` anche dopo aver attivato il device come
  proprietario — il puntino rimaneva rosso per sempre su eventi che in realtà sono "suoi al 100%".
  Risolto: `SettingsApp.configureOwnerDevice()` ora, appena il codice viene verificato con successo,
  sblocca in automatico (`_unlockOwnedEvents()`) tutti gli eventi già presenti nell'IndexedDB di
  questo device con `gated:true` → impostati a `gated:false`/`sync_allowed:true` (per definizione
  un evento unito tramite codice è SEMPRE `gated:false` fin da subito, quindi qualunque evento
  `gated:true` trovato in locale è stato necessariamente creato su questo stesso device). Si
  sincronizzano al successivo ciclo automatico.
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
- Foto cliccabile → lightbox a schermo intero con bottone elimina (solo a chi ha creato il movimento)
- **NUOVO v4.3 — Sincronizzazione foto movimenti**: dalla foto scattata vengono generate DUE versioni:
  - qualità alta (1200px/82%, comportamento di sempre) → resta SOLO sul device di chi l'ha scattata, mai sincronizzata
  - compatta (max 900px / qualità 60%, ~30-50KB) → sincronizzata su server (tabella `sp_expense_photos`) e
    scaricata dagli altri device, pull in batch per evento (`SupabaseClient.expensePhotos.getByExpenseIds`)
  - **Permesso**: solo chi ha CREATO il movimento (`expense.created_by`) può cambiare/eliminare la foto — anche se
    l'evento permette ad altri (es. il creatore dell'evento) di modificare il resto del movimento. Controllo sia
    in `evento.js` (lightbox dalla lista movimenti) sia in `spesa.js` (form di modifica, bottoni nascosti +
    doppio controllo lato app prima di eliminare)
  - Cancellazione "soft" (`DB.photos.markDeleted`): se offline al momento dell'eliminazione, resta in coda e si
    propaga al prossimo `Sync.push()` invece di perdersi
  - **Fix correlato**: il salvataggio di un movimento esistente sovrascriveva sempre `created_by` con chi stava
    modificando in quel momento, anche se non era il creatore originale — avrebbe rotto silenziosamente il
    controllo permessi appena sopra. Ora il creatore originale viene preservato in fase di modifica.
- **Fix critico timestamp generalizzato (v4.3)**: lo stesso bug di `events.save()` (v1.4, vedi §6) — sovrascriveva
  sempre `updated_at` con l'orario locale, anche quando andava preservato un valore arrivato dal pull — era
  presente anche in `put()` a livello generico (annullando di fatto anche il fix v1.4!) e in
  `users.save()`/`expenses.save()`/`payments.save()`. Tutti corretti: ora i pull di utenti, spese e pagamenti
  sono affidabili tanto quanto quello degli eventi, anche in presenza di disallineamento tra gli orologi dei device
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

## 5bis. Licenza dispositivo: Base vs Pro (NUOVO v4.4 — in corso, sviluppo a fasi)

Decisione di prodotto: ogni dispositivo (browser/installazione PWA — non esiste login/account,
vedi nota più sotto) ha un **tier** — `base` (default, gratuito) o `pro` (abilitato dall'admin).
Gestito interamente da **`license.js`** (nuovo file), che NON tocca lo schema Supabase per i
limiti stessi (sono regole applicative) — solo l'abilitazione Pro (fase 2/3) introdurrà una
nuova tabella.

| | **Base** (default) | **Pro** (abilitata dall'admin) |
|---|---|---|
| Eventi | **1 totale** (creato o collegato — contano allo stesso modo) | **100 creati** (i collegati NON contano) |
| Partecipanti per evento creato | 15 | 50 |
| Sincronizzazione foto (copertina evento + movimenti) | **Disattivata** (né invio né ricezione, foto restano locali) | Attiva (comportamento v4.2/v4.3 invariato) |
| Foto movimento (scatto) | Bottone visibile ma disattivato — badge "PRO", click mostra avviso | Disponibile |

**Nota identità "device fisico"**: una PWA non può leggere identificativi hardware reali (il
browser non lo permette). Il tier è quindi legato a *questa installazione del browser* — stesso
identico livello di robustezza già accettato per "Dispositivo proprietario" (si "perde" solo
cancellando manualmente i dati del sito o disinstallando/reinstallando la PWA).

**Campo locale `events.is_mine`** (db.js v1.6): `true` solo se l'evento è stato CREATO su questo
device (impostato in `App.createEvent`), mai sincronizzato su Supabase. Distingue in modo
affidabile "creato da me" da "a cui mi sono unito", necessario perché il tetto dei 100 eventi
Pro conta solo i creati. Preservato automaticamente nei pull (`Sync.pullEvent` parte sempre dal
record locale esistente prima di applicare i valori remoti).

### Fase 1 — Limiti versione Base (FATTA, v4.4)
- `license.js` (nuovo): `getTier()`/`isPro()`/`getLimits()`/`setTier()` (tier sempre `base` in
  questa fase — il meccanismo di abilitazione arriva in Fase 2/3), `canCreateEvent()`,
  `canJoinEvent()`, `canAddParticipant()`, `photoSyncAllowed()`, messaggi standard
- `app.js`: blocco apertura modal Crea/Unisciti se il device ha già 1 evento (Base) o ha
  raggiunto 100 creati (Pro); tetto partecipanti (15/50) in creazione evento; `is_mine:true`
  alla creazione
- `evento.js`: tetto partecipanti su "Aggiungi partecipante" (stesso limite di chi crea)
- `spesa.js`: bottone "Foto Scontrino" resta visibile ma con stile disattivato
  (`.btn--pro-locked` + badge "PRO" in style.css) — al click, se Base, mostra solo l'avviso
  invece di aprire la fotocamera/galleria
- `sync.js`: per i device Base, **niente sync foto in nessuna direzione** — `_executePending`
  invia sempre `photo:null` per create/update evento; `pullEvent` non adotta mai una foto
  remota (copertina o movimento) anche se sincronizzata da un partecipante Pro dello stesso
  evento; il blocco di push delle foto movimenti viene saltato del tutto
- `impostazioni.html`: nuova riga in "Avanzate" che mostra il tier corrente e i relativi limiti
  (solo informativo in questa fase — nessuna azione, vedi Fase 2)
- **Nessuna migrazione**: non essendoci ancora utenti realmente in produzione su questi limiti,
  si riparte "pulito" — nessuna logica di compatibilità per eventi/foto pregressi

### Fase 2 — Infrastruttura abilitazione (FATTA, v4.5)
- Nuova tabella `sp_device_license` (`device_id` VARCHAR PK, `label`, `requested_at`, `enabled`,
  `expires_at`, `enabled_at`, `enabled_by`) — schema in `supabase.js` v1.7, **da eseguire su
  Supabase** (vedi §11, non ancora confermato)
- Nuova funzione serverless `/api/device-license.js` (stesso pattern di `/api/sync-status.js`):
  GET lista completa (password admin), POST `{action:'enable'|'disable', device_id, expires_at}`
  (password admin; `expires_at` **obbligatorio** per `enable` — una data lontana nel tempo per
  "senza scadenza", una data reale per abilitazioni a termine)
- `supabase.js`: nuovo namespace `deviceLicense` (`request(deviceId,label)` — idempotente,
  aggiorna solo la nota se già registrato; `getByDeviceId(deviceId)`)
- **Riuso di `Utils.getDeviceId()`** (già esistente, già mostrato in Impostazioni → Generale →
  "Device ID" con bottone Copia) come identificativo univoco — niente ID duplicati
- `license.js` v1.1: `requestPro(label)` (invio diretto se online, altrimenti accodato in
  `DB.pending` e ritentato dal normale ciclo di sync — funziona anche su pagine senza
  `sync.js`, es. impostazioni.html); `checkRemoteStatus()` (confronta `now()` con `expires_at`
  e aggiorna il tier locale — **solo il tier**, nessuna pulizia eventi: quella è Fase 4);
  `looksUnlimited(iso)` (oltre 20 anni → mostrato come "nessuna scadenza")
- `sync.js` v1.8: `License.checkRemoteStatus()` richiamato ad ogni `Sync.push()` (stesso ciclo
  di `_refreshGatedEvents`); gestita la pending op `request_device_license` (fallback offline)
- `impostazioni.html`: nuova riga "Richiedi soluzione completa" (Avanzate) — apre un modal con
  nota libera (precompilata col nickname) + codice dispositivo copiabile; dopo l'abilitazione
  la riga diventa informativa e mostra la scadenza ("Valida fino al…" o "Nessuna scadenza")

### Fase 3 — Pannello Admin (FATTA, admin.html v1.8)
- Nuova sezione "Soluzione completa (Pro)" in `admin.html`, stesso identico pattern della
  sezione "Sincronizzazione eventi esterni" già esistente: campo per inserire un `device_id`
  (anche manualmente, non serve un'attesa richiesta) + campo data "fino al" (**obbligatorio**,
  bottone rapido "Usa senza scadenza (31/12/2099)", default precompilato a un anno da oggi) +
  bottone Abilita; lista sotto con tutti i dispositivi registrati (in attesa / Pro attivo con
  scadenza mostrata / Pro scaduto) e bottone Abilita-rapido o Disabilita per ciascuno
- Tutte le scritture passano da `/api/device-license.js` (password admin verificata lato
  server, stesso meccanismo di `/api/sync-status.js`) — `AdminGate.password` già gestito dal
  resto della pagina, nessuna modifica lì necessaria
- **Disabilitare un dispositivo Pro qui NON cancella ancora nulla** (nessun evento toccato):
  la pulizia con scelta dell'utente (Fase 4) non è ancora implementata, il dialog di conferma
  lo dice esplicitamente

### Fase 4 — Downgrade Pro→Base (disabilitazione o scadenza) (FATTA, v4.6)
Implementata esattamente come concordato:
1. `license.js` → `checkRemoteStatus()` (richiamata ad ogni `Sync.push()`): quando rileva un VERO
   downgrade (era 'pro', ora è 'base' — disabilitazione admin o `expires_at` superata) E il
   device ha più eventi di quanti la versione Base ne permetta, NON cancella nulla — imposta
   solo il flag `license_downgrade_pending` e ricarica la pagina (`window.location.reload()`)
2. `license.js` → `renderDowngradeGateIfNeeded()`: richiamata come PRIMA cosa subito dopo
   `DB.open()` sia in `App.init()` (app.js) sia in `EventoApp.init()` (evento.js) — se il flag è
   attivo, mostra una schermata bloccante a schermo intero (overlay creato via JS, stesso
   livello z-index/approccio di `AdminGate`) che indica **quale evento resterebbe** (il più
   vecchio per `created_at`, creato o collegato indifferentemente) e la lista di quelli che
   verrebbero eliminati
3. Due sole uscite dalla schermata, esattamente come richiesto:
   - **"Conferma — mantieni solo questo evento"** (`_confirmDowngradeCleanup`): rimuove tutti
     gli altri con lo STESSO comportamento già usato altrove nell'app — `_removeEventLocally()`
     replica `App.confirmDeleteFromMenu` per gli eventi creati da questo device (cancellazione
     completa anche dal server, cascata SQL) e `App.leaveEvent` per quelli a cui si era solo
     uniti (scollegamento locale + pulizia `joined_at` sul server per il proprio utente, dati
     del gruppo intatti per gli altri). Pulisce il flag e ricarica
   - **"Richiedi una nuova abilitazione"** (`_requestProFromGate`): chiama `License.requestPro()`
     (stesso meccanismo della Fase 2) e basta — NESSUNA cancellazione, l'utente resta sulla
     schermata bloccante (può chiudere l'app e riaprirla con calma). Alla riapertura successiva,
     se l'admin ha abilitato nel frattempo, `checkRemoteStatus()` rileva il nuovo `newTier==='pro'`
     e il blocco si rimuove da solo (nessuna pulizia, flag non toccato perché la diramazione
     "downgrade" non viene nemmeno raggiunta); altrimenti la stessa schermata riappare
4. **Badge "Pro N" in home**: nuovo elemento `#proBadge` nell'header di `index.html` (arancione,
   `.badge--amber`), aggiornato da `License.renderProBadge()` richiamata in `App._render()` —
   nascosto del tutto in versione Base, mostra "Pro N" dove N = 100 − eventi CREATI da questo
   device (`License.eventsRemaining()`, già pronta dalla Fase 2)

**Limite noto**: il controllo gira solo su index.html ed evento.html (come da specifica). Un
accesso diretto a spesa.html o impostazioni.html durante una finestra di downgrade non
mostrerebbe il blocco — caso limite ritenuto accettabile, dato che si arriva quasi sempre a
spesa.html passando da evento.html.

**🎉 Licenza Base/Pro completa — tutte le 4 fasi implementate.**

---

## 5quater. Modifica di sicurezza: blocco scritture su sp_sync_status e sp_device_license (v4.7)

**Problema risolto**: prima di questa modifica, la anon key di Supabase (pubblica, scaricabile
da `chiavi.json` senza alcuna autenticazione) aveva i permessi `INSERT`/`UPDATE` su
`sp_sync_status` e `sp_device_license`. Chiunque trovasse quella chiave poteva scrivere
direttamente su Supabase — ad esempio impostare `enabled:true` sul proprio `device_id` in
`sp_device_license` — **senza passare da admin.html e senza conoscere la password admin**. La
password proteggeva solo chi usava il pannello, non il database in sé.

**Soluzione adottata — niente RLS, solo permessi di tabella + una chiave server-only**:
- Nuova variabile d'ambiente Vercel **`SUPABASE_SERVICE_KEY`** (la "service role key" di
  Supabase, Settings → API — diversa dalla anon key, pensata per essere usata solo da un
  server: bypassa i permessi normali). **Da aggiungere tu su Vercel** — vedi §11.
- Schema SQL (`supabase.js` → `SQL_SCHEMA`): aggiunte `REVOKE INSERT, UPDATE, DELETE ... FROM
  anon` su entrambe le tabelle + `GRANT SELECT` (le letture dirette dal client restano
  permesse: il device deve poter leggere il proprio stato). **Va rieseguito su Supabase** — le
  REVOKE sono indispensabili, un semplice GRANT non rimuove permessi già concessi in precedenza.
- `/api/sync-status.js` e `/api/device-license.js` (entrambi diventati "v2"): non usano più la
  anon key per le scritture, usano `SUPABASE_SERVICE_KEY`. Aggiunta una terza azione, **`request`**,
  che NON richiede password admin (è solo "mettimi in lista d'attesa") ma scrive comunque solo
  tramite la funzione server — prima questa scrittura partiva direttamente dal client.
- `supabase.js` → `syncStatus.request()` e `deviceLicense.request()`: non scrivono più
  direttamente su Supabase, chiamano invece `/api/sync-status` e `/api/device-license` con
  `action:'request'`. `getByCode()`/`getByDeviceId()` (letture) restano invariate.
- **Nessuna modifica** a `license.js`, `sync.js`, `app.js`, `admin.html`: tutti questi file
  chiamano le stesse funzioni di `supabase.js` con la stessa firma — è cambiato solo cosa
  succede "dentro" quelle funzioni.

**Risultato**: nessun client (devtools, localStorage, chiamata diretta a Supabase con la anon
key) può più auto-abilitarsi alla sincronizzazione esterna o alla versione Pro. L'unico punto
di scrittura per enable/disable è la funzione server con la password verificata; l'unico modo
di "richiedere" è comunque tramite la funzione server (mai più scrittura diretta del client).

**Cosa NON è stato toccato (deciso consapevolmente, vedi conversazione)**: la anon key resta
visibile in `chiavi.json` e continua a poter leggere/scrivere `sp_events`, `sp_users`,
`sp_expenses`, `sp_payments` come sempre — è il funzionamento normale offline-first dell'app, e
nasconderla del tutto richiederebbe una riscrittura completa del livello dati (proxy di tutte le
operazioni attraverso funzioni server) sproporzionata al contesto d'uso (app tra amici, non
un prodotto con utenti non controllati). I limiti Base/Pro (1/100 eventi, 15/50 partecipanti,
foto) restano controlli lato client in `license.js` — bloccare anche questi richiederebbe
tracciare il device_id direttamente sulle righe di `sp_events` e validarlo lato server, un
salto di complessità non richiesto in questa fase.

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
| v3.x | **Notifiche push mai arrivate**: 3 bug concreti — (1) token push creato ma il salvataggio server-side era commentato nel codice (mai implementato); (2) `window._swRegistration` non impostato in `impostazioni.html`; (3) registrazione SW in `evento.html` non aspettava `serviceWorker.ready` prima di usare `pushManager`. Tutti i 3 corretti lato client; lato server completato e deployato in v4.0 (vedi riga v4.0) |
| v3.6 | `admin.html`: path CSS/JS rotti (`/css/`, `/js/` inesistenti) + nessun accesso dall'app + nessuna password → tutti risolti |
| v3.7 | **Password admin in chiaro nel codice**: spostata su `/api/admin-login.js` + env var Vercel `ADMIN_PASSWORD`. Introdotta sincronizzazione selettiva eventi esterni (`gated`/`sync_allowed` su `events`, tabella `sp_sync_status`, gestione da `admin.html`) |
| v3.8 | **Banner sync persistente**: in `evento.html` restava visibile anche dopo l'abilitazione → rimosso, sostituito da un puntino di stato + popup solo su tap manuale. **Messaggio "Sincronizzato" impreciso**: mostrato anche se l'evento era ancora `gated` e non abilitato (sia in `evento.js` che in `app.js`) → corretto |
| v3.9 | **Puntino sync giallo anche su eventi "propri"**: causa reale = eventi creati sul device PRIMA di attivare "Dispositivo proprietario" restavano `gated:true` per sempre (il flag si fissa solo alla creazione). Fix: tolto il giallo (ora solo verde/rosso, stesso schema del puntino di connessione) + sblocco retroattivo automatico in `configureOwnerDevice()` |
| v4.0 | **Notifiche push mai consegnate dopo aver rigenerato le chiavi VAPID** (errori 401/403 "VAPID public key mismatch" lato Edge Function, nessun errore visibile sul device): `notifications.js` riusava la sottoscrizione push del browser anche quando era legata a una chiave VAPID pubblica diversa da quella attualmente configurata — il browser non se ne accorge da solo finché non gli si chiede esplicitamente di confrontarla. Fix: confronto byte-per-byte con la chiave attuale, `unsubscribe()` + nuova `subscribe()` se non corrisponde. **CAUSA DEFINITIVA (vera root cause)**: anche dopo questo fix il mismatch persisteva — il bottone "Salva" in Admin → sezione FCM aggiorna SOLO il `localStorage` del browser dell'admin in quel momento, NON il file `chiavi.json` sul server. Tutte le pagine (incluse quelle dell'admin stesso) richiamano `Utils.loadRemoteConfig()` ad ogni apertura, che rifetcha `chiavi.json` con `cache:'no-store'` e sovrascrive silenziosamente qualunque valore locale — quindi la chiave "salvata" in Admin veniva persa al primo refresh su qualunque pagina, e ogni device continuava a leggere la VAPID pubblica vecchia da `chiavi.json`. **Procedura corretta per cambiare qualunque chiave in `chiavi.json` (non solo VAPID)**: Admin → aggiorna il campo e Salva → Admin → Backup configurazione → **Esporta configurazione** → sostituire il `chiavi.json` nel repo con il file esportato → push su GitHub → attendere il redeploy Vercel. Il pulsante "Salva" da solo NON basta mai, su nessun campo di quella sezione |
| v4.1 | **Titolo evento non si aggiornava mai dopo una modifica del creatore** (nemmeno scollegando/ricollegando): `db.js` → `events.save()` sovrascriveva SEMPRE `updated_at` con l'orario locale del device, anche durante un pull dal server col valore reale — bastava un minimo disallineamento tra gli orologi dei device perché il confronto "il server ha una versione più recente?" diventasse permanentemente falso su quell'evento. Fix: preserva `updated_at` se passato esplicitamente (pull/edit), default a "ora" solo per eventi nuovi. **Avatar sbagliato in home**: la card di un evento collegato (creato da altri) mostrava la TUA iniziale invece di quella del creatore — `_eventCardHtml()` usava l'identità locale (`session.userName`) invece di `ev.created_by`. **Estetica**: nuova classe `.ev-card--linked` (sfondo arancione chiaro) per distinguere a colpo d'occhio gli eventi collegati da quelli creati da me (verde chiaro, invariato) |
| v4.2 | **CAUSA VERA E PIÙ GRAVE del bug titolo (oltre al fix v4.1)**: `sp_events` sul server non ha mai avuto la colonna `photo`, ma `events.update()` la invia comunque in OGNI richiesta PATCH (insieme a titolo/descrizione). PostgREST rifiuta l'INTERA richiesta se una colonna non esiste — quindi ogni modifica all'evento falliva per intero lato server, titolo compreso, non solo la foto. La pending op restava in coda e ritentava ad ogni sync, fallendo sempre allo stesso modo (per questo "scollega/ricollega" non risolveva nulla: lato server non c'era mai arrivato niente). Fix: aggiunta colonna `photo TEXT` a `sp_events` (richiede di rieseguire lo schema SQL). **Foto evento mai sincronizzata neanche alla creazione**: `events.create()` non includeva affatto il campo `photo` nel payload — corretto anche questo, ora la foto viene inviata sia alla creazione che alle modifiche successive |
| v4.3 | **NUOVA FUNZIONALITÀ — sincronizzazione foto movimenti** (tabella `sp_expense_photos`, doppia compressione, permesso limitato al creatore). **Fix generalizzato del bug updated_at**: lo stesso problema del v4.1 (limitato a `events.save()`) era presente anche in `put()` a livello generico — che con la sua sovrascrittura incondizionata aveva di fatto NEUTRALIZZATO il fix v4.1 — e in `users.save()`/`expenses.save()`/`payments.save()`. Tutti corretti. **Fix `created_by` sovrascritto**: modificare un movimento esistente reimpostava sempre `created_by` a chi stava modificando in quel momento, anche se diverso dal creatore originale — avrebbe reso inutile il controllo permessi sulla foto al primo intervento di un'altra persona (es. il creatore dell'evento). Ora preservato |
| v4.4 | **NUOVA FUNZIONALITÀ — Fase 1 licenza Base/Pro** (vedi §5bis): nuovo file `license.js`; nuovo campo locale `events.is_mine` (db.js); limite di 1 evento totale e 15 partecipanti per i device in versione Base (default per tutti, finché non implementate le Fasi 2/3 di abilitazione); sincronizzazione foto (copertina evento + movimenti) completamente disattivata per la versione Base, in entrambe le direzioni; bottone foto movimento in `spesa.html` reso visibile-ma-disattivato (badge "PRO") invece che nascosto |
| v4.5 | **NUOVA FUNZIONALITÀ — Fase 2 licenza Base/Pro** (vedi §5bis): tabella `sp_device_license` + nuova funzione serverless `/api/device-license.js` (stesso pattern di `/api/sync-status.js`); `supabase.js` → namespace `deviceLicense`; `license.js` → `requestPro()`/`checkRemoteStatus()` (riusa `Utils.getDeviceId()` già esistente, non ne crea uno nuovo); `sync.js` → verifica periodica licenza ad ogni push; nuova riga "Richiedi soluzione completa" in Impostazioni → Avanzate. **Ancora SOLO infrastruttura**: l'abilitazione vera e propria si fa per ora a mano su Supabase (Fase 3 = pannello Admin, Fase 4 = gestione del downgrade) |
| admin.html v1.8 | **NUOVA FUNZIONALITÀ — Fase 3 licenza Base/Pro** (vedi §5bis): nuova sezione "Soluzione completa (Pro)" in admin.html — abilitazione/disabilitazione dispositivi con data di scadenza obbligatoria, lista dispositivi registrati. Nessun impatto sulla versione globale dell'app (solo admin.html è cambiato) |
| v4.6 | **NUOVA FUNZIONALITÀ — Fase 4 licenza Base/Pro, FASE FINALE** (vedi §5bis): schermata bloccante di downgrade Pro→Base (`license.js` → `renderDowngradeGateIfNeeded()`, richiamata subito dopo `DB.open()` in app.js/evento.js) con le due scelte concordate (mantieni solo l'evento più vecchio / richiedi nuova abilitazione, nessuna cancellazione automatica); badge arancione "Pro N" in home. **Tutte le 4 fasi della licenza Base/Pro sono complete.** |
| v4.7 | **MODIFICA DI SICUREZZA** (vedi §5quater): `sp_sync_status` e `sp_device_license` non più scrivibili dalla anon key pubblica — solo da `/api/sync-status.js`/`/api/device-license.js` con una nuova `SUPABASE_SERVICE_KEY` (solo su Vercel). Nessuna RLS. **Badge "Pro N"**: spostato dal gruppo icone a destra a fianco della scritta "WeGo" nell'header, ora solo testo arancione trasparente (stessa dimensione/colore di prima, senza più lo sfondo a pillola) |

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
license.js        ← dipende da utils.js, db.js (vedi §5bis — usa anche
                     SupabaseClient a runtime per requestPro/
                     checkRemoteStatus, caricato dopo ma chiamato solo
                     più tardi: nessun problema di ordine)
supabase.js       ← dipende da utils.js
sync.js           ← dipende da db.js, supabase.js, utils.js, license.js
notifications.js  ← dipende da utils.js, supabase.js (per il salvataggio server-side)
payments.js       ← dipende da utils.js
app.js            ← dipende da tutti, incluso license.js (solo index.html)
evento.js         ← dipende da tutti tranne app.js, incluso license.js
spesa.js          ← dipende da utils, db, license, supabase, sync, payments
```

Ordine di caricamento negli script tag: `utils.js → db.js → license.js → supabase.js → sync.js → notifications.js → payments.js → app.js/evento.js/spesa.js` (license.js va caricato dopo db.js perché conta gli eventi locali, e prima di app.js/evento.js/spesa.js che lo usano).

---

## 10. Come riprendere lo sviluppo

1. Caricare questo `situazione.md` come file di progetto in Claude
2. Recuperare i file sorgenti aggiornati da GitHub (https://github.com/Ivo-designweb/WeGo) — sono la fonte di verità, più aggiornati degli eventuali allegati di progetto
3. Indicare il punto/bug/funzionalità da modificare; specificare se la versione va aggiornata o no per quella sessione
4. Claude aggiorna la versione del file HTML/JS coinvolto +0.1 e, se necessario, sw.js CACHE_NAME + manifest.json + index.html in coerenza
5. Dopo aver ricevuto i file: caricarli su GitHub (Add file → Upload files → sovrascrive automaticamente i file con lo stesso nome → Commit) → Vercel pubblica da solo

**Versione attuale:** v4.7 (v3.5 per spesa.html/spesa.js)
**Service Worker cache:** `wego-v4.7`

---

## 11. Cose da fare / lavori futuri — PRIORITÀ

### ✅ Licenza Base/Pro — COMPLETA (tutte le 4 fasi fatte, vedi §5bis per il dettaglio)
Nessuna azione residua lato codice.

### 🔒 Modifica di sicurezza v4.7 — vedi §5quater per il dettaglio completo
**ATTENZIONE ALL'ORDINE DI DEPLOY** — se carichi il nuovo codice senza prima fare questi due
passaggi, "Richiedi soluzione completa" e la sincronizzazione di eventi esterni si romperanno
(la anon key non avrà più i permessi, e la funzione server non avrà ancora la chiave nuova):
1. [ ] Recupera la **service role key** di Supabase (Settings → API, sotto la anon key — diversa, più lunga, NON quella che già usi)
2. [ ] Aggiungi una nuova variabile d'ambiente su Vercel: `SUPABASE_SERVICE_KEY` = quella chiave, poi rideploy
3. [ ] Esegui di nuovo lo schema SQL aggiornato (Admin → Schema SQL → copia → Supabase SQL Editor → Run) — contiene le `REVOKE` indispensabili, un semplice re-deploy del codice non le applica da solo
4. [ ] Solo dopo i punti 1-3, carica i file nuovi su GitHub/Vercel

### ⚠️ Da completare TU (richiede accesso al progetto Supabase/Vercel, non eseguibile da Claude)
- [ ] **Eseguire le migrazioni SQL non ancora confermate**: `sp_users.joined_at`, `sp_users.last_sync_at`, tabella `sp_push_subscriptions`, tabella `sp_sync_status`, colonna `sp_events.photo`, tabella `sp_expense_photos` (per la sincronizzazione foto movimenti), tabella `sp_device_license` (per la licenza Base/Pro), **le `REVOKE` su sp_sync_status/sp_device_license (v4.7, vedi sopra)**. Schema completo sempre disponibile in Admin → Schema SQL. **Senza queste colonne/tabelle, le funzioni "connesso multi-device", "ultima sincronizzazione", "sincronizzazione selettiva eventi esterni", "modifica evento", "sincronizzazione foto movimenti" e "richiesta soluzione completa" falliranno silenziosamente** (la app non si rompe, ma quei campi non si aggiorneranno mai sul server)
- [ ] **NUOVO v4.7 — Impostare `SUPABASE_SERVICE_KEY` su Vercel** (vedi sopra)
- [ ] **NUOVO v3.7 — Impostare 2 variabili d'ambiente su Vercel** (Project → Settings → Environment Variables), poi rideployare:
  - `ADMIN_PASSWORD` → la password vera del pannello admin (sostituisce quella che prima era in chiaro nel codice)
  - `OWNER_DEVICE_SECRET` → il codice segreto da inserire UNA VOLTA in Impostazioni → Avanzate sui tuoi device, per marcarli come "proprietario" (eventi sempre sincronizzati)
- [ ] **NUOVO v3.7 — Verificare che Vercel rilevi la cartella `/api/`** come funzioni serverless dopo il primo upload (dovrebbe essere automatico, nessuna configurazione aggiuntiva in `vercel.json` richiesta per il runtime Node di default)
- [x] **Deployare la Edge Function** `supabase-function/send-push-notification/` — **fatto, v4.0**. Durante l'attivazione sono emersi e risolti 2 problemi non previsti: (1) il bottone "Create Webhook" della Dashboard dava errore `schema "supabase_functions" does not exist` (bug noto della piattaforma su alcuni progetti) → risolto con trigger manuale via `pg_net`/`net.http_post` direttamente in SQL; (2) dopo aver rigenerato le chiavi VAPID, le notifiche risultavano "inviate" senza errori lato client ma non arrivavano mai → causa: `notifications.js` riusava la sottoscrizione del browser legata alla VECCHIA chiave pubblica, mai confrontata con quella nuova (fix in `notifications.js` v1.2, vedi tabella fix v4.0)

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
