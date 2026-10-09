module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { checkout_reference } = req.body || {};
  if (!checkout_reference || typeof checkout_reference !== 'string' || checkout_reference.length > 100) {
    return res.status(400).json({ error: 'Invalid checkout_reference' });
  }

  const { SUMUP_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUMUP_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    const sumupRes = await fetch(
      `https://api.sumup.com/v0.1/checkouts?checkout_reference=${encodeURIComponent(checkout_reference)}`,
      { headers: { Authorization: `Bearer ${SUMUP_API_KEY}` } }
    );
    if (!sumupRes.ok) throw new Error('Could not retrieve checkout from SumUp');

    const checkouts = await sumupRes.json();
    const checkout = Array.isArray(checkouts) ? checkouts[0] : null;
    if (!checkout) return res.status(404).json({ error: 'Checkout not found in SumUp' });

    const status = String(checkout?.status ?? checkout?.payment_status ?? checkout?.checkout_status ?? 'PENDING').trim().toUpperCase();
    const bookingRes = await fetch(
      `${SUPABASE_URL}/rest/v1/eventi_associazione_prenotazioni?payment_reference=eq.${encodeURIComponent(checkout_reference)}&select=id,nome,cognome,num_posti,evento_id,stato` ,
      { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } }
    );
    const [booking] = bookingRes.ok ? await bookingRes.json() : [];
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const bookingStatus = String(booking.stato || '').trim().toLowerCase();
    const isPaidStatus = ['PAID', 'PAYMENT_CONFIRMED', 'SETTLED', 'SUCCESS', 'SUCCEEDED'].includes(status);
    const isPendingBooking = ['pending_payment', 'pending', 'in_attesa', 'in attesa', 'awaiting_payment', 'da_pagare'].includes(bookingStatus);
    const isCancelledBooking = ['cancellata', 'cancelled', 'failed', 'expired'].includes(bookingStatus);

    if (bookingStatus === 'confermata') {
      const evRes = await fetch(
        `${SUPABASE_URL}/rest/v1/eventi_associazione?id=eq.${booking.evento_id}&select=titolo,data` ,
        { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } }
      );
      const [ev] = evRes.ok ? await evRes.json() : [null];
      return res.status(200).json({
        success: true,
        status: 'PAID',
        booking: { nome: booking.nome, cognome: booking.cognome, num_posti: booking.num_posti, event_name: ev?.titolo || 'Serata', event_date: ev?.data || null },
      });
    }

    if (isPaidStatus || (status === 'PAID' && isPendingBooking)) {
      await fetch(`${SUPABASE_URL}/rest/v1/eventi_associazione_prenotazioni?id=eq.${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
        body: JSON.stringify({ stato: 'confermata' }),
      });

      const evRes = await fetch(
        `${SUPABASE_URL}/rest/v1/eventi_associazione?id=eq.${booking.evento_id}&select=titolo,data` ,
        { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } }
      );
      const [ev] = evRes.ok ? await evRes.json() : [null];

      return res.status(200).json({
        success: true,
        status: 'PAID',
        booking: { nome: booking.nome, cognome: booking.cognome, num_posti: booking.num_posti, event_name: ev?.titolo || 'Serata', event_date: ev?.data || null },
      });
    }

    if (['FAILED', 'EXPIRED', 'CANCELLED', 'CANCELED'].includes(status) || isCancelledBooking) {
      await fetch(`${SUPABASE_URL}/rest/v1/eventi_associazione_prenotazioni?id=eq.${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
        body: JSON.stringify({ stato: 'cancellata' }),
      });
      return res.status(200).json({ success: false, status });
    }

    return res.status(200).json({ success: false, status: 'PENDING' });
  } catch (error) {
    console.error('[eventi-associazione-verify] Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
};
