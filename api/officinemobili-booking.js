/* Officine Mobili - public booking lookup by access code. */
module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const code = String(req.body?.booking_code || '').trim().toUpperCase();
  if (!/^OM-[A-HJ-NP-Z2-9]{8}$/.test(code)) return res.status(400).json({ error: 'Codice non valido' });

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Server configuration error' });
  const headers = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` };
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/officinemobili_prenotazioni?booking_code=eq.${encodeURIComponent(code)}&stato=eq.confermata&select=nome,cognome,num_posti,booking_code,officinemobili_laboratori(nome),officinemobili_edizioni(titolo,data_inizio,data_fine,prezzo)`, { headers });
    if (!response.ok) throw new Error('Impossibile verificare la prenotazione');
    const [booking] = await response.json();
    if (!booking) return res.status(404).json({ error: 'Prenotazione non trovata' });
    return res.status(200).json({ booking: {
      nome: booking.nome,
      cognome: booking.cognome,
      num_posti: booking.num_posti,
      booking_code: booking.booking_code,
      laboratorio: booking.officinemobili_laboratori?.nome || 'Laboratorio',
      edizione: booking.officinemobili_edizioni || null,
    }});
  } catch (error) {
    console.error('[officinemobili-booking]', error.message);
    return res.status(500).json({ error: 'Errore durante la verifica' });
  }
};
function cors(res) { res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); }
