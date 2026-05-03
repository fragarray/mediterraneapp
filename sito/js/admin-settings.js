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
    const [start, instagram, colorHex, carouselRaw, backupInterval, lastBackup] = await Promise.all([
      getAppSetting(SETTING_MEMBERSHIP_START),
      getAppSetting(SETTING_INSTAGRAM_URL),
      getAppSetting(SETTING_THEME_COLOR),
      getAppSetting(SETTING_CAROUSEL_CONFIG),
      getAppSetting(SETTING_BACKUP_INTERVAL),
      getAppSetting(SETTING_LAST_BACKUP),
    ]);

    if (start) document.getElementById('membershipStartInput').value = start;
    if (instagram) document.getElementById('instagramInput').value = instagram;

    if (backupInterval) document.getElementById('backupIntervalInput').value = backupInterval;
    const lastBackupLabel = document.getElementById('lastBackupLabel');
    if (lastBackupLabel) {
      if (lastBackup) {
        const [y, m, d] = lastBackup.split('-');
        lastBackupLabel.textContent = `${d}/${m}/${y}`;
      } else {
        lastBackupLabel.textContent = 'mai';
      }
    }

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

/* ================================================================
   Backup interval
   ================================================================ */

async function saveBackupInterval() {
  const val = document.getElementById('backupIntervalInput').value.trim();
  const n = parseInt(val, 10);
  if (!val || isNaN(n) || n < 1) {
    settingsShowSnackbar('Inserisci un numero di giorni valido (minimo 1).', true);
    return;
  }
  const btn = document.getElementById('saveBackupIntervalBtn');
  btn.disabled = true;
  try {
    await saveAppSetting(SETTING_BACKUP_INTERVAL, String(n));
    settingsShowSnackbar('Intervallo promemoria salvato.');
  } catch (e) {
    settingsShowSnackbar(e.message || 'Salvataggio fallito.', true);
  } finally {
    btn.disabled = false;
  }
}

/* ================================================================
   Backup generation
   ================================================================ */

function _setBackupProgress(label, pct) {
  const wrap = document.getElementById('backupProgressWrap');
  const bar  = document.getElementById('backupProgressBar');
  const pctEl = document.getElementById('backupProgressPct');
  const lblEl = document.getElementById('backupProgressLabel');
  if (!wrap) return;
  wrap.style.display = '';
  if (bar)   bar.style.width = `${pct}%`;
  if (pctEl) pctEl.textContent = `${Math.round(pct)}%`;
  if (lblEl) lblEl.textContent = label;
}

function _hideBackupProgress() {
  const wrap = document.getElementById('backupProgressWrap');
  if (wrap) wrap.style.display = 'none';
}

async function generateBackup() {
  if (typeof JSZip === 'undefined') {
    settingsShowSnackbar('JSZip non disponibile. Ricarica la pagina e riprova.', true);
    return;
  }

  const btn = document.getElementById('generateBackupBtn');
  btn.disabled = true;

  try {
    _setBackupProgress('Recupero dati…', 0);

    // 1. Fetch DB tables in parallel (full scan, no limit)
    const [sociResult, legacyResult, settingsResult] = await Promise.all([
      supabase.from('soci').select('*').order('created_at', { ascending: true }),
      supabase.from('legacy_membership_requests').select('*').order('created_at', { ascending: true }),
      supabase.from('app_settings').select('*'),
    ]);

    if (sociResult.error) throw new Error(`Errore lettura soci: ${sociResult.error.message}`);
    if (legacyResult.error) throw new Error(`Errore lettura legacy: ${legacyResult.error.message}`);
    if (settingsResult.error) throw new Error(`Errore lettura impostazioni: ${settingsResult.error.message}`);

    _setBackupProgress('Lista file storage…', 10);

    // 2. List all storage files across the three folders
    const [firmeFiles, schedeFiles, landingFiles] = await Promise.all([
      listAllStorageFiles(''),            // root of bucket (direct files, e.g. firme PNG)
      listAllStorageFiles('schede-storiche'),
      listAllStorageFiles('landing'),
    ]);

    // Root-level files are actual signature PNGs stored directly in the bucket root
    const allFiles = [
      ...firmeFiles.map(f => ({ path: f.name,                  storageKey: f.name })),
      ...schedeFiles.map(f => ({ path: `schede-storiche/${f.name}`, storageKey: `schede-storiche/${f.name}` })),
      ...landingFiles.map(f => ({ path: `landing/${f.name}`,   storageKey: `landing/${f.name}` })),
    ];

    const totalSteps = allFiles.length + 3; // 3 for DB tables
    let done = 0;

    const zip = new JSZip();
    const todayStr = new Date().toISOString().slice(0, 10);
    const rootFolder = `mediterranea-backup-${todayStr}`;

    // 3. Add DB JSON files
    zip.file(`${rootFolder}/data/soci.json`,                        JSON.stringify(sociResult.data,    null, 2));
    zip.file(`${rootFolder}/data/legacy_membership_requests.json`,  JSON.stringify(legacyResult.data,  null, 2));
    zip.file(`${rootFolder}/data/app_settings.json`,                JSON.stringify(settingsResult.data, null, 2));
    done += 3;
    _setBackupProgress('Download immagini…', Math.round((done / totalSteps) * 85));

    // 4. Download storage files and add to zip (with concurrency limit to avoid flooding)
    const CONCURRENCY = 4;
    for (let i = 0; i < allFiles.length; i += CONCURRENCY) {
      const batch = allFiles.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(async (f) => {
        try {
          const { data: blob, error } = await supabase.storage
            .from('firme')
            .download(f.storageKey);
          if (!error && blob) {
            zip.file(`${rootFolder}/storage/${f.path}`, blob);
          }
        } catch (_) {
          // File non scaricabile: salta senza interrompere tutto il backup
        }
        done++;
        _setBackupProgress(
          `Download immagini… (${done - 3}/${allFiles.length})`,
          Math.round((done / totalSteps) * 85),
        );
      }));
    }

    _setBackupProgress('Generazione ZIP…', 90);

    // 5. Generate ZIP blob
    const zipBlob = await zip.generateAsync(
      { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
      (meta) => {
        _setBackupProgress('Compressione…', 90 + meta.percent * 0.09);
      },
    );

    _setBackupProgress('Download…', 99);

    // 6. Trigger download
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mediterranea-backup-${todayStr}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // 7. Save last backup date
    const isoToday = new Date().toISOString().slice(0, 10);
    await saveAppSetting(SETTING_LAST_BACKUP, isoToday);
    const lastBackupLabel = document.getElementById('lastBackupLabel');
    if (lastBackupLabel) {
      const [y, m, d] = isoToday.split('-');
      lastBackupLabel.textContent = `${d}/${m}/${y}`;
    }

    _setBackupProgress('Completato!', 100);
    settingsShowSnackbar('Backup generato e scaricato.');
    setTimeout(_hideBackupProgress, 3000);

  } catch (e) {
    _hideBackupProgress();
    settingsShowSnackbar(e.message || 'Errore durante il backup.', true);
  } finally {
    btn.disabled = false;
  }
}

/* ================================================================
   Backup restore
   ================================================================ */

async function restoreBackup(input) {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];
  input.value = '';

  if (typeof JSZip === 'undefined') {
    settingsShowSnackbar('JSZip non disponibile. Ricarica la pagina e riprova.', true);
    return;
  }

  const label = document.getElementById('restoreBackupLabel');
  if (label) label.style.pointerEvents = 'none';

  try {
    _setBackupProgress('Lettura archivio…', 0);

    const zip = await JSZip.loadAsync(file);

    // Detect root folder name inside ZIP
    const zipFiles = Object.keys(zip.files);
    const rootDir = zipFiles.find(k => zip.files[k].dir && !k.slice(0, -1).includes('/'));
    const root = rootDir || '';

    // --- Restore DB tables ---
    _setBackupProgress('Ripristino dati…', 10);

    const tableMap = [
      { file: `${root}data/soci.json`,                       table: 'soci' },
      { file: `${root}data/legacy_membership_requests.json`, table: 'legacy_membership_requests' },
      { file: `${root}data/app_settings.json`,               table: 'app_settings' },
    ];

    for (const { file: zipPath, table } of tableMap) {
      const entry = zip.file(zipPath);
      if (!entry) continue;
      const text = await entry.async('string');
      const rows = JSON.parse(text);
      if (!Array.isArray(rows) || !rows.length) continue;

      // Upsert in chunks of 200 to avoid payload limits
      const CHUNK = 200;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const conflictCol = table === 'app_settings' ? 'key' : 'id';
        const { error } = await supabase.from(table).upsert(chunk, { onConflict: conflictCol });
        if (error) throw new Error(`Ripristino tabella ${table} fallito: ${error.message}`);
      }
    }

    _setBackupProgress('Ripristino immagini…', 40);

    // --- Restore Storage files ---
    const storageEntries = zipFiles.filter(k =>
      !zip.files[k].dir && k.includes(`${root}storage/`),
    );

    const total = storageEntries.length;
    let done = 0;

    const CONCURRENCY = 3;
    for (let i = 0; i < storageEntries.length; i += CONCURRENCY) {
      const batch = storageEntries.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(async (zipKey) => {
        try {
          const blob = await zip.file(zipKey).async('blob');
          // storageKey is the path inside the bucket (strip root + "storage/")
          const storageKey = zipKey.slice(`${root}storage/`.length);
          const ext = storageKey.split('.').pop().toLowerCase();
          const mimeMap = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
                            gif: 'image/gif', webp: 'image/webp' };
          const contentType = mimeMap[ext] || 'application/octet-stream';
          const { error } = await supabase.storage
            .from('firme')
            .upload(storageKey, blob, { contentType, upsert: true });
          if (error) {
            console.warn(`Upload storage fallito per ${storageKey}: ${error.message}`);
          }
        } catch (err) {
          console.warn(`Errore ripristino file: ${err.message}`);
        }
        done++;
        _setBackupProgress(
          `Ripristino immagini… (${done}/${total})`,
          40 + Math.round((done / Math.max(total, 1)) * 55),
        );
      }));
    }

    _setBackupProgress('Completato!', 100);
    settingsShowSnackbar('Ripristino completato.');
    setTimeout(_hideBackupProgress, 3000);

  } catch (e) {
    _hideBackupProgress();
    settingsShowSnackbar(e.message || 'Errore durante il ripristino.', true);
  } finally {
    if (label) label.style.pointerEvents = '';
  }
}
