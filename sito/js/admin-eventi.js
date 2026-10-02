(function () {
  const { showSnackbar, loadThemeAndReady } = CodexUi;
  const $ = id => document.getElementById(id);
  const state = { events: [], bookings: [], eventImageUrls: [] };
  const ENLARGE_FACTOR = 0.34;

  function renderEventImageList() {
    const list = $('eventCarouselImageList');
    if (!state.eventImageUrls.length) {
      list.innerHTML = '<div class="empty-state" style="padding:16px;">Nessuna immagine caricata.</div>';
      return;
    }

    list.innerHTML = '';
    state.eventImageUrls.forEach((url, idx) => {
      const badge = document.createElement('div');
      badge.className = 'carousel-image-badge';
      badge.innerHTML = `
        <img src="${url}" alt="" onerror="this.style.background='#ddd'">
        <button class="badge-delete" title="Rimuovi" onclick="removeEventImageUrl(${idx})">
          <span class="material-icons-outlined" style="font-size:16px;">close</span>
        </button>`;
      list.appendChild(badge);
    });
  }

  function updateEventCarouselPreview() {
    const wrap = $('eventCarouselPreviewWrap');
    const track = $('eventCarouselTrack');
    const height = parseInt($('eventSliderHeight').value, 10);
    const visible = parseInt($('eventSliderItems').value, 10);
    const seconds = parseInt($('eventSliderAutoplay').value, 10);

    wrap.style.height = height + 'px';
    clearInterval(window.__eventPreviewTimer);

    if (!state.eventImageUrls.length) {
      track.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:#999;font-size:14px;">Nessuna immagine</div>';
      return;
    }

    const previewRealCount = state.eventImageUrls.length;
    const previewFraction = previewRealCount > 1 ? Math.min(Math.max(1 / visible, 0.28), 1) : 1;
    const allUrls = previewRealCount > 1 ? [...state.eventImageUrls, ...state.eventImageUrls, ...state.eventImageUrls] : state.eventImageUrls;

    track.innerHTML = '';
    allUrls.forEach((url) => {
      const slide = document.createElement('div');
      slide.className = 'carousel-slide';
      slide.style.flex = '0 0 ' + (previewFraction * 100) + '%';
      slide.style.width = (previewFraction * 100) + '%';
      slide.style.height = height + 'px';
      const img = document.createElement('img');
      img.src = url;
      img.alt = '';
      img.onerror = function() { this.style.background = '#ddd'; };
      slide.appendChild(img);
      track.appendChild(slide);
    });

    let previewIndex = 0;
    const slideW = previewFraction * 100;
    const padOffset = (100 - slideW) / 2;
    const startReal = Math.floor(previewRealCount / 2);
    const startIdx = previewRealCount > 1 ? previewRealCount + startReal : 0;
    previewIndex = startIdx;
    track.style.transition = 'none';
    track.style.transform = 'translateX(' + (-(startIdx * slideW - padOffset)) + '%)';
    requestAnimationFrame(() => { track.style.transition = ''; });

    const applyScales = () => {
      const slides = track.querySelectorAll('.carousel-slide');
      slides.forEach((slide, i) => {
        const isCenter = i === (previewIndex % previewRealCount) + previewRealCount; 
        slide.style.transform = isCenter ? 'scale(1)' : `scale(${1 - ENLARGE_FACTOR})`;
        slide.style.zIndex = isCenter ? '2' : '1';
      });
    };

    applyScales();

    if (previewRealCount > 1) {
      window.__eventPreviewTimer = setInterval(() => {
        previewIndex += 1;
        const tx = previewIndex * slideW - padOffset;
        track.style.transform = 'translateX(' + (-tx) + '%)';
        applyScales();
      }, seconds * 1000);
    }
  }

  async function optimizeEventImage(file) {
    const MAX_DIM = 1920;
    const JPEG_QUALITY = 0.82;
    if (file.type === 'image/gif') return file;
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w <= MAX_DIM && h <= MAX_DIM) { resolve(file); return; }
        const ratio = Math.min(MAX_DIM / w, MAX_DIM / h);
        w = Math.round(w * ratio); h = Math.round(h * ratio);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        const isJpeg = file.type === 'image/jpeg' || file.type === 'image/jpg';
        const mime = isJpeg ? 'image/jpeg' : 'image/png';
        const quality = isJpeg ? JPEG_QUALITY : undefined;
        canvas.toBlob((blob) => {
          resolve(new File([blob], file.name, { type: mime }));
        }, mime, quality);
      };
      img.onerror = () => resolve(file);
      img.src = URL.createObjectURL(file);
    });
  }

  async function uploadEventCarouselFiles(input) {
    const files = Array.from(input.files);
    if (!files.length) return;

    for (const file of files) {
      try {
        const optimized = await optimizeEventImage(file);
        const url = await uploadCarouselImage(optimized);
        state.eventImageUrls.push(url);
        $('eventImageInput').value = url;
      } catch (error) {
        showSnackbar(`Upload fallito: ${error.message}`, true);
      }
    }

    input.value = '';
    renderEventImageList();
    updateEventCarouselPreview();
  }

  window.removeEventImageUrl = async (idx) => {
    const url = state.eventImageUrls[idx];
    if (!url) return;
    state.eventImageUrls.splice(idx, 1);
    renderEventImageList();
    updateEventCarouselPreview();
    if ($('eventImageInput').value === url) {
      $('eventImageInput').value = state.eventImageUrls[0] || '';
    }
    try {
      await deleteCarouselImageByPublicUrl(url);
    } catch (error) {
      console.warn('Eliminazione immagine evento fallita:', error);
    }
  };

  window.uploadEventCarouselFiles = uploadEventCarouselFiles;

  function showMain() {
    $('loginView').style.display = 'none';
    $('mainView').style.display = '';
    $('appbarUser').textContent = supabase.auth.getUser?.()?.then ? '' : '';
    loadData();
  }

  async function checkAuth() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      $('appbarUser').textContent = session.user.email || '';
      showMain();
    } else {
      $('loginView').style.display = '';
      $('mainView').style.display = 'none';
      document.body.classList.add('ready');
    }
  }

  $('loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    clearLoginErrors();

    const email = $('loginEmail').value.trim();
    const password = $('loginPassword').value;

    if (!email) { setFieldError('loginEmail'); return; }
    if (!password) { setFieldError('loginPassword'); return; }

    const btn = $('loginBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="material-icons-outlined">lock_open</span> Accesso in corso…';

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    btn.disabled = false;
    btn.innerHTML = '<span class="material-icons-outlined">lock_open</span> Accedi';

    if (error || !data.user) {
      showSnackbar('Credenziali non valide.', true);
      return;
    }

    $('appbarUser').textContent = data.user.email || '';
    showMain();
  });

  $('signOutBtn').addEventListener('click', async () => {
    await supabase.auth.signOut();
    $('loginView').style.display = '';
    $('mainView').style.display = 'none';
    document.body.classList.add('ready');
    $('loginEmail').value = '';
    $('loginPassword').value = '';
    showSnackbar('Disconnesso.');
  });

  function clearLoginErrors() {
    ['loginEmail', 'loginPassword'].forEach(id => {
      $(id)?.closest('.form-group')?.classList.remove('has-error');
    });
  }

  function setFieldError(id) {
    $(id)?.closest('.form-group')?.classList.add('has-error');
  }

  document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => {
        const active = b.dataset.tab === target;
        b.classList.toggle('active', active);
        b.setAttribute('aria-selected', String(active));
      });
      $('tabEvents').style.display = target === 'events' ? '' : 'none';
      $('tabBookings').style.display = target === 'bookings' ? '' : 'none';
    });
  });

  async function loadData() {
    await Promise.all([loadEvents(), loadBookings()]);
    await loadThemeAndReady({ readyClass: true });
  }

  async function loadEvents() {
    const { data, error } = await supabase
      .from('eventi_associazione')
      .select('*')
      .order('data', { ascending: true });

    if (error) {
      showSnackbar('Errore caricamento eventi.', true);
      return;
    }

    state.events = data || [];
    renderEventsTable();
  }

  async function loadBookings() {
    const { data, error } = await supabase
      .from('eventi_associazione_prenotazioni')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      showSnackbar('Errore caricamento prenotazioni.', true);
      return;
    }

    state.bookings = data || [];
    renderBookingsTable();
    updateStats();
  }

  function formatDate(iso) {
    if (!iso) return '–';
    const d = new Date(iso + 'T00:00:00');
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('it-IT');
  }

  function formatMoney(value) {
    return `€${Number(value || 0).toFixed(2).replace('.', ',')}`;
  }

  function renderEventsTable() {
    const tbody = $('eventsTbody');
    if (!state.events.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Nessuna serata inserita.</td></tr>';
      return;
    }

    tbody.innerHTML = state.events.map(eventDoc => `
      <tr>
        <td><strong>${eventDoc.slug || '–'}</strong></td>
        <td>${eventDoc.titolo || '–'}</td>
        <td>${formatDate(eventDoc.data)}</td>
        <td class="rendered-money">${formatMoney(eventDoc.prezzo)}</td>
        <td>
          <span class="status-badge ${eventDoc.prenotazioni_aperte ? 'status-open' : 'status-closed'}">
            ${eventDoc.prenotazioni_aperte ? 'Aperta' : 'Chiusa'}
          </span>
          <div style="margin-top:6px;">
            <span class="status-badge ${eventDoc.sold_out ? 'status-closed' : 'status-open'}">
              ${eventDoc.sold_out ? 'Sold out' : 'Prenotabile'}
            </span>
          </div>
        </td>
        <td>
          <label class="inline-toggle">
            <input type="checkbox" ${eventDoc.is_active ? 'checked' : ''} onchange="toggleEventActive('${eventDoc.id}', this.checked)">
            <span>Home</span>
          </label>
        </td>
        <td>
          <div class="event-actions">
            <button class="btn-icon" title="Apri/chiudi prenotazioni" onclick="toggleEventOpen('${eventDoc.id}', ${eventDoc.prenotazioni_aperte ? 'false' : 'true'})">
              <span class="material-icons-outlined">${eventDoc.prenotazioni_aperte ? 'lock' : 'lock_open'}</span>
            </button>
            <button class="btn-icon" title="Sold out" onclick="toggleEventSoldOut('${eventDoc.id}', ${eventDoc.sold_out ? 'false' : 'true'})">
              <span class="material-icons-outlined">${eventDoc.sold_out ? 'check_circle' : 'warning'}</span>
            </button>
            <button class="btn-icon btn-warning" title="Elimina serata" onclick="deleteEvent('${eventDoc.id}')">
              <span class="material-icons-outlined">delete</span>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  function renderBookingsTable() {
    const tbody = $('bookingsTbody');
    if (!state.bookings.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Nessuna prenotazione.</td></tr>';
      return;
    }

    const eventMap = new Map(state.events.map(eventDoc => [eventDoc.id, eventDoc]));
    tbody.innerHTML = state.bookings.map(booking => {
      const eventDoc = eventMap.get(booking.evento_id);
      return `
        <tr>
          <td>${eventDoc ? eventDoc.titolo : 'Evento non trovato'}</td>
          <td>${booking.nome} ${booking.cognome}</td>
          <td>${booking.email || '–'}</td>
          <td>${booking.telefono || '–'}</td>
          <td>${booking.num_posti}</td>
          <td>
            <span class="status-badge ${booking.stato === 'confermata' ? 'status-open' : booking.stato === 'pending_payment' ? 'status-closed' : 'status-closed'}">
              ${booking.stato === 'confermata' ? 'Confermata' : booking.stato === 'pending_payment' ? 'Attesa pagamento' : 'Cancellata'}
            </span>
          </td>
          <td>${eventDoc ? formatDate(eventDoc.data) : '–'}</td>
          <td>
            <button class="btn-icon btn-warning" title="Cancella prenotazione" onclick="cancelBooking('${booking.id}')">
              <span class="material-icons-outlined">cancel</span>
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  function updateStats() {
    const confirmed = state.bookings.filter(item => item.stato === 'confermata');
    const totalSeats = state.bookings.reduce((sum, item) => sum + Number(item.num_posti || 0), 0);
    const revenue = confirmed.reduce((sum, item) => sum + Number(item.importo_pagato || 0), 0);

    $('statTotalBookings').textContent = String(state.bookings.length);
    $('statTotalSeats').textContent = String(totalSeats);
    $('statConfirmed').textContent = String(confirmed.length);
    $('statRevenue').textContent = formatMoney(revenue);
  }

  $('eventForm').addEventListener('submit', async (event) => {
    event.preventDefault();

    const imageUrl = ($('eventImageInput').value.trim() || state.eventImageUrls[0] || null);

    const payload = {
      slug: $('eventSlug').value.trim(),
      titolo: $('eventTitleInput').value.trim(),
      data: $('eventDateInput').value,
      ora: $('eventTimeInput').value || '19:30',
      prezzo: Number($('eventPriceInput').value || 0),
      luogo: $('eventLocationInput').value.trim() || 'Mediterranea – Lecce',
      immagine_url: imageUrl,
      note: $('eventNoteInput').value.trim() || null,
      is_active: true,
      prenotazioni_aperte: true,
      sold_out: false,
    };

    if (!payload.slug || !payload.titolo || !payload.data) {
      showSnackbar('Slug, titolo e data sono obbligatori.', true);
      return;
    }

    const { error } = await supabase.from('eventi_associazione').insert(payload);
    if (error) {
      showSnackbar(error.message || 'Errore durante il salvataggio dell\'evento.', true);
      return;
    }

    $('eventForm').reset();
    $('eventTimeInput').value = '19:30';
    $('eventPriceInput').value = '15';
    $('eventImageInput').value = '';
    state.eventImageUrls = [];
    renderEventImageList();
    updateEventCarouselPreview();
    showSnackbar('Evento salvato.');
    await loadEvents();
  });

  window.toggleEventActive = async (id, checked) => {
    const { error } = await supabase.from('eventi_associazione').update({ is_active: checked }).eq('id', id);
    if (error) {
      showSnackbar('Errore aggiornamento home.', true);
      return;
    }
    showSnackbar(checked ? 'Evento visibile in home.' : 'Evento nascosto in home.');
    await loadEvents();
  };

  window.toggleEventOpen = async (id, checked) => {
    const { error } = await supabase.from('eventi_associazione').update({ prenotazioni_aperte: checked }).eq('id', id);
    if (error) {
      showSnackbar('Errore aggiornamento apertura prenotazioni.', true);
      return;
    }
    showSnackbar(checked ? 'Prenotazioni aperte.' : 'Prenotazioni chiuse.');
    await loadEvents();
  };

  window.toggleEventSoldOut = async (id, checked) => {
    const { error } = await supabase.from('eventi_associazione').update({ sold_out: checked }).eq('id', id);
    if (error) {
      showSnackbar('Errore aggiornamento sold out.', true);
      return;
    }
    showSnackbar(checked ? 'Evento segnato come sold out.' : 'Evento rimosso da sold out.');
    await loadEvents();
  };

  window.deleteEvent = async (id) => {
    if (!window.confirm('Eliminare questo evento e tutte le relative prenotazioni?')) return;
    const { error } = await supabase.from('eventi_associazione').delete().eq('id', id);
    if (error) {
      showSnackbar('Errore eliminazione evento.', true);
      return;
    }
    showSnackbar('Evento eliminato.');
    await loadEvents();
    await loadBookings();
  };

  window.cancelBooking = async (id) => {
    const { error } = await supabase.from('eventi_associazione_prenotazioni').update({ stato: 'cancellata' }).eq('id', id);
    if (error) {
      showSnackbar('Errore durante la cancellazione.', true);
      return;
    }
    showSnackbar('Prenotazione cancellata.');
    await loadBookings();
  };

  renderEventImageList();
  updateEventCarouselPreview();
  checkAuth();
})();
