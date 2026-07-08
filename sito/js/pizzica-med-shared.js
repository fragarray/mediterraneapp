/* ============================================================
   Estate Mediterranea – Pizzica Pizzica
   Shared booking logic with SumUp payment flow
   ============================================================ */

window.initEstateMediterranea = function (config) {
  const { showSnackbar, loadThemeAndReady, scrollToFirstInvalidField } = CodexUi;
  const { days, monthsFull, timeLabel, s } = config;

  // ── State ─────────────────────────────────────────────────
  let events            = [];
  let selectedEventId   = null;
  let currentEventPrice = 15.00;
  let capturedFormData  = null;
  let defaultEventPrice = 15.00;
  const DEFAULT_EVENT_PRICE = 15.00;

  function normalizeEventPrice(value, fallback = DEFAULT_EVENT_PRICE) {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  async function loadDefaultEventPrice() {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'pizzica_prezzo_default')
        .maybeSingle();
      if (error) throw error;
      const price = data && data.value ? parseFloat(data.value) : NaN;
      defaultEventPrice = Number.isFinite(price) ? price : DEFAULT_EVENT_PRICE;
    } catch (err) {
      defaultEventPrice = DEFAULT_EVENT_PRICE;
      console.warn('[booking] could not load default event price, using fallback', err.message);
    }
  }

  // ── DOM refs ──────────────────────────────────────────────
  const datesContainer        = document.getElementById('datesContainer');
  const formPlaceholder       = document.getElementById('formPlaceholder');
  const formSection           = document.getElementById('formSection');
  const selectedDateLabel     = document.getElementById('selectedDateLabel');
  const bookingForm           = document.getElementById('bookingForm');
  const submitBtnLabel        = document.getElementById('submitBtnLabel');
  const paymentSection        = document.getElementById('paymentSection');
  const paymentDateLabel      = document.getElementById('paymentDateLabel');
  const payNumPosti            = document.getElementById('payNumPosti');
  const payPricePerPerson     = document.getElementById('payPricePerPerson');
  const payTotal              = document.getElementById('payTotal');
  const btnPayNow             = document.getElementById('btnPayNow');
  const payNowSpinner         = document.getElementById('payNowSpinner');
  const payNowLabel           = document.getElementById('payNowLabel');
  const btnBackToForm         = document.getElementById('btnBackToForm');
  const paymentVerifySection  = document.getElementById('paymentVerifySection');
  const verifyStatusText      = document.getElementById('verifyStatusText');
  const successView           = document.getElementById('successView');
  const successText           = document.getElementById('successText');
  const successDetail         = document.getElementById('successDetail');
  const btnAnother            = document.getElementById('btnAnother');

  // ── Helpers ───────────────────────────────────────────────
  function parseLocalDate(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function formatDateFull(iso) {
    const d = parseLocalDate(iso);
    return `${days[d.getDay()]} ${d.getDate()} ${monthsFull[d.getMonth()]} ${d.getFullYear()} · ${timeLabel}`;
  }

  function formatDateCard(iso) {
    const d = parseLocalDate(iso);
    return { weekday: days[d.getDay()], day: d.getDate(), month: monthsFull[d.getMonth()], year: d.getFullYear() };
  }

  function formatPrice(amount) {
    return '€' + parseFloat(amount).toFixed(2).replace('.', config.lang === 'en' ? '.' : ',');
  }

  function esc(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Load events ───────────────────────────────────────────
  async function loadEvents() {
    await loadDefaultEventPrice();
    const now = new Date();
    const todayIso = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

    const { data, error } = await supabase
      .from('pizzica_eventi')
      .select('id, data, ora, luogo, note, prezzo')
      .eq('prenotazioni_aperte', true)
      .gte('data', todayIso)
      .order('data', { ascending: true });

    if (error) {
      datesContainer.innerHTML = `<div class="dates-empty">${esc(s.loadError)}</div>`;
      return;
    }
    events = data || [];
    renderDates(events);
  }

  function renderDates(evts) {
    if (!evts.length) {
      datesContainer.innerHTML = `<div class="dates-empty">${esc(s.noEvents)}</div>`;
      return;
    }
    const cards = evts.map(ev => {
      const price = normalizeEventPrice(ev.prezzo, defaultEventPrice);
      const { weekday, day, month, year } = formatDateCard(ev.data);
      return `
        <button type="button" class="date-card"
          data-id="${esc(ev.id)}"
          data-date="${esc(ev.data)}"
          data-price="${price}"
          aria-label="${esc(weekday)} ${day} ${esc(month)} ${year}">
          <span class="dc-weekday">${esc(weekday)}</span>
          <span class="dc-day">${day}</span>
          <span class="dc-month">${esc(month)} ${year}</span>
        </button>`;
    }).join('');
    datesContainer.innerHTML = `<div class="dates-grid">${cards}</div>`;
    datesContainer.querySelectorAll('.date-card').forEach(card => {
      const price = normalizeEventPrice(card.dataset.price, defaultEventPrice);
      card.addEventListener('click', () => onDateClick(
        card.dataset.id,
        card.dataset.date,
        price
      ));
    });
  }

  // ── Select date ───────────────────────────────────────────
  function onDateClick(eventId, isoDate, price) {
    selectedEventId   = eventId;
    currentEventPrice = normalizeEventPrice(price);
    datesContainer.querySelectorAll('.date-card').forEach(c => {
      c.classList.toggle('selected', c.dataset.id === eventId);
    });
    formPlaceholder.style.display = 'none';
    successView.classList.remove('visible');
    paymentSection?.classList.remove('visible');
    formSection.classList.add('visible');
    selectedDateLabel.textContent = formatDateFull(isoDate);
    bookingForm.reset();
    clearErrors();
    formSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ── Validation ────────────────────────────────────────────
  function clearErrors() {
    document.querySelectorAll('.form-group.has-error').forEach(g => g.classList.remove('has-error'));
  }

  function setError(id) {
    document.getElementById(id)?.closest('.form-group')?.classList.add('has-error');
  }

  function validateForm() {
    clearErrors();
    let valid = true;
    const nome    = document.getElementById('nome')?.value.trim();
    const cognome = document.getElementById('cognome')?.value.trim();
    const email   = document.getElementById('email')?.value.trim();
    const tel     = document.getElementById('telefono')?.value.trim();
    const posti   = Number(document.getElementById('numPosti')?.value);

    if (!nome)                                              { setError('nome');     valid = false; }
    if (!cognome)                                           { setError('cognome');  valid = false; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || ''))  { setError('email');    valid = false; }
    if (!tel || tel.length < 6)                            { setError('telefono'); valid = false; }
    if (!Number.isInteger(posti) || posti < 1)             { setError('numPosti'); valid = false; }

    if (!valid) scrollToFirstInvalidField();
    return valid;
  }

  // ── Form submit → payment summary ────────────────────────
  bookingForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selectedEventId) return;
    if (!validateForm()) { showSnackbar(s.formInvalid, true); return; }

    capturedFormData = {
      nome:     document.getElementById('nome').value.trim(),
      cognome:  document.getElementById('cognome').value.trim(),
      email:    document.getElementById('email').value.trim().toLowerCase(),
      telefono: document.getElementById('telefono').value.trim(),
      numPosti: parseInt(document.getElementById('numPosti').value, 10),
      note:     document.getElementById('note').value.trim() || null,
    };

    showPaymentStep();
  });

  async function loadEventPrice(eventId) {
    if (!eventId) return defaultEventPrice;
    try {
      const { data, error } = await supabase
        .from('pizzica_eventi')
        .select('prezzo')
        .eq('id', eventId)
        .maybeSingle();
      if (error) throw error;
      const price = data && data.prezzo != null ? parseFloat(data.prezzo) : null;
      return Number.isFinite(price) ? price : defaultEventPrice;
    } catch (err) {
      console.warn('[booking] could not load event price', err.message);
      return defaultEventPrice;
    }
  }

  async function showPaymentStep() {
    const { numPosti } = capturedFormData;
    const price = Number.isFinite(currentEventPrice)
      ? currentEventPrice
      : await loadEventPrice(selectedEventId);
    const total = price * numPosti;
    currentEventPrice = price;

    if (paymentDateLabel)  paymentDateLabel.textContent  = selectedDateLabel.textContent;
    if (payNumPosti)       payNumPosti.textContent        = numPosti;
    if (payPricePerPerson) payPricePerPerson.textContent  = formatPrice(price);
    if (payTotal)          payTotal.textContent           = formatPrice(total);
    if (document.getElementById('eventPriceNoteText')) {
      document.getElementById('eventPriceNoteText').textContent = `${formatPrice(price)} a persona`;
    }

    // Reset pay button state
    if (btnPayNow)    { btnPayNow.disabled = false; }
    if (payNowLabel)  { payNowLabel.textContent = s.payment.payNow; }
    if (payNowSpinner){ payNowSpinner.style.display = 'none'; }

    formSection.classList.remove('visible');
    paymentSection?.classList.add('visible');
    paymentSection?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ── "Paga con SumUp" click ────────────────────────────────
  btnPayNow?.addEventListener('click', async () => {
    if (!capturedFormData || !selectedEventId) return;

    btnPayNow.disabled = true;
    if (payNowLabel)   payNowLabel.textContent = s.payment.creating;
    if (payNowSpinner) payNowSpinner.style.display = '';

    const { nome, cognome, email, telefono, numPosti, note } = capturedFormData;
    const redirectBase = window.location.href.split('?')[0];

    try {
      const resp = await fetch('/api/sumup-create-checkout', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          bookingData: { evento_id: selectedEventId, nome, cognome, email, telefono, num_posti: numPosti, note },
          redirectBase,
        }),
      });
      const result = await resp.json();
      if (!resp.ok || !result.hosted_checkout_url) throw new Error(result.error || 'Unknown error');

      window.location.href = result.hosted_checkout_url;

    } catch (err) {
      btnPayNow.disabled = false;
      if (payNowLabel)   payNowLabel.textContent = s.payment.payNow;
      if (payNowSpinner) payNowSpinner.style.display = 'none';
      showSnackbar(s.payment.createError, true);
      console.error('[payment] create checkout error:', err.message);
    }
  });

  // ── Back to form ──────────────────────────────────────────
  btnBackToForm?.addEventListener('click', () => {
    paymentSection?.classList.remove('visible');
    formSection.classList.add('visible');
    capturedFormData = null;
    formSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  // ── "Book another" ────────────────────────────────────────
  btnAnother.addEventListener('click', () => {
    successView.classList.remove('visible');
    formPlaceholder.style.display = '';
    selectedEventId   = null;
    capturedFormData  = null;
    currentEventPrice = 15.00;
    datesContainer.querySelectorAll('.date-card').forEach(c => c.classList.remove('selected'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  if (submitBtnLabel) submitBtnLabel.textContent = s.submitLabel;

  // ── SumUp return: verify payment ─────────────────────────
  async function handleSumupReturn(checkoutRef) {
    // Hide normal UI sections
    if (datesContainer)   datesContainer.innerHTML = '';
    if (formPlaceholder)  formPlaceholder.style.display = 'none';
    formSection.classList.remove('visible');
    paymentSection?.classList.remove('visible');

    // Show verify section
    if (paymentVerifySection) paymentVerifySection.style.display = '';
    if (verifyStatusText)     verifyStatusText.textContent = s.payment.verifying;

    // Clean query string from URL
    history.replaceState(null, '', location.pathname);

    try {
      const resp = await fetch('/api/sumup-verify', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ checkout_reference: checkoutRef }),
      });
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error || 'Verify failed');

      if (result.status === 'PAID' && result.success) {
        if (paymentVerifySection) paymentVerifySection.style.display = 'none';

        const b = result.booking;
        const dateLabel = b?.event_date ? formatDateFull(b.event_date) : '';
        successText.textContent = s.successText(b?.num_posti || 1);
        successDetail.innerHTML = dateLabel
          ? `<span class="material-icons-outlined">event</span> ${esc(dateLabel)}`
          : '';
        successView.classList.add('visible');
        successView.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

      } else if (result.status === 'FAILED' || result.status === 'EXPIRED') {
        if (verifyStatusText) verifyStatusText.textContent =
          result.status === 'EXPIRED' ? s.payment.paymentExpired : s.payment.paymentFailed;
        setTimeout(() => {
          if (paymentVerifySection) paymentVerifySection.style.display = 'none';
          if (formPlaceholder) formPlaceholder.style.display = '';
          loadEvents();
          showSnackbar(result.status === 'EXPIRED' ? s.payment.paymentExpired : s.payment.paymentFailed, true);
        }, 2500);

      } else {
        // PENDING (raro dopo redirect)
        if (verifyStatusText) verifyStatusText.textContent = s.payment.paymentPending;
        setTimeout(() => {
          if (paymentVerifySection) paymentVerifySection.style.display = 'none';
          if (formPlaceholder) formPlaceholder.style.display = '';
          loadEvents();
        }, 3000);
      }
    } catch (err) {
      if (verifyStatusText) verifyStatusText.textContent = s.payment.verifyError;
      console.error('[payment] verify error:', err.message);
    }
  }

  // ── Boot ──────────────────────────────────────────────────
  async function boot() {
    const urlRef = new URLSearchParams(window.location.search).get('ref');
    if (urlRef) {
      await handleSumupReturn(urlRef);
    } else {
      await loadEvents();
    }
  }

  loadThemeAndReady({ beforeReady: boot });
};
