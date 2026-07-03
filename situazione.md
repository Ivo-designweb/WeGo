# WeGo — Documento di Stato Progetto
**Versione corrente: v6.8 (v3.8 per spesa.html/spesa.js, v1.0 per aiuto.html) — Aggiornato: 2 luglio 2026**

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
├── index.html          v6.8   Home: lista eventi, crea/unisciti, icona app + link alla Guida sul logo grande "WeGo" con evidenziazione "Help" (prime 2 visite), badge "Pro N"/"Base" corsivo, bottone "Installa", numero di versione accanto al logo "WeGo" nell'header
├── evento.html          v6.8  Pagina evento: tab Movimenti / Saldi / Partecipanti / Riepilogo (grafico a torta + bottone "Esporta in Excel" — NUOVO), 4 totali ("+Cassiere" escluso, "Spese" = conteggio), colonna Prev., saldo informativo "Cassa Comune" nei Saldi, badge "(Prev. ...)" in Partecipanti, menu "⋮" con voce "Guida", menu "Passa a Pro"
├── spesa.html            v3.8 Registrazione / visualizzazione movimento — Previsione, Tipo, foto sincronizzata, "+Cassiere" (icona moneta gialla), flag "Uso Cassa Comune"
├── impostazioni.html    v6.8   Impostazioni: tema, metodi pagamento, categorie spesa, licenza Base/Pro (id "licenzaSection", richiesta auto-apribile da evento.html), backup JSON completo + import da backup (entrambi Pro-only), link Admin
├── admin.html           v2.0   Pannello admin/debug — password verificata lato server + SOLO licenza Pro (sync esterni rimossa), lista con header fisso, bottone "Reset evidenziazione Help" per i test
├── aiuto.html            v1.0  Guida/Help: 3 passi base (crea/unisciti, registra spese, saldi), box sincronizzazione, confronto Base/Pro (senza il numero esatto di eventi Pro), approfondimenti in <details> richiudibili, freccia "Indietro" torna alla pagina di provenienza
├── sw.js                v6.8   Service Worker (CACHE_NAME: wego-v6.8) — esclude /api/* dalla cache, precache include /aiuto.html, /exceljs.min.js e /leaflet.js|css|marker-*.png
├── manifest.json        v6.8   PWA manifest — icone corrette (dimensioni reali = dichiarate), "maskable" rimosso (logo senza margine di sicurezza)
├── exceljs.min.js        4.4.0 Libreria ExcelJS vendorizzata in locale (build "bare", nessun CDN) — usata solo da EventoApp.exportRiepilogoExcel() (evento.js), precaricata da sw.js per funzionare offline
├── leaflet.js/.css       1.9.4 Libreria Leaflet vendorizzata in locale (nessun CDN, nessuna API key) — usata dal criterio "Mappa" nel tab Riepilogo (evento.js), tile scaricati da OpenStreetMap al momento della visualizzazione (richiede rete)
├── leaflet-marker-*.png  1.9.4 Icone marker di default di Leaflet (icon/icon-2x/shadow), vendorizzate in locale insieme a leaflet.js/.css
├── vercel.json                 Header Cache-Control must-revalidate su tutti i file, incluse le icone PNG
├── style.css            v1.5   Design system globale (font +15% rispetto a v1.3; v1.5 classe .btn--pro-locked)
├── app.js                v2.19 Logica home: eventi, crea/unisciti, licenza Base/Pro completa, bottone "Installa" PWA, evidenziazione "Help" sul logo (prime 2 visite, solo localStorage) — RIMOSSO il gating sync esterni
├── evento.js             v2.28 Logica pagina evento: movimenti (4 totali, "+Cassiere" escluso, "Spese" = conteggio, icona moneta su "Uso Cassa Comune"), saldi (con Prev., "+Cassiere" e saldo informativo "Cassa Comune"), partecipanti, ricerca, foto, gate downgrade, riepilogo condivisibile = UNICA fonte di verità coi saldi di Saldi, tab "Riepilogo" con grafico a torta (Partecipante/Data/Tipo spesa) + Mappa GPS (Leaflet/OSM, NUOVO) + export Excel dettagliato — RIMOSSO il gating sync esterni, menu "Passa a Pro"
├── spesa.js               v2.8 Logica form registrazione/visualizzazione movimento — Previsione, Tipo, "+Cassiere", flag "Uso Cassa Comune", salvataggio/eliminazione NON aspettano più la sync (NUOVO, torna subito indietro), fix layout flex in modifica, fix licenza foto per-evento
├── license.js             v1.4 Gestione completa livello dispositivo Base/Pro + photoSyncAllowedForEvent() — FIX requestPro non nasconde più errori reali
├── sync.js                v2.1 Sincronizzazione bidirezionale + foto movimenti PER EVENTO + verifica periodica licenza + sync differita/"quieta" (NUOVO, debounce 5s + rete di sicurezza) — RIMOSSO il gating eventi esterni
├── supabase.js            v1.12 Client REST Supabase — deviceLicense via /api/, expenses.category/is_forecast/is_cassa_comune, events.photo_sync_enabled — FIX GRANT service_role
├── db.js                  v1.10 IndexedDB wrapper — events.photo_sync_enabled, expenses.category/is_forecast/is_cassa_comune — gated/sync_allowed sempre false/true — NUOVI users/expenses/payments.getAll() non filtrati (per il backup completo, vedi impostazioni.html)
├── utils.js               v1.4 Funzioni condivise (formatAmount, formatDateLabel, formatDateTime, applyTheme, GPS, share, getDeviceId, calculateBalances con tipo 'cashier', NUOVA calculateCassaComune())
├── notifications.js       v1.3 Notifiche push Web Push (VAPID) + Supabase, fix percorso icone
├── payments.js            v1.1 Metodi di pagamento + NUOVO ExpenseCategories (categorie di spesa, stesso pattern)
├── api/                        Funzioni serverless Vercel (NUOVO in v3.7 — vedi §5bis e §5quater)
│   ├── admin-login.js          Verifica password admin contro env var ADMIN_PASSWORD
│   ├── owner-verify.js         Verificava il codice dispositivo proprietario — VESTIGIALE da v5.3 (gating rimosso), nessun file chiama più /api/owner-verify
│   ├── sync-status.js          v3 — Gestiva sp_sync_status (gating eventi esterni) — VESTIGIALE da v5.3, ora propaga errore Postgres completo (v5.5)
│   └── device-license.js       v3 — Lista/abilita/disabilita/registra licenze Pro per dispositivo (sp_device_license), con SUPABASE_SERVICE_KEY — ora propaga errore Postgres completo (v5.5)
└── icon*.png                  Icone PWA (72, 96, 128, 144, 152, 192, 384, 512 px) — RIGENERATE in v5.2: erano JPEG rinominati ".png" con dimensioni reali diverse da quelle dichiarate nel manifest (es. "192" era 196×196 reale), ora PNG veri esatti

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

### ❌ RIMOSSA in v5.3: Sincronizzazione selettiva eventi esterni (era NUOVO v3.7)
Esisteva dalla v3.7 alla v5.2: ogni evento creato da un device senza il codice
"dispositivo proprietario" nasceva `gated:true` e restava solo locale finché un
admin non lo abilitava da `admin.html` ("Sincronizzazione eventi esterni"). **Rimossa
del tutto in v5.3** (vedi §5decies per il dettaglio): ogni evento si sincronizza ora
sempre automaticamente, su qualunque device, senza nessuna richiesta/autorizzazione —
esattamente come si comportava prima solo il "dispositivo proprietario". Resta SOLO
l'abilitazione **Base→Pro** (licenza dispositivo, §5bis), un sistema completamente
diverso e indipendente. La tabella `sp_sync_status` e `/api/sync-status.js` restano
sul server ma non sono più usati da nessun file (nessuna migrazione SQL necessaria
per rimuoverli, se non si vuole nemmeno questo non c'è urgenza).


### Tipi pending (coda sync)
| Tipo | Quando viene creato | Nota |
|---|---|---|
| `create_event` | Salvataggio nuovo evento (utenti iniziali in `payload.users`) | Ora marca anche gli utenti come `synced` dopo successo |
| `update_event` | Modifica di un evento esistente | **Fix v3.x**: ora chiama `markSynced()` dopo successo (prima il badge "DA SYNC" restava acceso per sempre) |
| `delete_event` | Eliminazione di un evento | |
| `create_user` | Aggiunta partecipante da evento aperto | Ora marca l'utente come `synced` dopo successo |
| `delete_user` | Eliminazione di un partecipante | |
| `clear_joined` | **Nuovo**: bottone "Scollegati" (home) | Pulisce `joined_at` sul server per l'utente che si scollega, così gli altri device lo vedono tornare "non connesso" |
| `request_device_license` | Richiesta Pro fatta offline da Impostazioni | Registra il device su `sp_device_license` (licenza Base/Pro — vedi §5bis), ritentata dal normale ciclo di sync |

Le spese, i pagamenti e ora anche gli **utenti** (per `joined_at`/`last_sync_at`) si sincronizzano
direttamente via `getUnsyced()` + `_syncExpense()`/`_syncPayment()`/`_syncUser()`, senza passare
dalla coda `pending` (usano il flag `synced: false`).

---

## 5. Funzionalità implementate (stato a v3.7)

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

### Fase 3 — Pannello Admin (FATTA, admin.html v1.8 — lista riprogettata in v2.0/v5.3)
- Sezione "Soluzione completa (Pro)" in `admin.html`: campo per inserire un `device_id`
  manualmente (per abilitare proattivamente chi non ha ancora fatto richiesta dall'app) + campo
  data "fino al" (**obbligatorio**, bottone rapido "Usa senza scadenza (31/12/2099)") + bottone
  Abilita; sotto, **lista sintetica con header colonne fisso durante lo scroll** ("Codice
  dispositivo" / "Data scadenza" — vedi §5decies per il dettaglio del redesign v5.3): ogni riga
  mostra codice + (se già Pro) la scadenza in chiaro, oppure (se non ancora abilitato) un campo
  data direttamente in riga precompilato a un anno da oggi, la nota del richiedente sotto, e il
  bottone Abilita/Disabilita a destra — niente più bisogno di copiare il codice nel form in alto
  per i dispositivi già presenti in lista
- Tutte le scritture passano da `/api/device-license.js` (password admin verificata lato
  server) — `AdminGate.password` già gestito dal resto della pagina, nessuna modifica lì necessaria
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

**FIX v5.4 — "permission denied for table sp_device_license" anche con la chiave giusta**:
dopo aver verificato che `SUPABASE_SERVICE_KEY` su Vercel era corretta, l'errore persisteva.
Causa: i privilegi di default su una tabella NUOVA non garantiscono sempre l'accesso in
scrittura a `service_role` su ogni progetto Supabase (dipende da come sono configurati gli
"ALTER DEFAULT PRIVILEGES" di quello specifico progetto — **non** è un'assunzione sicura a
prescindere, come si potrebbe pensare). Aggiunto un `GRANT` esplicito a `service_role` su
`sp_device_license`/`sp_sync_status` in `supabase.js` (v1.12) — **va rieseguito lo schema SQL
aggiornato** (Admin → Schema SQL → copia → Supabase SQL Editor → Run): un redeploy del solo
codice non applica questo GRANT, serve eseguirlo a mano su Supabase come ogni modifica allo
schema. Query di verifica utile per il futuro (mostra subito chi ha quali permessi su una
tabella, utile per autodiagnosticare casi simili senza dover ragionare per esclusione):
```sql
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_name = 'sp_device_license';
```

**Seguito indagine (v5.5) — l'errore persisteva ANCHE dopo aver confermato che il GRANT
c'era**: due controlli incrociati hanno escluso le due cause più probabili — (1) la chiave
in `SUPABASE_SERVICE_KEY` decodifica correttamente a `"role": "service_role"` (verificato
decodificando il JWT su jwt.io, senza bisogno di devtools); (2) Postgres usa un messaggio
diverso (`"new row violates row-level security policy"`) quando il blocco è una policy RLS —
dato che l'errore qui è `"permission denied for table"`, **non** è RLS (che `service_role`
bypassa comunque sempre, a prescindere). Resta da capire se il `GRANT` confermato copre
TUTTI i privilegi necessari (in particolare UPDATE, usato da "Abilita" su un dispositivo che
ha già fatto richiesta — diverso da INSERT, usato per uno nuovo digitato a mano). **Fix
diagnostico applicato**: `/api/device-license.js` e `/api/sync-status.js` (entrambi v3) ora
propagano l'errore Postgres COMPLETO (`code`/`message`/`details`/`hint`) invece del solo
messaggio breve — la prossima volta che l'errore si presenta, admin.html lo mostrerà per
intero, senza dover guardare i log di Vercel. Query di verifica più precisa, filtrata sul
solo `service_role` (mostra l'elenco esatto dei privilegi, utile per scoprire un GRANT
parziale):
```sql
SELECT privilege_type
FROM information_schema.role_table_grants
WHERE table_name = 'sp_device_license' AND grantee = 'service_role';
```

**Svolta (v5.6) — trovato un bug indipendente che ha confuso la diagnosi**: l'utente ha
confermato che TUTTE le tabelle dell'app su Supabase hanno RLS disattivata (esclude
definitivamente quella pista), poi ha svuotato `sp_device_license` per ripartire da zero e
notato che le nuove richieste "Passa a Pro" non comparivano più nemmeno nella lista admin.
Causa reale, indipendente dal `GRANT`: **`License.requestPro()` (impostazioni.html → "Richiedi
soluzione completa") nascondeva qualunque errore del tentativo diretto dietro un falso
successo** — se la chiamata a `/api/device-license` falliva (es. proprio per il problema di
permessi che si stava indagando), il codice si limitava a un `console.warn()` e accodava la
richiesta in `DB.pending` per un retry silenzioso, **restituendo comunque `deviceId` come se
fosse andata bene**. Risultato: l'utente vedeva sempre il toast "Richiesta inviata!" (sia da
Impostazioni sia dalla schermata di downgrade), mentre sul server non arrivava nulla — la
richiesta restava bloccata in coda locale, ritentata a ogni sync ma sempre con lo stesso esito,
senza che nessuno se ne accorgesse. Questo significa che probabilmente **anche il problema di
permessi originale potrebbe non essere mai stato "visto" nella sua forma reale**, perché
proprio la richiesta che lo avrebbe rivelato falliva in silenzio.

**Fix**: `requestPro()` (license.js v1.4) ora rilancia l'errore al chiamante quando il
dispositivo è online (entrambi i punti che la chiamano — `sendRequestPro()` in
impostazioni.html e `_requestProFromGate()` nella schermata di downgrade — avevano già un
`try/catch` pronto a mostrare un toast d'errore reale, semplicemente non lo ricevevano mai).
Continua comunque ad accodare in `DB.pending` come backup, per i soli casi di un problema di
rete davvero transitorio — il comportamento per il vero offline (nessun errore, richiesta
accodata) resta invariato.

---

## 5quinquies. Movimenti: "Previsione", categoria "Tipo", fix licenza foto per-evento (v4.8)

### Campo "Previsione" (solo tipo "Spesa")
Spesa futura, non va divisa né conteggiata nei saldi/totali da dividere — solo evidenziata a
parte. Implementazione:
- `spesa.html`/`spesa.js`: toggle sotto i bottoni tipo (default spento, solo per "Spesa" — si
  nasconde e si forza spento passando a "Mov. cassa"). Quando attivo: l'etichetta "Descrizione *"
  diventa **"PREVISIONE"** in grassetto arancione (solo l'etichetta), e la sezione "Divide tra"
  si disattiva visivamente (dimmed, non cliccabile — `_setDivideTraEnabled()`) mentre "Paga"
  resta attivo (serve a sapere DI CHI è la previsione). Validazione: "Divide tra" non è più
  obbligatorio quando è Previsione (`_validate()`). Al salvataggio, `participants` è sempre `[]`
  per una previsione, indipendentemente da cosa mostra ancora la griglia
- Nuovo campo `expenses.is_forecast` (booleano, sincronizzato — `db.js`, `supabase.js`
  create/update, colonna `sp_expenses.is_forecast` nello schema SQL)
- `evento.js` → `_calcBalances()`: le previsioni sono escluse PRIMA di chiamare
  `Utils.calculateBalances()` — non entrano mai nei saldi. Stessa esclusione applicata anche a
  `shareRiepilogo()` (il riepilogo testuale condivisibile), che aveva un calcolo dei saldi
  indipendente e andava corretto allo stesso modo (questo ha anche sistemato un effetto
  collaterale preesistente: il conteggio "X spese" in quel testo includeva pure i trasferimenti)
- Badge "previsione" (arancione) nell'elenco movimenti — non richiesto esplicitamente, aggiunto
  per poterle distinguere a colpo d'occhio scorrendo la lista (segnalato come assunzione)

### 4 totali in alto nei Movimenti (Totale / Previsione / Spese / Pro capite)
- **Totale** = spese reali + previsioni (quadro generale)
- **Previsione** = solo le previsioni
- **Spese** = solo le spese reali (diventa un importo: prima qui c'era un CONTEGGIO, ora è una
  somma — il conteggio come numero non è più mostrato da nessuna parte nei totali)
- **Pro capite** = INVARIATO rispetto a prima: somma delle spese reali (mai previsioni) ÷
  numero di partecipanti (`users.length`) — stessa identica formula, solo la fonte si chiama
  "Spese" invece di "Totale" come nelle 3 colonne precedenti

### Colonna "Prev." nei Saldi
Per ogni utente: somma delle previsioni dove è impostato come "Paga" (`paid_by`) — solo
informativo, MAI usato nel calcolo del saldo. Mostrata solo se > 0 per quell'utente (altrimenti
solo "Saldo", come richiesto): es. "Pippo · Prev. 100€ · Saldo +80€"; "Anna · Saldo -20€" (Anna
non ha previsioni, niente colonna Prev. per lei). Intestazioni di colonna "Prev."/"Saldo" sopra
la lista, "Prev." nascosta del tutto se NESSUN utente ha previsioni > 0.

### Campo "Tipo" (categoria di spesa, solo tipo "Spesa", facoltativo)
- Nuovo modulo `ExpenseCategories` in `payments.js` — stesso identico pattern di
  `PaymentMethods` già esistente (lista di default modificabile: abilita/disabilita, aggiungi/
  rimuovi personalizzate). Default: Cibo, Trasporti, Alloggio, Ingressi, Souvenir, Altro
- `impostazioni.html`: nuova sezione "Categorie spesa", identica nell'aspetto a "Metodi di
  pagamento"
- `spesa.html`/`spesa.js`: select "Tipo" sotto il campo Importo (nascosta per "Mov. cassa").
  Facoltativo, prima opzione sempre vuota
- Nuovo campo `expenses.category` (stringa, sincronizzato — colonna `sp_expenses.category`)
- **Non mostrato** nell'elenco movimenti (deciso esplicitamente: non serve lì)

### Fix: licenza foto per-evento
**Bug risolto**: un partecipante con device in versione Base, collegato (con "Unisciti a un
evento") a un evento ospitato da un creatore con versione Pro, non poteva usare/sincronizzare
le foto — il controllo era SOLO sul tier del proprio device, mai sull'evento. Ora:
- Nuovo campo `events.photo_sync_enabled` (booleano, sincronizzato — colonna
  `sp_events.photo_sync_enabled`), impostato dal CREATORE in base al proprio tier al momento
  della creazione (`App.createEvent`) o di ogni modifica (`App.saveEditEvent` — si "rinfresca"
  ad ogni salvataggio, così un upgrade a Pro dopo la creazione si attiva con un semplice
  salvataggio del titolo)
- `license.js` → nuova `photoSyncAllowedForEvent(event)`: true se questo device è Pro, OPPURE
  se l'evento indicato ha `photo_sync_enabled:true` — usata ovunque prima si usava
  `photoSyncAllowed()` per le foto (mai per gli altri limiti Base/Pro, che restano quelli del
  proprio device: 1/100 eventi, 15/50 partecipanti continuano a valere normalmente)
- `sync.js`: il controllo foto (push e pull, copertina e movimenti) è ora PER EVENTO
  (`_isPhotoSyncAllowedForEvent()`), non più una condizione globale unica per tutto il device
- `spesa.js`: `pickPhoto()`/`_applyPhotoTierLock()` usano la stessa funzione per-evento
- **Limite noto**: per gli eventi creati PRIMA di questa versione, `photo_sync_enabled` parte
  `false` anche se il creatore è già Pro — si attiva al primo salvataggio dell'evento da parte
  del creatore (anche solo riaprendo "Modifica evento" e premendo Salva senza cambiare nulla).
  Nessuna migrazione automatica retroattiva, stessa filosofia "non preoccuparti del pregresso"
  già usata nelle fasi precedenti

### 🔜 Idea per il prossimo step (NON implementata, solo annotata)
Un nuovo tab dopo "Saldi" con un grafico delle spese per categoria (Tipo) — richiesto dal
cliente per una sessione futura, vedi §11.

---

## 5sexies. Terzo tipo movimento "+Cassiere" + fix type/paid_for (v4.9 / v3.7 spesa)

### Bottone "+Cassiere" (spesa.html/spesa.js)
Terza scelta in alto a destra in spesa.html, accanto a "Spesa" e "Trasf." (ex "Mov.
cassa" — rinominato, icona invariata a sinistra del testo). Usato per registrare un
versamento di uno o più utenti a un utente che fa da cassa comune/cassiere per
pagamenti futuri.

- **Stessa identica forma dati di una Spesa** (non del Trasferimento): `paid_by` +
  `participants[]`, diviso tra loro — riusa la sezione `sectionExpense` già esistente,
  solo con le etichette invertite: **"A:"** (ex "Paga:", chi RICEVE — il cassiere) e
  **"Da \*"** (ex "Divide tra \*", chi VERSA e si divide l'importo). Salvato con
  `type: 'cashier'` (nuovo valore della colonna `type`, già un VARCHAR senza vincoli
  CHECK — **nessuna migrazione SQL necessaria**).
- **Segno OPPOSTO a una spesa normale** in `Utils.calculateBalances()` (utils.js
  v1.3): il cassiere (`paid_by`) va in DEBITO per l'intero importo, chi versa
  (`participants`) va in CREDITO per la propria quota. Esempio: Marco (cassiere, "A")
  riceve 90€ da Anna e Luca (45€ a testa, "Da") → saldo Marco **−90€**, saldo Anna
  **+45€**, saldo Luca **+45€**.
- **Considerato come un movimento normale nei 4 totali** di Movimenti (decisione
  esplicita, diversa da "Trasf." che resta escluso): l'importo viene SOTTRATTO da
  "Spese"/"Totale"/"Pro capite" invece che sommato (è cassa che rientra nel gruppo,
  non una spesa reale — evita il doppio conteggio quando il cassiere la spenderà poi
  per una spesa vera). Stesso trattamento nel riepilogo condivisibile
  (`shareRiepilogo`).
- **"Versato"/"Incassato"** (Partecipanti, `_calcUserContribution`): chi versa conta
  come `transfersOut` per la propria quota, il cassiere come `transfersIn` per
  l'intero importo — stesso schema già usato per "Trasf.", solo che qui possono
  versare più persone insieme.
- **NON compare in "Pagamenti tra utenti"** (quella sezione assume una coppia singola
  Da→A; qui "Da" può essere più persone — resta filtrata solo su `type === 'transfer'`).
- **Badge verde "cassiere"** nell'elenco Movimenti, stesso pattern del badge arancione
  "previsione" già esistente. Bottone "+Cassiere" evidenziato in verde quando attivo
  (`.type-btn.active-cashier`), stesso pattern di Spesa=blu/Trasf.=viola.
- GPS, Foto, "Tipo" (categoria) e "Previsione" nascosti per "+Cassiere", come già per
  "Trasf." (non è uno scontrino/spesa reale).
- I 3 bottoni tipo sono stati compressi (gap/padding/font ridotti) per fare spazio al
  terzo senza andare a capo.

### Fix critico: `type`/`paid_for` non salvati in modifica movimento
`SupabaseClient.expenses.update()` (supabase.js) non includeva i campi `type` e
`paid_for` nel PATCH — erano presenti solo in `create()`. Cambiare il tipo di un
movimento esistente (es. Spesa → Trasf./+Cassiere) sembrava non avere effetto: il
salvataggio locale era corretto, ma il pull successivo (`Sync.pullEvent`)
sovrascriveva col vecchio `type` rimasto sul server. Aggiunti entrambi i campi al
payload PATCH.

### Altre modifiche minori (spesa.html/spesa.js)
- Campo "Tipo" (categoria spesa) sotto Importo: select ristretta (non più `flex:1`),
  più corta, subito a destra dell'etichetta, tutto su una riga (era già così
  strutturalmente, solo più larga del necessario).
- Riga "Previsione": ricompattata su un'unica riga (etichetta + nota + interruttore,
  prima etichetta/nota erano sopra l'una all'altra).
- **Fix bug visivo**: in `_activateViewMode()` (sola lettura) il selettore generico
  che disabilita tutti gli `<input>` della pagina impostava `opacity:0.8` inline anche
  sulla checkbox NATIVA dell'interruttore "Previsione" — quella checkbox va invece
  sempre mantenuta invisibile (`opacity:0` da CSS, l'aspetto è disegnato dallo
  `.toggle-slider` accanto), e lo stile inline ha priorità sulla classe. La checkbox
  "ricompariva" quindi sovrapposta allo slider, fuori posizione, ogni volta che si
  apriva un movimento esistente. Esclusa esplicitamente dal reset di opacità generico.

## 5septies. Fix layout "Previsione"/"Tipo" in modifica + Versato/Incassato senza previsioni (v5.0)

### Fix: interruttore "Previsione" e select "Tipo" disallineati in modifica
Bug residuo dopo il fix di v4.9 (quello era un problema diverso, in sola lettura). Le
righe `#forecastRow` e `#categoryRow` hanno `display:flex` SOLO nello style inline
scritto in spesa.html — non da una classe CSS (a differenza di `sectionExpense`/
`sectionTransfer`, che sono `.form-card`, `display:block` di default). `setType()`,
per mostrarle, eseguiva `el.style.display = ''`: questa istruzione rimuove SOLO la
proprietà "display" dallo style inline, senza ripristinarla — il browser ricadeva sul
default per un `<div>` ("block"), non "flex". Risultato: etichetta/nota/interruttore
non più allineati in riga, interruttore "troppo a sinistra". Capita SOLO in modifica
perché `setType()` viene chiamato solo da `_loadExistingExpense()` — in una spesa
nuova queste righe restano intatte col loro style originale, mai toccate da JS. Fix:
`el.style.display` ora viene impostato esplicitamente a `'flex'` invece di `''`.

### Fix: "Versato" includeva le previsioni
`_calcUserContribution()` (Partecipanti → Versato/Incassato) non escludeva le spese
`is_forecast`: venivano sommate come una spesa reale qualsiasi, gonfiando il totale
"Versato" di chi aveva previsioni a suo nome. Ora le esclude sempre
(`if (exp.is_forecast) continue;`), stesso criterio già usato per saldi/totali.

### Nuovo: badge "(Prev. ...)" in Partecipanti
Accanto al saldo Versato/Incassato di ogni partecipante, se ha almeno una previsione
a suo nome, compare un badge ambra con la somma totale delle sue previsioni — es.
"Pippo … (Prev. 180€) … 80€ Versato" — per mostrare le due cifre separate: 180€ di
spese previste (non ancora reali, non divise) e 80€ di contributo reale. Stesso
calcolo già usato per la colonna "Prev." in Saldi, riusato qui.

## 5octies. Bottone "Installa" PWA in home + fix percorso icone (v5.1)

### Bottone "Installa" (index.html / app.js)
Bottone colorato (non solo icona, a differenza degli altri in header) in alto a
destra in index.html, accanto agli altri bottoni header — visibile **solo se la PWA
non è già installata** (`display-mode: standalone` / `navigator.standalone`, vedi
`App._initInstallButton()`).

- **Rilevamento piattaforma**: per User-Agent (`/iPad|iPhone|iPod/` + il caso speciale
  iPadOS 13+ che si presenta come Mac con touch, e `/Android/`).
- **Android (e desktop Chrome/Edge)**: intercettiamo l'evento nativo del browser
  `beforeinstallprompt` (con `preventDefault()`, per sostituire il mini-banner
  automatico col nostro bottone) e lo riusiamo al tap (`promptEvent.prompt()`). Se il
  bottone è visibile ma il browser non ha ancora generato quell'evento in questa
  sessione, mostriamo le istruzioni manuali invece di non fare nulla.
- **iOS**: non esiste un'installazione programmatica né un evento equivalente —
  mostriamo subito il bottone (se non standalone) e al tap un modal con le istruzioni
  manuali (Safari → icona Condividi → "Aggiungi a Home" → "Aggiungi"), con
  l'avvertenza che funziona solo da Safari (non da Chrome/altre app su iOS).
- Ascoltiamo anche `appinstalled` per nascondere il bottone non appena l'utente
  installa, da qualunque percorso (nostro bottone o menu del browser).
- Modal istruzioni condiviso (`#modalInstallInfo`) — stesso contenuto per iOS e per
  il ripiego Android, testo scritto dinamicamente da `App._showInstallInfo()` in
  base alla piattaforma rilevata.

### Fix critico collegato: percorsi icone PWA inesistenti
Mentre si implementava il bottone, trovato un bug preesistente che lo riguarda
direttamente: `manifest.json` elencava le icone come `/icons/icon-72.png`,
`/icons/icon-192.png` ecc. (cartella `/icons/` e trattino nel nome), ma i file reali
sono in ROOT senza trattino (`/icon72.png`, `/icon192.png`…), come già documentato in
§3. Risultato: tutte le icone del manifest risultavano 404, quindi **Chrome non
considerava la PWA installabile** e `beforeinstallprompt` non si sarebbe mai
generato su Android — il bottone "Installa" sarebbe sempre ricaduto sul ripiego
manuale, mai sul prompt nativo one-tap. Stesso bug trovato (e corretto) anche in:
`sw.js` e `notifications.js` (icon/badge delle notifiche push), `admin.html` (stessa
cosa), `index.html`/`impostazioni.html` (`<link rel="apple-touch-icon">`, l'icona
mostrata sulla Home di iOS dopo "Aggiungi a Home" — anche questa avrebbe mostrato
uno screenshot della pagina invece dell'icona dell'app).

## 5nonies. Icone PWA: JPEG rinominati ".png" con dimensioni sbagliate — vera causa del prompt mai mostrato (v5.2)

Indagando sul perché Chrome non riproponeva l'installazione dopo una disinstallazione,
trovata la causa profonda — e probabilmente il vero motivo per cui il prompt nativo
**non si è mai generato fin dall'inizio**, non solo dopo la disinstallazione:

- Le 8 icone (`icon72.png` … `icon512.png`) erano file **JPEG rinominati con estensione
  `.png`** (confermato col formato reale del file, non dall'estensione).
- **Nessuna aveva la dimensione reale dichiarata nel manifest**: es. `icon192.png` era
  in realtà 196×196 px, `icon512.png` era 532×532 px, `icon144.png` e `icon152.png`
  erano entrambe 168×168 (stesso file, due nomi diversi). Pattern compatibile con
  icone generate da un tool che ha creato solo alcuni formati intermedi e riusato il
  più vicino per le taglie richieste, senza ridimensionare con precisione.
- Chrome scarta come "non valida" qualunque icona la cui dimensione reale non
  corrisponda esattamente a quella dichiarata in `sizes`. Con **nessuna icona valida**,
  il manifest non soddisfa il requisito minimo di installabilità (serve almeno
  un'icona ≥192px verificata) — `beforeinstallprompt` non si genera mai, a
  prescindere da qualunque storia di installazione/disinstallazione precedente.

**Fix**: rigenerate tutte le 8 icone come PNG veri, alle dimensioni esatte dichiarate,
ridimensionando dalla sorgente migliore disponibile (`icon512.png`, 532×532, la più
grande tra le esistenti). Rimosso anche `"maskable"` dal `purpose` in `manifest.json`
per le icone 192/512: il logo (testo "WEGO" + 3 figure) arriva quasi al bordo
dell'immagine senza margine di sicurezza, e un ritaglio circolare/squircle di Android
avrebbe tagliato testo e avatar laterali — meglio lasciare solo `"any"` finché non si
crea una versione con margine adeguato.

**Cache da considerare dopo il deploy**: le icone vengono servite dal Service Worker
con strategia Cache-First (non sono nella lista di precache esplicita, ma cadono nel
ramo generico "immagini/icone/font" del fetch handler) — i device che le avevano già
scaricate prima del fix le avrebbero tenute in cache indefinitamente. Per questo
`CACHE_NAME` è stato comunque incrementato a `wego-v5.2`: l'`activate` del nuovo SW
elimina la cache precedente, quindi le icone vengono riscaricate da zero. Aggiunta
anche una regola `Cache-Control` esplicita per i `.png` in `vercel.json`, che prima
non c'era (nessuna regola dedicata = comportamento di default non garantito).

## 5decies. Rimossa la sincronizzazione selettiva eventi esterni (v5.3)

Decisione di prodotto: la sincronizzazione selettiva eventi esterni (gating, NUOVO in
v3.7, vedi §4) è stata **rimossa del tutto**. Ogni evento creato da qualunque device
si sincronizza ora sempre, automaticamente, senza nessuna richiesta/autorizzazione
admin — esattamente il comportamento che prima aveva solo il "dispositivo
proprietario". Resta SOLO l'abilitazione **Base→Pro** (licenza dispositivo, §5bis),
sistema indipendente e non toccato in questa sessione (a parte il redesign della
lista in admin.html, vedi sotto).

### File toccati (rimozione del gating)
- **`app.js` (v2.18)**: `createEvent()` non imposta più `gated`/registra più
  `register_sync_request`; `_showShareCode()` semplificata (un solo messaggio,
  niente più ramo "evento gated"); rimosso il badge "In attesa di sync" nella lista
  eventi; `syncNow()` mostra sempre "Sincronizzato".
- **`db.js` (v1.8)**: `events.save()` forza sempre `gated:false`/`sync_allowed:true`
  — eventuali eventi locali rimasti `gated:true` da prima di questa versione si
  "auto-sbloccano" al primo save successivo (es. al prossimo pull). Rimossa
  `events.setSyncAllowed()` (non più usata).
- **`sync.js` (v2.0)**: rimossi `_refreshGatedEvents()`, `_isEventSyncAllowed()`,
  `_pendingEventId()` e tutti i controlli `if (!isEventSyncAllowed) continue` in
  `push()` (pending ops, spese, pagamenti, utenti, foto). Rimossa la pending op
  `register_sync_request`.
- **`supabase.js` (v1.11)**: rimosso il namespace `syncStatus` (request/getByCode).
- **`evento.js` (v2.19) / `evento.html`**: rimosso il puntino `syncGateDot` in
  header (era sempre verde, senza più significato); `syncNow()` mostra sempre
  "Sincronizzato". La voce di menu "Richiedi sincronizzazione"
  (`shareSyncRequest()`, condivisione WhatsApp del codice) è sostituita da **"Passa
  a Pro"** (`EventoApp.goToRequestPro()`), visibile solo se questo device NON è già
  Pro — naviga a `impostazioni.html?openRequestPro=1`.
- **`impostazioni.html`**: rimossa la riga "Dispositivo proprietario" (e le funzioni
  `configureOwnerDevice()`/`_unlockOwnedEvents()`/`_renderOwnerDeviceStatus()`) —
  non aveva più alcun effetto, dato che il gating che controllava è stato rimosso.
  `init()` ora controlla il parametro URL `?openRequestPro=1` e, se presente, apre
  in automatico il modal "Richiedi soluzione completa" (`showRequestPro()`, già
  gestisce da sola il caso "è già Pro" con un semplice toast).
- **`admin.html` (v2.0)**: rimossa l'intera sezione "Sincronizzazione eventi
  esterni" (HTML + funzioni `enableEventCode()`/`enableEventCodeQuick()`/
  `disableEventCode()`/`loadSyncStatusList()`).
- **`index.html`**: rimossa la classe CSS orfana `.ev-badge-amber` (badge "In attesa
  di sync", non più usato).
- **Lasciati intatti, ma ora "vestigiali"** (nessun file li chiama più, nessuna
  migrazione SQL necessaria per rimuoverli, si può fare con calma se si vuole
  pulizia totale): tabella `sp_sync_status`, `/api/sync-status.js`,
  `/api/owner-verify.js`, env var `OWNER_DEVICE_SECRET` su Vercel.

### Lista "Soluzione completa (Pro)" riprogettata (admin.html)
Su richiesta esplicita, la lista "Dispositivi in attesa / abilitati" è stata
riprogettata in una tabella sintetica con **header colonne fisso durante lo
scroll** (`position:sticky`, dentro un contenitore con scroll interno, max-height
400px): "Codice dispositivo" e "Data scadenza". Ogni riga mostra:
- **Riga 1**: codice dispositivo (troncato, tooltip col valore completo) a sinistra
  · data scadenza a destra — **se il dispositivo non è ancora Pro, questo è un
  campo `<input type="date">` editabile direttamente in riga** (precompilato a un
  anno da oggi), non più testo statico — se è già Pro, testo in chiaro con la data
  (o "Senza scad." se lontanissima).
- **Riga 2**: la nota/descrizione inserita dal richiedente.
- **A destra**, verticalmente centrato sulle due righe: bottone **Abilita** (legge
  la data dall'input nella STESSA riga, `AdminApp.enableDeviceLicenseRow(this,
  deviceId)`) oppure **Disabilita** se già attivo.

Il form manuale in alto (inserisci codice dispositivo + data + Abilita) resta
**invariato e separato** — serve per abilitare proattivamente un dispositivo che
non ha ancora fatto richiesta dall'app (quindi non compare ancora nella lista).
Rimossa `enableDeviceLicenseQuick()` (copiava il codice nel form in alto): la nuova
`enableDeviceLicenseRow()` agisce direttamente dalla riga, senza passare dal form.

**Nota**: "già Pro" qui significa `enabled && expires_at non ancora scaduta` (stesso
criterio `isActive` di prima) — un dispositivo con Pro **scaduto** (`enabled:true`
ma data passata) viene trattato come "non ancora Pro" ai fini del rendering: mostra
di nuovo il campo data editabile invece del testo statico, per permettere un rinnovo
con un tap solo, invece di un semplice "Disabilita" senza via di rinnovo rapido.

---

## 5undecies. Flag "Uso Cassa Comune" + saldo informativo "Cassa Comune" nei Saldi (v5.7 / v3.8 spesa)

### Flag "Uso Cassa Comune" (spesa.html/spesa.js v2.7, solo tipo "Spesa")
Nuovo toggle nella card "Importo", a destra del campo importo: etichetta "Uso Cassa
Comune" sopra, interruttore "mini" sotto, entrambi volutamente più piccoli (meno
della metà) del font dell'importo — flag usato raramente. Di default spento.
- Indica che quella spesa è stata pagata usando la cassa comune raccolta in
  precedenza con un movimento "+Cassiere", invece che di tasca propria.
- Visibile **solo per il tipo "Spesa"**: nascosto e forzato spento passando a
  "Trasf."/"+Cassiere" (stesso meccanismo già usato per "Previsione"), perché la
  formula del saldo Cassa Comune (vedi sotto) lo considera solo per le spese reali.
- Nuovo campo `expenses.is_cassa_comune` (booleano, sincronizzato — `db.js` v1.9,
  `supabase.js` v1.12 create/update, colonna `sp_expenses.is_cassa_comune` nello
  schema SQL — **migrazione da eseguire, vedi §11**).
- **Non cambia in alcun modo il saldo normale** (`Utils.calculateBalances()`,
  invariata): è un dato puramente informativo, letto solo dalla nuova funzione
  sotto.

### Saldo informativo "Cassa Comune" nei Saldi (`Utils.calculateCassaComune()` — utils.js v1.4)
Per ogni partecipante: somma di tutti i movimenti "+Cassiere" dove lui è il
cassiere (`paid_by`) — l'**intero** importo incassato, non diviso — MENO la somma
di tutte le spese marcate "Uso Cassa Comune" dove lui ha pagato (`paid_by`) —
anche qui l'intero importo, non la quota. Le previsioni sono sempre escluse (mai
cassa reale, stesso criterio del saldo normale).

**Esempio**: Pippo registra un movimento "+Cassiere" da 200€ (lui cassiere,
4 persone — lui incluso — versano 50€ a testa in "Da"). Poi paga una spesa reale
di 80€ con le stesse 4 persone, marcandola "Uso Cassa Comune". Cassa Comune di
Pippo = 200 − 80 = **120€**. Gli altri 3 partecipanti hanno Cassa Comune = 0 (non
sono mai stati cassiere né hanno mai pagato col flag) — per loro non compare
nulla. Il saldo normale di tutti resta calcolato esattamente come prima (Pippo in
debito di 90€ verso gli altri, gli altri 3 in credito di 30€ ciascuno) — il nuovo
calcolo Cassa Comune è solo un'informazione aggiuntiva, non lo cambia.

### Visualizzazione in Saldi (evento.js v2.20)
`_calcBalances()` calcola `EventoApp._cassaComune` **separatamente** da
`EventoApp._balances` (mai mischiati). `_renderSaldi()` mostra, sulla stessa riga
del Saldo di ogni partecipante, subito alla sua sinistra, la scritta
"(Cassa Comune: +120,00 €)" — **solo se diversa da zero** per quel partecipante
(per la maggior parte sarà 0 e non comparirà nulla). Colore neutro (ambra, come
"Prev.") per non confonderla col verde/rosso del saldo personale; nessuna nuova
colonna/intestazione in alto (il testo include già l'etichetta).

### Decisioni prese (confermate con l'utente prima di implementare)
- Il flag è visibile solo per "Spesa", non per "Trasf."/"+Cassiere".
- Nessun badge nell'elenco Movimenti per le spese con flag attivo (a differenza di
  "previsione"/"cassiere") — solo nel form e nei Saldi.
- "(Cassa Comune: …)" sulla stessa riga del Saldo, alla sua sinistra, solo se ≠ 0.
- Non toccato `shareRiepilogo()` (il riepilogo testuale condivisibile): non
  richiesto, resta come prima (nessuna menzione di Cassa Comune in quel testo).

---

## 5duodecies. 4 totali Movimenti: "+Cassiere" escluso, "Spese" diventa un conteggio (v5.8)

Richiesta del cliente: nei 4 totali in alto nella tab Movimenti (Totale /
Previsione / Spese / Pro capite), i movimenti "+Cassiere" non devono più
influenzare in alcun modo Totale/Spese/Pro capite (prima il loro importo veniva
SOTTRATTO — vedi §5sexies/v4.9 — per evitare un doppio conteggio quando il
cassiere spendeva poi quella cassa per una spesa vera). **Ora "+Cassiere" è
semplicemente ignorato** in questi 3 totali: né sommato né sottratto.

Inoltre, la voce **"Spese" non mostra più un importo**: mostra invece il
**numero** di registrazioni di spesa reale, escludendo Trasf., "+Cassiere" e
Previsione (stesso filtro già usato per "Pro capite", solo che ora compare anche
qui come conteggio invece che come somma). "Pro capite" resta una formula su
importi (somma spese reali ÷ partecipanti) — il calcolo interno non cambia,
cambia solo cosa viene MOSTRATO sotto l'etichetta "Spese".

Implementato in `evento.js` v2.21, `_renderSpese()`:
- `speseTotale` ora è la sola somma delle spese reali (mai più `- cashierTotale`).
- `summarySpese.textContent` ora è `count` (numero), non più un importo formattato.
- "Pro capite" invariato nella formula (`speseTotale / users.length`).

**Non toccato in questa sessione**: Saldi/Versato-Incassato non sono interessati
da questa modifica — "+Cassiere" continua a contare lì esattamente come prima
(segno opposto, vedi §5sexies).

**Aggiornamento (v5.9)**: anche `shareRiepilogo()` (il riepilogo testuale
condivisibile, bottone "Condividi riepilogo" in Saldi) è stato reso coerente con
questa stessa logica — la cifra "Totale" nel testo condiviso non sottrae più
"+Cassiere" (prima sì, con lo stesso meccanismo v4.9 ormai superato). "X spese"
nel testo non cambia (già escludeva Trasf./"+Cassiere"/Previsione). I saldi/"Da
saldare" calcolati nello stesso testo NON sono toccati: "+Cassiere" continua a
contare lì come sempre, segno opposto — è una formula completamente separata
dalla cifra "Totale" mostrata sopra.

---

## 5terdecies. Icona moneta "+Cassiere"/"Uso Cassa Comune", badge Pro/Base nella welcome, fix shareRiepilogo (v6.0)

### Icona "moneta gialla" (spesa.html, evento.js — nessun bump versione richiesto all'epoca)
Su richiesta del cliente, sostituita l'icona a stroke del bottone "+Cassiere"
(spesa.html) con una moneta gialla piena (cerchio oro `#FBBF24`, anello/simbolo
"€" in un marrone-oro `#92400E` per contrasto) — colore FISSO, non segue più lo
stato attivo/inattivo del bottone (resta gialla sempre). Scelta tra 2 varianti
proposte in anteprima (artifact HTML dedicato) — confermata la "Variante A"
(moneta singola con "€" dentro, non il "mucchietto" di 2 monete).

Stessa identica icona riusata nell'elenco Movimenti (`evento.js`
`_renderMovimentList()`): nuovo badge `.exp-badge--cassa`, subito a destra del
badge metodo di pagamento, mostrato SOLO se `exp.is_cassa_comune` è true — stesso
pattern visivo di `.exp-badge--photo` (nessuno sfondo, solo l'icona inline).

### Badge "Pro N"/"Base": spostato nella welcome screen, ora corsivo e allineato alla base (index.html)
Il badge (mostra "Pro N" in ambra se il device è Pro, "Base" in verde vivace se
non lo è — introdotto nella sessione precedente) è stato **rimosso dall'header
in alto** (che ora mostra solo "WeGo", a sinistra, senza badge) e **spostato
dentro `#welcomeScreen`**, subito a destra del logo grande "WeGo" (48.5px,
centrato) mostrato SOLO quando l'utente non ha ancora nessun evento. Stesso
font/colore di sempre per il testo, ma ora in **corsivo**
(`font-style:italic`) e allineato alla **base** del logo grande
(`align-items:flex-end` nel contenitore flex, non più `center`).

**Nota tecnica importante**: questo badge usa lo stesso elemento
`id="proBadge"`, quindi `License.renderProBadge('proBadge')` (richiamata da
`App._render()` in app.js, NON modificata) continua a funzionare senza alcuna
modifica JS — solo la sua posizione nel DOM/HTML è cambiata. **Conseguenza
accettata dal cliente**: essendo dentro `#welcomeScreen`, il badge è visibile
SOLO quando l'utente non ha ancora eventi — appena ne ha almeno uno
(`#eventsScreen` sostituisce `#welcomeScreen`), il badge non è più visibile da
nessuna parte nella home.

### Fix coerenza `shareRiepilogo()` — UNICA fonte di verità per i saldi (evento.js v2.23)
`shareRiepilogo()` (richiamabile sia dal bottone in Saldi sia dal menu "⋮" in
alto — STESSA funzione in entrambi i casi, mai stata duplicata lì) **ricalcolava
i saldi da zero** con una propria copia quasi identica della logica di
`Utils.calculateBalances()` (rischio di disallineamento futuro). Ora usa
direttamente `EventoApp._balances` — già calcolato da `_calcBalances()` ad ogni
`loadAll()`, indipendentemente da quale tab sia attiva — passato a
`Utils.calculateMinimalTransactions()`, esattamente come fa `_renderSaldi()`
per la sezione "Transazioni minime". Risultato: **garantito** che "Da saldare"
nel testo condiviso sia sempre identico, cifra per cifra, a "Transazioni
minime" in Saldi, in ogni circostanza (incluse eventuali modifiche future al
calcolo dei saldi, che ora si propagano automaticamente anche qui).

### Logica di `Utils.calculateMinimalTransactions()` — come si scelgono "chi paga chi" (per riferimento)
1. Dai saldi (`EventoApp._balances`, già netti di spese/trasf./"+Cassiere"/
   pagamenti) si separano i partecipanti in due liste: **creditori** (saldo
   positivo, ">+0,01" — gli altri devono soldi a loro) e **debitori** (saldo
   negativo, "<-0,01" — devono soldi agli altri).
2. Entrambe le liste vengono **ordinate in modo decrescente** per importo
   assoluto: il creditore con il credito più alto per primo, il debitore con il
   debito più alto per primo.
3. Algoritmo goloso ("greedy"): si prende il **primo creditore** (il più
   esposto in credito) e il **primo debitore** (il più esposto in debito),
   si genera una transazione debitore → creditore per `min(credito
   rimanente, debito rimanente)`, si scalano entrambi gli importi residui;
   chi arriva a ~0 passa al successivo della propria lista; si ripete finché
   una delle due liste si esaurisce.
4. La **priorità** con cui un debitore viene assegnato a un creditore è quindi
   **esclusivamente l'importo del saldo** (chi deve/ha diritto a più soldi viene
   gestito prima) — NON il nome, l'ordine di inserimento, né la data del
   movimento. È l'algoritmo "debt settlement" goloso standard: minimizza in
   pratica il numero di transazioni necessarie a chiudere tutti i conti (non è
   la soluzione matematicamente minima in senso assoluto in ogni caso — quel
   problema è NP-hard in generale — ma è l'euristica comune, efficiente e
   quasi sempre ottima o vicina all'ottimo).

---

## 5quaterdecies. Nuova pagina "Guida" (aiuto.html v1.0) + icona/link sul logo home (v6.1)

### Nuova pagina `aiuto.html` (v1.0, versione indipendente come admin.html)
Pagina di guida pensata per chi non ha mai usato l'app: linguaggio semplice,
SENZA dettagli tecnici (niente menzione di server/database/linguaggio — solo
"i dati si sincronizzano automaticamente tra i partecipanti online con lo
stesso codice evento"). Struttura:
- **3 passi essenziali** in cima (card con icona): 1) crea un evento o
  unisciti con un codice, 2) registra le spese, 3) guarda chi deve cosa a chi
  nei Saldi.
- **Box sincronizzazione**: una riga, nessun dettaglio implementativo.
- **Confronto Base/Pro**: Base = 1 evento attivo, 15 partecipanti, foto non
  sincronizzate · Pro = "molti più eventi" (volutamente SENZA scrivere il
  numero esatto 100, su richiesta cliente), 50 partecipanti, foto
  sincronizzate. Link "Vedi i dettagli e passa a Pro" →
  `/impostazioni.html#licenzaSection` (vedi sotto) per chi vuole i numeri
  precisi.
- **Approfondimenti** in `<details>`/`<summary>` richiudibili (nessun JS
  necessario): "+Cassiere", flag "Uso Cassa Comune", "Previsione", Pagamenti
  tra utenti, foto/posizione, metodi di pagamento — chi non è interessato non
  li vede nemmeno, chi vuole approfondire li apre con un tap.

Aggiunta alla lista di precache di `sw.js` (funziona anche offline, come le
altre pagine). **Non** ha il footer "Contatta lo sviluppatore" (quella regola
è specifica della pagina Impostazioni, non di ogni pagina HTML).

### Icona app + link alla Guida sul logo grande "WeGo" (index.html)
A sinistra del logo grande "WeGo" (schermata di benvenuto), aggiunta l'icona
dell'app (stessa usata per l'installazione PWA, `icon192.png`), alta come la
"W" — **unica icona disponibile nel progetto**, quindi la scritta "WEGO" compare
due volte (una volta disegnata a mano dentro l'icona, una volta nel testo
grande) — accettato così non avendo un logo "pulito" alternativo. Sia l'icona
che il testo grande sono ora un link a `/aiuto.html`.

**Scoperto durante questa sessione (NON corretto su richiesta esplicita del
cliente)**: la classe `.hidden` usata da `#welcomeScreen`/`#eventsScreen` (e
da `Utils.show()`/`Utils.hide()` in app.js) **non ha alcun effetto visivo** —
`style.css` definisce solo `.sync-bar.hidden{display:none}`, non una regola
generica `.hidden{display:none}`. Risultato pratico: la schermata di
benvenuto (logo grande + bottoni "Crea"/"Unisciti") resta SEMPRE visibile
sopra la lista eventi, anche quando ci sono già eventi — il cliente ha
confermato che questo è il comportamento che osserva e che gli va bene così,
quindi non è stato toccato. Annotato qui per consapevolezza futura: se in una
sessione successiva si decidesse di "pulire" la home nascondendo davvero la
welcome screen quando ci sono eventi, occorre aggiungere la regola CSS
generica mancante.

### Badge "Pro N"/"Base" (id="proBadge")
Restano valide le note della sessione precedente (§5terdecies) — nessuna
modifica aggiuntiva qui, il badge è rimasto un fratello (sibling) del link
icona+testo, non dentro di esso.

---

## 5quindecies. Voce "Guida" nel menu "⋮", fix freccia indietro, evidenziazione "Help" sul logo (v6.1 → v6.2)

### Voce "Guida" nel menu contestuale "⋮" (evento.html)
Aggiunta una nuova riga "Guida" nel menu a tre puntini in alto in evento.html
(`#eventMenu`), tra "Passa a Pro" e il divider che precede "Elimina evento" —
icona "?" in un cerchio, porta a `/aiuto.html`. Stesso identico markup/pattern
delle altre voci (`.ctx-item`).

### Fix freccia "Indietro" in aiuto.html
Con due punti di ingresso ora attivi alla Guida (logo grande in home, voce
"Guida" nel menu di un evento), la freccia "Indietro" con `href="/index.html"`
fisso sarebbe stata sbagliata quando si arriva da un evento (avrebbe riportato
in home invece che all'evento di provenienza). Corretto con
`onclick="if(window.history.length>1){event.preventDefault();window.history.back();}"`
— torna alla pagina di provenienza quando possibile, mantenendo `/index.html`
come fallback (href nativo) se la Guida viene apera direttamente (es. da un
collegamento esterno, history.length 1).

### Evidenziazione "Help" sul logo — IMPLEMENTATA (v6.2, index.html + app.js v2.19)
Dopo conferma del cliente sull'anteprima (`preview_help_hint.html` — bordo
tratteggiato ambra pulsante intorno a icona+testo "WeGo", freccetta animata
con etichetta "Help" in alto a destra, punta verso il bordo; movimento
dell'animazione da alto verso basso-SINISTRA, coerente con la direzione della
freccia), implementata per davvero nella welcome screen:

- **Markup** (`index.html`): due nuovi elementi `#helpPulseBorder` (il bordo)
  e `#helpPointer` (freccia+etichetta "Help") dentro il link `<a>` che avvolge
  icona+testo "WeGo" — nascosti di default (`display:none` inline), mostrati
  da JS solo quando serve. Stesse identiche classi/animazioni CSS
  dell'anteprima approvata (`.help-pulse-border`, `.help-pointer`,
  `@keyframes helpPulseBorder`, `@keyframes helpNudge`).
- **Click = scompare per sempre**: il link ha un `onclick` che scrive subito
  `localStorage.setItem('wego_help_hint_clicked','1')` PRIMA di navigare verso
  `/aiuto.html` — da quel momento l'evidenziazione non comparirà mai più su
  questo dispositivo.
- **Contatore visite** (`app.js` v2.19, `App._renderHelpHint()`, richiamata da
  `_render()`): legge/scrive due chiavi `localStorage` dedicate —
  `wego_help_hint_views` (contatore) e `wego_help_hint_clicked` (flag). Mostra
  bordo+freccia solo se `!clicked && views < 2`; ad ogni NUOVO caricamento
  pagina (non ad ogni `_render()` — vedi sotto) incrementa il contatore di 1.
  **Tutto e solo sul dispositivo**: NESSUNA sincronizzazione col server, è
  un suggerimento visivo locale, non un dato dell'evento.
- **Guardia anti-doppio-conteggio** (`App._helpHintCounted`, flag in
  memoria): `_render()` può essere richiamata più volte nello stesso
  caricamento di pagina (es. una volta con i dati locali, di nuovo dopo ogni
  sync in background via `_syncQuiet()`) — senza questa guardia il contatore
  "visite" si sarebbe potuto incrementare più volte per una singola visita
  reale dell'utente, facendo sparire l'evidenziazione troppo in fretta. Con
  la guardia, l'incremento avviene una sola volta per caricamento pagina,
  indipendentemente da quante volte `_render()` viene richiamata.
- **Nota legata al "bug" `.hidden` già documentato sopra**: poiché la welcome
  screen resta sempre visibile anche con eventi presenti (comportamento
  confermato e voluto dal cliente, non corretto), anche l'evidenziazione
  "Help" segue la stessa sorte — è soggetta alle stesse identiche regole
  (prime 2 visite/clic) indipendentemente dal fatto che l'utente abbia o no
  eventi.

---

## 5sexdecies. Fix overlap header su freccia "Help" + bottone reset per i test (nessun bump versione — richiesta esplicita cliente)

### Fix: la barra in alto coprivo parzialmente freccia+"Help" (index.html)
Bug segnalato dal cliente testando su mobile: `.app-header` è `position:sticky;
top:0; z-index:100` (style.css) — più "in alto" di tutto il resto della
pagina. Il calcolo originale del posizionamento di `#helpPointer`
(`top:-58px` rispetto al logo) non teneva conto dello spazio occupato
dall'header sticky + dal padding di `.page-content` (12px), risultando in un
overlap: la freccia e l'etichetta "Help" finivano parzialmente sotto la barra
in alto, quindi tagliate/invisibili in cima.

**Fix**: aumentato il padding-top della hero (il div che contiene
icona+testo+badge nella welcome screen) da `32px` a `56px` — lascia
abbastanza spazio sopra il logo perché freccia+etichetta (alte circa 56px in
totale) si posizionino interamente SOTTO il bordo inferiore dell'header
(52px), con un margine di sicurezza di circa 10px. Nessun'altra modifica:
stesse animazioni, stesso bordo, stessa logica di comparsa.

**Effetto collaterale accettato**: la welcome screen ha ora ~24px di spazio
in più sopra il logo SEMPRE, anche per chi ha già esaurito le 2 visite o ha
già cliccato il link (il padding è statico via CSS, non condizionale via
JS) — scelta deliberata per restare semplice; l'effetto visivo è minimo
(spaziatura leggermente più ampia in cima), non è stato reso condizionale.

### Bottone "Reset evidenziazione Help" in admin.html (per ritestare)
Il cliente ha chiesto come ritestare la freccia dopo aver già esaurito le 2
visite consentite. Aggiunta una nuova sezione "Test / Debug locale" in
`admin.html`, con un bottone che cancella le due chiavi `localStorage`
dedicate (`wego_help_hint_views` e `wego_help_hint_clicked`) SOLO su questo
browser/dispositivo — non tocca altri dati (tema, sessioni, licenza), a
differenza di un "cancella dati del sito" generico dal browser che
azzererebbe anche quelli. Dopo il reset basta riaprire/ricaricare la home.

**In alternativa**, senza passare da admin.html, lo stesso risultato si
ottiene aprendo la Console del browser (es. via ispezione remota da desktop
se si sta testando su mobile) sulla pagina `index.html` ed eseguendo:
```js
localStorage.removeItem('wego_help_hint_views');
localStorage.removeItem('wego_help_hint_clicked');
```
poi ricaricando la pagina.

---

## 5septendecies. Divisione delle migliaia negli importi (nessun bump versione — richiesta esplicita cliente)

### Fix centralizzato in `Utils.formatAmount()` (utils.js)
Richiesta cliente: gli importi nelle tab Movimenti/Partecipanti/Saldi
mancavano del separatore delle migliaia (es. "1234,56 €" invece di
"1.234,56 €"). `formatAmount()` è l'UNICA funzione usata in tutto il
progetto per formattare un importo in valuta (richiamata 15 volte in
`evento.js` e 1 volta in `spesa.js`) — corretta lì, il fix si propaga
automaticamente a tutti i punti che la usano: Movimenti, Saldi (saldi
personali E il nuovo saldo informativo "Cassa Comune"), Partecipanti
(Versato/Incassato), i 4 totali in alto, e anche il testo di "Condividi
riepilogo" e la vista di un movimento già salvato in spesa.html — non solo
le 3 tab esplicitamente citate dal cliente, per coerenza in tutta l'app.

**Scoperta interessante durante l'implementazione**: il modo "ovvio"
(`n.toLocaleString('it-IT', {minimumFractionDigits:2,maximumFractionDigits:2})`)
NON avrebbe risolto il problema per gli importi a 4 cifre (1.000–9.999): i
dati locale italiani in JavaScript **non raggruppano i numeri a 4 cifre**
(es. restituiscono "1234,56" senza punto — pensato per non separare gli
anni, es. "1984"), e raggruppano solo da 5 cifre in su (10.000+). Per un
importo in euro questo comportamento non va bene (un conto di 1.234,56€ va
scritto col punto). Risolto raggruppando le migliaia A MANO con una regex
(`replace(/\B(?=(\d{3})+(?!\d))/g, '.')`), indipendente da qualunque dato
locale del browser — stesso risultato identico su tutti i dispositivi.

Nessun cambiamento di comportamento per il resto: 2 decimali sempre,
virgola come separatore decimale, posizionamento del simbolo di valuta
invariato, numeri negativi (debiti) gestiti correttamente
(es. "-1.234,56 €").

---

## 5duodevicies. Numero di versione accanto al logo "WeGo" + tab "Riepilogo" con grafico a torta (v6.3)

### Numero di versione nell'header (index.html)
Richiesta cliente: la scritta "WeGo" in alto a sinistra nell'header
(non il logo grande della welcome screen) ora mostra anche il numero di
versione, es. "WeGo v. 6.3", con carattere il 50% più piccolo (14px
contro i 28px di "WeGo") e colore attenuato (`var(--text-secondary)`),
allineato alla base del testo principale. Valore scritto a mano nel
markup (come già il resto dei numeri di versione in tutta l'app — nessun
meccanismo automatico), va aggiornato manualmente ad ogni bump insieme
al `<title>`.

### Nuovo 4° tab "Riepilogo" (evento.html v6.3 / evento.js v2.24)
Aggiunto un tab dopo "Saldi": "Movimenti / Partecipanti / Saldi /
Riepilogo". Contiene un grafico a torta (donut) delle spese, con 3 chip
per scegliere la suddivisione delle fette:
- **Partecipante** (default): importo raggruppato per chi ha pagato
  (`paid_by`) — fetta = totale pagato da quella persona, stesso colore
  del suo avatar ovunque nell'app (`Utils.avatarColorIndex`).
- **Data**: raggruppato per giorno esatto (`exp.date`), etichetta con
  `Utils.formatDateLabel()` ("Oggi"/"Ieri"/data estesa).
- **Tipo spesa**: raggruppato per categoria (`ExpenseCategories`); le
  spese senza categoria confluiscono in una fetta "Senza categoria".

**Quali movimenti entrano nel grafico**: SOLO le spese reali, la stessa
identica definizione già usata dai 4 totali in Movimenti
(`_riepilogoRealExpenses()`: tipo `'expense'` e `!is_forecast`) —
Previsioni, Trasferimenti e "+Cassiere" sono sempre esclusi, per
coerenza con il resto della pagina.

**Implementazione tecnica**: torta CSS pura con `conic-gradient`
generato in JS (nessun canvas/SVG/libreria esterna — coerente con "no
framework, no build step", vedi §2), "buco" del donut ottenuto con un
div sovrapposto dello stesso colore di sfondo della pagina
(`var(--bg-primary)`), che mostra il totale al centro. Sotto la torta,
legenda con pallino colore, etichetta, percentuale e importo, ordinata
per importo decrescente. Stato vuoto ("Nessuna spesa da riepilogare")
se non ci sono spese reali nell'evento.

### Decisioni prese (confermate con l'utente prima di implementare)
- "Per Partecipante" = chi ha pagato (paid_by), NON la quota pro-capite
  a carico di ciascuno (importo diviso tra i partecipanti alla spesa).
- "Per Data" = giorno esatto, non raggruppato per settimana/mese.
- Il totale del grafico usa solo le spese reali (stessa base dei 4
  totali Movimenti), le Previsioni sono escluse.

### File toccati
`index.html` (v6.3), `evento.html` (v6.3), `evento.js` (v2.24),
`sw.js` (v6.3 — solo bump "famiglia", nessuna modifica alla lista di
precache), `manifest.json` (v6.3), `impostazioni.html` (v6.3 — solo
bump "famiglia", nessun contenuto nuovo).

---

## 5undevicies. Export Excel del riepilogo movimenti (v6.4)

Bottone "Esporta in Excel" nel tab Riepilogo (sotto il grafico a
torta), richiesto dal cliente con un file .xls di esempio ("fax
simile") da cui è stata dedotta la struttura.

### Libreria usata
**ExcelJS 4.4.0**, build "bare" (senza polyfill core-js — adatta a
browser moderni), vendorizzata in locale come `exceljs.min.js` (≈840KB
minificato, nessun CDN esterno) e aggiunta a `STATIC_ASSETS` in
`sw.js` per funzionare offline dopo il primo caricamento. Necessaria
perché SheetJS/xlsx "community" (l'alternativa più nota) non supporta
la formattazione (colori, grassetto, bordi, merge) in scrittura nella
versione gratuita — qui invece serve un file "ben impostato".

### Struttura del file generato
Replica la struttura del file di esempio fornito dal cliente:
- **Riga 1**: titolo evento + data di esportazione (celle unite).
- **Righe 2-3**: intestazione — colonne fisse (Titolo, **Tipologia**
  [NUOVO, non presente nell'esempio — valori "Spesa"/"Trasf."/
  "Cassiere"], Importo, Valuta, Da, Data, Creato il) unite in
  verticale; poi una coppia di colonne per ogni partecipante
  dell'evento, intestazione col nome unita in orizzontale e sotto
  due sotto-colonne "Versato" (credito) / "Quota" (debito).
- **Una riga per movimento**, ordinato per data crescente (data del
  movimento, o data creazione se assente). Per ogni riga, "Versato" e
  "Quota" di ciascun partecipante sono calcolati con
  `_riepilogoMovementDeltas()` — la STESSA logica di
  `Utils.calculateBalances()` (utils.js) riapplicata riga per riga
  invece che in accumulo:
  - **Spesa**: chi paga (`paid_by`) → Versato = intero importo; ogni
    partecipante (`participants`) → Quota = -importo/n. partecipanti
    (chi paga, se è anche partecipante, ha valorizzate entrambe le
    colonne sulla stessa riga).
  - **Trasferimento**: chi invia (`paid_by`) → Versato = +importo; chi
    riceve (`paid_for`) → Quota = -importo. Nessuno split.
  - **"+Cassiere"**: segno invertito rispetto a una spesa — il
    cassiere (`paid_by`) → Quota = -importo (intero, non diviso); ogni
    versante (`participants`) → Versato = +importo/n. versanti.
- **Riga TOTALE**: una formula Excel `SUM()` per colonna (non un
  valore precalcolato) che copre entrambe le sotto-colonne di ogni
  partecipante su tutte le righe dati — il risultato combacia SEMPRE
  con `EventoApp._balances`/tab Saldi, perché entrambi derivano dalla
  stessa logica di calcolo sugli stessi movimenti. Verificato con
  `scripts/recalc.py` (LibreOffice): 0 errori di formula.

### Quali movimenti include
**Tutti i movimenti reali**: spese + trasferimenti + "+Cassiere" — a
differenza del grafico a torta del tab Riepilogo (che esclude
Trasf./Cassiere), qui sono sempre inclusi perché è proprio la colonna
"Tipologia" richiesta dal cliente a doverli distinguere. Escluse solo
le **Previsioni** (`is_forecast`), stessa base di `_calcBalances()` —
scelta per coerenza con tutto il resto dell'app (mai chiesto
esplicitamente, assunzione dichiarata all'utente).

### Consegna del file
Doppio percorso, senza bisogno di chiedere all'utente ogni volta:
1. Se il browser/OS supporta la Web Share API con i file
   (`navigator.canShare({files:[...]})`, Chrome Android e Safari iOS
   moderni) → apre il foglio di condivisione nativo (WhatsApp, Mail,
   Drive, Salva su File...).
2. Altrimenti (desktop o browser non supportati) → download diretto
   del file (link temporaneo con `download`).

### File toccati
`evento.html` (v6.4 — script `exceljs.min.js` + bottone), `evento.js`
(v2.25 — `exportRiepilogoExcel()` e `_riepilogoMovementDeltas()`),
`sw.js` (v6.4 — `exceljs.min.js` aggiunto a `STATIC_ASSETS`),
`exceljs.min.js` (NUOVO file, vendorizzato), `index.html`/
`impostazioni.html`/`manifest.json` (v6.4 — solo bump "famiglia").

---

## 5vicies. Fix grafico Riepilogo, bottone Excel, backup completo Pro (v6.5)

### 1) Grafico Riepilogo — "Per Partecipante" include i Trasferimenti
Bug segnalato dal cliente: la fetta "Per Partecipante" usava
`_riepilogoRealExpenses()` (solo tipo `'expense'`) anche per questo
criterio, escludendo di fatto chi aveva solo inviato Trasferimenti.
Nuova funzione `_riepilogoPartecipanteMovements()` (spese + Trasf.,
"+Cassiere" resta escluso — non richiesto, e nel modello dati il
"pagatore" di un movimento cassiere è il cassiere che INCASSA, non chi
versa: includerlo confonderebbe il significato della fetta). "Data" e
"Tipo spesa" restano invariati (solo spese reali — non ha senso
raggruppare un trasferimento per categoria). Di conseguenza anche il
totale al centro della torta ora cambia in base al criterio
selezionato, sempre coerente con le fette che lo compongono.

### 2) Bottone export Excel: titolo, icona, conferma
- Titolo: "Esporta in Excel" → **"Esporta Movimenti in Excel"**.
- Icona: sostituita la generica icona "documento" con un'icona
  "foglio di calcolo" originale (quadrato verde + griglia bianca —
  NON il logo Excel di Microsoft, che è un marchio registrato e non va
  riprodotto: qui è solo un'icona generica che richiama visivamente
  "foglio di calcolo/verde").
- Conferma: `confirm()` nativo in cima a `exportRiepilogoExcel()`,
  PRIMA di qualunque generazione — stesso pattern già usato da
  `SettingsApp.forceUpdate()` in impostazioni.html.

### 3) Fix "Esporta dati locali" (impostazioni.html) — backup incompleto
**Bug preesistente trovato verificando la richiesta del cliente**:
`SettingsApp.exportData()` chiamava SOLO `DB.events.getAll()`. In
IndexedDB "events" è uno store SEPARATO da "users"/"expenses"/
"payments" (vedi `db.js` `STORES`) — il backup scaricato non conteneva
NESSUNA spesa, partecipante o pagamento, solo i metadati degli eventi
(titolo, codice, valuta...). Corretto: ora raccoglie anche
`DB.users.getAll()` / `DB.expenses.getAll()` / `DB.payments.getAll()`
(NUOVI in `db.js` v1.10 — non esistevano metodi pubblici non filtrati
per queste tre entità, solo `getByEvent()`/`getUnsyced()`). Il backup
ora include OGNI campo di ogni spesa (tipo, importo, valuta, paid_by,
paid_for, participants, payment_method, category, is_forecast,
is_cassa_comune, date, location, has_photo, notes, created_by,
timestamps — l'elenco completo di `db.js` `expenses.save()`, comprese
le aggiunte più recenti). Le **foto** (store "photos", blob binari)
restano escluse dal JSON per non farne esplodere le dimensioni — non
richiesto esplicitamente, e concettualmente sono già gestite dalla
sincronizzazione normale. Campo `payload.version` passato da `'1.2'` a
`'2.0'` per poter distinguere in futuro un backup vecchio (solo
eventi, incompleto) da uno nuovo.

### 4) Gate Pro su "Esporta dati locali"
Riga "Esporta dati locali" ora riservata alla versione Pro: badge
"PRO" (ambra) accanto all'etichetta + opacità ridotta quando il
device è Base, controllati da `_renderLicenseInfo()`. Il click resta
sempre attivo anche da Base: apre l'upsell "Richiedi soluzione
completa" (`SettingsApp.showRequestPro()`) invece di essere un bottone
morto — coerente con gli altri gate Pro già presenti nell'app.

### Import da backup JSON (v6.6)
Implementato dopo conferma del cliente su 2 scelte chiave:
1. **Merge per ID** (non sostituzione totale): ogni entità del backup
   passa per il rispettivo `DB.*.save()` esistente (che fa un `put()`
   IndexedDB — upsert per `id`) — i record con lo stesso id vengono
   sovrascritti dal backup, tutti gli altri dati locali restano
   intatti. Nessuna cancellazione, nessun nuovo codice di merge: riuso
   diretto delle stesse funzioni `.save()` già usate ovunque nell'app.
2. **Nessuna sincronizzazione forzata**: i record vengono salvati così
   come sono nel backup, flag `synced` incluso — quelli già
   sincronizzati in origine non vengono ri-inviati, quelli non
   sincronizzati verranno ripresi in automatico dal normale
   `Sync.push()`/`pullEvent()` già esistente, alla prossima apertura di
   ciascun evento. **Nessuna chiamata di rete durante l'import.**

Anche il `config` (nickname, tema, metodi di pagamento, categorie
spesa, sessioni device→utente per evento...) viene unito chiave per
chiave (`Utils.setConfig`) — non tocca chiavi assenti dal backup.

Flusso: `SettingsApp.importData()` (gate Pro, poi apre il file picker
nascosto `#importFileInput`) → `_handleImportFile()` legge il JSON,
valida che sia un oggetto con almeno uno tra events/users/expenses/
payments non vuoto, rileva i backup vecchi (formato pre-v6.5, solo
eventi) e lo segnala nel messaggio di conferma, mostra un riepilogo
(quanti eventi/partecipanti/movimenti/pagamenti, data del backup) in
un `confirm()` nativo PRIMA di scrivere qualunque cosa, poi importa e
ricarica la pagina (`location.reload()`) per rendere visibile ovunque
il nuovo stato.

Riservato alla versione Pro, stesso gate/badge di "Esporta dati
locali".

### File toccati (import)
`impostazioni.html` (v6.6 — riga "Importa da backup", input file
nascosto, `importData()`/`_handleImportFile()`), `index.html`/
`evento.html`/`sw.js`/`manifest.json` (v6.6 — solo bump "famiglia").

---

## 5sexvicies. Mappa GPS nel tab Riepilogo (v6.7)

4° criterio nel selettore del tab Riepilogo, accanto a Partecipante/
Data/Tipo spesa: **Mappa**. A differenza degli altri 3 (che ridisegnano
la torta), "Mappa" è una vista completamente diversa — `_renderRiepilogo()`
smista subito su un ramo separato quando `mode === 'mappa'`.

### Scelta tecnica (concordata con l'utente in chat)
Il cliente ha chiesto "tramite Google Maps" ma non ha una API key
Google Maps attiva (necessaria per incorporare una mappa interattiva
multi-pin — senza key l'unica opzione Google è aprire link esterni).
Proposte 3 alternative, scelta la più completa: **entrambe**:
1. **Mappa incorporata nella pagina**: OpenStreetMap + **Leaflet**
   1.9.4 (libreria gratuita, open source, nessuna API key/fatturazione
   — coerente col resto del progetto, che usa già Nominatim/OSM per il
   reverse geocoding in spesa.js). Vendorizzata in locale
   (`leaflet.js`/`leaflet.css`/`leaflet-marker-*.png`, ~165KB totali),
   precaricata da `sw.js` per funzionare offline — I TILE della mappa
   restano scaricati dalla rete al momento della visualizzazione (non
   precacheabili, richiedono connessione: stesso limite che avrebbe
   avuto anche una vera mappa Google).
2. **Bottone "Apri tutte le posizioni in Google Maps"**: link diretto
   multi-tappa `https://www.google.com/maps/dir/lat1,lng1/lat2,lng2/...`
   — nessuna API key, stesso pattern già usato in spesa.html per una
   singola spesa (lì con `?q=lat,lng`).

### Quali spese include
Solo tipo `'expense'` con `location.lat`/`location.lng` numerici e
`!is_forecast` (`_riepilogoMappaExpenses()`). Trasferimenti e
"+Cassiere" sono esclusi automaticamente: nel form (spesa.js) il
rilevamento GPS è visibile SOLO per il tipo "Spesa" (`gpsCard.style.display
= type === 'expense' ? '' : 'none'`), quindi per costruzione non hanno
mai un campo `location` valorizzato — non serve un filtro esplicito sul
tipo, basta il filtro su `location`. Le Previsioni sono escluse
esplicitamente, come nel resto del tab Riepilogo. Se nessuna spesa ha
una posizione salvata, mostra "Nessuna spesa con posizione GPS
salvata" invece della mappa vuota.

### Dettagli implementativi
- Mappa creata una sola volta (`EventoApp._riepilogoLeafletMap`,
  lazy-init al primo utilizzo del criterio "Mappa" — un secondo
  `L.map()` sullo stesso elemento genera un errore) e poi riusata: ad
  ogni render i marker vengono ripuliti (`layerGroup.clearLayers()`) e
  ridisegnati, coerente col resto dell'app che ri-renderizza sempre
  dai dati in memoria piuttosto che fare update incrementali.
- `invalidateSize()` + `fitBounds()`/`setView()` rimandati con
  `requestAnimationFrame()`: la mappa può essere creata mentre il
  container è ancora `display:none` (tab non ancora visibile), Leaflet
  calcola le dimensioni giuste solo a container visibile.
- Popup per ogni pin: titolo, importo formattato (`Utils.formatAmount`),
  data, indirizzo (se presente da `Utils.reverseGeocode`, salvato in
  `location.address`).
- CSS: popup/controlli Leaflet riadattati al tema scuro dell'app
  (`.leaflet-popup-*`, `.leaflet-bar a`); i TILE della mappa restano
  quelli originali OpenStreetMap (a colori), non è possibile
  "temizzarli" senza un tile provider diverso — limite accettato.
- Attribution "© OpenStreetMap contributors" sempre visibile
  sulla mappa (richiesta dalla policy di utilizzo dei tile OSM).

### File toccati
`evento.html` (v6.7 — 4° chip, container mappa, CSS, script
`leaflet.js`/link `leaflet.css`), `evento.js` (v2.27 —
`_riepilogoMappaExpenses()`, `_renderRiepilogoMappa()`,
`_configureLeafletIcons()`), `sw.js` (v6.7 — `leaflet.js`/`.css`/
`marker-*.png` aggiunti a `STATIC_ASSETS`), `leaflet.js`/`leaflet.css`/
`leaflet-marker-icon.png`/`leaflet-marker-icon-2x.png`/
`leaflet-marker-shadow.png` (NUOVI file, vendorizzati), `index.html`/
`impostazioni.html`/`manifest.json` (v6.7 — solo bump "famiglia").

---

## 5septvicies. Sincronizzazione differita ("quieta") — meno impattante (v6.8)

Richiesta cliente: salvare un movimento non deve più bloccare l'utente
in attesa della rete. Prima, `saveExpense()`/`deleteExpense()` in
spesa.js facevano `await Sync.push(); await Sync.pullEvent(...)`
PRIMA di mostrare "Spesa salvata" e tornare alla pagina evento —
l'utente restava fermo per tutta la sincronizzazione.

### Vincolo tecnico che ha guidato la soluzione
Un `setTimeout` non sopravvive alla navigazione tra pagine (spesa.html
→ evento.html è un cambio pagina completo, il contesto JS si perde). Non
si può quindi programmare la sync differita su spesa.html e aspettarsi
che scatti dopo essere già tornati su evento.html.

### Soluzione implementata (3 decisioni confermate dal cliente in chat)
- **spesa.js v2.8**: `saveExpense()`/`deleteExpense()` NON chiamano più
  Sync in alcun modo — salvano/eliminano solo in locale e tornano
  SUBITO alla pagina evento (nessun cambiamento alla UI, solo rimossa
  l'attesa).
- **evento.js v2.28 / sync.js v2.1**: è il ricaricamento di evento.html
  che segue (`EventoApp.init()` → `_syncQuiet()`) a far scattare la sync
  vera e propria — ma ora **differita di 5 secondi** invece che
  immediata, tramite la nuova `Sync.scheduleQuietSync(eventId, 5000,
  onDone)`. Il refresh della UI (`EventoApp.loadAll()`) avviene solo a
  sync completata (callback `onDone`), non prima.
- **Debounce vero, nessun tetto massimo** (scelta esplicita): ogni
  chiamata a `scheduleQuietSync()` cancella il timer precedente e ne
  riparte uno nuovo — se l'utente salva più movimenti ravvicinati, la
  sync parte una sola volta, 5s dopo l'ULTIMO salvataggio. Se continua a
  lavorare senza pause, resta rimandata finché non si ferma per almeno
  5s (nessun limite massimo di attesa, come richiesto).
- **Rete di sicurezza automatica** (`flushQuietSyncNow()`, auto-
  installata in sync.js su `visibilitychange`/`pagehide`): se la pagina
  viene nascosta o chiusa prima che i 5s scadano, la sync in sospeso
  parte subito, così non si perde nulla anche uscendo dall'app appena
  dopo un salvataggio.
- **Ambito**: SOLO il salvataggio/modifica/eliminazione di una spesa
  (scelta esplicita del cliente) — tutte le altre sync immediate già
  presenti nell'app (aggiungere/modificare partecipanti, segnare un
  pagamento come saldato, tap manuale sull'icona di sync `syncNow()`,
  ecc.) restano invariate, ancora immediate/bloccanti dove già lo erano.
  `syncNow()` ora chiama `Sync.cancelQuietSync()` prima di partire, per
  evitare un secondo giro superfluo pochi secondi dopo.
- La rotella di sincronizzazione in header (`#syncIcon`,
  `Sync._showBar()`/`_hideBar()`) resta invariata: gira quando la sync
  differita parte DAVVERO (dopo i 5s), non durante l'attesa.

Verificato con un test funzionale Node (harness con `Sync.push()`/
`pullEvent()` sostituiti da contatori): 3 chiamate ravvicinate →
1 sola sync eseguita; `cancelQuietSync()` → 0 sync eseguite;
`flushQuietSyncNow()` → sync immediata, bypassa l'attesa.

### File toccati
`sync.js` (v2.1 — `scheduleQuietSync()`, `_runQuietSync()`,
`flushQuietSyncNow()`, `cancelQuietSync()`, rete di sicurezza auto-
installata), `evento.js` (v2.28 — `_syncQuiet()`/`syncNow()`),
`spesa.js` (v2.8 — rimossa l'attesa in `saveExpense()`/
`deleteExpense()`), `index.html`/`evento.html`/`impostazioni.html`/
`sw.js`/`manifest.json` (v6.8 — solo bump "famiglia", nessun contenuto
nuovo: il bump serve a rigenerare la cache del Service Worker con i
file JS aggiornati).

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
| v4.8 | **NUOVA FUNZIONALITÀ** (vedi §5quinquies): campo "Previsione" (spesa futura, non divisa, esclusa da saldi/totali da dividere, evidenziata a parte); campo "Tipo" (categoria spesa, facoltativo, gestita in Impostazioni come i metodi di pagamento); 4 totali nei Movimenti (Totale/Previsione/Spese/Pro capite); colonna "Prev." nei Saldi. **FIX**: licenza foto per-evento — un device Base collegato a un evento ospitato da un creatore Pro può ora sincronizzare le foto su quell'evento specifico (`License.photoSyncAllowedForEvent()`, nuovo campo `events.photo_sync_enabled`) |
| v4.9 | **NUOVA FUNZIONALITÀ — terzo tipo movimento "+Cassiere"** (vedi §5sexies): si comporta come una spesa normale (paid_by="A" il cassiere, participants="Da" chi versa, diviso tra loro) ma con segno OPPOSTO nei saldi/totali (`Utils.calculateBalances()` v1.3) — il cassiere va in debito, chi versa va in credito; considerato nei 4 totali di Movimenti (sottratto, non escluso come "Trasf."); badge verde nell'elenco movimenti. Bottone "Mov. cassa" rinominato "Trasf.". **FIX CRITICO**: `SupabaseClient.expenses.update()` non inviava `type`/`paid_for` al server — cambiare il tipo di un movimento esistente non si salvava davvero (veniva sovrascritto al pull successivo). **FIX**: checkbox nativa dell'interruttore "Previsione" visibile/fuori posizione in sola lettura (opacity inline sovrascriveva la classe CSS) |
| v5.0 | **FIX**: interruttore "Previsione" e select "Tipo" disallineati SOLO in modifica movimento (mai in una spesa nuova) — `setType()` usava `el.style.display=''` per mostrarli, che rimuove la proprietà "display" dallo style inline senza ripristinarla (ricadeva su "block" invece di "flex", dato che queste due righe hanno "display:flex" solo inline, non da classe CSS); ora impostato esplicitamente a `'flex'`. **FIX**: `_calcUserContribution()` (Versato/Incassato in Partecipanti) includeva per errore le spese "Previsione" nel totale; ora le esclude sempre. **NUOVO**: badge ambra "(Prev. ...)" accanto al saldo di ogni partecipante in Partecipanti, quando ha previsioni a suo nome |
| v5.1 | **NUOVO**: bottone "Installa" PWA in home (vedi §5octies), nascosto se già installata, comportamento diverso Android (prompt nativo `beforeinstallprompt`) vs iOS (istruzioni manuali, nessuna installazione programmatica possibile). **FIX CRITICO COLLEGATO**: tutte le icone PWA puntavano a `/icons/icon-NN.png` (cartella/nome inesistenti) invece dei file reali in root (`/iconNN.png`) — `manifest.json`, `sw.js`, `notifications.js`, `admin.html`, `apple-touch-icon` in `index.html`/`impostazioni.html`. Senza icone risolvibili Chrome non considerava la PWA installabile: il prompt nativo Android non si sarebbe mai generato |
| v5.2 | **FIX CRITICO — vera causa del prompt di installazione mai mostrato** (vedi §5nonies): le 8 icone PWA erano JPEG rinominati ".png", con dimensioni reali diverse da quelle dichiarate nel manifest (es. "192" era 196×196 reale, "144" e "152" erano lo stesso file 168×168). Chrome scarta icone con dimensione reale ≠ dichiarata — con nessuna icona valida, il manifest non superava il requisito minimo di installabilità, a prescindere da installazioni/disinstallazioni precedenti. Rigenerate come PNG veri alle dimensioni esatte. Rimosso "maskable" dal purpose (logo senza margine di sicurezza). `CACHE_NAME` incrementato per forzare il riscarico delle icone sui device che le avevano già in cache; aggiunta regola `Cache-Control` dedicata per i `.png` in `vercel.json` (mancava) |
| v5.3 | **RIMOZIONE — sincronizzazione selettiva eventi esterni** (vedi §5decies): ogni evento si sincronizza ora sempre, su qualunque device, senza richiesta/autorizzazione admin (era NUOVO in v3.7). Rimossi: gating in `app.js`/`db.js`/`sync.js`/`evento.js`, namespace `syncStatus` in `supabase.js`, sezione "Sincronizzazione eventi esterni" in `admin.html`, riga "Dispositivo proprietario" in `impostazioni.html`. Menu "Richiedi sincronizzazione" → "Passa a Pro" in evento.html. **REDESIGN**: lista "Soluzione completa (Pro)" in admin.html con header colonne fisso durante lo scroll, campo data editabile direttamente in ogni riga |
| v5.4 | **FIX SCHEMA SQL** — "permission denied for table sp_device_license" anche con `SUPABASE_SERVICE_KEY` corretta su Vercel: i privilegi di default su una tabella nuova non garantiscono sempre l'accesso in scrittura a `service_role` su ogni progetto Supabase. Aggiunto `GRANT` esplicito a `service_role` su `sp_device_license`/`sp_sync_status` (supabase.js v1.12) — **va rieseguito lo schema SQL aggiornato su Supabase**, un redeploy del codice da solo non basta |
| v5.5 | **FIX DIAGNOSTICO** — l'errore "permission denied" persisteva anche col GRANT confermato; escluse chiave sbagliata (JWT decodificato confirma `service_role`) e RLS (messaggio Postgres diverso per le policy RLS). `/api/device-license.js` e `/api/sync-status.js` (v3) ora propagano l'errore Postgres COMPLETO (code/details/hint) invece del solo messaggio breve, per individuare con certezza la causa esatta al prossimo tentativo, senza dover guardare i log di Vercel |
| v5.6 | **FIX CRITICO** — `License.requestPro()` nascondeva qualunque errore reale del server (es. permessi su sp_device_license) dietro un falso "Richiesta inviata!": se il tentativo diretto falliva pur essendo online, veniva solo loggato in console e la richiesta restava accodata silenziosamente, restituendo comunque successo al chiamante. Scoperto svuotando la tabella per riprovare da zero: le nuove richieste "Passa a Pro" non comparivano più, ma nessun errore era mai stato visibile. Ora l'errore viene rilanciato al chiamante (mostrato con un toast reale in Impostazioni e nella schermata di downgrade), restando comunque in coda come backup per i problemi di rete transitori |

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

**Versione attuale:** v6.8 (v3.8 per spesa.html/spesa.js, v1.0 per aiuto.html)
**Service Worker cache:** `wego-v6.8`

---

## 11. Cose da fare / lavori futuri — PRIORITÀ

### ✅ Licenza Base/Pro — COMPLETA (tutte le 4 fasi fatte, vedi §5bis per il dettaglio)
Nessuna azione residua lato codice.

### 🔒 Modifica di sicurezza v4.7 — vedi §5quater per il dettaglio completo
**ATTENZIONE ALL'ORDINE DI DEPLOY** — se carichi il nuovo codice senza prima fare questi due
passaggi, "Richiedi soluzione completa" si romperà (la anon key non avrà più i permessi, e
la funzione server non avrà ancora la chiave nuova):
1. [ ] Recupera la **service role key** di Supabase (Settings → API, sotto la anon key — diversa, più lunga, NON quella che già usi)
2. [ ] Aggiungi una nuova variabile d'ambiente su Vercel: `SUPABASE_SERVICE_KEY` = quella chiave, poi rideploy
3. [ ] Esegui di nuovo lo schema SQL aggiornato (Admin → Schema SQL → copia → Supabase SQL Editor → Run) — contiene le `REVOKE` indispensabili, un semplice re-deploy del codice non le applica da solo
4. [ ] Solo dopo i punti 1-3, carica i file nuovi su GitHub/Vercel

### ⚠️ Da completare TU (richiede accesso al progetto Supabase/Vercel, non eseguibile da Claude)
- [ ] **🆕 NUOVO v5.7 — Eseguire la migrazione SQL per `sp_expenses.is_cassa_comune`** (Admin → Schema SQL → copia → Supabase SQL Editor → Run): aggiunge la colonna booleana per il nuovo flag "Uso Cassa Comune" (vedi §5septies). **Senza questa colonna il flag si salva solo in locale (IndexedDB) e non si sincronizza mai sul server** (fallisce silenziosamente, stessa dinamica già nota per category/is_forecast)
- [ ] **🔴 URGENTE v5.4 — Rieseguire lo schema SQL aggiornato** (Admin → Schema SQL → copia → Supabase SQL Editor → Run): aggiunge il `GRANT` a `service_role` su `sp_device_license`/`sp_sync_status` che risolve "permission denied for table sp_device_license" quando abiliti/disabiliti la versione Pro da admin.html. Un redeploy del codice da solo NON applica questo GRANT, va eseguito a mano sul database
- [ ] **v5.6 — prossimo passo concreto**: ricarica `license.js` (v1.4) insieme agli altri file di questa sessione, poi da un device qualsiasi vai su Impostazioni → "Richiedi soluzione completa" → invia una richiesta di prova. Se c'è ancora un problema di permessi, ORA comparirà un toast con l'errore vero (prima veniva nascosto) — riportalo per la diagnosi definitiva. Se invece "Richiesta inviata!" questa volta è vero, controlla che il dispositivo compaia nella lista di admin.html
- [ ] **Eseguire le migrazioni SQL non ancora confermate**: `sp_users.joined_at`, `sp_users.last_sync_at`, tabella `sp_push_subscriptions`, colonna `sp_events.photo`, tabella `sp_expense_photos` (per la sincronizzazione foto movimenti), tabella `sp_device_license` (per la licenza Base/Pro), le `REVOKE` su sp_sync_status/sp_device_license (v4.7), **NUOVO v4.8: colonne `sp_events.photo_sync_enabled`, `sp_expenses.category`, `sp_expenses.is_forecast`**. Schema completo sempre disponibile in Admin → Schema SQL. **Senza queste colonne/tabelle, le funzioni "connesso multi-device", "ultima sincronizzazione", "modifica evento", "sincronizzazione foto movimenti", "richiesta soluzione completa", "Previsione/Tipo" e "fix licenza foto per-evento" falliranno silenziosamente** (la app non si rompe, ma quei campi non si aggiorneranno mai sul server). La tabella `sp_sync_status` (sincronizzazione eventi esterni) è VESTIGIALE da v5.3 — non serve più crearla, nessun file la usa più
- [ ] **NUOVO v4.7 — Impostare `SUPABASE_SERVICE_KEY` su Vercel** (vedi sopra) — verifica che sia la chiave **`service_role`** (Supabase → Project Settings → API), NON la `anon`/`public`: sono due chiavi diverse mostrate sulla stessa pagina, facili da scambiare per errore
- [ ] **NUOVO v3.7 — Impostare 2 variabili d'ambiente su Vercel** (Project → Settings → Environment Variables), poi rideployare:
  - `ADMIN_PASSWORD` → la password vera del pannello admin (sostituisce quella che prima era in chiaro nel codice)
  - `OWNER_DEVICE_SECRET` → **VESTIGIALE da v5.3** (serviva solo al gating eventi esterni, ora rimosso) — non serve più impostarla per nuovi deploy, nessun file la usa più
- [ ] **NUOVO v3.7 — Verificare che Vercel rilevi la cartella `/api/`** come funzioni serverless dopo il primo upload (dovrebbe essere automatico, nessuna configurazione aggiuntiva in `vercel.json` richiesta per il runtime Node di default)
- [x] **Deployare la Edge Function** `supabase-function/send-push-notification/` — **fatto, v4.0**. Durante l'attivazione sono emersi e risolti 2 problemi non previsti: (1) il bottone "Create Webhook" della Dashboard dava errore `schema "supabase_functions" does not exist` (bug noto della piattaforma su alcuni progetti) → risolto con trigger manuale via `pg_net`/`net.http_post` direttamente in SQL; (2) dopo aver rigenerato le chiavi VAPID, le notifiche risultavano "inviate" senza errori lato client ma non arrivavano mai → causa: `notifications.js` riusava la sottoscrizione del browser legata alla VECCHIA chiave pubblica, mai confrontata con quella nuova (fix in `notifications.js` v1.2, vedi tabella fix v4.0)

### Idee non ancora implementate
- [ ] `offline.html` — pagina mostrata dal SW quando si è offline e la pagina non è in cache
- [ ] Archiviazione evento (flag `archived`)
- [ ] Gestione conflitti di merge (attuale: last-write-wins su `updated_at`)
- [x] ✅ **FATTO in v6.3** — nuovo tab "Riepilogo" dopo "Saldi" con grafico a torta delle spese, suddivisibile per Partecipante/Data/Tipo spesa (categoria, `ExpenseCategories`) — vedi §5duodevicies per il dettaglio. Le Previsioni NON sono incluse (stessa base dei 4 totali Movimenti).
- [ ] Esportazione riepilogo in PDF
- [ ] Supporto multi-valuta per spesa singola con conversione
- [ ] Risoluzione spese orfane dopo eliminazione partecipante
- [ ] Sync bidirezionale della foto (attualmente solo locale sul device del proprietario)
- [ ] Verificare se serve un heartbeat periodico per "connesso" oltre al semplice `joined_at` (attualmente "connesso" = ha fatto il join almeno una volta e non si è scollegato esplicitamente; non è una presenza realtime minuto-per-minuto)

---

## 12. Note per Claude su questa sessione di sviluppo

- L'utente lavora **da mobile** (Chrome Android), testa modifiche reali sul deploy live, e fa debug iterativo: a volte segnala un sintomo ("scrolla ancora", "appare ancora a destra") che richiede di **verificare il codice riga per riga** prima di concludere che sia un problema di deploy — più volte in questa sessione un bug "rimasto" si è rivelato un secondo problema distinto non ancora coperto dal fix precedente (es. lo scroll aveva 2 cause sovrapposte; l'avatar aveva una causa CSS diversa da quella inizialmente sospettata)
- Quando l'utente dice "non occorre aggiornare la versione" è per quella specifica sessione/richiesta di debug rapido, non una regola permanente
- L'utente preferisce che si chiedano chiarimenti su ambiguità di business logic (es. formula saldi/contributi) PRIMA di implementare, con esempi numerici concreti se possibile
- Schema SQL sempre mantenuto retrocompatibile con `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, mai modifiche distruttive
