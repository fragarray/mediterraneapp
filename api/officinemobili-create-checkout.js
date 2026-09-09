/* Officine Mobili - create SumUp checkout and reserve seats. */
const nodeCrypto = require('crypto');
module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { bookingData, redirectBase } = req.body || {};
  const b = bookingData || {};
  const required = ['laboratorio_id', 'nome', 'cognome', 'email', 'num_posti'];
  if (required.some(key => !b[key])) return res.status(400).json({ error: 'Campi obbligatori mancanti' });
  const numPosti = Number.parseInt(b.num_posti, 10);
  if (!Number.isInteger(numPosti) || numPosti < 1 || numPosti > 7) return res.status(400).json({ error: 'Numero posti non valido' });
  if (!/^\S+@\S+\.\S+$/.test(String(b.email).trim())) return res.status(400).json({ error: 'Email non valida' });

  const { SUMUP_API_KEY, SUMUP_MERCHANT_CODE, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUMUP_API_KEY || !SUMUP_MERCHANT_CODE || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Server configuration error' });
  const headers = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` };
  const editionUrl = `${SUPABASE_URL}/rest/v1/officinemobili_edizioni?slug=eq.officine-mobili-2026&attiva=eq.true&select=id,prezzo,prenotazioni_aperte,data_inizio,data_fine`;
  let bookingId;
  const checkoutRef = nodeCrypto.randomUUID();
  const bookingCode = createBookingCode();
  try {
    const editionRes = await fetch(editionUrl, { headers });
    if (!editionRes.ok) throw new Error('Impossibile leggere l\'edizione');
    const [edition] = await editionRes.json();
    if (!edition || !edition.prenotazioni_aperte) return res.status(400).json({ error: 'Iscrizioni chiuse' });
    const price = Number.parseFloat(edition.prezzo);
    if (!Number.isFinite(price)) throw new Error('Prezzo non configurato');
    const amount = Number((price * numPosti).toFixed(2));
    const labRes = await fetch(`${SUPABASE_URL}/rest/v1/officinemobili_laboratori?id=eq.${encodeURIComponent(b.laboratorio_id)}&edizione_id=eq.${encodeURIComponent(edition.id)}&attivo=eq.true&select=nome`, { headers });
    if (!labRes.ok) throw new Error('Impossibile leggere il laboratorio');
    const [lab] = await labRes.json();
    if (!lab) return res.status(400).json({ error: 'Laboratorio non disponibile' });

    const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/officinemobili_crea_prenotazione`, {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_edizione_id: edition.id, p_laboratorio_id: b.laboratorio_id, p_nome: b.nome, p_cognome: b.cognome, p_email: b.email, p_telefono: b.telefono || '', p_num_posti: numPosti, p_note: b.note || '', p_payment_reference: checkoutRef, p_booking_code: bookingCode, p_importo: amount }),
    });
    if (!rpcRes.ok) {
      const detail = await rpcRes.text();
      if (detail.includes('POSTI_ESAURITI')) return res.status(409).json({ error: 'Posti esauriti' });
      if (detail.includes('LABORATORIO_NON_DISPONIBILE')) return res.status(400).json({ error: 'Laboratorio non disponibile' });
      throw new Error('Impossibile salvare la prenotazione');
    }
    const booking = await rpcRes.json();
    bookingId = booking.id;

    const safeBase = typeof redirectBase === 'string' ? redirectBase.replace(/[<>"'`]/g, '').substring(0, 300) : `https://${req.headers.host}/officinemobili.html`;
    const sumupRes = await fetch('https://api.sumup.com/v0.1/checkouts', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUMUP_API_KEY}` },
      body: JSON.stringify({ checkout_reference: checkoutRef, amount, currency: 'EUR', merchant_code: SUMUP_MERCHANT_CODE, description: buildPaymentDescription(b.cognome, b.nome, lab.nome), redirect_url: `${safeBase}?ref=${checkoutRef}`, valid_until: new Date(Date.now() + 10 * 60 * 1000).toISOString(), hosted_checkout: { enabled: true } }),
    });
    if (!sumupRes.ok) throw new Error('Errore del provider di pagamento');
    const checkout = await sumupRes.json();
    if (!checkout.hosted_checkout_url) throw new Error('URL di pagamento non restituito');
    return res.status(200).json({ hosted_checkout_url: checkout.hosted_checkout_url, checkout_reference: checkoutRef });
  } catch (error) {
    if (bookingId) await fetch(`${SUPABASE_URL}/rest/v1/officinemobili_prenotazioni?id=eq.${bookingId}`, { method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ stato: 'cancellata' }) });
    console.error('[officinemobili-create]', error.message);
    return res.status(500).json({ error: error.message || 'Errore interno' });
  }
};
function cors(res) { res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); }
function buildPaymentDescription(cognome, nome, laboratorio) {
  const clean = value => String(value || '').trim().replace(/\s+/g, '_').replace(/[^\p{L}\p{N}_-]/gu, '');
  return `OfficineMobili-${clean(cognome).toUpperCase()}-${clean(nome).toUpperCase()}-${clean(laboratorio)}`.substring(0, 120);
}
function createBookingCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = nodeCrypto.randomBytes(8);
  const values = bytes.length ? bytes : Array.from(bytes);
  return `OM-${values.map(value => alphabet[value % alphabet.length]).join('')}`;
}
