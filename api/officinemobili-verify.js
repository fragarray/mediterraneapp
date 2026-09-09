/* Officine Mobili - verify SumUp checkout and update booking. */
module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { checkout_reference } = req.body || {};
  if (typeof checkout_reference !== 'string' || checkout_reference.length > 100) return res.status(400).json({ error: 'Riferimento non valido' });
  const { SUMUP_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUMUP_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Server configuration error' });
  const headers = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` };
  try {
    const sumupRes = await fetch(`https://api.sumup.com/v0.1/checkouts?checkout_reference=${encodeURIComponent(checkout_reference)}`, { headers: { Authorization: `Bearer ${SUMUP_API_KEY}` } });
    if (!sumupRes.ok) throw new Error('Impossibile verificare il pagamento');
    const checkouts = await sumupRes.json();
    const checkout = Array.isArray(checkouts) ? checkouts[0] : null;
    if (!checkout) return res.status(404).json({ error: 'Pagamento non trovato' });
    const bookingRes = await fetch(`${SUPABASE_URL}/rest/v1/officinemobili_prenotazioni?payment_reference=eq.${encodeURIComponent(checkout_reference)}&select=id,nome,cognome,num_posti,laboratorio_id,stato,booking_code`, { headers });
    if (!bookingRes.ok) throw new Error('Impossibile leggere la prenotazione');
    const [booking] = await bookingRes.json();
    if (!booking) return res.status(404).json({ error: 'Prenotazione non trovata' });
    if (booking.stato === 'confermata') return res.status(200).json({ success: true, status: 'PAID', booking: publicBooking(booking) });
    if (checkout.status === 'PAID') {
      await patchBooking(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, booking.id, 'confermata');
      return res.status(200).json({ success: true, status: 'PAID', booking: publicBooking(booking) });
    }
    if (checkout.status === 'FAILED' || checkout.status === 'EXPIRED') {
      await patchBooking(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, booking.id, 'cancellata');
      return res.status(200).json({ success: false, status: checkout.status });
    }
    return res.status(200).json({ success: false, status: 'PENDING' });
  } catch (error) {
    console.error('[officinemobili-verify]', error.message);
    return res.status(500).json({ error: error.message || 'Errore interno' });
  }
};
async function patchBooking(url, key, id, stato) { const response = await fetch(`${url}/rest/v1/officinemobili_prenotazioni?id=eq.${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` }, body: JSON.stringify({ stato }) }); if (!response.ok) throw new Error('Impossibile aggiornare la prenotazione'); }
function publicBooking(booking) { return { nome: booking.nome, cognome: booking.cognome, num_posti: booking.num_posti, laboratorio_id: booking.laboratorio_id, booking_code: booking.booking_code }; }
function cors(res) { res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); }
