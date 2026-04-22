
    /* ======== Lightbox ======== */
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightboxImg');
    const { openLightbox, loadThemeAndReady } = CodexUi;

    lightbox.addEventListener('click', () => lightbox.classList.remove('active'));

    /* ======== Carousel ======== */
    const carouselWrapper = document.getElementById('carouselWrapper');
    const carouselViewport = carouselWrapper.querySelector('.carousel-viewport');
    const carouselTrack   = document.getElementById('carouselTrack');
    const placeholder     = document.getElementById('carouselPlaceholder');

    let realCount = 0;        // numero slide reali (senza cloni)
    let internalIndex = 0;    // posizione nel track completo (cloni inclusi)
    let autoplayTimer = null;
    let carouselFraction = 1;
    let carouselEnlarge = true;
    let carouselAutoplaySeconds = 4;
    let dragPointerId = null;
    let dragStartX = 0;
    let dragStartY = 0;
    let dragStartIndex = 0;
    let dragStartTranslate = 0;
    let dragTrackWidth = 1;
    let dragOffsetPercent = 0;
    let dragActive = false;
    let suppressNextCarouselClick = false;
    const ENLARGE_FACTOR = 0.34;
    const DRAG_ACTIVATION_PX = 8;
    const DRAG_SETTLE_RATIO = 0.18;

    /* CenterPageEnlargeStrategy.zoom */
    function updateSlideScales() {
      const slides = carouselTrack.querySelectorAll('.carousel-slide');
      slides.forEach((slide, i) => {
        if (carouselEnlarge && realCount > 1) {
          const isCenter = i === internalIndex;
          slide.style.transform = isCenter ? 'scale(1)' : `scale(${1 - ENLARGE_FACTOR})`;
          slide.style.zIndex    = isCenter ? '2' : '1';
        } else {
          slide.style.transform = 'scale(1)';
          slide.style.zIndex    = '1';
        }
      });
    }

    function getSlideTranslatePercent(idx) {
      const slideW = carouselFraction * 100;
      const padOffset = (100 - slideW) / 2;
      return idx * slideW - padOffset;
    }

    function normalizeCarouselIndex(idx) {
      if (realCount <= 1) return idx;
      const normalized = ((idx - realCount) % realCount + realCount) % realCount;
      return realCount + normalized;
    }

    function getCurrentTranslateXPx() {
      const transform = window.getComputedStyle(carouselTrack).transform;
      if (!transform || transform === 'none') return 0;

      const matrix3d = transform.match(/^matrix3d\((.+)\)$/);
      if (matrix3d) {
        const values = matrix3d[1].split(',').map(Number);
        return values[12] || 0;
      }

      const matrix = transform.match(/^matrix\((.+)\)$/);
      if (matrix) {
        const values = matrix[1].split(',').map(Number);
        return values[4] || 0;
      }

      return 0;
    }

    function applyTrackTransform(baseTranslatePercent, offsetPercent, animate) {
      if (animate === undefined) animate = true;

      if (!animate) {
        carouselTrack.style.transition = 'none';
      } else {
        carouselTrack.style.transition = '';
      }

      const translatePercent = baseTranslatePercent - (offsetPercent || 0);
      carouselTrack.style.transform = 'translateX(' + (-translatePercent) + '%)';

      if (!animate) {
        // forza reflow, poi ripristina la transizione CSS
        void carouselTrack.offsetHeight;
        carouselTrack.style.transition = '';
      }
    }

    /* Sposta il track alla slide indicata.
       animate=false => salto istantaneo (usato dopo transitionend per ricentrare). */
    function goToSlide(idx, animate) {
      if (animate === undefined) animate = true;
      internalIndex = idx;

      applyTrackTransform(getSlideTranslatePercent(idx), 0, animate);
      updateSlideScales();
    }

    /* Dopo la transizione, se siamo su un clone saltiamo
       silenziosamente alla slide reale equivalente. */
    carouselTrack.addEventListener('transitionend', function(event) {
      if (event.target !== carouselTrack || event.propertyName !== 'transform') return;
      if (internalIndex < realCount) {
        goToSlide(internalIndex + realCount, false);
      } else if (internalIndex >= 2 * realCount) {
        goToSlide(internalIndex - realCount, false);
      }
    });

    function getDragStepDelta() {
      const slideW = carouselFraction * 100;
      if (!slideW) return 0;

      const rawSteps = -dragOffsetPercent / slideW;
      if (Math.abs(rawSteps) < DRAG_SETTLE_RATIO) return 0;

      return rawSteps > 0 ? Math.max(1, Math.round(rawSteps)) : Math.min(-1, Math.round(rawSteps));
    }

    function activateCarouselDrag() {
      if (dragActive || dragPointerId === null) return;

      dragTrackWidth = carouselTrack.getBoundingClientRect().width || 1;
      const currentTranslatePx = getCurrentTranslateXPx();
      dragStartTranslate = dragTrackWidth
        ? (-currentTranslatePx / dragTrackWidth) * 100
        : getSlideTranslatePercent(internalIndex);

      dragActive = true;
      carouselViewport.classList.add('is-dragging');
      stopAutoplay();
      applyTrackTransform(dragStartTranslate, 0, false);

      try {
        carouselViewport.setPointerCapture(dragPointerId);
      } catch { /* noop */ }
    }

    function finishCarouselDrag(commitSlide) {
      const wasDragging = dragActive;

      if (dragPointerId !== null) {
        try {
          if (carouselViewport.hasPointerCapture(dragPointerId)) {
            carouselViewport.releasePointerCapture(dragPointerId);
          }
        } catch { /* noop */ }
      }

      carouselViewport.classList.remove('is-dragging');
      dragActive = false;

      if (!wasDragging) {
        dragPointerId = null;
        dragOffsetPercent = 0;
        return;
      }

      const targetIndex = commitSlide
        ? normalizeCarouselIndex(dragStartIndex + getDragStepDelta())
        : normalizeCarouselIndex(dragStartIndex);

      suppressNextCarouselClick = commitSlide;
      goToSlide(targetIndex, true);
      dragPointerId = null;
      dragOffsetPercent = 0;

      if (realCount > 1) startAutoplay(carouselAutoplaySeconds);
    }

    carouselViewport.addEventListener('pointerdown', function(event) {
      if (realCount <= 1) return;
      if (event.button !== undefined && event.button !== 0) return;
      if (dragPointerId !== null) return;

      suppressNextCarouselClick = false;
      dragPointerId = event.pointerId;
      dragStartX = event.clientX;
      dragStartY = event.clientY;
      dragStartIndex = internalIndex;
      dragOffsetPercent = 0;
      dragActive = false;
    });

    carouselViewport.addEventListener('pointermove', function(event) {
      if (dragPointerId !== event.pointerId) return;

      const deltaX = event.clientX - dragStartX;
      const deltaY = event.clientY - dragStartY;

      if (!dragActive) {
        if (Math.abs(deltaX) < DRAG_ACTIVATION_PX && Math.abs(deltaY) < DRAG_ACTIVATION_PX) {
          return;
        }

        if (Math.abs(deltaY) > Math.abs(deltaX)) {
          dragPointerId = null;
          return;
        }

        activateCarouselDrag();
      }

      dragOffsetPercent = dragTrackWidth ? (deltaX / dragTrackWidth) * 100 : 0;
      applyTrackTransform(dragStartTranslate, dragOffsetPercent, false);
      event.preventDefault();
    });

    carouselViewport.addEventListener('pointerup', function(event) {
      if (dragPointerId !== event.pointerId) return;

      if (dragActive) {
        finishCarouselDrag(true);
      } else {
        dragPointerId = null;
        dragOffsetPercent = 0;
      }
    });

    carouselViewport.addEventListener('pointercancel', function(event) {
      if (dragPointerId !== event.pointerId) return;

      if (dragActive) {
        finishCarouselDrag(true);
      } else {
        dragPointerId = null;
        dragOffsetPercent = 0;
      }
    });

    carouselViewport.addEventListener('click', function(event) {
      if (!suppressNextCarouselClick) return;
      event.preventDefault();
      event.stopPropagation();
      suppressNextCarouselClick = false;
    }, true);

    function startAutoplay(seconds) {
      stopAutoplay();
      autoplayTimer = setInterval(function() {
        goToSlide(internalIndex + 1);
      }, seconds * 1000);
    }
    function stopAutoplay() {
      if (autoplayTimer) { clearInterval(autoplayTimer); autoplayTimer = null; }
    }

    function renderCarousel(settings) {
      const urls = settings.image_urls || [];
      if (!urls.length) return;

      const height      = Math.min(Math.max(Number(settings.widget_height)   || 230, 140), 520);
      const visible     = Math.min(Math.max(Number(settings.visible_items)   || 2,     1),   4);
      const autoplaySec = Math.min(Math.max(Number(settings.autoplay_seconds)|| 4,     1),  12);

      carouselAutoplaySeconds = autoplaySec;

      carouselFraction = urls.length > 1
        ? Math.min(Math.max(1 / visible, 0.28), 1)
        : 1;
      carouselEnlarge = urls.length > 1;
      realCount = urls.length;

      const viewport = carouselWrapper.querySelector('.carousel-viewport');
      viewport.style.height = height + 'px';

      /* Track = [cloni] [reali] [cloni]  —  3 copie per loop infinito.
         La sezione "reale" va da indice realCount a 2*realCount-1.       */
      const allUrls = urls.length > 1 ? [...urls, ...urls, ...urls] : urls;

      carouselTrack.innerHTML = '';
      allUrls.forEach(function(url) {
        const slide = document.createElement('div');
        slide.className = 'carousel-slide';
        slide.style.flex   = '0 0 ' + (carouselFraction * 100) + '%';
        slide.style.width  = (carouselFraction * 100) + '%';
        slide.style.height = height + 'px';

        const img = document.createElement('img');
        img.src = url;
        img.alt = 'Immagine carosello';
        img.draggable = false;
        img.addEventListener('dragstart', function(event) { event.preventDefault(); });
        img.addEventListener('click', function() { openLightbox(url); });
        img.onerror = function() { this.alt = 'Immagine non disponibile'; };

        slide.appendChild(img);
        carouselTrack.appendChild(slide);
      });

      placeholder.style.display = 'none';
      carouselWrapper.style.display = 'block';

      /* Partenza dalla foto centrale (sezione reale).
         Es. 5 foto → indice reale 2 → indice interno realCount + 2. */
      var startReal = Math.floor(realCount / 2);
      var startIdx  = urls.length > 1 ? realCount + startReal : 0;
      goToSlide(startIdx, false);

      if (urls.length > 1) startAutoplay(autoplaySec);
    }

    /* ======== Instagram ======== */
    function setupInstagram(url) {
      if (!url || !url.trim()) return;
      const btn = document.getElementById('instagramBtn');
      btn.disabled = false;
      btn.addEventListener('click', () => window.open(url.trim(), '_blank'));
    }

    /* ======== Caricamento da Supabase ======== */
    (async function init() {
      await loadThemeAndReady();

      // 2. Instagram
      const instagramUrl = await getAppSetting(SETTING_INSTAGRAM_URL);
      setupInstagram(instagramUrl);

      // 3. Carosello
      const carouselRaw = await getAppSetting(SETTING_CAROUSEL_CONFIG);
      if (carouselRaw) {
        try {
          const settings = JSON.parse(carouselRaw);
          renderCarousel(settings);
        } catch { /* json non valido, resta il placeholder */ }
      }
    })();
  

