(function () {
  const { showSnackbar, loadThemeAndReady, scrollToFirstInvalidField } = CodexUi;

  const state = {
    event: null,
    formData: null,
    currentPrice: 0,
  };

  const els = {
    title: document.getElementById('eventTitle'),
    subtitle: document.getElementById('eventSubtitle'),
    eventDateChip: document.getElementById('eventDateChip'),
    eventTimeChip: document.getElementById('eventTimeChip'),
    eventPlaceChip: document.getElementById('eventPlaceChip'),
    eventPriceInfo: document.getElementById('eventPriceInfo'),
    formSection: document.getElementById('formSection'),
    paymentSection: document.getElementById('paymentSection'),
    selectedDateLabel: document.getElementById('selectedDateLabel'),
    selectedPriceInfo: document.getElementById('selectedPriceInfo'),
    bookingForm: document.getElementById('bookingForm'),
    btnPayNow: document.getElementById('btnPayNow'),
    payNowLabel: document.getElementById('payNowLabel'),
    payNowSpinner: document.getElementById('payNowSpinner'),
    paymentDateLabel: document.getElementById('paymentDateLabel'),
    payNumPosti: document.getElementById('payNumPosti'),
    payPricePerPerson: document.getElementById('payPricePerPerson'),
    payTotal: document.getElementById('payTotal'),
    eventPriceNoteText: document.getElementById('eventPriceNoteText'),
    verifyStatusText: document.getElementById('verifyStatusText'),
    paymentVerifySection: document.getElementById('paymentVerifySection'),
    successView: document.getElementById('successView'),
    successText: document.getElementById('successText'),
    successDetail: document.getElementById('successDetail'),
    btnAnother: document.getElementById('btnAnother'),
    errorState: document.getElementById('errorState'),
    errorStateText: document.getElementById('errorStateText'),
    submitBtnLabel: document.getElementById('submitBtnLabel'),
    btnBackToForm: document.getElementById('btnBackToForm'),
  };

  const days = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
  const monthsFull = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

  function parseLocalDate(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function formatDateFull(iso, timeText = 'ore 19:30') {
    const d = parseLocalDate(iso);
    return `${days[d.getDay()]} ${d.getDate()} ${monthsFull[d.getMonth()]} ${d.getFullYear()} · ${timeText}`;
  }

  function formatPrice(amount) {
    return '€' + Number(amount || 0).toFixed(2).replace('.', ',');
  }

  function setErrorState(message) {
    els.errorStateText.textContent = message;
    els.errorState.style.display = 'block';
    els.formSection.style.display = 'none';
  }

  function setEventDetails(eventDoc) {
    state.event = eventDoc;
    state.currentPrice = Number(eventDoc.prezzo || 0) || 0;

    els.title.textContent = eventDoc.titolo || 'Prenotazione';
    els.subtitle.textContent = eventDoc.note || 'Serata in organizzazione';
    els.eventDateChip.textContent = formatDateFull(eventDoc.data, eventDoc.ora || 'ore 19:30').split(' · ')[0];
    els.eventTimeChip.textContent = eventDoc.ora || '19:30';
    els.eventPlaceChip.textContent = eventDoc.luogo || 'Mediterranea';
    els.eventPriceInfo.textContent = `Prezzo a persona: ${formatPrice(state.currentPrice)}`;
    els.selectedDateLabel.textContent = formatDateFull(eventDoc.data, eventDoc.ora || 'ore 19:30');
    els.selectedPriceInfo.textContent = `${formatPrice(state.currentPrice)} a persona`;
    els.paymentDateLabel.textContent = formatDateFull(eventDoc.data, eventDoc.ora || 'ore 19:30');
    els.eventPriceNoteText.textContent = `${formatPrice(state.currentPrice)} a persona`;
    document.title = `${eventDoc.titolo} – Prenotazione | Mediterranea`;
  }

  function clearErrors() {
    document.querySelectorAll('.form-group.has-error').forEach(group => group.classList.remove('has-error'));
  }

  function setFieldError(id) {
    const input = document.getElementById(id);
    if (input) input.closest('.form-group')?.classList.add('has-error');
  }

  function validateForm() {
    clearErrors();
    let valid = true;

    const nome = document.getElementById('nome').value.trim();
    const cognome = document.getElementById('cognome').value.trim();
    const email = document.getElementById('email').value.trim();
    const telefono = document.getElementById('telefono').value.trim();
    const posti = Number(document.getElementById('numPosti').value);

    if (!nome) { setFieldError('nome'); valid = false; }
    if (!cognome) { setFieldError('cognome'); valid = false; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setFieldError('email'); valid = false; }
    if (!telefono || telefono.length < 6) { setFieldError('telefono'); valid = false; }
    if (!Number.isInteger(posti) || posti < 1) { setFieldError('numPosti'); valid = false; }

    if (!valid) scrollToFirstInvalidField();
    return valid;
  }

  function showPaymentStep() {
    const numPosti = Number(document.getElementById('numPosti').value);
    const total = state.currentPrice * numPosti;

    els.payNumPosti.textContent = String(numPosti);
    els.payPricePerPerson.textContent = formatPrice(state.currentPrice);
    els.payTotal.textContent = formatPrice(total);
    els.formSection.style.display = 'none';
    els.paymentSection.style.display = 'block';
    els.paymentSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  els.bookingForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!state.event) return;
    if (!validateForm()) {
      showSnackbar('Controlla i campi evidenziati.', true);
      return;
    }

    state.formData = {
      nome: document.getElementById('nome').value.trim(),
      cognome: document.getElementById('cognome').value.trim(),
      email: document.getElementById('email').value.trim().toLowerCase(),
      telefono: document.getElementById('telefono').value.trim(),
      numPosti: Number(document.getElementById('numPosti').value),
      note: document.getElementById('note').value.trim() || null,
    };

    showPaymentStep();
  });

  els.btnBackToForm.addEventListener('click', () => {
    els.paymentSection.style.display = 'none';
    els.formSection.style.display = 'block';
    state.formData = null;
    els.formSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  els.btnAnother.addEventListener('click', () => {
    window.location.href = 'index.html';
  });

  els.btnPayNow.addEventListener('click', async () => {
    if (!state.formData || !state.event) return;

    els.btnPayNow.disabled = true;
    els.payNowLabel.textContent = 'Preparazione pagamento…';
    els.payNowSpinner.style.display = '';

    try {
      const response = await fetch('/api/eventi-associazione-create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingData: {
            evento_id: state.event.id,
            nome: state.formData.nome,
            cognome: state.formData.cognome,
            email: state.formData.email,
            telefono: state.formData.telefono,
            num_posti: state.formData.numPosti,
            note: state.formData.note,
          },
          redirectBase: `${window.location.origin}${window.location.pathname}`,
        }),
      });

      const result = await response.json();
      if (!response.ok || !result.hosted_checkout_url) {
        throw new Error(result.error || 'Errore nel pagamento');
      }

      window.location.href = result.hosted_checkout_url;
    } catch (error) {
      els.btnPayNow.disabled = false;
      els.payNowLabel.textContent = 'Paga con SumUp';
      els.payNowSpinner.style.display = 'none';
      showSnackbar(error.message || 'Errore nella creazione del pagamento.', true);
    }
  });

  async function handleSumupReturn(checkoutRef) {
    els.formSection.style.display = 'none';
    els.paymentSection.style.display = 'none';
    els.paymentVerifySection.style.display = 'block';
    els.verifyStatusText.textContent = 'Verifica pagamento in corso…';
    history.replaceState(null, '', location.pathname);

    try {
      const response = await fetch('/api/eventi-associazione-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkout_reference: checkoutRef }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Errore verifica');

      if (result.status === 'PAID' && result.success) {
        els.paymentVerifySection.style.display = 'none';
        els.successText.textContent = result.booking && result.booking.num_posti === 1
          ? `La tua prenotazione per 1 posto è stata confermata. Ti aspettiamo!`
          : `La tua prenotazione per ${result.booking?.num_posti || 1} posti è stata confermata. Ti aspettiamo!`;
        els.successDetail.innerHTML = result.booking?.event_name
          ? `<span class="material-icons-outlined">event</span> ${result.booking.event_name}`
          : '<span class="material-icons-outlined">event</span> Serata confermata';
        els.successView.style.display = 'block';
      } else if (result.status === 'FAILED' || result.status === 'EXPIRED') {
        els.verifyStatusText.textContent = result.status === 'EXPIRED' ? 'Il tempo per il pagamento è scaduto. Riprova la prenotazione.' : 'Pagamento non riuscito. Puoi riprovare quando vuoi.';
        setTimeout(() => {
          els.paymentVerifySection.style.display = 'none';
          window.location.href = `booking-evento.html?slug=${encodeURIComponent(state.event?.slug || '')}`;
        }, 2200);
      } else {
        els.verifyStatusText.textContent = 'Pagamento in attesa di conferma. Ricarica tra qualche istante.';
        setTimeout(() => {
          els.paymentVerifySection.style.display = 'none';
          els.formSection.style.display = 'block';
        }, 2000);
      }
    } catch (error) {
      els.verifyStatusText.textContent = 'Impossibile verificare il pagamento. Contatta l\'organizzatore.';
      console.error('[booking-evento] verify error', error);
    }
  }

  async function boot() {
    await loadThemeAndReady();

    const slug = new URLSearchParams(window.location.search).get('slug');
    if (!slug) {
      setErrorState('Nessuna serata selezionata. Torna alla home e scegli una locandina.');
      return;
    }

    const { data, error } = await supabase
      .from('eventi_associazione')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();

    if (error || !data) {
      setErrorState('La serata richiesta non è disponibile oppure è stata rimossa.');
      return;
    }

    if (!data.is_active) {
      setErrorState('Questa serata non accetta prenotazioni al momento.');
      return;
    }

    setEventDetails(data);

    const ref = new URLSearchParams(window.location.search).get('ref');
    if (ref) {
      await handleSumupReturn(ref);
    }
  }

  boot();
})();
