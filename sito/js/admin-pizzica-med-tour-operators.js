/* ============================================================
   Tour Operator admin – Pizzica Pizzica
   ============================================================ */

(function () {
  const { showSnackbar, loadThemeAndReady } = CodexUi;

  const $ = id => document.getElementById(id);

  let currentUser = null;
  let events = [];

  function showLogin() {
    $('loginView').style.display = '';
    $('mainView').style.display = 'none';
    document.body.classList.add('ready');
  }

  function showMain() {
    $('loginView').style.display = 'none';
    $('mainView').style.display = '';
    loadEvents();
  }

  async function checkAuth() {
    const email = window.localStorage.getItem('pizzicaOperatorEmail');
    const password = window.localStorage.getItem('pizzicaOperatorPassword');

    if (!email || !password) {
      showLogin();
      return;
    }

    const { data, error } = await supabase
      .from('pizzica_operator_users')
      .select('id,email,password,attivo')
      .eq('email', email)
      .maybeSingle();

    if (error || !data || !data.attivo) {
      showLogin();
      return;
    }

    if (String(data.password) !== String(password)) {
      showLogin();
      return;
    }

    currentUser = data;
    showMain();
  }

  $('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('loginEmail').value.trim();
    const password = $('loginPassword').value;

    if (!email || !password) {
      showSnackbar('Inserisci email e password.', true);
      return;
    }

    const loginBtn = $('loginBtn');
    loginBtn.disabled = true;
    loginBtn.innerHTML = '<span class="material-icons-outlined">hourglass_top</span> Accesso in corso…';

    const { data, error } = await supabase
      .from('pizzica_operator_users')
      .select('id,email,password,attivo')
      .eq('email', email)
      .maybeSingle();

    loginBtn.disabled = false;
    loginBtn.innerHTML = '<span class="material-icons-outlined">lock_open</span> Accedi';

    if (error || !data || !data.attivo) {
      showSnackbar('Credenziali non valide o non ancora attive.', true);
      return;
    }

    if (String(data.password) !== String(password)) {
      showSnackbar('Password non corretta.', true);
      return;
    }

    currentUser = data;
    window.localStorage.setItem('pizzicaOperatorEmail', email);
    window.localStorage.setItem('pizzicaOperatorPassword', password);
    showMain();
  });

  $('signOutBtn')?.addEventListener('click', () => {
    window.localStorage.removeItem('pizzicaOperatorEmail');
    window.localStorage.removeItem('pizzicaOperatorPassword');
    currentUser = null;
    showLogin();
    showSnackbar('Disconnesso.');
  });

  async function loadEvents() {
    const todayIso = new Date().toISOString().slice(0, 10);

    try {
      const { data, error } = await supabase
        .from('pizzica_eventi')
        .select('id,data,ora,prenotazioni_aperte,sold_out')
        .gte('data', todayIso)
        .order('data', { ascending: true });

      if (error) {
        const fallback = await supabase
          .from('pizzica_eventi')
          .select('id,data,ora,prenotazioni_aperte')
          .gte('data', todayIso)
          .order('data', { ascending: true });
        events = (fallback.data || []).filter(ev => ev.prenotazioni_aperte !== false);
      } else {
        events = (data || []).filter(ev => ev.prenotazioni_aperte !== false && ev.sold_out !== true);
      }

      renderEventOptions();
    } catch (err) {
      console.error('[tour-operator] load events error', err);
      showSnackbar('Errore nel caricamento delle serate.', true);
    }
  }

  function renderEventOptions() {
    const select = $('eventSelect');
    if (!select) return;

    if (!events.length) {
      select.innerHTML = '<option value="">Nessuna serata disponibile</option>';
      return;
    }

    select.innerHTML = '<option value="">Seleziona una serata</option>' + events.map(ev => {
      const label = formatDate(ev.data);
      return `<option value="${ev.id}">${label}</option>`;
    }).join('');
  }

  $('submitBtn')?.addEventListener('click', async () => {
    const eventId = $('eventSelect').value;
    const nome = $('nome').value.trim();
    const cognome = $('cognome').value.trim();
    const nazionalita = $('nazionalita').value.trim();
    const numPosti = parseInt($('numPosti').value, 10);

    if (!eventId || !nome || !cognome || !nazionalita || !Number.isInteger(numPosti) || numPosti < 1) {
      showSnackbar('Compila tutti i campi obbligatori.', true);
      return;
    }

    const submitBtn = $('submitBtn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="material-icons-outlined">hourglass_top</span> Salvataggio…';

    const { error } = await supabase.from('pizzica_prenotazioni').insert({
      evento_id: eventId,
      nome,
      cognome,
      email: null,
      telefono: null,
      nazionalita,
      num_posti: numPosti,
      note: `Inserita da tour operator (${currentUser?.email || 'sconosciuto'})`,
      stato: 'confermata',
      booking_source: 'tour_operator',
      importo_pagato: 0,
      payment_method: 'operator_manual',
    });

    submitBtn.disabled = false;
    submitBtn.innerHTML = '<span class="material-icons-outlined">save</span> Salva prenotazione';

    if (error) {
      console.error('[tour-operator] insert error', error);
      showSnackbar('Errore durante il salvataggio della prenotazione.', true);
      return;
    }

    showSnackbar('Prenotazione salvata correttamente.');
    $('loginForm')?.reset();
    $('eventSelect').value = '';
    $('nome').value = '';
    $('cognome').value = '';
    $('nazionalita').value = '';
    $('numPosti').value = '1';
  });

  function formatDate(iso) {
    if (!iso) return '–';
    const d = new Date(`${iso}T00:00:00`);
    const days = ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];
    const months = ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];
    return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }

  loadThemeAndReady({ readyClass: true });
  checkAuth();
})();
