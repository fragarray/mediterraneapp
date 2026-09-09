/* Officine Mobili - public availability summary. */
module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Server configuration error' });
  const headers = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` };
  try {
    const editionRes = await fetch(`${SUPABASE_URL}/rest/v1/officinemobili_edizioni?slug=eq.officine-mobili-2026&attiva=eq.true&select=id`, { headers });
    if (!editionRes.ok) throw new Error('Impossibile leggere l\'edizione');
    const [edition] = await editionRes.json();
    if (!edition) return res.status(404).json({ error: 'Edizione non trovata' });

    const [labsRes, bookingsRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/officinemobili_laboratori?edizione_id=eq.${edition.id}&attivo=eq.true&select=id,capienza`, { headers }),
      fetch(`${SUPABASE_URL}/rest/v1/officinemobili_prenotazioni?edizione_id=eq.${edition.id}&or=(stato.eq.confermata,and(stato.eq.pending_payment,expires_at.gt.${encodeURIComponent(new Date().toISOString())}))&select=laboratorio_id,num_posti`, { headers }),
    ]);
    if (!labsRes.ok || !bookingsRes.ok) throw new Error('Impossibile leggere la disponibilita');
    const labs = await labsRes.json();
    const bookings = await bookingsRes.json();
    const reserved = Object.fromEntries(labs.map(lab => [lab.id, 0]));
    bookings.forEach(booking => { reserved[booking.laboratorio_id] = (reserved[booking.laboratorio_id] || 0) + Number(booking.num_posti || 0); });
    const availability = Object.fromEntries(labs.map(lab => [lab.id, { remaining: Math.max(0, lab.capienza - (reserved[lab.id] || 0)), soldOut: (reserved[lab.id] || 0) >= lab.capienza }]));
    return res.status(200).json({ availability });
  } catch (error) {
    console.error('[officinemobili-availability]', error.message);
    return res.status(500).json({ error: 'Errore durante la lettura della disponibilita' });
  }
};
function cors(res) { res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); }
