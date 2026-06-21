// ═══════════════════════════════════════════════════════════════
// WeGo — /api/admin-login.js
// Verifica la password del pannello admin (admin.html) SOLO lato server.
// La password vera vive esclusivamente come variabile d'ambiente Vercel
// (ADMIN_PASSWORD) — Project Settings → Environment Variables — e non è
// MAI presente nel codice sorgente del repository GitHub.
// ═══════════════════════════════════════════════════════════════

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Metodo non permesso' });
    return;
  }

  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    res.status(500).json({ ok: false, error: 'ADMIN_PASSWORD non configurata su Vercel (Project Settings → Environment Variables)' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const password = (body && body.password) || '';

  if (password && password === expected) {
    res.status(200).json({ ok: true });
  } else {
    res.status(401).json({ ok: false, error: 'Password errata' });
  }
};
