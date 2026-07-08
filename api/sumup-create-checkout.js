/* ============================================================
   Vercel Serverless Function – SumUp: create checkout + save pending booking
   POST /api/sumup-create-checkout
   Body: { bookingData: { evento_id, nome, cognome, email, telefono, num_posti, note },
          redirectBase: string }
   Response: { hosted_checkout_url: string, checkout_reference: string }
   ============================================================ */

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

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
    console.error('[sumup-create] Missing env vars');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    // ── Step 0: Look up event price & status ─────────────────
    const evRes = await fetch(
      `${SUPABASE_URL}/rest/v1/pizzica_eventi?id=eq.${encodeURIComponent(b.evento_id)}&select=prezzo,prenotazioni_aperte,data`,
      { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } }
    );
    if (!evRes.ok) throw new Error('Could not read event');
    const [ev] = await evRes.json();
    if (!ev)                      return res.status(400).json({ error: 'Event not found' });
    if (!ev.prenotazioni_aperte)  return res.status(400).json({ error: 'Event bookings closed' });

    const defaultPrice = await getDefaultPrice(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const eventPrice   = Number.isFinite(parseFloat(ev.prezzo))
      ? parseFloat(ev.prezzo)
      : Number.isFinite(defaultPrice)
        ? defaultPrice
        : 15;
    const amount       = parseFloat((eventPrice * numPosti).toFixed(2));
    const checkoutRef  = crypto.randomUUID();
    const validUntil   = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    // Build redirect URL (client sends its own base URL)
    const safeBase = typeof redirectBase === 'string'
      ? redirectBase.replace(/[<>"'`]/g, '').substring(0, 300)
      : `https://${req.headers.host}/pizzica-med.html`;
    const redirectUrl = `${safeBase}?ref=${checkoutRef}`;

    // ── Step 1: Create SumUp hosted checkout ─────────────────
    const sumupRes = await fetch('https://api.sumup.com/v0.1/checkouts', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${SUMUP_API_KEY}`,
      },
      body: JSON.stringify({
        checkout_reference: checkoutRef,
        amount,
        currency:      'EUR',
        merchant_code: SUMUP_MERCHANT_CODE,
        description:   `Pizzica Pizzica – ${ev.data} × ${numPosti} posto/i`,
        redirect_url:  redirectUrl,
        valid_until:   validUntil,
        hosted_checkout: { enabled: true },
      }),
    });

    if (!sumupRes.ok) {
      const errText = await sumupRes.text();
      console.error('[sumup-create] SumUp error:', errText);
      throw new Error('Payment provider error');
    }

    const checkout = await sumupRes.json();
    if (!checkout.hosted_checkout_url) throw new Error('No checkout URL returned by SumUp');

    // ── Step 2: Save booking as pending_payment ───────────────
    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/pizzica_prenotazioni`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        apikey:          SUPABASE_SERVICE_ROLE_KEY,
        Authorization:   `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer:          'return=representation',
      },
      body: JSON.stringify({
        evento_id:         b.evento_id,
        nome:              String(b.nome).trim().substring(0, 100),
        cognome:           String(b.cognome).trim().substring(0, 100),
        email:             String(b.email).trim().toLowerCase().substring(0, 200),
        telefono:          String(b.telefono || '').trim().substring(0, 30),
        num_posti:         numPosti,
        note:              b.note ? String(b.note).trim().substring(0, 500) : null,
        stato:             'pending_payment',
        payment_reference: checkoutRef,
        importo_pagato:    amount,
        payment_method:    'sumup',
      }),
    });

    if (!insertRes.ok) {
      const errText = await insertRes.text();
      console.error('[sumup-create] DB insert failed:', errText);
      throw new Error('Could not save booking');
    }

    return res.status(200).json({
      hosted_checkout_url: checkout.hosted_checkout_url,
      checkout_reference:  checkoutRef,
    });

  } catch (err) {
    console.error('[sumup-create] Error:', err.message);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

async function getDefaultPrice(supabaseUrl, serviceRoleKey) {
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/app_settings?key=eq.pizzica_prezzo_default&select=value`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      }
    );
    if (!res.ok) throw new Error('Could not read default price');
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return DEFAULT_PRICE_FALLBACK;
    const parsed = parseFloat(data[0].value);
    return Number.isFinite(parsed) ? parsed : DEFAULT_PRICE_FALLBACK;
  } catch (err) {
    console.warn('[sumup-create] default price lookup failed', err.message);
    return DEFAULT_PRICE_FALLBACK;
  }
}

const DEFAULT_PRICE_FALLBACK = 15;
