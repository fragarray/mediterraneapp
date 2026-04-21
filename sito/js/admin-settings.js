const {
  showSnackbar: settingsShowSnackbar,
  escHtml: settingsEscHtml,
} = AdminShared;

let _selectedColorHex = null;
let _carouselUrls = [];
let _colorAlpha = 255;
let _previewRealCount = 0;
let _previewIndex = 0;
let _previewTimer = null;
let _previewFraction = 1;
let _previewEnlarge = true;
const ENLARGE_FACTOR = 0.34;

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

    if (colorHex) {
      _selectedColorHex = colorHex;
      setColorFromSaved(colorHex);
    }

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

function onColorWheelChange(hex6) {
  document.getElementById('colorHexInput').value = hex6.toUpperCase();
  updateColorPreview();
}

function onHexInputChange(val) {
  val = val.trim();
  if (!val.startsWith('#')) val = '#' + val;
  if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
    document.getElementById('colorWheel').value = val;
    updateColorPreview();
  }
}

function onAlphaChange(val) {
  _colorAlpha = parseInt(val, 10);
  document.getElementById('colorAlphaVal').textContent = Math.round(_colorAlpha / 255 * 100) + '%';
  updateColorPreview();
}

function updateColorPreview() {
  const hex6 = document.getElementById('colorWheel').value;
  const r = parseInt(hex6.slice(1, 3), 16);
  const g = parseInt(hex6.slice(3, 5), 16);
  const b = parseInt(hex6.slice(5, 7), 16);
  document.getElementById('colorPreviewBar').style.background =
    `rgba(${r},${g},${b},${(_colorAlpha / 255).toFixed(2)})`;
  const aa = _colorAlpha.toString(16).padStart(2, '0').toUpperCase();
  _selectedColorHex = '#' + aa + hex6.slice(1).toUpperCase();
  document.querySelectorAll('.color-preset').forEach(p =>
    p.classList.toggle('active', p.dataset.color.toUpperCase() === hex6.toUpperCase())
  );
}

function pickPreset(el) {
  const c = el.dataset.color;
  document.getElementById('colorWheel').value = c;
  document.getElementById('colorHexInput').value = c.toUpperCase();
  updateColorPreview();
}

function setColorFromSaved(aarrggbb) {
  if (!aarrggbb || aarrggbb.length < 9) return;
  const aa = parseInt(aarrggbb.slice(1, 3), 16);
  const rgb = '#' + aarrggbb.slice(3);
  _colorAlpha = aa;
  document.getElementById('colorWheel').value = rgb;
  document.getElementById('colorHexInput').value = rgb.toUpperCase();
  document.getElementById('colorAlpha').value = aa;
  document.getElementById('colorAlphaVal').textContent = Math.round(aa / 255 * 100) + '%';
  updateColorPreview();
}

async function saveThemeColor() {
  if (!_selectedColorHex) {
    settingsShowSnackbar('Seleziona un colore.', true);
    return;
  }
  const btn = document.getElementById('saveColorBtn');
  btn.disabled = true;
  try {
    await saveAppSetting(SETTING_THEME_COLOR, _selectedColorHex);
    applySeedColor(_selectedColorHex);
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
