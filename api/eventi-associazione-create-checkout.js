module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { bookingData, redirectBase } = req.body || {};
  const b = bookingData || {};

  if (!b.evento_id || !b.nome || !b.cognome || !b.email || !b.num_posti) {
    return res.status(400).json({ error: 'Missing booking fields' });
  }

  const numPosti = parseInt(b.num_posti, 10);
  if (!Number.isInteger(numPosti) || numPosti < 1 || numPosti > 50) {
    return res.status(400).json({ error: 'Invalid num_posti' });
  }

  const { SUMUP_API_KEY, SUMUP_MERCHANT_CODE, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUMUP_API_KEY || !SUMUP_MERCHANT_CODE || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    const evRes = await fetch(
      `${SUPABASE_URL}/rest/v1/eventi_associazione?id=eq.${encodeURIComponent(b.evento_id)}&select=id,slug,titolo,data,ora,prezzo,prenotazioni_aperte,sold_out` ,
      { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } }
    );
    const [eventDoc] = evRes.ok ? await evRes.json() : [];
    if (!eventDoc) return res.status(404).json({ error: 'Event not found' });
    if (!eventDoc.prenotazioni_aperte || eventDoc.sold_out) return res.status(400).json({ error: 'Event bookings closed' });

    const eventPrice = Number.isFinite(parseFloat(eventDoc.prezzo)) ? parseFloat(eventDoc.prezzo) : 15;
    const amount = parseFloat((eventPrice * numPosti).toFixed(2));
    const checkoutRef = crypto.randomUUID();
    const validUntil = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const fullName = [String(b.nome || '').trim(), String(b.cognome || '').trim()].filter(Boolean).join(' ');
    const eventDate = formatDate(eventDoc.data);
    const description = `Prenotazione ${eventDoc.titolo || 'Evento'} – ${fullName || 'Prenotazione'} – ${eventDate} – ${numPosti} posti`;
    const safeBase = typeof redirectBase === 'string' ? redirectBase.replace(/[<>"'`]/g, '').substring(0, 300) : `https://${req.headers.host}/booking-evento.html`;
    const redirectUrl = `${safeBase}?ref=${checkoutRef}`;

    const sumupRes = await fetch('https://api.sumup.com/v0.1/checkouts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUMUP_API_KEY}`,
      },
      body: JSON.stringify({
        checkout_reference: checkoutRef,
        amount,
        currency: 'EUR',
        merchant_code: SUMUP_MERCHANT_CODE,
        description,
        redirect_url: redirectUrl,
        valid_until: validUntil,
        hosted_checkout: { enabled: true },
      }),
    });

    if (!sumupRes.ok) {
      const errText = await sumupRes.text();
      console.error('[eventi-associazione-create] SumUp error:', errText);
      throw new Error('Payment provider error');
    }

    const checkout = await sumupRes.json();
    if (!checkout.hosted_checkout_url) throw new Error('No checkout URL returned by SumUp');

    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/eventi_associazione_prenotazioni`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        evento_id: b.evento_id,
        nome: String(b.nome).trim().substring(0, 100),
        cognome: String(b.cognome).trim().substring(0, 100),
        email: String(b.email).trim().toLowerCase().substring(0, 200),
        telefono: String(b.telefono || '').trim().substring(0, 30),
        num_posti: numPosti,
        note: b.note ? String(b.note).trim().substring(0, 500) : null,
        stato: 'pending_payment',
        payment_reference: checkoutRef,
        importo_pagato: amount,
        payment_method: 'sumup',
        booking_source: 'website',
      }),
    });

    if (!insertRes.ok) {
      const errText = await insertRes.text();
      console.error('[eventi-associazione-create] DB insert failed:', errText);
      throw new Error('Could not save booking');
    }

    return res.status(200).json({
      hosted_checkout_url: checkout.hosted_checkout_url,
      checkout_reference: checkoutRef,
    });
  } catch (error) {
    console.error('[eventi-associazione-create] Error:', error.message);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

function formatDate(dateValue) {
  if (typeof dateValue !== 'string') return 'Data non disponibile';
  const match = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return dateValue;
  const [, y, m, d] = match;
  return `${d}/${m}/${y}`;
}
