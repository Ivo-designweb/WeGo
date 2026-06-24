// ═══════════════════════════════════════════════════════════════
// WeGo — /api/device-license.js  (NUOVO — Fase 2 licenza Base/Pro)
// Gestisce la tabella sp_device_license (abilitazione "versione Pro" per
// singolo dispositivo — vedi license.js / impostazioni.html / admin.html).
//
// GET  → lista completa dei dispositivi registrati (richiede password admin).
// POST → { action: 'enable'|'disable', device_id, expires_at? }
//        (richiede password admin). expires_at è OBBLIGATORIO per
//        action:'enable' (stringa data, es. "2027-06-24" o ISO 8601):
//        l'admin decide sempre fino a quando dura l'abilitazione — una
//        data molto lontana nel tempo equivale a "senza scadenza".
//
// La richiesta "informativa" che registra un nuovo dispositivo in attesa
// (action 'request') NON passa da qui: viene fatta direttamente dal
// client a Supabase con l'anon key — non è un'azione privilegiata, vedi
// supabase.js → deviceLicense.request() / license.js → requestPro().
//
// Le credenziali Supabase qui sotto sono la stessa anon key pubblica già
// presente in chiavi.json (stessa nota di sicurezza di sync-status.js: non
// è un segreto, è protetta dal fatto che enable/disable passano sempre da
// qui, che verifica la password admin lato server prima di scrivere).
// ═══════════════════════════════════════════════════════════════

const SUPABASE_URL = 'https://wwaomtfchpplmmxdpsqa.supabase.co';
const SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3YW9tdGZjaHBwbG1teGRwc3FhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MjQ5MTIsImV4cCI6MjA5NzIwMDkxMn0.OyIYsrpg4yZQVxeG7gxA0KQRqM7q0MOc29AWaGNxhR8';

function checkAdmin(req) {
  const expected = process.env.ADMIN_PASSWORD;
  const provided = req.headers['x-admin-password'] || '';
  return !!expected && !!provided && provided === expected;
}

async function sb(method, path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      apikey:         SUPABASE_KEY,
      Authorization:  `Bearer ${SUPABASE_KEY}`,
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
      const items = await sb('GET', 'sp_device_license?select=*&order=requested_at.desc', null);
      res.status(200).json({ ok: true, items: items || [] });
      return;
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { body = {}; }
      }
      const { action, device_id, expires_at } = body || {};

      if (!device_id) {
        res.status(400).json({ ok: false, error: 'device_id mancante' });
        return;
      }
      if (action !== 'enable' && action !== 'disable') {
        res.status(400).json({ ok: false, error: 'Azione non valida' });
        return;
      }

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

      const enabled = action === 'enable';
      const nowIso  = new Date().toISOString();

      const existing = await sb('GET', `sp_device_license?device_id=eq.${encodeURIComponent(device_id)}&select=device_id`, null);

      if (Array.isArray(existing) && existing.length) {
        await sb('PATCH', `sp_device_license?device_id=eq.${encodeURIComponent(device_id)}`, {
          enabled,
          expires_at: enabled ? expiresIso : null,
          enabled_at: enabled ? nowIso : null,
          enabled_by: enabled ? 'admin' : null
        });
      } else if (enabled) {
        // Dispositivo abilitato manualmente senza essere mai passato dalla
        // richiesta automatica (es. l'utente ha comunicato il codice a
        // voce/WhatsApp senza che l'app l'avesse ancora registrato): lo
        // creiamo comunque, già abilitato.
        await sb('POST', 'sp_device_license', {
          device_id,
          label:        null,
          requested_at: nowIso,
          enabled:      true,
          expires_at:   expiresIso,
          enabled_at:   nowIso,
          enabled_by:   'admin'
        });
      }
      // Se enabled=false e non esiste nessuna riga, non c'è nulla da
      // disabilitare: nessuna azione necessaria.

      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ ok: false, error: 'Metodo non permesso' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
