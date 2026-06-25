// ═══════════════════════════════════════════════════════════════
// WeGo — /api/sync-status.js  (v2 — modifica chirurgica sicurezza)
// Gestisce la tabella sp_sync_status (sincronizzazione selettiva degli
// eventi creati da utenti esterni — vedi sync.js / app.js / admin.html).
//
// GET  → lista completa dei codici registrati (richiede password admin).
// POST → { action: 'request' | 'enable' | 'disable', code, title?, createdBy? }
//   - 'request' (NESSUNA password): registra il codice in attesa — usata
//     alla creazione di un evento "gated" (vedi app.js / sync.js ->
//     register_sync_request). Idempotente: se il codice esiste già non
//     fa nulla.
//   - 'enable'/'disable' (richiede password admin).
//
// MODIFICA SICUREZZA: prima di questa versione, la "richiesta" passava
// direttamente dal client a Supabase con la anon key pubblica (che aveva
// i permessi INSERT/UPDATE su questa tabella) -- chiunque trovasse quella
// chiave avrebbe potuto abilitare da solo la sincronizzazione di un
// evento, scrivendo direttamente su Supabase, bypassando admin.html e la
// password. Ora la anon key ha SOLO il permesso SELECT su questa tabella
// (vedi GRANT nello schema SQL): ogni scrittura, compresa la "richiesta"
// senza password, passa SOLO da qui e usa una chiave diversa -- la
// SUPABASE_SERVICE_KEY -- che vive ESCLUSIVAMENTE come variabile
// d'ambiente Vercel e non e mai stata, e non sara mai, presente in
// nessun file scaricabile dal browser.
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

async function sb(method, path, body, key) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      apikey:         key,
      Authorization:  `Bearer ${key}`,
      Prefer:         'return=representation'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && (data.message || data.hint)) || `Errore HTTP ${res.status}`);
  return data;
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      if (!checkAdmin(req)) {
        res.status(401).json({ ok: false, error: 'Password admin richiesta' });
        return;
      }
      const serviceKey = getServiceKey(res);
      if (!serviceKey) return;
      const items = await sb('GET', 'sp_sync_status?select=*&order=requested_at.desc', null, serviceKey);
      res.status(200).json({ ok: true, items: items || [] });
      return;
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { body = {}; }
      }
      const { action, code, title, createdBy } = body || {};

      if (!code) {
        res.status(400).json({ ok: false, error: 'Codice evento mancante' });
        return;
      }
      if (action !== 'request' && action !== 'enable' && action !== 'disable') {
        res.status(400).json({ ok: false, error: 'Azione non valida' });
        return;
      }

      // -- 'request': nessuna password, e solo "mettimi in lista d'attesa" --
      if (action === 'request') {
        const serviceKey = getServiceKey(res);
        if (!serviceKey) return;

        const existing = await sb('GET', `sp_sync_status?code=eq.${encodeURIComponent(code)}&select=code`, null, serviceKey);
        if (!Array.isArray(existing) || !existing.length) {
          await sb('POST', 'sp_sync_status', {
            code,
            title:        title || null,
            created_by:   createdBy || null,
            requested_at: new Date().toISOString(),
            enabled:      false
          }, serviceKey);
        }
        res.status(200).json({ ok: true });
        return;
      }

      // -- 'enable' / 'disable': richiede password admin --
      if (!checkAdmin(req)) {
        res.status(401).json({ ok: false, error: 'Password admin richiesta' });
        return;
      }
      const serviceKey = getServiceKey(res);
      if (!serviceKey) return;

      const enabled = action === 'enable';
      const nowIso  = new Date().toISOString();

      const existing = await sb('GET', `sp_sync_status?code=eq.${encodeURIComponent(code)}&select=code`, null, serviceKey);

      if (Array.isArray(existing) && existing.length) {
        await sb('PATCH', `sp_sync_status?code=eq.${encodeURIComponent(code)}`, {
          enabled,
          enabled_at: enabled ? nowIso : null,
          enabled_by: enabled ? 'admin' : null
        }, serviceKey);
      } else if (enabled) {
        await sb('POST', 'sp_sync_status', {
          code,
          title:        null,
          created_by:   null,
          requested_at: nowIso,
          enabled:      true,
          enabled_at:   nowIso,
          enabled_by:   'admin'
        }, serviceKey);
      }

      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ ok: false, error: 'Metodo non permesso' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
