// ═══════════════════════════════════════════════════════════════
// WeGo — /api/device-license.js  (v2 — modifica chirurgica sicurezza)
// Gestisce la tabella sp_device_license (abilitazione "versione Pro" per
// singolo dispositivo — vedi license.js / impostazioni.html / admin.html).
//
// GET  → lista completa dei dispositivi registrati (richiede password admin).
// POST → { action: 'request' | 'enable' | 'disable', device_id, label?, expires_at? }
//   - 'request' (NESSUNA password): registra/aggiorna la richiesta in
//     attesa — usata da Impostazioni quando l'utente chiede la versione
//     Pro (vedi license.js -> requestPro()). Idempotente.
//   - 'enable'/'disable' (richiede password admin): expires_at è
//     OBBLIGATORIO per 'enable' — una data molto lontana nel tempo
//     equivale a "senza scadenza".
//
// MODIFICA SICUREZZA: prima di questa versione, tutte le scritture su
// sp_device_license passavano anche direttamente dal client con la anon
// key pubblica (che aveva i permessi INSERT/UPDATE) -- chiunque trovasse
// quella chiave avrebbe potuto auto-abilitarsi alla versione Pro
// scrivendo direttamente su Supabase, bypassando admin.html e la
// password. Ora la anon key ha SOLO il permesso SELECT su questa
// tabella (vedi GRANT nello schema SQL): ogni scrittura, compresa la
// "richiesta" senza password, passa SOLO da qui e usa una chiave
// diversa -- la SUPABASE_SERVICE_KEY -- che vive ESCLUSIVAMENTE come
// variabile d'ambiente Vercel e non e mai stata, e non sara mai,
// presente in nessun file scaricabile dal browser.
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
      const items = await sb('GET', 'sp_device_license?select=*&order=requested_at.desc', null, serviceKey);
      res.status(200).json({ ok: true, items: items || [] });
      return;
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { body = {}; }
      }
      const { action, device_id, label, expires_at } = body || {};

      if (!device_id) {
        res.status(400).json({ ok: false, error: 'device_id mancante' });
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

        const existing = await sb('GET', `sp_device_license?device_id=eq.${encodeURIComponent(device_id)}&select=device_id`, null, serviceKey);
        if (Array.isArray(existing) && existing.length) {
          if (label) {
            await sb('PATCH', `sp_device_license?device_id=eq.${encodeURIComponent(device_id)}`, { label }, serviceKey);
          }
        } else {
          await sb('POST', 'sp_device_license', {
            device_id,
            label:        label || null,
            requested_at: new Date().toISOString(),
            enabled:      false
          }, serviceKey);
        }
        res.status(200).json({ ok: true });
        return;
      }

      // -- 'enable' / 'disable': richiede password admin --
      let expiresIso = null;
      if (action === 'enable') {
        const d = new Date(expires_at);
        if (!expires_at || isNaN(d.getTime())) {
          res.status(400).json({ ok: false, error: 'Data di scadenza (expires_at) mancante o non valida' });
          return;
        }
        expiresIso = d.toISOString();
      }

      if (!checkAdmin(req)) {
        res.status(401).json({ ok: false, error: 'Password admin richiesta' });
        return;
      }
      const serviceKey = getServiceKey(res);
      if (!serviceKey) return;

      const enabled = action === 'enable';
      const nowIso  = new Date().toISOString();

      const existing = await sb('GET', `sp_device_license?device_id=eq.${encodeURIComponent(device_id)}&select=device_id`, null, serviceKey);

      if (Array.isArray(existing) && existing.length) {
        await sb('PATCH', `sp_device_license?device_id=eq.${encodeURIComponent(device_id)}`, {
          enabled,
          expires_at: enabled ? expiresIso : null,
          enabled_at: enabled ? nowIso : null,
          enabled_by: enabled ? 'admin' : null
        }, serviceKey);
      } else if (enabled) {
        await sb('POST', 'sp_device_license', {
          device_id,
          label:        null,
          requested_at: nowIso,
          enabled:      true,
          expires_at:   expiresIso,
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
