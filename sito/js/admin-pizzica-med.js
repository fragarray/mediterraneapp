/* ============================================================
   Admin Estate Mediterranea – Pizzica Pizzica
   ============================================================ */

(function () {
  const { showSnackbar, loadThemeAndReady, escHtml } = CodexUi;

  // ── State ─────────────────────────────────────────────────
  let currentUser = null;
  let allEvents   = [];       // pizzica_eventi
  let bookings    = [];       // current event bookings
  let currentEventId = null;
  let confirmResolver = null;
  let sortKey = 'created_at';
  let sortAsc = false;
  let evSortKey = 'data';
  let evSortAsc = true;
  let defaultPrice = 15.00;

  // ── DOM helpers ───────────────────────────────────────────
  const $  = id => document.getElementById(id);
  const esc = escHtml;

  // ── Auth ──────────────────────────────────────────────────
  async function checkAuth() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      currentUser = session.user;
      showMain();
    } else {
      showLogin();
    }
  }

  function showLogin() {
    $('loginView').style.display = '';
    $('mainView').style.display  = 'none';
    document.body.classList.add('ready');
  }

  function showMain() {
    $('loginView').style.display = 'none';
    $('mainView').style.display  = '';
    $('appbarUser').textContent  = currentUser?.email || '';
    loadSettingsValues();   // load defaultPrice + SumUp config silently
    loadEventsData();
  }

  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    clearLoginErrors();

    const email = $('loginEmail').value.trim();
    const pass  = $('loginPassword').value;
    let valid = true;

    if (!email) { setFieldError('loginEmail'); valid = false; }
    if (!pass)  { setFieldError('loginPassword'); valid = false; }
    if (!valid) return;

    const loginBtn = $('loginBtn');
    loginBtn.disabled = true;
    loginBtn.textContent = 'Accesso in corso…';

    const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });

    loginBtn.disabled = false;
    loginBtn.textContent = 'Accedi';

    if (error || !data.user) {
      showSnackbar('Credenziali non valide.', true);
      return;
    }

    currentUser = data.user;
    showMain();
  });

  $('signOutBtn').addEventListener('click', async () => {
    await supabase.auth.signOut();
    currentUser = null;
    showLogin();
    showSnackbar('Disconnesso.');
  });

  function clearLoginErrors() {
    ['loginEmail','loginPassword'].forEach(id => {
      $( id)?.closest('.form-group')?.classList.remove('has-error');
    });
  }

  function setFieldError(id) {
    $(id)?.closest('.form-group')?.classList.add('has-error');
  }

  // ── Tab switching ─────────────────────────────────────────
  document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  function switchTab(tab) {
    document.querySelectorAll('.tab-btn[data-tab]').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    $('tabBookings').style.display = tab === 'bookings'  ? '' : 'none';
    $('tabEvents').style.display   = tab === 'events'    ? '' : 'none';
    $('tabSettings').style.display = tab === 'settings'  ? '' : 'none';
    if (tab === 'settings') loadSettingsValues();
  }

  // ── Load events (used by both tabs) ───────────────────────
  async function loadEventsData() {
    const { data, error } = await supabase
      .from('pizzica_eventi')
      .select('id, data, ora, luogo, prenotazioni_aperte, note, prezzo, created_at')
      .order('data', { ascending: true });

    if (error) {
      showSnackbar('Errore nel caricamento delle serate.', true);
      return;
    }

    allEvents = data || [];
    populateEventSelector(allEvents);
    renderEventsTable(allEvents);
    loadThemeAndReady({ readyClass: true });
  }

  // ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ──
  // TAB 1: PRENOTAZIONI
  // ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ──

  function populateEventSelector(events) {
    const sel = $('eventSelector');
    const prevVal = sel.value;

    sel.innerHTML = '<option value="">— Seleziona una serata —</option>' +
      events.map(ev => {
        const label = formatDate(ev.data) + (ev.prenotazioni_aperte ? '' : ' (chiusa)');
        return `<option value="${esc(ev.id)}">${esc(label)}</option>`;
      }).join('');

    if (prevVal && events.find(e => e.id === prevVal)) {
      sel.value = prevVal;
    }
  }

  $('eventSelector').addEventListener('change', async () => {
    const id = $('eventSelector').value;
    currentEventId = id || null;
    if (!id) {
      renderBookingsTable([]);
      updateStats([]);
      return;
    }
    await loadBookings(id);
  });

  async function loadBookings(eventoId) {
    const { data, error } = await supabase
      .from('pizzica_prenotazioni')
      .select('id, nome, cognome, email, telefono, num_posti, note, stato, created_at, payment_reference, importo_pagato, payment_method')
      .eq('evento_id', eventoId)
      .order('created_at', { ascending: true });

    if (error) {
      showSnackbar('Errore nel caricamento delle prenotazioni.', true);
      return;
    }

    bookings = data || [];
    renderBookingsTable(bookings);
    updateStats(bookings);
  }

  function updateStats(rows) {
    const confirmed = rows.filter(r => r.stato === 'confermata');
    $('statBookings').textContent  = confirmed.length;
    $('statSeats').textContent     = confirmed.reduce((sum, r) => sum + (r.num_posti || 0), 0);
    $('statCancelled').textContent = rows.filter(r => r.stato === 'cancellata').length;
    const revenue = confirmed.reduce((sum, r) => sum + (parseFloat(r.importo_pagato) || 0), 0);
    $('statRevenue').textContent   = `€${revenue.toFixed(2)}`;
  }

  function renderBookingsTable(rows) {
    const tbody = $('bookingsTbody');

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="9" class="empty-state">Nessuna prenotazione per questa serata.</td></tr>`;
      return;
    }

    const sorted = sortBookings(rows);
    tbody.innerHTML = sorted.map(r => `
      <tr>
        <td title="${esc(r.nome)} ${esc(r.cognome)}">${esc(r.nome)} ${esc(r.cognome)}</td>
        <td><a href="mailto:${esc(r.email)}" style="color:var(--seed)">${esc(r.email)}</a></td>
        <td>${esc(r.telefono || '–')}</td>
        <td style="text-align:center;font-weight:700">${r.num_posti}</td>
        <td title="${esc(r.note || '')}">${esc(r.note || '–')}</td>
        <td>            ${r.importo_pagato != null
              ? `<span class="badge badge-approved">€${parseFloat(r.importo_pagato).toFixed(2)}</span>`
              : `<span class="badge badge-deleted">–</span>`
            }
          </td>
          <td>          <span class="badge ${r.stato === 'confermata' ? 'badge-approved' : 'badge-deleted'}">
            ${r.stato === 'confermata' ? 'Confermata' : 'Cancellata'}
          </span>
        </td>
        <td style="color:var(--text-secondary);font-size:12px">${fmtDateTime(r.created_at)}</td>
        <td>
          <div style="display:flex;gap:4px">
            ${r.stato === 'confermata'
              ? `<button class="action-btn danger" title="Cancella" onclick="cancelBooking('${esc(r.id)}')">
                   <span class="material-icons-outlined">cancel</span>
                 </button>`
              : `<button class="action-btn" title="Ripristina" onclick="restoreBooking('${esc(r.id)}')">
                   <span class="material-icons-outlined">undo</span>
                 </button>`
            }
          </div>
        </td>
      </tr>`).join('');
  }

  function sortBookings(rows) {
    return [...rows].sort((a, b) => {
      let va = a[sortKey] ?? '';
      let vb = b[sortKey] ?? '';
      if (sortKey === 'num_posti') { va = Number(va); vb = Number(vb); }
      else { va = String(va).toLowerCase(); vb = String(vb).toLowerCase(); }
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ?  1 : -1;
      return 0;
    });
  }

  // Column sort
  document.querySelectorAll('#bookingsTable th[data-col]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (sortKey === col) sortAsc = !sortAsc;
      else { sortKey = col; sortAsc = true; }
      document.querySelectorAll('#bookingsTable th .sort-icon').forEach(i => i.textContent = '');
      th.querySelector('.sort-icon').textContent = sortAsc ? 'arrow_upward' : 'arrow_downward';
      renderBookingsTable(bookings);
    });
  });

  // Cancel / restore
  window.cancelBooking = async (id) => {
    const ok = await showConfirm(
      'Cancella prenotazione',
      'Sei sicuro di voler cancellare questa prenotazione? L\'utente non verrà notificato automaticamente.',
      'Cancella'
    );
    if (!ok) return;

    const { error } = await supabase
      .from('pizzica_prenotazioni')
      .update({ stato: 'cancellata' })
      .eq('id', id);

    if (error) { showSnackbar('Errore durante la cancellazione.', true); return; }
    showSnackbar('Prenotazione cancellata.');
    await loadBookings(currentEventId);
  };

  window.restoreBooking = async (id) => {
    const { error } = await supabase
      .from('pizzica_prenotazioni')
      .update({ stato: 'confermata' })
      .eq('id', id);

    if (error) { showSnackbar('Errore durante il ripristino.', true); return; }
    showSnackbar('Prenotazione ripristinata.');
    await loadBookings(currentEventId);
  };

  // Export CSV
  $('exportCsvBtn').addEventListener('click', () => {
    if (!bookings.length) { showSnackbar('Nessuna prenotazione da esportare.', true); return; }
    const ev = allEvents.find(e => e.id === currentEventId);
    exportCsv(bookings, ev ? formatDate(ev.data) : 'serata');
  });

  function exportCsv(rows, eventLabel) {
    const headers = ['Nome','Cognome','Email','Telefono','Posti','Note','Stato','Pagato (€)','Metodo pagamento','Data prenotazione'];
    const lines = rows.map(r => [
      csvCell(r.nome),
      csvCell(r.cognome),
      csvCell(r.email),
      csvCell(r.telefono),
      r.num_posti,
      csvCell(r.note || ''),
      csvCell(r.stato),
      r.importo_pagato != null ? parseFloat(r.importo_pagato).toFixed(2) : '',
      csvCell(r.payment_method || ''),
      csvCell(fmtDateTime(r.created_at)),
    ].join(';'));

    const bom  = '\uFEFF';
    const blob = new Blob([bom + [headers.join(';'), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `prenotazioni_pizzica_${eventLabel.replace(/[^a-z0-9]/gi,'_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function csvCell(val) {
    const s = String(val ?? '');
    if (s.includes(';') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

  // ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ──
  // TAB 2: GESTIONE SERATE
  // ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ──

  function renderEventsTable(evts) {
    const tbody = $('eventsTbody');
    const sorted = sortEvents(evts);

    if (!sorted.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty-state">Nessuna serata inserita.</td></tr>`;
      return;
    }

    tbody.innerHTML = sorted.map(ev => `
      <tr data-id="${esc(ev.id)}">
        <td class="event-date-cell">${esc(formatDate(ev.data))}</td>
        <td>${esc(ev.ora?.slice(0,5) || '19:30')}</td>
        <td>
          <input type="number" class="price-inline-input" value="${parseFloat(ev.prezzo || 15).toFixed(2)}"
            min="0" step="0.50" style="width:72px"
            onchange="updateEventPrice('${esc(ev.id)}', this.value)"
            title="Modifica prezzo">
        </td>
        <td>
          <input type="number" class="price-inline-input" value="${parseFloat(ev.prezzo || 15).toFixed(2)}"
            min="0" step="0.50" style="width:72px"
            onchange="updateEventPrice('${esc(ev.id)}', this.value)"
            title="Modifica prezzo">
        </td>
        <td>
          <span class="open-badge ${ev.prenotazioni_aperte ? 'open' : 'closed'}">
            ${ev.prenotazioni_aperte ? 'Aperta' : 'Chiusa'}
          </span>
        </td>
        <td>${esc(ev.note || '–')}</td>
        <td style="color:var(--text-secondary);font-size:12px">${esc(fmtDate(ev.created_at))}</td>
        <td>
          <div class="event-actions">
            <label class="toggle-switch" title="${ev.prenotazioni_aperte ? 'Chiudi prenotazioni' : 'Apri prenotazioni'}">
              <input type="checkbox" ${ev.prenotazioni_aperte ? 'checked' : ''}
                onchange="toggleEventOpen('${esc(ev.id)}', this.checked)">
              <span class="toggle-track"></span>
            </label>
            <button class="action-btn danger" title="Elimina serata" onclick="deleteEvent('${esc(ev.id)}')">
              <span class="material-icons-outlined">delete</span>
            </button>
          </div>
        </td>
      </tr>`).join('');
  }

  function sortEvents(evts) {
    return [...evts].sort((a, b) => {
      let va = a[evSortKey] ?? '';
      let vb = b[evSortKey] ?? '';
      va = String(va).toLowerCase();
      vb = String(vb).toLowerCase();
      if (va < vb) return evSortAsc ? -1 : 1;
      if (va > vb) return evSortAsc ?  1 : -1;
      return 0;
    });
  }

  // Toggle open/closed
  window.toggleEventOpen = async (id, newVal) => {
    const { error } = await supabase
      .from('pizzica_eventi')
      .update({ prenotazioni_aperte: newVal })
      .eq('id', id);

    if (error) {
      showSnackbar('Errore nell\'aggiornamento.', true);
      await loadEventsData();
      return;
    }

    const ev = allEvents.find(e => e.id === id);
    if (ev) ev.prenotazioni_aperte = newVal;
    populateEventSelector(allEvents);
    renderEventsTable(allEvents);
    showSnackbar(newVal ? 'Prenotazioni aperte.' : 'Prenotazioni chiuse.');
  };

  // Delete event
  window.deleteEvent = async (id) => {
    const ev = allEvents.find(e => e.id === id);
    const label = ev ? formatDate(ev.data) : 'questa serata';
    const ok = await showConfirm(
      'Elimina serata',
      `Eliminando "${label}" verranno cancellate anche tutte le prenotazioni associate. Continuare?`,
      'Elimina'
    );
    if (!ok) return;

    const { error } = await supabase.from('pizzica_eventi').delete().eq('id', id);
    if (error) { showSnackbar('Errore durante l\'eliminazione.', true); return; }
    showSnackbar('Serata eliminata.');
    await loadEventsData();
    if (currentEventId === id) { currentEventId = null; renderBookingsTable([]); updateStats([]); }
  };

  // Add single date
  $('addDateBtn').addEventListener('click', async () => {
    const input = $('newDateInput');
    const date  = input.value;
    if (!date) { showSnackbar('Inserisci una data valida.', true); return; }

    const today = new Date();
    const todayIso = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    if (date < todayIso) { showSnackbar('La data deve essere futura.', true); return; }

    const priceVal = parseFloat($('newDatePrice')?.value) || defaultPrice;
    if (allEvents.find(e => e.data === date)) {
      showSnackbar('Questa data esiste già.', true);
      return;
    }

    const { error } = await supabase.from('pizzica_eventi').insert({
      data: date,
      ora: '19:30',
      luogo: 'Mediterranea – Palazzo dei Celestini – Lecce',
      prenotazioni_aperte: true,
      prezzo: priceVal,
    });

    if (error) { showSnackbar('Errore durante l\'inserimento.', true); return; }
    if ($('newDateInput')) $('newDateInput').value = '';
    showSnackbar('Serata aggiunta.');
    await loadEventsData();
  });

  // updateEventPrice (called from table inline input)
  window.updateEventPrice = async (id, newPriceStr) => {
    const newPrice = parseFloat(newPriceStr);
    if (isNaN(newPrice) || newPrice < 0) { showSnackbar('Prezzo non valido.', true); return; }
    const { error } = await supabase
      .from('pizzica_eventi')
      .update({ prezzo: newPrice })
      .eq('id', id);
    if (error) { showSnackbar('Errore aggiornamento prezzo.', true); return; }
    const ev = allEvents.find(e => e.id === id);
    if (ev) ev.prezzo = newPrice;
    showSnackbar(`Prezzo aggiornato: €${newPrice.toFixed(2)}`);
  };

  // Generate dates (Mon/Wed/Sat)
  $('generateDatesBtn').addEventListener('click', async () => {
    const fromInput  = $('genFromDate').value;
    const weeksInput = parseInt($('genWeeks').value, 10);

    if (!fromInput || isNaN(weeksInput) || weeksInput < 1) {
      showSnackbar('Inserisci una data di inizio e un numero di settimane valido.', true);
      return;
    }

    const dates = generateMonWedSatDates(fromInput, weeksInput);
    const existing = new Set(allEvents.map(e => e.data));
    const newDates = dates.filter(d => !existing.has(d));

    if (!newDates.length) {
      showSnackbar('Tutte le date in questo intervallo esistono già.');
      return;
    }

    const ok = await showConfirm(
      'Genera serate',
      `Verranno create ${newDates.length} nuove serate (Lunedì, Mercoledì, Sabato) da ${formatDate(fromInput)} per ${weeksInput} settimane. Continuare?`,
      'Genera'
    );
    if (!ok) return;

    const rows = newDates.map(d => ({
      data: d,
      ora: '19:30',
      luogo: 'Mediterranea – Palazzo dei Celestini – Lecce',
      prenotazioni_aperte: true,
      prezzo: defaultPrice,
    }));

    const { error } = await supabase.from('pizzica_eventi').insert(rows);
    if (error) { showSnackbar('Errore durante la generazione.', true); return; }
    showSnackbar(`${newDates.length} serate aggiunte.`);
    await loadEventsData();
  });

  function generateMonWedSatDates(fromIso, weeks) {
    const targetDays = new Set([1, 3, 6]); // Mon, Wed, Sat
    const dates = [];
    const from  = parseLocalDate(fromIso);
    const until = new Date(from);
    until.setDate(until.getDate() + weeks * 7);

    const cur = new Date(from);
    while (cur <= until) {
      if (targetDays.has(cur.getDay())) {
        dates.push(toIsoDate(cur));
      }
      cur.setDate(cur.getDate() + 1);
    }
    return dates;
  }

  // ── Settings tab ──────────────────────────────────────────
  async function loadSettingsValues() {
    try {
      const [merchantCode, defPrice] = await Promise.all([
        supabase.from('app_settings').select('value').eq('key','sumup_merchant_code').maybeSingle(),
        supabase.from('app_settings').select('value').eq('key','pizzica_prezzo_default').maybeSingle(),
      ]);

      if ($('sumupMerchantCode') && merchantCode.data?.value != null) {
        $('sumupMerchantCode').value = merchantCode.data.value;
      }
      if ($('defaultPriceInput') && defPrice.data?.value != null) {
        $('defaultPriceInput').value = parseFloat(defPrice.data.value).toFixed(2);
        defaultPrice = parseFloat(defPrice.data.value) || 15;
      }
    } catch(e) {
      showSnackbar('Errore caricamento impostazioni.', true);
    }
  }

  $('saveSumupMerchantCodeBtn')?.addEventListener('click', async () => {
    const val = $('sumupMerchantCode').value.trim();
    if (!val) { showSnackbar('Inserisci un Merchant Code valido.', true); return; }
    const { error } = await supabase.from('app_settings')
      .upsert({ key: 'sumup_merchant_code', value: val, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) { showSnackbar('Errore salvataggio.', true); return; }
    showSnackbar('SumUp Merchant Code salvato.');
  });

  $('saveDefaultPriceBtn')?.addEventListener('click', async () => {
    const val = parseFloat($('defaultPriceInput').value);
    if (isNaN(val) || val < 0) { showSnackbar('Prezzo non valido.', true); return; }
    defaultPrice = val;
    const { error } = await supabase.from('app_settings')
      .upsert({ key: 'pizzica_prezzo_default', value: val.toFixed(2), updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) { showSnackbar('Errore salvataggio.', true); return; }
    if ($('newDatePrice')) $('newDatePrice').value = val.toFixed(2);
    showSnackbar(`Prezzo predefinito salvato: €${val.toFixed(2)}`);
  });

  // ── Confirm dialog ────────────────────────────────────────
  function showConfirm(title, text, okLabel) {
    $('confirmTitle').textContent   = title;
    $('confirmText').textContent    = text;
    $('confirmOkBtn').textContent   = okLabel || 'Conferma';
    $('confirmOverlay').classList.add('active');
    return new Promise(resolve => { confirmResolver = resolve; });
  }

  window.confirmResolve = function (val) {
    $('confirmOverlay').classList.remove('active');
    if (confirmResolver) { const r = confirmResolver; confirmResolver = null; r(val); }
  };

  // ── Date/time utils ───────────────────────────────────────
  function parseLocalDate(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function toIsoDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  }

  const DAYS_IT   = ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];
  const MONTHS_IT = ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];

  function formatDate(iso) {
    if (!iso) return '–';
    const d = parseLocalDate(iso);
    return `${DAYS_IT[d.getDay()]} ${d.getDate()} ${MONTHS_IT[d.getMonth()]} ${d.getFullYear()}`;
  }

  function fmtDate(iso) {
    if (!iso) return '–';
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  }

  function fmtDateTime(iso) {
    if (!iso) return '–';
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }

  // ── Boot ──────────────────────────────────────────────────
  checkAuth();
})();
