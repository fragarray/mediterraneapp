/* ============================================================
   Vercel Serverless Function – PayPal capture + Supabase insert
   POST /api/paypal-capture
   Body: { orderId: string, bookingData: { evento_id, nome, cognome,
          email, telefono, num_posti, note } }
   ============================================================ */

module.exports = async function handler(req, res) {
  // ── CORS ──────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  // ── Parse & validate input ────────────────────────────────
  const { orderId, bookingData } = req.body || {};

  if (!orderId || typeof orderId !== 'string' || orderId.length > 80) {
    return res.status(400).json({ error: 'Invalid orderId' });
  }

  const b = bookingData || {};
  if (!b.evento_id || !b.nome || !b.cognome || !b.email || !b.num_posti) {
    return res.status(400).json({ error: 'Missing booking fields' });
  }

  const numPosti = parseInt(b.num_posti, 10);
  if (!Number.isInteger(numPosti) || numPosti < 1 || numPosti > 50) {
    return res.status(400).json({ error: 'Invalid num_posti' });
  }

  // ── Env vars ──────────────────────────────────────────────
  const {
    PAYPAL_CLIENT_ID,
    PAYPAL_CLIENT_SECRET,
    PAYPAL_MODE,
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
  } = process.env;

  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[paypal-capture] Missing env vars');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const PAYPAL_BASE = (PAYPAL_MODE || 'sandbox') === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

  try {
    // ── Step 0: Verify event exists and get price from Supabase ──
    const evRes = await fetch(
      `${SUPABASE_URL}/rest/v1/pizzica_eventi?id=eq.${encodeURIComponent(b.evento_id)}&select=prezzo,prenotazioni_aperte`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );

    if (!evRes.ok) throw new Error('Could not read event data');
    const [ev] = await evRes.json();
    if (!ev)                       return res.status(400).json({ error: 'Event not found' });
    if (!ev.prenotazioni_aperte)   return res.status(400).json({ error: 'Event bookings closed' });

    const eventPrice    = parseFloat(ev.prezzo || 15);
    const expectedTotal = parseFloat((eventPrice * numPosti).toFixed(2));

    // ── Step 1: Get PayPal access token ───────────────────────
    const credentials = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');

    const tokenRes = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
      },
      body: 'grant_type=client_credentials',
    });

    if (!tokenRes.ok) {
      const t = await tokenRes.text();
      console.error('[paypal-capture] Token error:', t);
      throw new Error('PayPal authentication failed');
    }

    const { access_token } = await tokenRes.json();

    // ── Step 2: Capture PayPal order ──────────────────────────
    const captureRes = await fetch(
      `${PAYPAL_BASE}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
      {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${access_token}`,
        },
      }
    );

    if (!captureRes.ok) {
      const c = await captureRes.text();
      console.error('[paypal-capture] Capture error:', c);
      throw new Error('Payment capture failed');
    }

    const captureData = await captureRes.json();

    if (captureData.status !== 'COMPLETED') {
      throw new Error(`Payment not completed (status: ${captureData.status})`);
    }

    const capturedAmount = parseFloat(
      captureData.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value || '0'
    );

    // ── Step 3: Verify amount ─────────────────────────────────
    if (capturedAmount < expectedTotal - 0.01) {
      console.error(
        `[paypal-capture] Amount mismatch: captured ${capturedAmount}, expected ${expectedTotal}. Order: ${orderId}`
      );
      // Payment captured but amount is wrong – flag for manual review
      throw new Error(`Payment amount mismatch (captured €${capturedAmount}, expected €${expectedTotal})`);
    }

    // ── Step 4: Save booking to Supabase ─────────────────────
    const insertBody = {
      evento_id:       b.evento_id,
      nome:            String(b.nome).trim().substring(0, 100),
      cognome:         String(b.cognome).trim().substring(0, 100),
      email:           String(b.email).trim().toLowerCase().substring(0, 200),
      telefono:        String(b.telefono || '').trim().substring(0, 30),
      num_posti:       numPosti,
      note:            b.note ? String(b.note).trim().substring(0, 500) : null,
      stato:           'confermata',
      paypal_order_id: orderId,
      importo_pagato:  capturedAmount,
      payment_method:  'paypal',
    };

    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/pizzica_prenotazioni`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        apikey:          SUPABASE_SERVICE_ROLE_KEY,
        Authorization:   `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer:          'return=representation',
      },
      body: JSON.stringify(insertBody),
    });

    if (!insertRes.ok) {
      const errText = await insertRes.text();
      // CRITICAL: payment captured but booking not saved
      // The orderId is logged for manual recovery
      console.error(`[paypal-capture] CRITICAL: DB insert failed after capture. Order=${orderId} Error=${errText}`);
      throw new Error('Booking save failed after payment – please contact support with your order ID: ' + orderId);
    }

    const [inserted] = await insertRes.json();

    return res.status(200).json({ success: true, bookingId: inserted?.id });

  } catch (err) {
    console.error('[paypal-capture] Error:', err.message);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};
