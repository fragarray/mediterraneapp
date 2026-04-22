window.CodexUi = (() => {
  let snackTimer = null;
  const validationFocusTimers = new WeakMap();

  function showSnackbar(message, isError = false, options = {}) {
    const el = document.getElementById(options.id || 'snackbar');
    if (!el) return;
    el.textContent = message;
    el.className = 'snackbar visible ' + (isError ? 'error' : 'success');
    clearTimeout(snackTimer);
    snackTimer = setTimeout(() => el.classList.remove('visible'), options.duration || 4500);
  }

  function flashValidationTarget(target) {
    if (!target) return;

    document.querySelectorAll('.form-group.validation-focus')
      .forEach(group => group.classList.remove('validation-focus'));

    const existingTimer = validationFocusTimers.get(target);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    target.classList.remove('validation-focus');
    void target.offsetWidth;
    target.classList.add('validation-focus');

    const timer = window.setTimeout(() => {
      target.classList.remove('validation-focus');
      validationFocusTimers.delete(target);
    }, 1400);

    validationFocusTimers.set(target, timer);
  }

  function scrollToFirstInvalidField(root = document) {
    const invalidGroup = root.querySelector('.form-group.has-error');
    if (!invalidGroup) return false;

    const focusable = invalidGroup.querySelector(
      'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])'
    ) || invalidGroup;
    const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    flashValidationTarget(invalidGroup);
    invalidGroup.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      block: 'center',
      inline: 'nearest',
    });

    if (focusable !== invalidGroup && typeof focusable.focus === 'function') {
      window.requestAnimationFrame(() => {
        try {
          focusable.focus({ preventScroll: true });
        } catch (error) {
          focusable.focus();
        }
      });
    }

    return true;
  }

  function escHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escJs(str) {
    return String(str ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  function fmtDate(isoStr) {
    if (!isoStr) return '–';
    const d = new Date(isoStr);
    if (Number.isNaN(d.getTime())) return isoStr;
    return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function fmtBirth(isoDate) {
    if (!isoDate) return '–';
    const parts = String(isoDate).split('-');
    if (parts.length < 3) return isoDate;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }

  function birthToInput(isoDate) {
    if (!isoDate) return '';
    const parts = String(isoDate).split('-');
    if (parts.length < 3) return '';
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }

  function residenceLabel(member) {
    const addr = String(member?.residenza || '').trim();
    const city = String(member?.comune || '').trim();
    const zip = String(member?.cap || '').trim();
    const cityZip = [city, zip ? `(${zip})` : ''].filter(Boolean).join(' ');
    const parts = [addr, cityZip].filter(Boolean);
    return parts.length ? parts.join(' · ') : '–';
  }

  function birthPlaceAndDateLabel(member) {
    const place = String(member?.luogo_nascita || '').trim() || '–';
    const date = fmtBirth(member?.data_nascita);
    if (place === '–' && date === '–') return '–';
    if (date === '–') return place;
    if (place === '–') return date;
    return `${place} · ${date}`;
  }

  function openLightbox(url, imageId = 'lightboxImg', overlayId = 'lightbox') {
    const img = document.getElementById(imageId);
    const overlay = document.getElementById(overlayId);
    if (!img || !overlay) return;
    img.src = url;
    overlay.classList.add('active');
  }

  async function loadThemeAndReady(options = {}) {
    const {
      settingKey = SETTING_THEME_COLOR,
      beforeReady = null,
      onError = null,
      readyClass = true,
    } = options;

    let colorHex = null;
    try {
      colorHex = await getAppSetting(settingKey);
      if (colorHex) {
        applySeedColor(colorHex);
      }
    } catch (error) {
      if (onError) onError(error);
    }

    if (beforeReady) {
      try {
        await beforeReady(colorHex);
      } catch (error) {
        if (onError) onError(error);
      }
    }

    if (readyClass) {
      document.body.classList.add('ready');
    }

    return colorHex;
  }

  return {
    showSnackbar,
    escHtml,
    escJs,
    fmtDate,
    fmtBirth,
    birthToInput,
    residenceLabel,
    birthPlaceAndDateLabel,
    openLightbox,
    loadThemeAndReady,
    scrollToFirstInvalidField,
  };
})();

