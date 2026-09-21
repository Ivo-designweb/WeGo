// ═══════════════════════════════════════════════════════════════
// WeGo — /api/notification-log.js  (v1 — NUOVO)
// Legge lo storico delle notifiche push tentate (tabella
// sp_notification_log, scritta dalla Edge Function
// send-push-notification v3 ad ogni invio — vedi supabase.js v1.16 per
// lo schema). Sola lettura, protetta da password admin: usa la
// SUPABASE_SERVICE_KEY per bypassare la RLS — la tabella non ha NESSUN
// privilegio per la anon key pubblica, quindi non è leggibile in nessun
// altro modo.
//
// GET → ultime N righe (default 100, max 500), con nome partecipante e
// titolo evento già risolti (embedding PostgREST), più recenti per
// prime. Query string opzionale: ?limit=N
//
// Stesso pattern di sicurezza di device-license.js: la password admin
// (ADMIN_PASSWORD, variabile d'ambiente Vercel) è richiesta nell'header
// x-admin-password.
// ═══════════════════════════════════════════════════════════════

const SUPABASE_URL = 'https://wwaomtfchpplmmxdpsqa.supabase.co';

function checkAdmin(req) {
  const expected = process.env.ADMIN_PASSWORD;
  const provided = req.headers['x-admin-password'] || '';
  return !!expected && !!provided && provided === expected;
}

function getServiceKey(res) {
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) {
    res.status(500).json({ ok: false, error: 'SUPABASE_SERVICE_KEY non configurata su Vercel (Project Settings -> Environment Variables)' });
    return null;
  }
  return key;
}

async function sb(path, key) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // Stesso fix diagnostico di device-license.js v3: componiamo TUTTI i
    // campi che PostgREST restituisce (code/message/details/hint), utile
    // in particolare per un "permission denied" su una tabella nuova
    // come questa (vedi situazione.md, fix v5.4 su sp_device_license).
    const parts = [];
    if (data?.message) parts.push(data.message);
    if (data?.code)    parts.push(`[${data.code}]`);
    if (data?.details) parts.push(`— ${data.details}`);
    if (data?.hint)    parts.push(`(hint: ${data.hint})`);
    throw new Error(parts.length ? parts.join(' ') : `Errore HTTP ${res.status}`);
  }
  return data;
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.status(405).json({ ok: false, error: 'Metodo non permesso' });
      return;
    }
    if (!checkAdmin(req)) {
      res.status(401).json({ ok: false, error: 'Password admin richiesta' });
      return;
    }
    const serviceKey = getServiceKey(res);
    if (!serviceKey) return;

    const limitParam = parseInt(req.query?.limit, 10);
    const limit = Math.min(Math.max(limitParam || 100, 1), 500);

    // Embedding PostgREST: risolve nome partecipante e titolo evento in
    // un'unica richiesta, senza dover fare N+1 query lato client.
    const items = await sb(
      `sp_notification_log?select=*,sp_users(name),sp_events(title)&order=created_at.desc&limit=${limit}`,
      serviceKey
    );
    res.status(200).json({ ok: true, items: items || [] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
