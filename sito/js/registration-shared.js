const { showSnackbar, loadThemeAndReady, scrollToFirstInvalidField } = CodexUi;

function initRegistrationPage(config) {
  preserveLanguageQuery(config);

  const params = new URLSearchParams(window.location.search);
  const fixedMembershipNumber = params.get('tessera');
  const isLegacyFlow = fixedMembershipNumber !== null && fixedMembershipNumber !== '';

  if (isLegacyFlow) {
    applyLegacyTexts(config, fixedMembershipNumber);
  }

  setupDateFormatter(document.getElementById('dataNascita'));
  const dataRegInput = document.getElementById('dataRegTessera');
  if (dataRegInput) setupDateFormatter(dataRegInput);

  const signature = initSignaturePad();
  const optOut = initOptOut(config);

  document.getElementById('registrationForm').addEventListener('submit', async function (e) {
    e.preventDefault();

    let valid = true;
    valid = validateRequired('nome') & valid;
    valid = validateRequired('cognome') & valid;
    valid = validateRequired('luogoNascita') & valid;
    valid = validateDate('dataNascita') & valid;
    valid = validateRequired('residenza') & valid;
    valid = validateRequired('comune') & valid;
    valid = validateCap('cap') & valid;
    if (!optOut.getPhone()) valid = validatePhone('telefono') & valid;
    if (!optOut.getEmail()) valid = validateEmail('email') & valid;

    if (isLegacyFlow) {
      valid = validateDate('dataRegTessera') & valid;
    }

    if (!valid) {
      scrollToFirstInvalidField(document);
      showSnackbar(config.messages.invalidFields, true);
      return;
    }

    if (!document.getElementById('privacy').checked) {
      showSnackbar(config.messages.privacyRequired, true);
      return;
    }

    if (!signature.isUsed()) {
      showSnackbar(config.messages.signatureRequired, true);
      return;
    }

    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.innerHTML = `<span class="material-icons-outlined spin">sync</span> ${config.messages.loadingLabel}`;

    try {
      const signatureBlob = await signature.toBlob();
      if (!signatureBlob || signatureBlob.size === 0) {
        throw new Error(config.messages.signatureBlobError);
      }

      const formData = {
        nome: sanitizeText(document.getElementById('nome').value.trim()),
        cognome: sanitizeText(document.getElementById('cognome').value.trim()),
        luogoNascita: sanitizeText(document.getElementById('luogoNascita').value.trim()),
        dataNascita: dateToIso(document.getElementById('dataNascita').value.trim()),
        residenza: sanitizeText(document.getElementById('residenza').value.trim()),
        comune: sanitizeText(document.getElementById('comune').value.trim()),
        cap: document.getElementById('cap').value.trim(),
        email: optOut.getEmail() ? 'no@mail.no' : document.getElementById('email').value.trim().toLowerCase(),
        telefono: optOut.getPhone() ? '0000000000' : document.getElementById('telefono').value.trim(),
        privacyAccepted: true,
      };

      if (isLegacyFlow) {
        formData.numeroTessera = fixedMembershipNumber;
        formData.dataRegistrazioneTessera = dateToIso(document.getElementById('dataRegTessera').value.trim());
        await submitLegacyMembershipRequest(formData, signatureBlob);
        showSnackbar(config.messages.legacySubmitted(fixedMembershipNumber), false);
      } else {
        await submitRegistration(formData, signatureBlob);
        showSnackbar(config.messages.submitted, false);
      }

      document.getElementById('registrationForm').reset();
      signature.clear();
      optOut.reset();
      document.querySelectorAll('.form-group.has-error, .form-group.validation-focus')
        .forEach(g => g.classList.remove('has-error', 'validation-focus'));

      const tesseraInput = document.getElementById('numeroTessera');
      tesseraInput.value = isLegacyFlow ? fixedMembershipNumber : config.messages.defaultMembershipValue;
    } catch (err) {
      showSnackbar(err.message || config.messages.submitError, true);
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<span class="material-icons-outlined">send</span> ${config.messages.submitLabel}`;
    }
  });

  loadThemeAndReady();
}

function preserveLanguageQuery(config) {
  if (!config.otherLangButtonId || !config.otherLangPage) return;
  const qs = window.location.search;
  if (!qs) return;
  const otherBtn = document.getElementById(config.otherLangButtonId);
  if (otherBtn) otherBtn.href = config.otherLangPage + qs;
}

function applyLegacyTexts(config, membershipNumber) {
  document.querySelector('.appbar-title').textContent = config.legacy.appBarTitle;
  document.title = config.legacy.documentTitle;
  document.getElementById('introTitle').textContent = config.legacy.introTitle;
  document.getElementById('introDesc').textContent = config.legacy.introDesc(membershipNumber);
  document.getElementById('introTesseraNote').textContent = config.legacy.introTesseraNote;
  document.getElementById('numeroTessera').value = membershipNumber;
  document.getElementById('numeroTesseraHelper').textContent = config.legacy.membershipHelper;
  document.getElementById('dataRegTesseraGroup').style.display = '';
}

function setupDateFormatter(inputEl) {
  inputEl.addEventListener('input', function () {
    let digits = this.value.replace(/\D/g, '').slice(0, 8);
    let formatted = '';
    for (let i = 0; i < digits.length; i++) {
      formatted += digits[i];
      if ((i === 1 || i === 3) && i !== digits.length - 1) formatted += '/';
    }
    this.value = formatted;
  });
}

function initSignaturePad() {
  const canvas = document.getElementById('signatureCanvas');
  const ctx = canvas.getContext('2d');
  let drawing = false;
  let lastX = 0;
  let lastY = 0;
  let used = false;

  function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    const newW = rect.width;
    const newH = rect.height;
    let savedDataUrl = null;

    if (used && canvas.width > 0 && canvas.height > 0) {
      savedDataUrl = canvas.toDataURL();
    }

    canvas.width = newW;
    canvas.height = newH;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (savedDataUrl) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, newW, newH);
      img.src = savedDataUrl;
    }
  }

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches ? e.touches[0] : e;
    return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
  }

  function startDrawing(e) {
    drawing = true;
    used = true;
    const p = getPos(e);
    lastX = p.x;
    lastY = p.y;
  }

  function moveDrawing(e) {
    if (!drawing) return;
    const p = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastX = p.x;
    lastY = p.y;
  }

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  canvas.addEventListener('mousedown', startDrawing);
  canvas.addEventListener('mousemove', moveDrawing);
  canvas.addEventListener('mouseup', () => { drawing = false; });
  canvas.addEventListener('mouseleave', () => { drawing = false; });

  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    startDrawing(e);
  }, { passive: false });
  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    moveDrawing(e);
  }, { passive: false });
  canvas.addEventListener('touchend', () => { drawing = false; });

  document.getElementById('clearSignature').addEventListener('click', () => {
    clear();
  });

  function clear() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    used = false;
  }

  return {
    clear,
    isUsed: () => used,
    toBlob: () => new Promise(resolve => canvas.toBlob(resolve, 'image/png')),
  };
}

function initOptOut(config) {
  let optOutTelefono = false;
  let optOutEmail = false;
  let dialogShown = false;

  setupOptOutChip('optOutTelefono', 'telefonoGroup', 'telefono', v => { optOutTelefono = v; }, config.messages.phoneLabel);
  setupOptOutChip('optOutEmail', 'emailGroup', 'email', v => { optOutEmail = v; }, config.messages.emailLabel);

  function activateOptOut(chip, group, input, flagSetter) {
    chip.classList.add('active');
    group.classList.add('opted-out');
    flagSetter(true);
    input.value = '';
    group.classList.remove('has-error', 'validation-focus');
    input.tabIndex = -1;
  }

  function deactivateOptOut(chip, group, input, flagSetter) {
    chip.classList.remove('active');
    group.classList.remove('opted-out');
    flagSetter(false);
    input.tabIndex = 0;
  }

  function setupOptOutChip(chipId, groupId, inputId, flagSetter, labelField) {
    const chip = document.getElementById(chipId);
    const group = document.getElementById(groupId);
    const input = document.getElementById(inputId);
    chip.addEventListener('click', async () => {
      const isActive = chip.classList.contains('active');
      if (isActive) {
        deactivateOptOut(chip, group, input, flagSetter);
        return;
      }
      if (!dialogShown) {
        const confirmed = await showOptOutDialog(config.messages.optOutDialog(labelField));
        if (!confirmed) return;
        dialogShown = true;
      }
      activateOptOut(chip, group, input, flagSetter);
    });
  }

  function showOptOutDialog(message) {
    return new Promise(resolve => {
      document.getElementById('optoutDialogMsg').textContent = message;
      const overlay = document.getElementById('optoutOverlay');
      overlay.classList.add('visible');

      function cleanup(result) {
        overlay.classList.remove('visible');
        document.getElementById('optoutBtnStay').removeEventListener('click', onStay);
        document.getElementById('optoutBtnSkip').removeEventListener('click', onSkip);
        resolve(result);
      }

      function onStay() { cleanup(false); }
      function onSkip() { cleanup(true); }

      document.getElementById('optoutBtnStay').addEventListener('click', onStay);
      document.getElementById('optoutBtnSkip').addEventListener('click', onSkip);
    });
  }

  return {
    getPhone: () => optOutTelefono,
    getEmail: () => optOutEmail,
    reset: () => {
      dialogShown = false;
      ['optOutTelefono', 'optOutEmail'].forEach(id => document.getElementById(id).classList.remove('active'));
      ['telefonoGroup', 'emailGroup'].forEach(id => document.getElementById(id).classList.remove('opted-out'));
      optOutTelefono = false;
      optOutEmail = false;
    },
  };
}

function setError(id, show) {
  const group = document.getElementById(id).closest('.form-group');
  group.classList.toggle('has-error', show);
  if (!show) {
    group.classList.remove('validation-focus');
  }
}

function validateRequired(id) {
  const val = document.getElementById(id).value.trim();
  const empty = val.length === 0;
  setError(id, empty);
  return !empty;
}

function validateDate(id) {
  const val = document.getElementById(id).value.trim();
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(val);
  if (!match) {
    setError(id, true);
    return false;
  }
  const d = new Date(+match[3], +match[2] - 1, +match[1]);
  const valid = d.getFullYear() === +match[3] && d.getMonth() === +match[2] - 1 && d.getDate() === +match[1] && d <= new Date();
  setError(id, !valid);
  return valid;
}

function validateEmail(id) {
  const val = document.getElementById(id).value.trim();
  const ok = /^[\w\-.]+@([\w-]+\.)+[\w-]{2,4}$/.test(val);
  setError(id, !ok);
  return ok;
}

function validatePhone(id) {
  const val = document.getElementById(id).value.trim().replace(/ /g, '');
  const ok = /^[+0-9]{8,15}$/.test(val);
  setError(id, !ok);
  return ok;
}

function validateCap(id) {
  const val = document.getElementById(id).value.trim();
  const ok = /^\d+$/.test(val);
  setError(id, !ok);
  return ok;
}

function sanitizeText(str) {
  return str.replace(/([''`])\ +/g, '$1');
}

