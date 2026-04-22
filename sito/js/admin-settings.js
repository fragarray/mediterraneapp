const {
  showSnackbar: settingsShowSnackbar,
  escHtml: settingsEscHtml,
} = AdminShared;

let _selectedColorHex = null;
let _carouselUrls = [];
let _themeColorPicker = null;
let _isUpdatingThemeColorPicker = false;
let _previewRealCount = 0;
let _previewIndex = 0;
let _previewTimer = null;
let _previewFraction = 1;
let _previewEnlarge = true;
const ENLARGE_FACTOR = 0.34;

function normalizeThemeColorHex(value) {
  if (typeof value !== 'string') {
    return null;
  }

  let normalized = value.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(normalized)) {
    normalized = normalized
      .split('')
      .map((character) => character + character)
      .join('');
  } else if (/^[0-9a-fA-F]{8}$/.test(normalized)) {
    normalized = normalized.slice(2);
  } else if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return null;
  }

  return `#${normalized.toUpperCase()}`;
}

function clampNumber(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function hexToRgb(value) {
  const normalized = normalizeThemeColorHex(value);
  if (!normalized) {
    return null;
  }

  const raw = normalized.slice(1);
  return {
    r: parseInt(raw.slice(0, 2), 16),
    g: parseInt(raw.slice(2, 4), 16),
    b: parseInt(raw.slice(4, 6), 16),
  };
}

function rgbToHsl(r, g, b) {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  const lightness = (maximum + minimum) / 2;

  if (delta === 0) {
    return { h: 0, s: 0, l: lightness * 100 };
  }

  let hue = 0;
  if (maximum === red) {
    hue = ((green - blue) / delta) % 6;
  } else if (maximum === green) {
    hue = (blue - red) / delta + 2;
  } else {
    hue = (red - green) / delta + 4;
  }

  hue = Math.round(hue * 60);
  if (hue < 0) {
    hue += 360;
  }

  const saturation = delta / (1 - Math.abs(2 * lightness - 1));

  return {
    h: hue,
    s: saturation * 100,
    l: lightness * 100,
  };
}

function hslToRgb(hue, saturation, lightness) {
  const normalizedHue = ((hue % 360) + 360) % 360;
  const sat = clampNumber(saturation, 0, 100) / 100;
  const light = clampNumber(lightness, 0, 100) / 100;
  const chroma = (1 - Math.abs(2 * light - 1)) * sat;
  const hueSection = normalizedHue / 60;
  const secondary = chroma * (1 - Math.abs((hueSection % 2) - 1));
  let red = 0;
  let green = 0;
  let blue = 0;

  if (hueSection >= 0 && hueSection < 1) {
    red = chroma;
    green = secondary;
  } else if (hueSection < 2) {
    red = secondary;
    green = chroma;
  } else if (hueSection < 3) {
    green = chroma;
    blue = secondary;
  } else if (hueSection < 4) {
    green = secondary;
    blue = chroma;
  } else if (hueSection < 5) {
    red = secondary;
    blue = chroma;
  } else {
    red = chroma;
    blue = secondary;
  }

  const match = light - chroma / 2;

  return {
    r: (red + match) * 255,
    g: (green + match) * 255,
    b: (blue + match) * 255,
  };
}

function rgbToRgbaString(rgb, alpha) {
  return `rgba(${Math.round(rgb.r)}, ${Math.round(rgb.g)}, ${Math.round(rgb.b)}, ${alpha.toFixed(2)})`;
}

function relativeLuminance(rgb) {
  const toLinear = (channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };

  return (
    0.2126 * toLinear(rgb.r) +
    0.7152 * toLinear(rgb.g) +
    0.0722 * toLinear(rgb.b)
  );
}

function updateThemeColorLiveSurface(hexValue) {
  const liveCard = document.querySelector('.theme-color-live');
  if (!liveCard) {
    return;
  }

  const rgb = hexToRgb(hexValue);
  if (!rgb) {
    return;
  }

  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const complementaryHue = (hsl.h + 180) % 360;
  const saturation = clampNumber(hsl.s * 0.08 + 8, 8, 16);
  const lightness = clampNumber(97 - (hsl.s * 0.02), 95.5, 98.2);
  const startRgb = hslToRgb(complementaryHue, saturation, lightness);
  const endRgb = hslToRgb(
    complementaryHue,
    clampNumber(saturation - 1.5, 7, 15),
    clampNumber(lightness - 1.3, 94.5, 97.8),
  );
  const isBright = relativeLuminance(startRgb) > 0.82;
  const foreground = isBright
    ? 'rgba(15, 23, 42, 0.96)'
    : 'rgba(255, 255, 255, 0.98)';
  const muted = isBright
    ? 'rgba(15, 23, 42, 0.72)'
    : 'rgba(255, 255, 255, 0.74)';
  const label = isBright
    ? 'rgba(15, 23, 42, 0.66)'
    : 'rgba(255, 255, 255, 0.66)';
  const border = isBright
    ? 'rgba(15, 23, 42, 0.18)'
    : 'rgba(255, 255, 255, 0.28)';
  const shadow = isBright
    ? '0 16px 34px rgba(15, 23, 42, .12)'
    : '0 16px 34px rgba(15, 23, 42, .16)';

  liveCard.style.setProperty(
    '--theme-color-live-bg',
    `linear-gradient(135deg, ${rgbToRgbaString(startRgb, 1)}, ${rgbToRgbaString(endRgb, 1)})`,
  );
  liveCard.style.setProperty('--theme-color-live-fg', foreground);
  liveCard.style.setProperty('--theme-color-live-note', muted);
  liveCard.style.setProperty('--theme-color-live-label', label);
  liveCard.style.setProperty('--theme-color-live-border', border);
  liveCard.style.setProperty('--theme-color-live-shadow', shadow);
}

function ensureThemeColorPicker() {
  if (_themeColorPicker || typeof iro === 'undefined') {
    return;
  }

  const pickerHost = document.getElementById('themeColorPicker');
  if (!pickerHost) {
    return;
  }

  _themeColorPicker = new iro.ColorPicker(pickerHost, {
    width: 300,
    color: _selectedColorHex || '#2E7D32',
    layout: [
      {
        component: iro.ui.Wheel,
      },
    ],
    wheelLightness: false,
    borderWidth: 0,
    padding: 10,
    margin: 12,
    handleRadius: 11,
    activeHandleRadius: 13,
  });

  _themeColorPicker.on('color:change', (color) => {
    if (_isUpdatingThemeColorPicker) {
      return;
    }

    applyThemeColorSelection(color.hexString, { syncPicker: false });
  });
}

function applyThemeColorSelection(hexValue, { syncPicker = true } = {}) {
  const normalized = normalizeThemeColorHex(hexValue);
  if (!normalized) {
    return false;
  }

  _selectedColorHex = normalized;

  const colorInput = document.getElementById('colorHexInput');
  if (colorInput && colorInput.value.toUpperCase() !== normalized) {
    colorInput.value = normalized;
  }

  const previewSwatch = document.getElementById('themeColorPreviewSwatch');
  if (previewSwatch) {
    previewSwatch.style.background = normalized;
  }

  updateThemeColorLiveSurface(normalized);

  const colorValue = document.getElementById('themeColorValue');
  if (colorValue) {
    colorValue.textContent = normalized;
  }

  document.querySelectorAll('.theme-color-swatch[data-color]').forEach((button) => {
    button.classList.toggle(
      'active',
      normalizeThemeColorHex(button.dataset.color) === normalized,
    );
  });

  if (syncPicker && _themeColorPicker) {
    const currentHex = (_themeColorPicker.color.hexString || '').toUpperCase();
    if (currentHex !== normalized) {
      _isUpdatingThemeColorPicker = true;
      try {
        _themeColorPicker.color.hexString = normalized;
      } finally {
        _isUpdatingThemeColorPicker = false;
      }
    }
  }

  return true;
}

async function loadSettingsValues() {
  try {
    const [start, instagram, colorHex, carouselRaw] = await Promise.all([
      getAppSetting(SETTING_MEMBERSHIP_START),
      getAppSetting(SETTING_INSTAGRAM_URL),
      getAppSetting(SETTING_THEME_COLOR),
      getAppSetting(SETTING_CAROUSEL_CONFIG),
    ]);

    if (start) document.getElementById('membershipStartInput').value = start;
    if (instagram) document.getElementById('instagramInput').value = instagram;

    ensureThemeColorPicker();

    const savedColor = normalizeThemeColorHex(colorHex) || _selectedColorHex || '#2E7D32';
    setColorFromSaved(savedColor);

    if (carouselRaw) {
      try {
        const cfg = JSON.parse(carouselRaw);
        _carouselUrls = cfg.image_urls || [];
        document.getElementById('sliderHeight').value = cfg.widget_height || 230;
        document.getElementById('valHeight').textContent = cfg.widget_height || 230;
        document.getElementById('sliderItems').value = cfg.visible_items || 2;
        document.getElementById('valItems').textContent = cfg.visible_items || 2;
        document.getElementById('sliderAutoplay').value = cfg.autoplay_seconds || 4;
        document.getElementById('valAutoplay').textContent = cfg.autoplay_seconds || 4;
      } catch (_) {}
    }

    renderCarouselImageList();
    updateCarouselPreview();
  } catch (e) {
    settingsShowSnackbar('Errore caricamento impostazioni.', true);
  }
}

async function saveMembershipStart() {
  const val = document.getElementById('membershipStartInput').value.trim();
  if (!val || isNaN(parseInt(val, 10)) || parseInt(val, 10) <= 0) {
    settingsShowSnackbar('Inserisci un numero valido maggiore di zero.', true);
    return;
  }
  const btn = document.getElementById('saveMembershipStartBtn');
  btn.disabled = true;
  try {
    await saveAppSetting(SETTING_MEMBERSHIP_START, val);
    settingsShowSnackbar('Numero iniziale salvato.');
  } catch (e) {
    settingsShowSnackbar(e.message || 'Salvataggio fallito.', true);
  } finally {
    btn.disabled = false;
  }
}

async function saveInstagram() {
  const val = document.getElementById('instagramInput').value.trim();
  const btn = document.getElementById('saveInstagramBtn');
  btn.disabled = true;
  try {
    await saveAppSetting(SETTING_INSTAGRAM_URL, val);
    settingsShowSnackbar('Link Instagram salvato.');
  } catch (e) {
    settingsShowSnackbar(e.message || 'Salvataggio fallito.', true);
  } finally {
    btn.disabled = false;
  }
}

function onHexInputChange(val) {
  const normalized = normalizeThemeColorHex(val);
  if (!normalized) {
    return;
  }

  applyThemeColorSelection(normalized);
}

function pickPreset(el) {
  applyThemeColorSelection(el.dataset.color);
}

function setColorFromSaved(savedColor) {
  const normalized = normalizeThemeColorHex(savedColor);
  if (!normalized) {
    return;
  }

  applyThemeColorSelection(normalized);
}

async function saveThemeColor() {
  const colorInput = document.getElementById('colorHexInput');
  const colorToSave = normalizeThemeColorHex(
    colorInput?.value || _selectedColorHex,
  );
  if (!colorToSave) {
    settingsShowSnackbar('Seleziona un colore.', true);
    return;
  }

  _selectedColorHex = colorToSave;
  if (colorInput) {
    colorInput.value = colorToSave;
  }
  const btn = document.getElementById('saveColorBtn');
  btn.disabled = true;
  try {
    await saveAppSetting(SETTING_THEME_COLOR, colorToSave);
    if (typeof applySeedColor === 'function') {
      applySeedColor(colorToSave);
    }
    settingsShowSnackbar('Colore tema salvato.');
  } catch (e) {
    settingsShowSnackbar(e.message || 'Salvataggio fallito.', true);
  } finally {
    btn.disabled = false;
  }
}

function renderCarouselImageList() {
  const list = document.getElementById('carouselImageList');
  if (!_carouselUrls.length) {
    list.innerHTML = '<div class="empty-state" style="padding:16px;">Nessuna immagine caricata.</div>';
    return;
  }
  list.innerHTML = '';
  _carouselUrls.forEach((url, idx) => {
    const badge = document.createElement('div');
    badge.className = 'carousel-image-badge';
    badge.innerHTML = `
      <img src="${settingsEscHtml(url)}" alt="" onerror="this.style.background='#ddd'">
      <button class="badge-delete" title="Rimuovi" onclick="removeCarouselUrl(${idx})">
        <span class="material-icons-outlined" style="font-size:16px;">close</span>
      </button>`;
    list.appendChild(badge);
  });
}

async function removeCarouselUrl(idx) {
  const url = _carouselUrls[idx];
  _carouselUrls.splice(idx, 1);
  renderCarouselImageList();
  updateCarouselPreview();
  try {
    await deleteCarouselImageByPublicUrl(url);
  } catch (e) {
    console.warn('Eliminazione immagine dallo storage fallita:', e);
  }
}

function updateSlideScales() {
  const track = document.getElementById('carouselTrack');
  const slides = track.querySelectorAll('.carousel-slide');
  slides.forEach((slide, i) => {
    if (_previewEnlarge && _previewRealCount > 1) {
      const isCenter = i === _previewIndex;
      slide.style.transform = isCenter ? 'scale(1)' : `scale(${1 - ENLARGE_FACTOR})`;
      slide.style.zIndex = isCenter ? '2' : '1';
    } else {
      slide.style.transform = 'scale(1)';
      slide.style.zIndex = '1';
    }
  });
}

function goToPreviewSlide(idx, animate) {
  if (animate === undefined) animate = true;
  _previewIndex = idx;
  const track = document.getElementById('carouselTrack');
  if (!animate) {
    track.style.transition = 'none';
  }
  const slideW = _previewFraction * 100;
  const padOffset = (100 - slideW) / 2;
  const tx = _previewIndex * slideW - padOffset;
  track.style.transform = 'translateX(' + (-tx) + '%)';
  updateSlideScales();
  if (!animate) {
    void track.offsetHeight;
    track.style.transition = '';
  }
}

function updateCarouselPreview() {
  const wrap = document.getElementById('carouselPreviewWrap');
  const track = document.getElementById('carouselTrack');
  const height = parseInt(document.getElementById('sliderHeight').value, 10);
  const visible = parseInt(document.getElementById('sliderItems').value, 10);
  const seconds = parseInt(document.getElementById('sliderAutoplay').value, 10);

  wrap.style.height = height + 'px';
  clearInterval(_previewTimer);

  if (!_carouselUrls.length) {
    track.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:#999;font-size:14px;">Nessuna immagine</div>';
    return;
  }

  _previewRealCount = _carouselUrls.length;
  _previewFraction = _carouselUrls.length > 1
    ? Math.min(Math.max(1 / visible, 0.28), 1)
    : 1;
  _previewEnlarge = _carouselUrls.length > 1;

  const allUrls = _carouselUrls.length > 1
    ? [..._carouselUrls, ..._carouselUrls, ..._carouselUrls]
    : _carouselUrls;

  track.innerHTML = '';
  allUrls.forEach(url => {
    const slide = document.createElement('div');
    slide.className = 'carousel-slide';
    slide.style.flex = '0 0 ' + (_previewFraction * 100) + '%';
    slide.style.width = (_previewFraction * 100) + '%';
    slide.style.height = height + 'px';
    const img = document.createElement('img');
    img.src = url;
    img.alt = '';
    img.onerror = function() { this.style.background = '#ddd'; };
    slide.appendChild(img);
    track.appendChild(slide);
  });

  track.ontransitionend = function() {
    if (_previewIndex < _previewRealCount) {
      goToPreviewSlide(_previewIndex + _previewRealCount, false);
    } else if (_previewIndex >= 2 * _previewRealCount) {
      goToPreviewSlide(_previewIndex - _previewRealCount, false);
    }
  };

  const startReal = Math.floor(_previewRealCount / 2);
  const startIdx = _carouselUrls.length > 1 ? _previewRealCount + startReal : 0;
  goToPreviewSlide(startIdx, false);

  if (_carouselUrls.length > 1) {
    _previewTimer = setInterval(() => {
      goToPreviewSlide(_previewIndex + 1);
    }, seconds * 1000);
  }
}

async function optimizeCarouselImage(file) {
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

async function uploadCarouselFiles(input) {
  const files = Array.from(input.files);
  if (!files.length) return;
  for (const file of files) {
    try {
      const optimized = await optimizeCarouselImage(file);
      const url = await uploadCarouselImage(optimized);
      _carouselUrls.push(url);
    } catch (e) {
      settingsShowSnackbar(`Upload fallito: ${e.message}`, true);
    }
  }
  input.value = '';
  renderCarouselImageList();
  updateCarouselPreview();
}

async function saveCarouselConfig() {
  const config = {
    image_urls: _carouselUrls,
    widget_height: parseInt(document.getElementById('sliderHeight').value, 10),
    visible_items: parseInt(document.getElementById('sliderItems').value, 10),
    autoplay_seconds: parseInt(document.getElementById('sliderAutoplay').value, 10),
  };
  try {
    await saveAppSetting(SETTING_CAROUSEL_CONFIG, JSON.stringify(config));
    settingsShowSnackbar('Configurazione carosello salvata.');
  } catch (e) {
    settingsShowSnackbar(e.message || 'Salvataggio fallito.', true);
  }
}
