/* ============================================================
   Estate Mediterranea – Pizzica Pizzica
   Shared booking logic
   Called by estate-mediterranea.js (IT) and estate-mediterranea-en.js (EN)
   ============================================================ */

window.initEstateMediterranea = function (config) {
  /* config = {
       lang: 'it' | 'en',
       otherLangHref: string,
       days: string[7],           // Sunday first
       monthsShort: string[12],
       monthsFull: string[12],
       timeLabel: string,         // e.g. 'ore 19:30' / '7:30 PM'
       s: {                       // UI strings
         loading, loadError, noEvents,
         selectDate, selectDateHint,
         formTitle,
         labelNome, errNome,
         labelCognome, errCognome,
         labelEmail, errEmail,
         labelTelefono, errTelefono,
         labelNumPosti, errNumPosti,
         labelNote, placeholderNote,
         priceNote,
         submitLabel, submittingLabel, submitError,
         formInvalid,
         successTitle, successText, successDetailPrefix,
         anotherLabel,
         placeholderTitle, placeholderHint,
       }
     }
  */
  const { showSnackbar, loadThemeAndReady, scrollToFirstInvalidField } = CodexUi;
  const { days, monthsFull, timeLabel, s } = config;

  // ── State ─────────────────────────────────────────────────
  let events = [];
  let selectedEventId = null;

  // ── DOM refs ──────────────────────────────────────────────
  const datesContainer   = document.getElementById('datesContainer');
  const formPlaceholder  = document.getElementById('formPlaceholder');
  const formSection      = document.getElementById('formSection');
  const selectedDateLabel = document.getElementById('selectedDateLabel');
  const bookingForm      = document.getElementById('bookingForm');
  const submitBtn        = document.getElementById('submitBtn');
  const submitBtnLabel   = document.getElementById('submitBtnLabel');
  const successView      = document.getElementById('successView');
  const successText      = document.getElementById('successText');
  const successDetail    = document.getElementById('successDetail');
  const btnAnother       = document.getElementById('btnAnother');

  // ── Date helpers ──────────────────────────────────────────
  // Parse YYYY-MM-DD without timezone shift
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
    return {
      weekday: days[d.getDay()],
      day: d.getDate(),
      month: monthsFull[d.getMonth()],
      year: d.getFullYear(),
    };
  }

  // ── Security: escape HTML output ──────────────────────────
  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Load events ───────────────────────────────────────────
  async function loadEvents() {
    const now = new Date();
    const todayIso = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

    const { data, error } = await supabase
      .from('pizzica_eventi')
      .select('id, data, ora, luogo, note')
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
          aria-label="${esc(weekday)} ${day} ${esc(month)} ${year}">
          <span class="dc-weekday">${esc(weekday)}</span>
          <span class="dc-day">${day}</span>
          <span class="dc-month">${esc(month)} ${year}</span>
        </button>`;
    }).join('');

    datesContainer.innerHTML = `<div class="dates-grid">${cards}</div>`;

    datesContainer.querySelectorAll('.date-card').forEach(card => {
      card.addEventListener('click', () => onDateClick(card.dataset.id, card.dataset.date));
    });
  }

  // ── Select date ───────────────────────────────────────────
  function onDateClick(eventId, isoDate) {
    selectedEventId = eventId;

    datesContainer.querySelectorAll('.date-card').forEach(c => {
      c.classList.toggle('selected', c.dataset.id === eventId);
    });

    formPlaceholder.style.display = 'none';
    successView.classList.remove('visible');
    formSection.classList.add('visible');
    selectedDateLabel.textContent = formatDateFull(isoDate);
    bookingForm.reset();
    clearErrors();
    formSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ── Validation ────────────────────────────────────────────
  function clearErrors() {
    document.querySelectorAll('.form-group.has-error')
      .forEach(g => g.classList.remove('has-error'));
  }

  function setError(id) {
    const el = document.getElementById(id);
    if (el) el.closest('.form-group').classList.add('has-error');
  }

  function validateForm() {
    clearErrors();
    let valid = true;

    const nome    = document.getElementById('nome')?.value.trim();
    const cognome = document.getElementById('cognome')?.value.trim();
    const email   = document.getElementById('email')?.value.trim();
    const tel     = document.getElementById('telefono')?.value.trim();
    const posti   = Number(document.getElementById('numPosti')?.value);

    if (!nome)                            { setError('nome');     valid = false; }
    if (!cognome)                         { setError('cognome');  valid = false; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '')) { setError('email'); valid = false; }
    if (!tel || tel.length < 6)           { setError('telefono'); valid = false; }
    if (!Number.isInteger(posti) || posti < 1) { setError('numPosti'); valid = false; }

    if (!valid) scrollToFirstInvalidField();
    return valid;
  }

  // ── Submit ────────────────────────────────────────────────
  bookingForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selectedEventId) return;
    if (!validateForm()) {
      showSnackbar(s.formInvalid, true);
      return;
    }

    submitBtn.disabled = true;
    submitBtnLabel.textContent = s.submittingLabel;

    const nome     = document.getElementById('nome').value.trim();
    const cognome  = document.getElementById('cognome').value.trim();
    const email    = document.getElementById('email').value.trim().toLowerCase();
    const telefono = document.getElementById('telefono').value.trim();
    const numPosti = parseInt(document.getElementById('numPosti').value, 10);
    const note     = document.getElementById('note').value.trim() || null;

    const { error } = await supabase.from('pizzica_prenotazioni').insert({
      evento_id: selectedEventId,
      nome,
      cognome,
      email,
      telefono,
      num_posti: numPosti,
      note,
      stato: 'confermata',
    });

    submitBtn.disabled = false;
    submitBtnLabel.textContent = s.submitLabel;

    if (error) {
      showSnackbar(s.submitError, true);
      return;
    }

    const ev = events.find(e => e.id === selectedEventId);
    const dateLabel = ev ? formatDateFull(ev.data) : '';

    successText.textContent = s.successText(numPosti);
    successDetail.innerHTML = `<span class="material-icons-outlined">event</span> ${esc(dateLabel)}`;
    formSection.classList.remove('visible');
    successView.classList.add('visible');
    successView.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  // ── "Book another" ────────────────────────────────────────
  btnAnother.addEventListener('click', () => {
    successView.classList.remove('visible');
    formPlaceholder.style.display = '';
    selectedEventId = null;
    datesContainer.querySelectorAll('.date-card').forEach(c => c.classList.remove('selected'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // ── Boot ──────────────────────────────────────────────────
  loadThemeAndReady({ beforeReady: loadEvents });
};
