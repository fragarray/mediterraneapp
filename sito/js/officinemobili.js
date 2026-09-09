(() => {
  'use strict';
  const state = { edition: null, labs: [], selectedLab: null, seats: 1, amount: 0, reference: null, confirmedBooking: null };
  const $ = id => document.getElementById(id);
  const show = (id, visible = true) => {
    const element = $(id);
    if (!element) return;
    element.style.display = visible ? 'block' : 'none';
  };
  const snack = message => window.CodexUi?.showSnackbar ? CodexUi.showSnackbar(message) : alert(message);

  async function boot() {
    document.body.classList.add('ready');
    const params = new URLSearchParams(location.search);
    if (params.get('ref')) { await verifyReturn(params.get('ref')); return; }
    const { data: edition, error: editionError } = await supabase.from('officinemobili_edizioni').select('id,titolo,data_inizio,data_fine,prezzo,prenotazioni_aperte').eq('slug', 'officine-mobili-2026').eq('attiva', true).maybeSingle();
    if (editionError || !edition) return renderError('Le iscrizioni non sono al momento disponibili.');
    state.edition = edition;
    const { data: labs, error } = await supabase.from('officinemobili_laboratori').select('id,slug,nome,descrizione,capienza,attivo').eq('edizione_id', edition.id).eq('attivo', true).order('nome');
    if (error) return renderError('Impossibile caricare i laboratori.');
    state.labs = labs || [];
    renderLabs();
    $('bookingForm').addEventListener('submit', submitForm);
    $('btnPayNow').addEventListener('click', payNow);
    $('btnBackToForm').addEventListener('click', () => { show('paymentSection', false); show('formSection'); window.scrollTo({ top: $('formSection').offsetTop - 20, behavior: 'smooth' }); });
    $('btnAnother').addEventListener('click', () => location.href = location.pathname);
    $('bookingLookupTrigger').addEventListener('click', () => {
      $('bookingLookup').hidden = !$('bookingLookup').hidden;
      if (!$('bookingLookup').hidden) $('bookingCode').focus();
    });
    $('bookingLookupForm').addEventListener('submit', lookupBooking);
    $('downloadTicketBtn').addEventListener('click', () => downloadBookingFile('biglietto-officine-mobili.html', buildTicketHtml(state.confirmedBooking)));
    $('downloadInfoBtn').addEventListener('click', () => downloadBookingFile('materiale-informativo-officine-mobili.txt', buildInfoText(state.confirmedBooking)));
  }
  function renderError(message) { $('labsContainer').innerHTML = `<div class="loading-state">${escapeHtml(message)}</div>`; }
  function renderLabs() {
    $('labsContainer').innerHTML = state.labs.map(lab => `<article class="lab-card" data-id="${lab.id}" tabindex="0" role="button" aria-label="Scegli ${escapeHtml(lab.nome)}"><span class="material-icons-outlined lab-icon">school</span><h3>${escapeHtml(lab.nome)}</h3><p>${escapeHtml(lab.descrizione || '')}</p><span class="lab-seats">${lab.capienza} posti disponibili</span></article>`).join('');
    document.querySelectorAll('.lab-card').forEach(card => { card.addEventListener('click', () => selectLab(card.dataset.id)); card.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectLab(card.dataset.id); } }); });
  }
  function selectLab(id) {
    state.selectedLab = state.labs.find(lab => lab.id === id);
    document.querySelectorAll('.lab-card').forEach(card => card.classList.toggle('selected', card.dataset.id === id));
    $('selectedLabLabel').textContent = state.selectedLab.nome;
    $('selectedLabCapacity').textContent = `${state.selectedLab.capienza} posti totali`;
    show('formPlaceholder', false); show('formSection');
    $('formSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function validate() {
    let valid = Boolean(state.selectedLab);
    document.querySelectorAll('#bookingForm .form-group').forEach(group => { const input = group.querySelector('input, textarea'); let ok = input.id === 'email' ? /^\S+@\S+\.\S+$/.test(input.value.trim()) : input.id === 'numPosti' ? Number(input.value) >= 1 && Number(input.value) <= 7 : input.required ? input.value.trim().length > 0 : true; group.classList.toggle('has-error', !ok); valid = valid && ok; });
    if (!state.selectedLab) snack('Seleziona un laboratorio.');
    return valid;
  }
  async function submitForm(event) { event.preventDefault(); if (!validate()) return; state.seats = Number($('numPosti').value); state.amount = Number(state.edition.prezzo) * state.seats; $('payLab').textContent = state.selectedLab.nome; $('payNumPosti').textContent = state.seats; $('payTotal').textContent = `${state.amount.toFixed(2)} €`; show('formSection', false); show('paymentSection'); $('paymentSection').scrollIntoView({ behavior: 'smooth' }); }
  async function payNow() {
    const button = $('btnPayNow'); button.disabled = true; $('payNowSpinner').style.display = 'inline-flex'; $('payNowLabel').textContent = 'Preparazione pagamento…';
    try { const response = await fetch('/api/officinemobili-create-checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookingData: { laboratorio_id: state.selectedLab.id, nome: $('nome').value, cognome: $('cognome').value, email: $('email').value, telefono: $('telefono').value, num_posti: state.seats, note: $('note').value }, redirectBase: `${location.origin}${location.pathname}` }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Impossibile avviare il pagamento'); state.reference = result.checkout_reference; location.href = result.hosted_checkout_url; } catch (error) { snack(error.message); button.disabled = false; $('payNowSpinner').style.display = 'none'; $('payNowLabel').textContent = 'Paga con SumUp'; }
  }
  async function verifyReturn(reference) {
    show('labsContainer', false); show('formPlaceholder', false); show('paymentVerifySection');
    try { const response = await fetch('/api/officinemobili-verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ checkout_reference: reference }) }); const result = await response.json(); if (result.success && result.status === 'PAID') { state.confirmedBooking = { ...result.booking, laboratorio: 'Laboratorio selezionato', edizione: state.edition }; renderSuccess(state.confirmedBooking); show('paymentVerifySection', false); show('successView'); } else { $('verifyStatusText').textContent = result.status === 'PENDING' ? 'Pagamento ancora in verifica. Ricarica tra poco.' : 'Il pagamento non è stato completato.'; } } catch { $('verifyStatusText').textContent = 'Non è stato possibile verificare il pagamento.'; }
  }
  async function lookupBooking(event) {
    event.preventDefault();
    const error = $('bookingLookupError');
    const button = $('bookingLookupBtn');
    error.textContent = '';
    button.disabled = true;
    try {
      const response = await fetch('/api/officinemobili-booking', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booking_code: $('bookingCode').value }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Codice non riconosciuto');
      state.confirmedBooking = result.booking;
      $('bookingLookupResult').hidden = false;
      $('bookingLookupResult').innerHTML = `<strong>Prenotazione confermata</strong><p>${escapeHtml(result.booking.nome)} ${escapeHtml(result.booking.cognome)} · ${escapeHtml(result.booking.laboratorio)} · ${result.booking.num_posti} partecipante/i</p><p>Codice: <strong>${escapeHtml(result.booking.booking_code)}</strong></p><div class="lookup-downloads"><button type="button" class="btn-another" id="lookupTicketBtn">Scarica biglietto</button><button type="button" class="btn-another secondary" id="lookupInfoBtn">Scarica materiale informativo</button></div>`;
      $('lookupTicketBtn').addEventListener('click', () => downloadBookingFile('biglietto-officine-mobili.html', buildTicketHtml(state.confirmedBooking)));
      $('lookupInfoBtn').addEventListener('click', () => downloadBookingFile('materiale-informativo-officine-mobili.txt', buildInfoText(state.confirmedBooking)));
    } catch (lookupError) {
      error.textContent = lookupError.message;
      $('bookingLookupResult').hidden = true;
    } finally { button.disabled = false; }
  }
  function renderSuccess(booking) { $('successText').textContent = `Grazie ${booking.nome}, la tua iscrizione è stata confermata.`; $('successDetail').textContent = `${booking.num_posti} partecipante/i · ${booking.laboratorio}`; $('successCode').textContent = booking.booking_code || 'Codice non disponibile'; }
  function downloadBookingFile(filename, content) { const blob = new Blob([content], { type: filename.endsWith('.html') ? 'text/html;charset=utf-8' : 'text/plain;charset=utf-8' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url); }
  function buildTicketHtml(booking) { return `<!doctype html><html lang="it"><meta charset="utf-8"><title>Biglietto Officine Mobili</title><body style="font-family:Arial,sans-serif;max-width:640px;margin:40px auto;padding:24px;border:2px solid #e74628"><h1>Officine Mobili</h1><h2>Biglietto di iscrizione</h2><p><strong>${escapeHtml(booking.nome)} ${escapeHtml(booking.cognome)}</strong></p><p>Laboratorio: ${escapeHtml(booking.laboratorio)}</p><p>Periodo: 26–30 ottobre</p><p>Partecipanti: ${booking.num_posti}</p><h2>Codice: ${escapeHtml(booking.booking_code)}</h2></body></html>`; }
  function buildInfoText(booking) { return `OFFICINE MOBILI\n\nLaboratorio: ${booking.laboratorio}\nPeriodo: 26–30 ottobre\nPartecipanti: ${booking.num_posti}\nCodice prenotazione: ${booking.booking_code}\n\nConserva questo codice per verificare la tua prenotazione dalla pagina Officine Mobili.`; }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char])); }
  document.addEventListener('DOMContentLoaded', boot);
})();
