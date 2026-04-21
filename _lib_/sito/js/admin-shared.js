window.AdminShared = (() => {
  const {
    showSnackbar: baseShowSnackbar,
    loadThemeAndReady,
    escHtml,
    escJs,
    fmtDate,
    fmtBirth,
    birthToInput,
    residenceLabel,
    birthPlaceAndDateLabel,
  } = CodexUi;

  let confirmResolver = null;

  function showSnackbar(message, isError = false, snackbarId = 'snackbar') {
    baseShowSnackbar(message, isError, { id: snackbarId, duration: 4500 });
  }

  function showConfirm(title, text, okLabel, options = {}) {
    const ids = {
      overlay: options.overlayId || 'confirmOverlay',
      title: options.titleId || 'confirmTitle',
      text: options.textId || 'confirmText',
      ok: options.okId || 'confirmOkBtn',
    };
    const overlay = document.getElementById(ids.overlay);
    const titleEl = document.getElementById(ids.title);
    const textEl = document.getElementById(ids.text);
    const okEl = document.getElementById(ids.ok);
    if (!overlay || !titleEl || !textEl || !okEl) {
      return Promise.resolve(false);
    }
    titleEl.textContent = title;
    textEl.textContent = text;
    okEl.textContent = okLabel || 'Conferma';
    overlay.classList.add('active');
    return new Promise(resolve => {
      confirmResolver = value => {
        overlay.classList.remove('active');
        resolve(value);
      };
    });
  }

  function confirmResolve(value) {
    if (confirmResolver) {
      const resolver = confirmResolver;
      confirmResolver = null;
      resolver(value);
    }
  }

  function fmtBirthLabel(member) {
    const place = String(member?.luogo_nascita || '').trim();
    const date = fmtBirth(member?.data_nascita);
    if (!place && date === '–') return '–';
    if (!place) return date;
    if (date === '–') return place;
    return `${place} · ${date}`;
  }

  function createRecordCache() {
    const store = {};
    return {
      cacheRecord(record) {
        store[record.id] = record;
      },
      getRecord(id) {
        return store[id];
      },
    };
  }

  function sortRows(rows, key, asc) {
    return [...rows].sort((a, b) => {
      let va = a[key];
      let vb = b[key];
      if (key === 'numero_tessera') {
        va = parseInt(va, 10) || 0;
        vb = parseInt(vb, 10) || 0;
      } else if (key === 'created_at' || key === 'data_nascita') {
        va = va || '';
        vb = vb || '';
      } else {
        va = String(va || '').toLowerCase();
        vb = String(vb || '').toLowerCase();
      }
      if (va < vb) return asc ? -1 : 1;
      if (va > vb) return asc ? 1 : -1;
      return 0;
    });
  }

  async function runConfirmedMutation(options = {}) {
    const {
      title,
      text,
      okLabel,
      mutate,
      successMessage,
      errorMessage,
      beforeRun,
      afterRun,
    } = options;

    const ok = await showConfirm(title, text, okLabel);
    if (!ok) return null;

    try {
      if (beforeRun) {
        await beforeRun();
      }
      const result = await mutate();
      if (successMessage) {
        const message = typeof successMessage === 'function' ? successMessage(result) : successMessage;
        showSnackbar(message);
      }
      return result;
    } catch (error) {
      const message = typeof errorMessage === 'function'
        ? errorMessage(error)
        : (errorMessage || error?.message || 'Operazione fallita.');
      showSnackbar(message, true);
      return null;
    } finally {
      if (afterRun) {
        await afterRun();
      }
    }
  }

  function saveColWidths(tableSelector, store) {
    const ths = document.querySelectorAll(`${tableSelector} thead th`);
    ths.forEach((th, i) => {
      store[i] = th.style.width;
    });
  }

  function restoreColWidths(tableSelector, store) {
    const ths = document.querySelectorAll(`${tableSelector} thead th`);
    ths.forEach((th, i) => {
      if (store[i]) th.style.width = store[i];
    });
  }

  function initResizeHandles(tableSelector, store, setResizing) {
    const table = document.querySelector(tableSelector);
    if (!table) return;
    restoreColWidths(tableSelector, store);
    table.querySelectorAll('.resize-handle').forEach(handle => {
      handle.addEventListener('mousedown', function (e) {
        e.preventDefault();
        e.stopPropagation();
        setResizing(true);
        const th = this.parentElement;
        const allThs = Array.from(th.closest('tr').children);
        const idx = allThs.indexOf(th);
        const rightThs = allThs.slice(idx + 1);
        const startX = e.clientX;
        const startW = th.offsetWidth;
        const rightStartWidths = rightThs.map(t => t.offsetWidth);
        const totalStart = allThs.reduce((s, t) => s + t.offsetWidth, 0);
        const containerW = table.parentElement.clientWidth;
        const min = 40;
        this.classList.add('active');

        const onMove = ev => {
          const delta = ev.clientX - startX;
          const newW = Math.max(min, startW + delta);
          const growth = newW - startW;
          const freeSpace = containerW - totalStart;
          const overflow = Math.max(0, growth - Math.max(0, freeSpace));
          let remaining = overflow;
          const rightNewWidths = rightStartWidths.map(w => w);

          if (remaining > 0 && rightThs.length > 0) {
            const shrinkable = rightNewWidths.reduce((s, w) => s + Math.max(0, w - min), 0);
            if (shrinkable > 0) {
              for (let i = 0; i < rightNewWidths.length; i++) {
                const avail = Math.max(0, rightNewWidths[i] - min);
                const share = (avail / shrinkable) * remaining;
                rightNewWidths[i] = Math.max(min, rightNewWidths[i] - share);
              }
            }
          }

          const actualShrink = rightStartWidths.reduce((s, w, i) => s + (w - rightNewWidths[i]), 0);
          const cappedW = Math.max(min, startW + Math.max(0, freeSpace) + actualShrink);
          th.style.width = `${Math.min(newW, cappedW)}px`;
          rightThs.forEach((cell, i) => {
            cell.style.width = `${rightNewWidths[i]}px`;
          });
        };

        const onUp = () => {
          this.classList.remove('active');
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          saveColWidths(tableSelector, store);
          setTimeout(() => setResizing(false), 0);
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    });
  }

  return {
    showSnackbar,
    showConfirm,
    confirmResolve,
    escHtml,
    escJs,
    fmtDate,
    fmtBirth,
    birthToInput,
    residenceLabel,
    birthPlaceAndDateLabel,
    fmtBirthLabel,
    createRecordCache,
    sortRows,
    loadThemeAndReady,
    runConfirmedMutation,
    saveColWidths,
    restoreColWidths,
    initResizeHandles,
  };
})();
