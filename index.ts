// ═══════════════════════════════════════════════════════════════
// WeGo — Supabase Edge Function: send-push-notification
// ═══════════════════════════════════════════════════════════════
//
// COSA FA:
// Riceve l'evento di INSERT su sp_expenses o sp_payments (tramite un
// Database Webhook configurato nel Dashboard Supabase), recupera tutte le
// sottoscrizioni push collegate a quell'evento (tabella sp_push_subscriptions)
// — escludendo chi ha appena registrato il movimento — e invia a ciascuna
// una notifica Web Push firmata con le chiavi VAPID.
//
// COME SI ATTIVA (1 volta sola, dal Dashboard Supabase):
//   Database → Webhooks → Create a new hook
//     - Table:      sp_expenses   (creane una seconda identica per sp_payments)
//     - Events:     Insert
//     - Type:       Supabase Edge Functions
//     - Function:   send-push-notification
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

Deno.serve(async (req) => {
  try {
    const payload = await req.json();

    // Supabase Database Webhook invia: { type, table, record, old_record, schema }
    const table  = payload.table;
    const record = payload.record;
    if (!record) return new Response("ok (no record)", { status: 200 });

    const eventId = record.event_id;
    if (!eventId) return new Response("ok (no event_id)", { status: 200 });

    // L'utente che ha creato il movimento: non notifichiamo lui stesso.
    const actingUserId = record.created_by || record.from_user || record.paid_by || null;

    // ── Dati evento (per il titolo della notifica) ──
    const events = await sbRequest(
      "GET",
      `sp_events?id=eq.${eventId}&select=title`
    );
    const eventTitle = Array.isArray(events) && events[0] ? events[0].title : "WeGo";

    // ── Nome di chi ha effettuato l'operazione ──
    let actorName = "Qualcuno";
    if (actingUserId) {
      const users = await sbRequest(
        "GET",
        `sp_users?id=eq.${actingUserId}&select=name`
      );
      if (Array.isArray(users) && users[0]) actorName = users[0].name;
    }

    // ── Testo della notifica in base alla tabella coinvolta ──
    let title = `Nuovo movimento — ${eventTitle}`;
    let body  = `${actorName} ha registrato un nuovo movimento.`;

    if (table === "sp_expenses") {
      const amount = record.amount != null ? Number(record.amount).toFixed(2) : "";
      if (record.type === "transfer") {
        title = `Movimento cassa — ${eventTitle}`;
        body  = `${actorName} ha registrato "${record.title || "movimento di cassa"}" (${amount} ${record.currency || ""})`;
      } else {
        title = `Nuova spesa — ${eventTitle}`;
        body  = `${actorName} ha aggiunto "${record.title || "una spesa"}" (${amount} ${record.currency || ""})`;
      }
    } else if (table === "sp_payments") {
      const amount = record.amount != null ? Number(record.amount).toFixed(2) : "";
      title = `Pagamento registrato — ${eventTitle}`;
      body  = `${actorName} ha registrato un pagamento di ${amount}`;
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
