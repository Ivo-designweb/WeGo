// ═══════════════════════════════════════════════════════════════
// WeGo — Supabase Edge Function: send-push-notification
// ═══════════════════════════════════════════════════════════════
//
// COSA FA:
// Riceve gli eventi di INSERT e UPDATE su sp_expenses (e INSERT su
// sp_payments — vedi sotto) tramite un Database Webhook configurato nel
// Dashboard Supabase, recupera tutte le sottoscrizioni push collegate a
// quell'evento (tabella sp_push_subscriptions) — escludendo chi ha
// appena eseguito l'operazione — e invia a ciascuna una notifica Web
// Push firmata con le chiavi VAPID.
//
// v2 (NUOVO): oltre alla "nuova spesa/movimento" (INSERT), ora gestisce
// anche modifica ed eliminazione di un movimento (UPDATE su sp_expenses —
// l'eliminazione in WeGo è un soft-delete, quindi tecnicamente anche lei
// è un UPDATE con deleted:true). Distingue i due casi confrontando
// old_record.deleted con record.deleted. Usa il NUOVO campo
// record.updated_by (chi ha eseguito l'azione ADESSO — vedi db.js v1.11/
// supabase.js v1.15) per il nome dell'autore, e record.created_by per il
// nome del proprietario ORIGINALE, citato solo se diverso dall'autore.
// Corretto anche un mislabeling preesistente: i movimenti "+Cassiere"
// (type:'cashier') venivano annunciati come "Nuova spesa" — ora hanno un
// titolo/testo dedicato, come i trasferimenti.
//
// COME SI ATTIVA:
//   Database → Webhooks → il webhook già esistente su sp_expenses:
//     - Events: spuntare anche "Update" (oltre a "Insert" già presente)
//   sp_payments NON necessita di modifiche: resta solo su Insert, la
//   modifica/eliminazione dei pagamenti saldati non è in questo giro di
//   lavoro (il codice sotto la gestisce comunque in modo innocuo, nel
//   caso la abilitiate in futuro).
//
// SEGRETI NECESSARI (supabase secrets set ...):
//   VAPID_PUBLIC_KEY   = la stessa chiave pubblica già in Impostazioni > Admin
//   VAPID_PRIVATE_KEY  = la chiave privata corrispondente (NON va mai nel client)
//   VAPID_SUBJECT      = es. "mailto:tuonome@esempio.com" (richiesto dal protocollo Web Push)
//   SUPABASE_URL              (già presente di default nelle Edge Functions)
//   SUPABASE_SERVICE_ROLE_KEY (già presente di default nelle Edge Functions)
//
// DEPLOY:
//   supabase functions deploy send-push-notification
//
// ═══════════════════════════════════════════════════════════════

// @deno-types="npm:@types/web-push@3"
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY           = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY          = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT              = Deno.env.get("VAPID_SUBJECT") || "mailto:noreply@example.com";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// ─── HELPER: chiamata REST a Supabase con la service role key ──────
// (bypassa le policy "anon" — necessario per leggere/scrivere
// sp_push_subscriptions e leggere nomi utente/evento lato server)
async function sbRequest(method: string, path: string, body: unknown = null) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      "Content-Type":  "application/json",
      "apikey":        SUPABASE_SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Prefer":        "return=representation"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(`Supabase REST error ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

// Etichette per tipo di movimento (sp_expenses.type) — usate sia per il
// nome comune ("una spesa" / "un movimento di cassa" / "un versamento
// cassiere") sia per il titolo della notifica.
function expenseKindWords(type: string | undefined) {
  if (type === "transfer") return { article: "un",  noun: "movimento di cassa", titleWord: "Movimento cassa" };
  if (type === "cashier")  return { article: "un",  noun: "versamento cassiere", titleWord: "Versamento cassiere" };
  return { article: "una", noun: "spesa", titleWord: "spesa" };
}

function fmtAmount(record: any) {
  const amount = record.amount != null ? Number(record.amount).toFixed(2) : "";
  return `${amount} ${record.currency || ""}`.trim();
}

Deno.serve(async (req) => {
  try {
    const payload = await req.json();

    // Supabase Database Webhook invia: { type, table, record, old_record, schema }
    // "type" = TG_OP: 'INSERT' | 'UPDATE' | 'DELETE'.
    const opType    = payload.type;
    const table     = payload.table;
    const record    = payload.record;
    const oldRecord = payload.old_record;
    if (!record) return new Response("ok (no record)", { status: 200 });

    const eventId = record.event_id;
    if (!eventId) return new Response("ok (no event_id)", { status: 200 });

    const isUpdate = opType === "UPDATE";
    // Eliminazione = soft-delete, tecnicamente un UPDATE: lo riconosciamo
    // dal passaggio deleted false→true rispetto al record precedente.
    const isDeletion = isUpdate && record.deleted === true && oldRecord?.deleted !== true;

    // L'utente che ha ESEGUITO l'operazione ADESSO: per un INSERT è
    // sempre il creatore; per un UPDATE (modifica o eliminazione) è
    // updated_by (NUOVO — vedi db.js v1.11/supabase.js v1.15), con
    // ripiego su created_by per righe salvate prima di questa colonna.
    // Non notifichiamo mai lui stesso.
    const actingUserId = isUpdate
      ? (record.updated_by || record.created_by || record.from_user || null)
      : (record.created_by || record.from_user || record.paid_by || null);

    // Il proprietario ORIGINALE (solo sp_expenses) — citato nel testo
    // SOLO se diverso da chi ha eseguito l'operazione ora.
    const ownerId = table === "sp_expenses" ? (record.created_by || null) : null;

    // ── Dati evento (per il titolo della notifica) ──
    const events = await sbRequest(
      "GET",
      `sp_events?id=eq.${eventId}&select=title`
    );
    const eventTitle = Array.isArray(events) && events[0] ? events[0].title : "WeGo";

    // ── Nome di chi ha effettuato l'operazione + (se serve) del proprietario ──
    async function userName(id: string | null): Promise<string | null> {
      if (!id) return null;
      const users = await sbRequest("GET", `sp_users?id=eq.${id}&select=name`);
      return Array.isArray(users) && users[0] ? users[0].name : null;
    }
    const actorName = (await userName(actingUserId)) || "Qualcuno";
    const ownerName = (ownerId && ownerId !== actingUserId) ? await userName(ownerId) : null;

    // ── Testo della notifica ──
    let title = `Nuovo movimento — ${eventTitle}`;
    let body  = `${actorName} ha registrato un nuovo movimento.`;

    if (table === "sp_expenses") {
      const amount = fmtAmount(record);
      const { article, noun, titleWord } = expenseKindWords(record.type);
      const ownerSuffix = ownerName ? ` di ${ownerName}` : "";

      if (!isUpdate) {
        // ── Nuovo movimento — stesso testo di sempre per spesa/
        // trasferimento (invariato), NUOVO solo per "+Cassiere" (prima
        // ricadeva per errore nel ramo "Nuova spesa", vedi nota in testa
        // al file).
        if (record.type === "transfer") {
          title = `${titleWord} — ${eventTitle}`;
          body  = `${actorName} ha registrato "${record.title || noun}" (${amount})`;
        } else if (record.type === "cashier") {
          title = `${titleWord} — ${eventTitle}`;
          body  = `${actorName} ha registrato "${record.title || noun}" (${amount})`;
        } else {
          title = `Nuova spesa — ${eventTitle}`;
          body  = `${actorName} ha aggiunto "${record.title || noun}" (${amount})`;
        }
      } else if (isDeletion) {
        // ── Eliminazione (soft-delete) ──
        title = `Movimento eliminato — ${eventTitle}`;
        body  = `${actorName} ha eliminato ${article} ${noun}${ownerSuffix} — "${record.title || noun}" (${amount})`;
      } else {
        // ── Modifica ──
        title = `Movimento modificato — ${eventTitle}`;
        body  = `${actorName} ha modificato ${article} ${noun}${ownerSuffix} — "${record.title || noun}" (${amount})`;
      }
    } else if (table === "sp_payments") {
      const amount = fmtAmount(record);
      if (!isUpdate) {
        title = `Pagamento registrato — ${eventTitle}`;
        body  = `${actorName} ha registrato un pagamento di ${amount}`;
      } else if (isDeletion) {
        title = `Pagamento eliminato — ${eventTitle}`;
        body  = `${actorName} ha eliminato un pagamento di ${amount}`;
      } else {
        title = `Pagamento modificato — ${eventTitle}`;
        body  = `${actorName} ha modificato un pagamento di ${amount}`;
      }
    }

    // ── Tutte le sottoscrizioni collegate a questo evento ──
    const subs = await sbRequest(
      "GET",
      `sp_push_subscriptions?event_id=eq.${eventId}&select=*`
    );

    if (!Array.isArray(subs) || subs.length === 0) {
      return new Response("ok (no subscriptions)", { status: 200 });
    }

    const notifPayload = JSON.stringify({
      title,
      body,
      eventId
    });

    const results = await Promise.allSettled(
      subs
        // Non notificare chi ha appena creato il movimento sul suo stesso device
        .filter((s: any) => !actingUserId || s.user_id !== actingUserId)
        .map((s: any) =>
          webpush.sendNotification(
            {
              endpoint: s.endpoint,
              keys: { p256dh: s.p256dh, auth: s.auth }
            },
            notifPayload
          ).catch(async (err: any) => {
            // 404/410 = sottoscrizione scaduta o revocata: la rimuoviamo
            if (err?.statusCode === 404 || err?.statusCode === 410) {
              await sbRequest(
                "DELETE",
                `sp_push_subscriptions?id=eq.${s.id}`
              ).catch(() => {});
            }
            throw err;
          })
        )
    );

    const sent   = results.filter(r => r.status === "fulfilled").length;
    const failed = results.filter(r => r.status === "rejected").length;

    return new Response(JSON.stringify({ ok: true, sent, failed }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (e) {
    console.error("[send-push-notification] error:", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});
