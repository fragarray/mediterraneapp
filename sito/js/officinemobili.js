(() => {
  'use strict';
  const state = { edition: null, labs: [], selectedLab: null, seats: 1, amount: 0, reference: null };
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
    try { const response = await fetch('/api/officinemobili-verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ checkout_reference: reference }) }); const result = await response.json(); if (result.success && result.status === 'PAID') { $('successText').textContent = `Grazie ${result.booking.nome}, la tua iscrizione è stata confermata.`; $('successDetail').textContent = `${result.booking.num_posti} partecipante/i · ${result.booking.laboratorio_id ? 'laboratorio selezionato' : ''}`; show('paymentVerifySection', false); show('successView'); } else { $('verifyStatusText').textContent = result.status === 'PENDING' ? 'Pagamento ancora in verifica. Ricarica tra poco.' : 'Il pagamento non è stato completato.'; } } catch { $('verifyStatusText').textContent = 'Non è stato possibile verificare il pagamento.'; }
  }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char])); }
  document.addEventListener('DOMContentLoaded', boot);
})();
