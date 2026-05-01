(async function () {
  'use strict';

  /* ── Device detection ────────────────────────────────────────── */
  const IS_MOBILE = /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  /* ── Auth check ─────────────────────────────────────────────── */
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    document.getElementById('authGuard').style.display = 'flex';
    document.body.style.opacity = '1';
    return;
  }

  if (IS_MOBILE) {
    runMobileMode(session);
  } else {
    runDesktopMode(session);
  }

  /* ═══════════════════════════════════════════════════════════════
     MOBILE — fotocamera scanner
  ═══════════════════════════════════════════════════════════════ */
  async function runMobileMode(session) {
    // If loaded inside the shell iframe, break out to top-level first.
    if (window.top !== window.self) {
      const standalone = window.location.href
        .replace(/[?&]embedded=1/, '')
        .replace(/\?$/, '');
      window.top.location.replace(standalone);
      return;
    }

    document.getElementById('mobileView').style.display = '';
    document.body.classList.add('mobile-mode');
    // Prevent pinch-zoom interfering with the live viewfinder
    document.querySelector('meta[name=viewport]').content =
      'width=device-width, initial-scale=1.0, user-scalable=no';

    const connDot      = document.getElementById('mobileConnDot');
    const connLabel    = document.getElementById('mobileConnLabel');
    const desktopBadge = document.getElementById('mobileDesktopBadge');
    const desktopLabel = document.getElementById('mobileDesktopLabel');
    const snackbar     = document.getElementById('snackbar');
    const stateWaiting = document.getElementById('stateWaiting');
    const stateReady   = document.getElementById('stateReady');
    const stateUpload  = document.getElementById('stateUploading');
    const stateSent    = document.getElementById('stateSent');
    const fotoNumero   = document.getElementById('fotoNumero');
    const captureBtn   = document.getElementById('captureBtn');
    const fallbackInput= document.getElementById('mobileFileInput');
    const cameraVideo  = document.getElementById('cameraVideo');
    const cameraCanvas = document.getElementById('cameraCanvas');

    const STORAGE_KEY = 'digit_mobile_number';
    let currentNumber = null;
    let videoStream   = null;

    function showSnack(msg, isError = false) {
      snackbar.textContent = msg;
      snackbar.className = `snackbar visible${isError ? ' error' : ''}`;
      clearTimeout(snackbar._timer);
      snackbar._timer = setTimeout(() => snackbar.classList.remove('visible'), 3500);
    }

    function showState(id) {
      [stateWaiting, stateReady, stateUpload, stateSent].forEach(el => {
        el.style.display = el.id === id ? '' : 'none';
      });
    }

    function setDesktopPresence(connected) {
      desktopLabel.textContent = connected ? 'Desktop connesso' : 'Desktop non connesso';
      desktopBadge.classList.toggle('connected', connected);
    }

    /* ── getUserMedia camera — no page navigation, no reload risk ── */
    async function startCamera() {
      try {
        videoStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width:  { ideal: 3840 },
            height: { ideal: 2160 },
          },
          audio: false,
        });
        cameraVideo.srcObject = videoStream;
        await cameraVideo.play();
      } catch (err) {
        // Permission denied or getUserMedia unavailable → fallback to file picker
        showSnack('Impossibile aprire la fotocamera. Scegli il file manualmente.', true);
        fallbackInput.click();
      }
    }

    function stopCamera() {
      if (videoStream) {
        videoStream.getTracks().forEach(t => t.stop());
        videoStream = null;
        cameraVideo.srcObject = null;
      }
    }

    async function uploadAndSend(file) {
      showState('stateUploading');
      try {
        const url = await uploadSchedaStorica(file);
        await channel.send({
          type: 'broadcast',
          event: 'image_ready',
          payload: { url, numero: currentNumber },
        });
        sessionStorage.removeItem(STORAGE_KEY);
        showState('stateSent');
        if (navigator.vibrate) navigator.vibrate([100, 50, 200]);
      } catch (err) {
        showSnack(err.message || 'Errore durante il caricamento.', true);
        showState('stateReady');
        await startCamera(); // restart stream for retry
      }
    }

    /* ── Realtime channel ─────────────────────────────────────── */
    const channel = supabase.channel(`digit-${session.user.id}`);

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const desktopOnline = Object.values(state).flat().some(p => p.role === 'desktop');
        setDesktopPresence(desktopOnline);
      })
      .on('broadcast', { event: 'number_verified' }, async ({ payload }) => {
        currentNumber = String(payload.numero);
        sessionStorage.setItem(STORAGE_KEY, currentNumber);
        fotoNumero.textContent = currentNumber;
        showState('stateReady');
        await startCamera();
        if (navigator.vibrate) navigator.vibrate(100);
      })
      .on('broadcast', { event: 'form_reset' }, () => {
        currentNumber = null;
        sessionStorage.removeItem(STORAGE_KEY);
        stopCamera();
        showState('stateWaiting');
      })
      // Desktop removed the photo taken by this device: reopen camera for a retake
      .on('broadcast', { event: 'image_removed' }, async () => {
        if (currentNumber) {
          showState('stateReady');
          await startCamera();
          showSnack('Foto rimossa dal desktop — scatta di nuovo.');
          if (navigator.vibrate) navigator.vibrate(80);
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          connDot.classList.add('connected');
          connLabel.textContent = 'Connesso';
          await channel.track({ role: 'mobile' });

          // Restore state after an unexpected page reload
          const savedNum = sessionStorage.getItem(STORAGE_KEY);
          if (savedNum) {
            currentNumber = savedNum;
            fotoNumero.textContent = currentNumber;
            showState('stateReady');
            await startCamera();
            showSnack('Numero ripristinato — riprova a scattare la foto.');
          }

          document.body.style.opacity = '1';
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          connDot.classList.remove('connected');
          connLabel.textContent = 'Disconnesso';
          setDesktopPresence(false);
          document.body.style.opacity = '1';
        }
      });

    /* ── Shutter button: capture frame from live stream ───────── */
    captureBtn.addEventListener('click', () => {
      if (!videoStream) {
        fallbackInput.click(); // no stream → file picker fallback
        return;
      }
      cameraCanvas.width  = cameraVideo.videoWidth  || 1920;
      cameraCanvas.height = cameraVideo.videoHeight || 1080;
      cameraCanvas.getContext('2d').drawImage(cameraVideo, 0, 0);
      stopCamera();
      cameraCanvas.toBlob(async (blob) => {
        const file = new File([blob], `scheda-${Date.now()}.jpg`, { type: 'image/jpeg' });
        await uploadAndSend(file);
      }, 'image/jpeg', 0.92);
    });

    /* ── Fallback: file input (getUserMedia unavailable/denied) ── */
    fallbackInput.addEventListener('change', async () => {
      const file = fallbackInput.files[0];
      if (!file) return;
      fallbackInput.value = '';
      await uploadAndSend(file);
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     DESKTOP — form di digitalizzazione
  ═══════════════════════════════════════════════════════════════ */
  function runDesktopMode(session) {
    const { showSnackbar, loadThemeAndReady } = AdminShared;

    /* ── State ─────────────────────────────────────────────────── */
    let sessionCount     = 0;
    let currentImageFile = null;
    let currentImageUrl  = null;
    let previewObjectUrl = null;
    let verifyState      = 'unverified';
    let imageOriginMobile = false;  // true even after crop if original came from mobile

    /* ── DOM refs ───────────────────────────────────────────────── */
    document.getElementById('digitMain').style.display = '';

    const dropZone        = document.getElementById('dropZone');
    const dropHint        = document.getElementById('dropHint');
    const imagePreview    = document.getElementById('imagePreview');
    const fileInput       = document.getElementById('fileInput');
    const clearImageBtn   = document.getElementById('clearImageBtn');
    const zoomImageBtn    = document.getElementById('zoomImageBtn');
    const dropToolbar     = document.querySelector('.drop-toolbar');
    const form            = document.getElementById('digitForm');
    const submitBtn       = document.getElementById('submitBtn');
    const counterEl       = document.getElementById('sessionCounter');
    const numInput        = document.getElementById('numTessera');
    const verificaBtn     = document.getElementById('verificaBtn');
    const verificaIcon    = document.getElementById('verificaBtnIcon');
    const verificaLabel   = document.getElementById('verificaBtnLabel');
    const dupAlert        = document.getElementById('dupAlert');
    const dupAlertNum     = document.getElementById('dupAlertNum');
    const dupAlertTable   = document.getElementById('dupAlertTable');
    const mobileBadge     = document.getElementById('mobileBadge');
    const mobileBadgeIcon = document.getElementById('mobileBadgeIcon');
    const mobileBadgeText = document.getElementById('mobileBadgeText');

    const FORM_FIELDS = ['nome','cognome','dataNascita','luogoNascita','residenza','comune','cap','telefono','email'];

    /* ── Realtime channel ───────────────────────────────────────── */
    const realtimeChannel = supabase.channel(`digit-${session.user.id}`);

    realtimeChannel
      .on('presence', { event: 'sync' }, () => {
        const state = realtimeChannel.presenceState();
        const mobileOnline = Object.values(state).flat().some(p => p.role === 'mobile');
        updateMobileBadge(mobileOnline);
      })
      .on('broadcast', { event: 'image_ready' }, ({ payload }) => {
        if (payload?.url) {
          setImageFromUrl(payload.url);
          showSnackbar('Foto ricevuta dal dispositivo mobile. \u2713');
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await realtimeChannel.track({ role: 'desktop' });
        }
      });

    function updateMobileBadge(connected) {
      mobileBadge.classList.toggle('mobile-connected', connected);
      if (connected) {
        mobileBadgeIcon.textContent = 'smartphone';
        mobileBadgeText.innerHTML   = '<strong>Fotocamera mobile connessa</strong> \u2014 premi Verifica per attivare';
      } else {
        mobileBadgeIcon.textContent = 'smartphone';
        mobileBadgeText.innerHTML   = 'Apri questa pagina sul <strong>cellulare o tablet</strong> per scattare le foto';
      }
    }

    function broadcast(event, payload = {}) {
      realtimeChannel.send({ type: 'broadcast', event, payload }).catch(() => {});
    }

    /* ── Resize handle ──────────────────────────────────────────── */
    (function initResize() {
      const handle   = document.getElementById('digitResizeHandle');
      const colImage = document.querySelector('.digit-col-image');
      const layout   = document.querySelector('.digit-layout');
      if (!handle || !colImage || !layout) return;

      handle.addEventListener('mousedown', e => {
        e.preventDefault();
        const startX = e.clientX;
        const startW = colImage.getBoundingClientRect().width;
        const MIN_W  = 120;
        const MAX_R  = 0.65;

        handle.classList.add('dragging');
        document.body.style.cursor     = 'col-resize';
        document.body.style.userSelect = 'none';

        function onMove(ev) {
          const totalW = layout.getBoundingClientRect().width;
          const newW   = Math.max(MIN_W, Math.min(totalW * MAX_R, startW + (ev.clientX - startX)));
          colImage.style.flex = `0 0 ${newW}px`;
        }

        function onUp() {
          handle.classList.remove('dragging');
          document.body.style.cursor     = '';
          document.body.style.userSelect = '';
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup',   onUp);
        }

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup',   onUp);
      });
    })();

    /* ── Image handling ─────────────────────────────────────────── */
    function setImage(file) {
      if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
      currentImageFile = file;
      currentImageUrl  = null;
      previewObjectUrl = URL.createObjectURL(file);
      imagePreview.src = previewObjectUrl;
      imagePreview.style.display = 'block';
      dropHint.style.display = 'none';
      dropZone.classList.add('has-image');
      dropZone.classList.remove('drop-error');
      dropToolbar.classList.add('visible');
    }

    function setImageFromUrl(url) {
      if (previewObjectUrl) { URL.revokeObjectURL(previewObjectUrl); previewObjectUrl = null; }
      currentImageFile  = null;
      currentImageUrl   = url;
      imageOriginMobile = true;
      imagePreview.src = url;
      imagePreview.style.display = 'block';
      dropHint.style.display = 'none';
      dropZone.classList.add('has-image');
      dropZone.classList.remove('drop-error');
      dropToolbar.classList.add('visible');
    }

    function clearImage({ notifyMobile = false } = {}) {
      const wasFromMobile = imageOriginMobile;
      // Exit crop mode first so no stale crop-active state remains
      if (document.querySelector('.digit-col-image.crop-active')) exitCropMode();
      if (previewObjectUrl) { URL.revokeObjectURL(previewObjectUrl); previewObjectUrl = null; }
      currentImageFile  = null;
      currentImageUrl   = null;
      imageOriginMobile = false;
      imagePreview.src = '';
      imagePreview.style.display = 'none';
      dropHint.style.display = 'flex';
      dropZone.classList.remove('has-image', 'drop-error');
      dropToolbar.classList.remove('visible');
      fileInput.value = '';
      // Tell mobile to reopen camera if the removed image came from it
      if (notifyMobile && wasFromMobile) broadcast('image_removed');
    }

    /* ── Field lock / unlock ────────────────────────────────────── */
    function lockFields() {
      FORM_FIELDS.forEach(id => { const el = document.getElementById(id); if (el) el.disabled = true; });
      submitBtn.disabled = true;
    }

    function unlockFields() {
      FORM_FIELDS.forEach(id => { const el = document.getElementById(id); if (el) el.disabled = false; });
      submitBtn.disabled = false;
    }

    /* ── Verify state ───────────────────────────────────────────── */
    function setVerifyState(state) {
      verifyState = state;
      verificaBtn.classList.remove('verify-free', 'verify-taken', 'verify-loading');
      if (state === 'unverified') {
        verificaIcon.textContent  = 'search';
        verificaLabel.textContent = 'Verifica';
        lockFields();
        dupAlert.style.display = 'none';
        numInput.readOnly = false;
      } else if (state === 'loading') {
        verificaIcon.textContent  = 'sync';
        verificaLabel.textContent = 'Verifica\u2026';
        verificaBtn.classList.add('verify-loading');
        verificaBtn.disabled = true;
      } else if (state === 'free') {
        verificaIcon.textContent  = 'check_circle';
        verificaLabel.textContent = 'Libera';
        verificaBtn.classList.add('verify-free');
        verificaBtn.disabled = false;
        numInput.readOnly = true;
        dupAlert.style.display = 'none';
        unlockFields();
        broadcast('number_verified', { numero: numInput.value.trim() });
        document.getElementById('nome').focus();
      } else if (state === 'taken') {
        verificaIcon.textContent  = 'block';
        verificaLabel.textContent = 'Gi\u00e0 presente';
        verificaBtn.classList.add('verify-taken');
        verificaBtn.disabled = false;
        numInput.readOnly = true;
        dupAlert.style.display = '';
        lockFields();
      }
    }

    /* ── Verifica click ─────────────────────────────────────────── */
    verificaBtn.addEventListener('click', async () => {
      if (verifyState === 'free' || verifyState === 'taken') {
        numInput.readOnly = false;
        clearImage();
        setVerifyState('unverified');
        numInput.focus();
        return;
      }
      const numRaw = numInput.value.trim();
      if (!numRaw || !/^\d+$/.test(numRaw) || parseInt(numRaw, 10) < 1) {
        setFieldError('numTessera', true);
        numInput.focus();
        return;
      }
      setFieldError('numTessera', false);
      setVerifyState('loading');
      try {
        const socio = await getSocioByNumeroTessera(numRaw);
        if (socio) {
          dupAlertNum.textContent = numRaw;
          dupAlertTable.innerHTML = buildDupTable(socio);
          setVerifyState('taken');
        } else {
          setVerifyState('free');
          showSnackbar(`Tessera n\u00b0 ${numRaw} disponibile \u2014 compila i dati.`);
        }
      } catch (err) {
        setVerifyState('unverified');
        showSnackbar('Errore durante la verifica. Riprova.', true);
      }
    });

    function buildDupTable(s) {
      const fmt     = v => v && v !== '\u2013' && v !== 'no@mail.no' && v !== '0000000000' ? v : '\u2014';
      const fmtDate = iso => iso ? iso.split('T')[0].split('-').reverse().join('/') : '\u2014';
      const rows = [
        ['Nome',             fmt(s.nome)],
        ['Cognome',          fmt(s.cognome)],
        ['Data di nascita',  fmtDate(s.data_nascita)],
        ['Luogo di nascita', fmt(s.luogo_nascita)],
        ['Residenza',        fmt(s.residenza)],
        ['Comune',           fmt(s.comune)],
        ['CAP',              fmt(s.cap)],
        ['Telefono',         fmt(s.telefono)],
        ['Email',            fmt(s.email)],
        ['Stato',            s.stato || '\u2014'],
        ['Registrato il',    fmtDate(s.created_at)],
      ];
      return rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('');
    }

    numInput.addEventListener('input', () => {
      if (verifyState !== 'unverified') { clearImage(); setVerifyState('unverified'); }
    });

    /* ── Drop zone ──────────────────────────────────────────────── */
    dropZone.addEventListener('click', e => { if (e.target.closest('.drop-toolbar')) return; fileInput.click(); });
    dropZone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
    fileInput.addEventListener('change', () => { const f = fileInput.files[0]; if (f) setImage(f); });
    dropZone.addEventListener('dragenter', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', e => { if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove('drag-over'); });
    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) { setImage(file); }
      else { showSnackbar('Inserisci un file immagine (JPG, PNG, ecc.)', true); }
    });

    document.addEventListener('paste', e => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) { setImage(file); showSnackbar('Immagine incollata dalla clipboard.'); break; }
        }
      }
    });

    clearImageBtn.addEventListener('click', e => { e.stopPropagation(); clearImage({ notifyMobile: true }); });

    /* ── Inline image crop ──────────────────────────────────────── */
    const colImage      = document.querySelector('.digit-col-image');
    const cropImg       = document.getElementById('cropImg');
    const cropImageBtn  = document.getElementById('cropImageBtn');
    const cropCancelBtn = document.getElementById('cropCancelInlineBtn');
    const cropApplyBtn  = document.getElementById('cropApplyInlineBtn');
    let cropper = null;

    function enterCropMode() {
      const src = previewObjectUrl || currentImageUrl;
      if (!src) return;
      cropImg.src = src;
      colImage.classList.add('crop-active');
      cropImg.onload = () => {
        if (cropper) { cropper.destroy(); cropper = null; }
        cropper = new Cropper(cropImg, {
          viewMode: 1,
          autoCropArea: 0.9,
          movable: true,
          zoomable: true,
          rotatable: true,
          scalable: false,
          guides: true,
          background: true,
        });
      };
      if (cropImg.complete && cropImg.naturalWidth) cropImg.onload();
    }

    function exitCropMode() {
      if (cropper) { cropper.destroy(); cropper = null; }
      colImage.classList.remove('crop-active');
      cropImg.src = '';
    }

    cropImageBtn.addEventListener('click', e => { e.stopPropagation(); enterCropMode(); });
    cropCancelBtn.addEventListener('click', exitCropMode);

    cropApplyBtn.addEventListener('click', () => {
      if (!cropper) return;
      cropApplyBtn.disabled = true;
      cropApplyBtn.innerHTML = '<span class="material-icons-outlined spin">sync</span> Applicazione\u2026';

      cropper.getCroppedCanvas({ maxWidth: 4096, maxHeight: 4096 }).toBlob(blob => {
        const ext  = currentImageFile ? (currentImageFile.name.split('.').pop() || 'jpg') : 'jpg';
        const file = new File([blob], `scheda-ritagliata.${ext}`, { type: blob.type });
        exitCropMode();
        setImage(file);
        showSnackbar('Ritaglio applicato. \u2713');
        cropApplyBtn.disabled = false;
        cropApplyBtn.innerHTML = '<span class="material-icons-outlined">check</span> Applica';
      }, 'image/jpeg', 0.94);
    });
    zoomImageBtn.addEventListener('click', e => {
      e.stopPropagation();
      const src = previewObjectUrl || currentImageUrl;
      if (src) {
        document.getElementById('lightboxImg').src = src;
        document.getElementById('lightbox').classList.add('active');
      }
    });

    const lightbox = document.getElementById('lightbox');
    if (lightbox) lightbox.addEventListener('click', () => lightbox.classList.remove('active'));

    /* ── Date formatter gg/mm/aaaa ─────────────────────────────── */
    document.getElementById('dataNascita').addEventListener('input', function () {
      let digits = this.value.replace(/\D/g, '').slice(0, 8);
      let fmt = '';
      for (let i = 0; i < digits.length; i++) {
        fmt += digits[i];
        if ((i === 1 || i === 3) && i !== digits.length - 1) fmt += '/';
      }
      this.value = fmt;
    });

    /* ── Validation helpers ─────────────────────────────────────── */
    function setFieldError(id, show) {
      const fg = document.getElementById('fg-' + id);
      if (fg) fg.classList.toggle('has-error', show);
    }

    function validateRequired(id) {
      const ok = document.getElementById(id).value.trim().length > 0;
      setFieldError(id, !ok);
      return ok;
    }

    function validateDate(id) {
      const v = document.getElementById(id).value.trim();
      const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
      if (!m) { setFieldError(id, true); return false; }
      const d = new Date(+m[3], +m[2] - 1, +m[1]);
      const ok = d.getFullYear() === +m[3] && d.getMonth() === +m[2] - 1 &&
                 d.getDate() === +m[1] && d <= new Date();
      setFieldError(id, !ok);
      return ok;
    }

    function validateEmailIfFilled(id) {
      const v = document.getElementById(id).value.trim();
      if (!v) { setFieldError(id, false); return true; }
      const ok = /^[\w\-.]+@([\w-]+\.)+[\w-]{2,}$/.test(v);
      setFieldError(id, !ok);
      return ok;
    }

    function validatePhoneIfFilled(id) {
      const v = document.getElementById(id).value.trim().replace(/ /g, '');
      if (!v) { setFieldError(id, false); return true; }
      const ok = /^[+0-9]{8,15}$/.test(v);
      setFieldError(id, !ok);
      return ok;
    }

    function sanitize(str) { return str.replace(/([''`]) +/g, '$1'); }
    function val(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }

    function dateToIso(ddmmyyyy) {
      const [d, m, y] = ddmmyyyy.split('/');
      return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
    }

    /* ── Submit ─────────────────────────────────────────────────── */
    form.addEventListener('submit', async e => {
      e.preventDefault();

      if (verifyState !== 'free') {
        showSnackbar('Verifica prima il numero tessera con il tasto "Verifica".', true);
        return;
      }

      let valid = true;
      valid = validateRequired('numTessera')    & valid;
      valid = validateRequired('nome')          & valid;
      valid = validateRequired('cognome')       & valid;
      valid = validateDate('dataNascita')       & valid;
      valid = validateEmailIfFilled('email')    & valid;
      valid = validatePhoneIfFilled('telefono') & valid;

      if (!currentImageFile && !currentImageUrl) {
        dropZone.classList.add('drop-error');
        valid = false;
      }

      if (!valid) {
        showSnackbar('Controlla i campi evidenziati e la scheda da caricare.', true);
        const firstErr = document.querySelector('.form-group.has-error, .drop-zone.drop-error');
        if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      const numTessera = numInput.value.trim();
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="material-icons-outlined spin">sync</span> Salvataggio\u2026';

      try {
        await submitAdminDigitalization({
          numeroTessera: numTessera,
          nome:          sanitize(val('nome')),
          cognome:       sanitize(val('cognome')),
          dataNascita:   dateToIso(val('dataNascita')),
          luogoNascita:  sanitize(val('luogoNascita')),
          residenza:     sanitize(val('residenza')),
          comune:        sanitize(val('comune')),
          cap:           val('cap'),
          telefono:      val('telefono'),
          email:         val('email').toLowerCase(),
        }, currentImageFile, currentImageUrl);

        sessionCount++;
        counterEl.textContent = sessionCount;
        broadcast('form_reset');
        form.reset();
        clearImage();
        document.querySelectorAll('.form-group.has-error').forEach(g => g.classList.remove('has-error'));
        numInput.readOnly = false;
        setVerifyState('unverified');
        showSnackbar(`Tessera n\u00b0 ${numTessera} digitalizzata con successo. \u2713`);
        numInput.focus();

      } catch (err) {
        showSnackbar(err.message || 'Errore durante il salvataggio.', true);
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span class="material-icons-outlined">save</span> Salva e prossima';
      }
    });

    /* ── Init ───────────────────────────────────────────────────── */
    loadThemeAndReady();
    numInput.focus();
  }

})();
