// ═══════════════════════════════════════════════════════════════
// WeGo — /api/sync-status.js
// Gestisce la tabella sp_sync_status (sincronizzazione selettiva degli
// eventi creati da utenti esterni — vedi sync.js / app.js / admin.html).
//
// GET  → lista completa dei codici registrati (richiede password admin).
// POST → { action: 'enable'|'disable', code } (richiede password admin).
//
// La richiesta "informativa" che registra un nuovo codice in attesa
// (action 'request') NON passa da qui: viene fatta direttamente dal
// client a Supabase con l'anon key, come tutto il resto dei dati
// dell'app — non è un'azione privilegiata, vedi supabase.js → syncStatus.request().
//
// Le credenziali Supabase qui sotto sono la stessa anon key pubblica
// già presente in chiavi.json (non è un segreto: è protetta solo dal
// fatto che enable/disable passano da questa funzione, che verifica la
// password admin lato server prima di scrivere). Se in futuro rigeneri
// le chiavi Supabase, aggiornale in ENTRAMBI i posti.
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
      const items = await sb('GET', 'sp_sync_status?select=*&order=requested_at.desc', null);
      res.status(200).json({ ok: true, items: items || [] });
      return;
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { body = {}; }
      }
      const { action, code } = body || {};

      if (!code) {
        res.status(400).json({ ok: false, error: 'Codice evento mancante' });
        return;
      }
      if (action !== 'enable' && action !== 'disable') {
        res.status(400).json({ ok: false, error: 'Azione non valida' });
        return;
      }
      if (!checkAdmin(req)) {
        res.status(401).json({ ok: false, error: 'Password admin richiesta' });
        return;
      }

      const enabled = action === 'enable';
      const nowIso  = new Date().toISOString();

      const existing = await sb('GET', `sp_sync_status?code=eq.${encodeURIComponent(code)}&select=code`, null);

      if (Array.isArray(existing) && existing.length) {
        await sb('PATCH', `sp_sync_status?code=eq.${encodeURIComponent(code)}`, {
          enabled,
          enabled_at: enabled ? nowIso : null,
          enabled_by: enabled ? 'admin' : null
        });
      } else if (enabled) {
        // Codice abilitato manualmente senza essere mai passato dalla
        // richiesta automatica (es. il device non era online alla
        // creazione dell'evento): lo creiamo comunque, già abilitato.
        await sb('POST', 'sp_sync_status', {
          code,
          title:        null,
          created_by:   null,
          requested_at: nowIso,
          enabled:      true,
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
