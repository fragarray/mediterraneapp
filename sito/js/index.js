
    /* ======== Lightbox ======== */
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightboxImg');
    const { openLightbox, loadThemeAndReady } = CodexUi;

    lightbox.addEventListener('click', () => lightbox.classList.remove('active'));

    /* ======== Carousel ======== */
    const carouselWrapper = document.getElementById('carouselWrapper');
    const carouselTrack   = document.getElementById('carouselTrack');
    const placeholder     = document.getElementById('carouselPlaceholder');

    let realCount = 0;        // numero slide reali (senza cloni)
    let internalIndex = 0;    // posizione nel track completo (cloni inclusi)
    let autoplayTimer = null;
    let carouselFraction = 1;
    let carouselEnlarge = true;
    const ENLARGE_FACTOR = 0.34;

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

    /* Sposta il track alla slide indicata.
       animate=false => salto istantaneo (usato dopo transitionend per ricentrare). */
    function goToSlide(idx, animate) {
      if (animate === undefined) animate = true;
      internalIndex = idx;

      if (!animate) {
        carouselTrack.style.transition = 'none';
      }

      const slideW   = carouselFraction * 100;
      const padOffset = (100 - slideW) / 2;
      const tx = internalIndex * slideW - padOffset;
      carouselTrack.style.transform = 'translateX(' + (-tx) + '%)';
      updateSlideScales();

      if (!animate) {
        // forza reflow, poi ripristina la transizione CSS
        void carouselTrack.offsetHeight;
        carouselTrack.style.transition = '';
      }
    }

    /* Dopo la transizione, se siamo su un clone saltiamo
       silenziosamente alla slide reale equivalente. */
    carouselTrack.addEventListener('transitionend', function() {
      if (internalIndex < realCount) {
        goToSlide(internalIndex + realCount, false);
      } else if (internalIndex >= 2 * realCount) {
        goToSlide(internalIndex - realCount, false);
      }
    });

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
  

