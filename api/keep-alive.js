// ═══════════════════════════════════════════════════════════════
// WeGo — /api/keep-alive.js  (NUOVO)
// "Heartbeat" richiamato una volta al giorno da un Cron Job di Vercel
// (vedi vercel.json → "crons") per evitare che Supabase metta in pausa
// il progetto per inattività — piano Free: pausa automatica dopo 7
// giorni senza attività sul database (successo il 2026, vedi
// situazione.md). Una chiamata al giorno lascia ampio margine.
//
// Fa una singola lettura innocua (SELECT id LIMIT 1) sulla tabella
// sp_events con la SUPABASE_SERVICE_KEY — stessa env var già
// configurata su Vercel per gli altri /api/*.js, nessuna chiave nuova
// da aggiungere. Nessun dato dell'evento viene restituito al chiamante,
// solo {ok:true}.
// ═══════════════════════════════════════════════════════════════

const SUPABASE_URL = 'https://wwaomtfchpplmmxdpsqa.supabase.co';

module.exports = async function handler(req, res) {
  // Vercel firma le chiamate cron con l'header
  // Authorization: Bearer <CRON_SECRET> — variabile creata IN AUTOMATICO
  // da Vercel stesso al primo deploy con un cron configurato, non va
  // impostata a mano. La verifichiamo per evitare che l'URL pubblico
  // dell'endpoint venga richiamato/abusato da chiunque lo indovini.
  const auth = req.headers['authorization'] || '';
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ ok: false, error: 'Non autorizzato' });
    return;
  }

  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!serviceKey) {
    res.status(500).json({ ok: false, error: 'SUPABASE_SERVICE_KEY non configurata su Vercel' });
    return;
  }

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/sp_events?select=id&limit=1`, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`
      }
    });
    if (!r.ok) throw new Error(`Errore HTTP ${r.status}`);
    res.status(200).json({ ok: true, ts: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
