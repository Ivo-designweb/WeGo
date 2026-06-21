// ═══════════════════════════════════════════════════════════════
// WeGo — /api/owner-verify.js
// Verifica il "codice dispositivo proprietario" (Impostazioni → Avanzate)
// SOLO lato server. Il codice vero vive esclusivamente come variabile
// d'ambiente Vercel (OWNER_DEVICE_SECRET) e non è MAI presente nel
// codice sorgente: se fosse confrontato solo lato client, chiunque
// leggesse il codice JS potrebbe trovarlo e "auto-dichiararsi"
// proprietario, bypassando la sincronizzazione selettiva (vedi sync.js).
// ═══════════════════════════════════════════════════════════════

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Metodo non permesso' });
    return;
  }

  const expected = process.env.OWNER_DEVICE_SECRET;
  if (!expected) {
    res.status(500).json({ ok: false, error: 'OWNER_DEVICE_SECRET non configurato su Vercel (Project Settings → Environment Variables)' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const secret = (body && body.secret) || '';

  if (secret && secret === expected) {
    res.status(200).json({ ok: true });
  } else {
    res.status(401).json({ ok: false, error: 'Codice non valido' });
  }
};
