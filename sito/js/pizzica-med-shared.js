/* ============================================================
   Estate Mediterranea – Pizzica Pizzica
   Shared booking logic with PayPal payment flow
   ============================================================ */

window.initEstateMediterranea = function (config) {
  const { showSnackbar, loadThemeAndReady, scrollToFirstInvalidField } = CodexUi;
  const { days, monthsFull, timeLabel, s } = config;

  // ── State ─────────────────────────────────────────────────
  let events            = [];
  let selectedEventId   = null;
  let currentEventPrice = 15.00;
  let capturedFormData  = null;
  let timerInterval     = null;
  let timerSeconds      = 600;
  let paypalRendered    = false;

  // ── DOM refs ──────────────────────────────────────────────
  const datesContainer    = document.getElementById('datesContainer');
  const formPlaceholder   = document.getElementById('formPlaceholder');
  const formSection       = document.getElementById('formSection');
  const selectedDateLabel = document.getElementById('selectedDateLabel');
  const bookingForm       = document.getElementById('bookingForm');
  const submitBtn         = document.getElementById('submitBtn');
  const submitBtnLabel    = document.getElementById('submitBtnLabel');
  const paymentSection    = document.getElementById('paymentSection');
  const paymentDateLabel  = document.getElementById('paymentDateLabel');
  const payNumPosti       = document.getElementById('payNumPosti');
  const payPricePerPerson = document.getElementById('payPricePerPerson');
  const payTotal          = document.getElementById('payTotal');
  const timerDisplay      = document.getElementById('timerDisplay');
  const timerExpiredMsg   = document.getElementById('timerExpiredMsg');
  const btnBackToForm     = document.getElementById('btnBackToForm');
  const btnRestartBooking = document.getElementById('btnRestartBooking');
  const successView       = document.getElementById('successView');
  const successText       = document.getElementById('successText');
  const successDetail     = document.getElementById('successDetail');
  const btnAnother        = document.getElementById('btnAnother');

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
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Load events ───────────────────────────────────────────
  async function loadEvents() {
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
      const { weekday, day, month, year } = formatDateCard(ev.data);
      return `
        <button type="button" class="date-card"
          data-id="${esc(ev.id)}"
          data-date="${esc(ev.data)}"
          data-price="${parseFloat(ev.prezzo || 15)}"
          aria-label="${esc(weekday)} ${day} ${esc(month)} ${year}">
          <span class="dc-weekday">${esc(weekday)}</span>
          <span class="dc-day">${day}</span>
          <span class="dc-month">${esc(month)} ${year}</span>
        </button>`;
    }).join('');

    datesContainer.innerHTML = `<div class="dates-grid">${cards}</div>`;

    datesContainer.querySelectorAll('.date-card').forEach(card => {
      card.addEventListener('click', () => onDateClick(
        card.dataset.id,
        card.dataset.date,
        parseFloat(card.dataset.price) || 15,
      ));
    });
  }

  // ── Select date ───────────────────────────────────────────
  function onDateClick(eventId, isoDate, price) {
    selectedEventId   = eventId;
    currentEventPrice = price;

    datesContainer.querySelectorAll('.date-card').forEach(c => {
      c.classList.toggle('selected', c.dataset.id === eventId);
    });

    formPlaceholder.style.display = 'none';
    successView.classList.remove('visible');
    paymentSection?.classList.remove('visible');
    stopTimer();
    clearPaypal();

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

  // ── Form submit → payment step ────────────────────────────
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

  // ── Payment step ──────────────────────────────────────────
  async function showPaymentStep() {
    const { numPosti } = capturedFormData;
    const total = currentEventPrice * numPosti;

    if (paymentDateLabel)  paymentDateLabel.textContent  = selectedDateLabel.textContent;
    if (payNumPosti)       payNumPosti.textContent        = numPosti;
    if (payPricePerPerson) payPricePerPerson.textContent  = formatPrice(currentEventPrice);
    if (payTotal)          payTotal.textContent           = formatPrice(total);
    if (timerExpiredMsg)   timerExpiredMsg.style.display  = 'none';

    formSection.classList.remove('visible');
    paymentSection?.classList.add('visible');
    paymentSection?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    startTimer();
    await initPaypal(numPosti, total);
  }

  // ── PayPal SDK ────────────────────────────────────────────
  async function loadPaypalSdk(clientId) {
    if (window.paypal) return;
    const locale = config.lang === 'en' ? 'en_US' : 'it_IT';
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.id  = 'paypal-sdk';
      script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=EUR&intent=capture&locale=${locale}`;
      script.onload  = resolve;
      script.onerror = () => reject(new Error('PayPal SDK load failed'));
      document.head.appendChild(script);
    });
  }

  function clearPaypal() {
    paypalRendered = false;
    const container  = document.getElementById('paypalButtonContainer');
    const loadingMsg = document.getElementById('paypalLoadingMsg');
    if (container)  { container.innerHTML = ''; container.style.opacity = ''; container.style.pointerEvents = ''; }
    if (loadingMsg) { loadingMsg.textContent = s.payment.loading; loadingMsg.style.display = ''; }
  }

  async function initPaypal(numPosti, total) {
    const container  = document.getElementById('paypalButtonContainer');
    const loadingMsg = document.getElementById('paypalLoadingMsg');
    if (!container) return;

    clearPaypal();

    try {
      const clientId = await getAppSetting('paypal_client_id');
      if (!clientId) {
        if (loadingMsg) loadingMsg.textContent = s.payment.missingConfig;
        return;
      }

      await loadPaypalSdk(clientId);
      if (loadingMsg) loadingMsg.style.display = 'none';
      if (paypalRendered) return;

      const { nome, cognome, email, telefono, note } = capturedFormData;
      const ev = events.find(e => e.id === selectedEventId);
      const desc = ev
        ? `Pizzica Pizzica – ${formatDateFull(ev.data).split(' · ')[0]}`
        : 'Pizzica Pizzica';

      paypal.Buttons({
        style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'pay', height: 48 },

        createOrder: (data, actions) => actions.order.create({
          purchase_units: [{
            amount: { currency_code: 'EUR', value: total.toFixed(2) },
            description: `${desc} × ${numPosti} ${numPosti === 1 ? s.payment.seatSingular : s.payment.seatPlural}`,
          }],
        }),

        onApprove: async (data) => {
          stopTimer();
          container.style.opacity = '0.4';
          container.style.pointerEvents = 'none';
          if (loadingMsg) { loadingMsg.textContent = s.payment.processing; loadingMsg.style.display = ''; }

          try {
            const resp = await fetch('/api/paypal-capture', {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify({
                orderId:     data.orderID,
                bookingData: { evento_id: selectedEventId, nome, cognome, email, telefono, num_posti: numPosti, note },
              }),
            });

            const result = await resp.json();
            if (!resp.ok || !result.success) throw new Error(result.error || 'Unknown error');

            // ✅ Success
            paymentSection?.classList.remove('visible');
            const dateLabel = ev ? formatDateFull(ev.data) : '';
            successText.textContent = s.successText(numPosti);
            successDetail.innerHTML = `<span class="material-icons-outlined">event</span> ${esc(dateLabel)}`;
            successView.classList.add('visible');
            successView.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

          } catch (err) {
            container.style.opacity = '';
            container.style.pointerEvents = '';
            if (loadingMsg) loadingMsg.style.display = 'none';
            showSnackbar(s.payment.serverError, true);
            console.error('[payment] capture error:', err.message);
          }
        },

        onCancel:  ()    => showSnackbar(s.payment.cancelled, false),
        onError:   (err) => { console.error('[paypal] error:', err); showSnackbar(s.payment.paypalError, true); },
      }).render('#paypalButtonContainer');

      paypalRendered = true;

    } catch (err) {
      if (loadingMsg) loadingMsg.textContent = s.payment.loadError;
      console.error('[paypal] init error:', err);
    }
  }

  // ── Timer ─────────────────────────────────────────────────
  function startTimer() {
    timerSeconds = 600;
    if (timerDisplay) timerDisplay.style.color = '';
    updateTimerDisplay();
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      timerSeconds--;
      updateTimerDisplay();
      if (timerSeconds <= 0) { stopTimer(); onTimerExpired(); }
    }, 1000);
  }

  function stopTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  }

  function updateTimerDisplay() {
    if (!timerDisplay) return;
    const m  = Math.floor(timerSeconds / 60);
    const ss = timerSeconds % 60;
    timerDisplay.textContent = `${m}:${String(ss).padStart(2, '0')}`;
    if (timerSeconds <= 60) timerDisplay.style.color = '#c62828';
  }

  function onTimerExpired() {
    const container = document.getElementById('paypalButtonContainer');
    if (container) { container.style.opacity = '0.3'; container.style.pointerEvents = 'none'; }
    if (timerExpiredMsg) timerExpiredMsg.style.display = '';
    showSnackbar(s.payment.expired, true);
  }

  // ── Back to form ──────────────────────────────────────────
  btnBackToForm?.addEventListener('click', () => {
    stopTimer();
    clearPaypal();
    paymentSection?.classList.remove('visible');
    formSection.classList.add('visible');
    capturedFormData = null;
    formSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  // ── Timer expired: restart ────────────────────────────────
  btnRestartBooking?.addEventListener('click', () => {
    stopTimer();
    clearPaypal();
    paymentSection?.classList.remove('visible');
    formPlaceholder.style.display = '';
    selectedEventId = null;
    capturedFormData = null;
    datesContainer.querySelectorAll('.date-card').forEach(c => c.classList.remove('selected'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // ── "Book another" ────────────────────────────────────────
  btnAnother.addEventListener('click', () => {
    successView.classList.remove('visible');
    formPlaceholder.style.display = '';
    selectedEventId   = null;
    capturedFormData  = null;
    currentEventPrice = 15.00;
    stopTimer();
    clearPaypal();
    datesContainer.querySelectorAll('.date-card').forEach(c => c.classList.remove('selected'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // ── Set initial button label ──────────────────────────────
  if (submitBtnLabel) submitBtnLabel.textContent = s.submitLabel;

  // ── Boot ──────────────────────────────────────────────────
  loadThemeAndReady({ beforeReady: loadEvents });
};
