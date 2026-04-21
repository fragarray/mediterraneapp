    const {
      showSnackbar,
      confirmResolve,
      loadThemeAndReady,
      runConfirmedMutation,
      escHtml,
      escJs,
      fmtDate,
      fmtBirth,
      birthToInput,
      residenceLabel,
      birthPlaceAndDateLabel,
      createRecordCache,
      sortRows: _sortRows,
      initResizeHandles,
    } = AdminShared;
    window.confirmResolve = confirmResolve;

    /* ===========================================================
       History date viewer
    =========================================================== */
    (function initHistoryViewer() {
      const calBtn   = document.getElementById('btnHistoryDate');
      const picker   = document.getElementById('historyDatePicker');
      const overlay  = document.getElementById('historyOverlay');
      const iframe   = document.getElementById('historyIframe');
      const closeBtn = document.getElementById('historyCloseBtn');
      const titleEl  = document.getElementById('historyFrameTitle');

      calBtn.addEventListener('click', () => picker.showPicker());

      picker.addEventListener('change', () => {
        const isoDate = picker.value;
        if (!isoDate) return;
        const [y, m, d] = isoDate.split('-');
        const label = `${d}/${m}/${y}`;

        const historyUrl = `admin-storico.html?data=${encodeURIComponent(isoDate)}`;

        // Keep the history view in the same authenticated browsing context.
        if (overlay && iframe && titleEl) {
          titleEl.textContent = `Approvati il ${label}`;
          iframe.src = historyUrl;
          overlay.classList.add('active');
          return;
        }

        window.open(historyUrl, '_blank', 'noopener');
      });

      closeBtn.addEventListener('click', () => {
        overlay.classList.remove('active');
        iframe.src = 'about:blank';
      });

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.classList.remove('active');
          iframe.src = 'about:blank';
        }
      });
    })();

    /* ===========================================================
       Tab switching
    =========================================================== */
    function switchTab(name) {
      document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === name);
      });
      document.getElementById('tabDashboard').style.display = name === 'dashboard' ? '' : 'none';
      document.getElementById('tabSettings').style.display  = name === 'settings'  ? '' : 'none';
      if (name === 'settings') loadSettingsValues();
    }

    /* ===========================================================
       Data state
    =========================================================== */
    let _pendingMembers  = [];
    let _approvedMembers = [];
    let _legacyPending   = [];
    let _approvedTodayCount = 0;
    let _approvedYesterdayCount = 0;
    let _approvedLimit = 30;

    /* ===========================================================
       Realtime
    =========================================================== */
    let _rtChannel  = null;
    let _localActionInProgress = false;

    function runAdminMutation(options) {
      return runConfirmedMutation({
        ...options,
        beforeRun: async () => {
          _localActionInProgress = true;
          if (options.beforeRun) await options.beforeRun();
        },
        afterRun: async () => {
          _localActionInProgress = false;
          if (options.afterRun) await options.afterRun();
        },
      });
    }

    function initRealtime() {
      _subscribeRealtime();
    }

    function _subscribeRealtime() {
      _rtChannel = supabase
        .channel('admin-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'soci' }, () => { if (!_localActionInProgress) loadDashboardData(); })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'legacy_membership_requests' }, () => { if (!_localActionInProgress) loadDashboardData(); })
        .subscribe(status => {
          const dot = document.getElementById('rtDot');
          dot.classList.toggle('connected', status === 'SUBSCRIBED');
        });
    }

    /* ===========================================================
       Load dashboard data
    =========================================================== */
    async function loadDashboardData() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yISO = yesterday.getFullYear() + '-' + String(yesterday.getMonth() + 1).padStart(2, '0') + '-' + String(yesterday.getDate()).padStart(2, '0');
      try {
        const [pending, approved, legacy, approvedToday, approvedYesterday] = await Promise.all([
          fetchPendingMembers(),
          fetchApprovedMembers(_approvedLimit),
          fetchPendingLegacyRequests(),
          fetchApprovedTodayCount(),
          fetchApprovedByDateCount(yISO),
        ]);
        _pendingMembers  = pending;
        _approvedMembers = approved;
        _legacyPending   = legacy;
        _approvedTodayCount = approvedToday;
        _approvedYesterdayCount = approvedYesterday;
        renderStats();
        renderPendingTable();
        renderLegacyTable();
        renderApprovedTable();
        updateLimitUI();
      } catch (e) {
        showSnackbar(e.message || 'Errore caricamento dati.', true);
      }
    }

    /* ===========================================================
       Approved limit picker
    =========================================================== */
    function updateLimitUI() {
      document.getElementById('approvedLimitLabel').textContent = _approvedLimit;
      const btns = document.querySelectorAll('#limitOptions button');
      btns.forEach(b => b.classList.toggle('active', Number(b.textContent) === _approvedLimit));
    }

    document.getElementById('limitEditBtn').addEventListener('click', function() {
      const opts = document.getElementById('limitOptions');
      opts.classList.toggle('active');
    });

    async function setApprovedLimit(n) {
      _approvedLimit = n;
      document.getElementById('limitOptions').classList.remove('active');
      updateLimitUI();
      try {
        await saveAppSetting(SETTING_APPROVED_LIMIT, String(n));
      } catch(e) { /* ignore save error, UI already updated */ }
      loadDashboardData();
    }

    /* ===========================================================
       Stats
    =========================================================== */
    function renderStats() {
      document.getElementById('statPending').textContent  = _pendingMembers.length;
      document.getElementById('statApproved').textContent = _approvedTodayCount;
      document.getElementById('statLegacy').textContent   = _legacyPending.length;
      document.getElementById('statYesterday').textContent = _approvedYesterdayCount;

      // Yesterday date label
      const y = new Date();
      y.setDate(y.getDate() - 1);
      document.getElementById('statYesterdayDate').textContent = y.toLocaleDateString('it-IT', { day:'2-digit', month:'2-digit', year:'numeric' });

      // Last membership number among approved (max of numero_tessera as int)
      let lastNum = null;
      for (const m of _approvedMembers) {
        const n = parseInt(m.numero_tessera, 10);
        if (!isNaN(n) && (lastNum === null || n > lastNum)) lastNum = n;
      }
      document.getElementById('statLastNumber').textContent = lastNum !== null ? lastNum : '–';
    }

    /* ===========================================================
       Tables
    =========================================================== */
    const _memberCache = createRecordCache();
    function cacheMember(m) { _memberCache.cacheRecord(m); }
    function getCached(id) { return _memberCache.getRecord(id); }
    window.getCached = getCached;

    /* ---- Sorting state (per table) ---- */
    let _sortPendingKey = 'created_at', _sortPendingAsc = false;
    let _sortApprovedKey = 'numero_tessera', _sortApprovedAsc = false;
    let _sortLegacyKey = 'created_at', _sortLegacyAsc = false;
    let _resizing = false;
    let _colWidthsPending = {};
    let _colWidthsApproved = {};
    let _colWidthsLegacy = {};

    function sortByPending(key) {
      if (_resizing) return;
      if (_sortPendingKey === key) { _sortPendingAsc = !_sortPendingAsc; }
      else { _sortPendingKey = key; _sortPendingAsc = true; }
      renderPendingTable();
    }
    function sortByApproved(key) {
      if (_resizing) return;
      if (_sortApprovedKey === key) { _sortApprovedAsc = !_sortApprovedAsc; }
      else { _sortApprovedKey = key; _sortApprovedAsc = true; }
      renderApprovedTable();
    }
    function sortByLegacy(key) {
      if (_resizing) return;
      if (_sortLegacyKey === key) { _sortLegacyAsc = !_sortLegacyAsc; }
      else { _sortLegacyKey = key; _sortLegacyAsc = true; }
      renderLegacyTable();
    }

    function sortIconPending(key) {
      if (_sortPendingKey !== key) return '';
      return `<span class="sort-icon material-icons-outlined">${_sortPendingAsc ? 'arrow_upward' : 'arrow_downward'}</span>`;
    }
    function sortIconApproved(key) {
      if (_sortApprovedKey !== key) return '';
      return `<span class="sort-icon material-icons-outlined">${_sortApprovedAsc ? 'arrow_upward' : 'arrow_downward'}</span>`;
    }
    function sortIconLegacy(key) {
      if (_sortLegacyKey !== key) return '';
      return `<span class="sort-icon material-icons-outlined">${_sortLegacyAsc ? 'arrow_upward' : 'arrow_downward'}</span>`;
    }

    // --- Pending members ---
    function renderPendingTable() {
      const wrap = document.getElementById('pendingTableWrap');
      if (!_pendingMembers.length) {
        wrap.innerHTML = '<div class="empty-state">Nessuna richiesta pending.</div>';
        return;
      }

      const sorted = _sortRows(_pendingMembers, _sortPendingKey, _sortPendingAsc);
      wrap.innerHTML = `
        <table id="pendingTable">
          <thead><tr>
            <th onclick="sortByPending('numero_tessera')" style="width:6%">Tessera ${sortIconPending('numero_tessera')}<div class="resize-handle"></div></th>
            <th onclick="sortByPending('cognome')" style="width:16%">Nome ${sortIconPending('cognome')}<div class="resize-handle"></div></th>
            <th onclick="sortByPending('data_nascita')" style="width:14%">Nascita ${sortIconPending('data_nascita')}<div class="resize-handle"></div></th>
            <th onclick="sortByPending('comune')" style="width:14%">Residenza ${sortIconPending('comune')}<div class="resize-handle"></div></th>
            <th onclick="sortByPending('email')" style="width:18%">Email ${sortIconPending('email')}<div class="resize-handle"></div></th>
            <th style="width:10%">Telefono<div class="resize-handle"></div></th>
            <th onclick="sortByPending('created_at')" style="width:8%">Data ${sortIconPending('created_at')}<div class="resize-handle"></div></th>
            <th style="width:14%">Azioni</th>
          </tr></thead>
          <tbody id="pendingTbody"></tbody>
        </table>`;
      initResizeHandles('#pendingTable', _colWidthsPending, value => { _resizing = value; });
      const tbody = document.getElementById('pendingTbody');
      sorted.forEach(m => {
        cacheMember(m);
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>–</td>
          <td title="${escHtml(m.nome+' '+m.cognome)}">${escHtml(m.nome)} ${escHtml(m.cognome)}</td>
          <td>${escHtml(birthPlaceAndDateLabel(m))}</td>
          <td title="${escHtml(residenceLabel(m))}">${escHtml(residenceLabel(m))}</td>
          <td title="${escHtml(m.email)}">${escHtml(m.email)}</td>
          <td>${escHtml(m.telefono)}</td>
          <td>${fmtDate(m.created_at)}</td>
          <td style="white-space:nowrap;">
            <button class="action-btn" title="Genera PDF" onclick="exportMemberPdf(getCached('${escJs(m.id)}'))">
              <span class="material-icons-outlined">picture_as_pdf</span>
            </button>
            <button class="action-btn danger" title="Archivia" onclick="handleDeleteMember('${escJs(m.id)}','${escJs(m.nome+' '+m.cognome)}')">
              <span class="material-icons-outlined">delete</span>
            </button>
            <button class="action-btn" title="Approva" onclick="handleApproveMember('${escJs(m.id)}','${escJs(m.nome+' '+m.cognome)}')">
              <span class="material-icons-outlined">check_circle</span>
            </button>
            <button class="action-btn danger" title="Rifiuta" onclick="handleRejectMember('${escJs(m.id)}','${escJs(m.nome+' '+m.cognome)}')">
              <span class="material-icons-outlined">close</span>
            </button>
          </td>`;
        tbody.appendChild(tr);
      });
    }

    // --- Legacy requests ---
    function renderLegacyTable() {
      const wrap = document.getElementById('legacyTableWrap');
      if (!_legacyPending.length) {
        wrap.innerHTML = '<div class="empty-state">Nessuna richiesta di digitalizzazione in sospeso.</div>';
        return;
      }
      const sorted = _sortRows(_legacyPending, _sortLegacyKey, _sortLegacyAsc);
      wrap.innerHTML = `
        <table id="legacyTable">
          <thead><tr>
            <th onclick="sortByLegacy('numero_tessera')" style="width:6%">Tessera ${sortIconLegacy('numero_tessera')}<div class="resize-handle"></div></th>
            <th onclick="sortByLegacy('cognome')" style="width:16%">Nome ${sortIconLegacy('cognome')}<div class="resize-handle"></div></th>
            <th onclick="sortByLegacy('data_nascita')" style="width:14%">Nascita ${sortIconLegacy('data_nascita')}<div class="resize-handle"></div></th>
            <th onclick="sortByLegacy('comune')" style="width:14%">Residenza ${sortIconLegacy('comune')}<div class="resize-handle"></div></th>
            <th onclick="sortByLegacy('email')" style="width:18%">Email ${sortIconLegacy('email')}<div class="resize-handle"></div></th>
            <th style="width:10%">Telefono<div class="resize-handle"></div></th>
            <th onclick="sortByLegacy('created_at')" style="width:8%">Data ${sortIconLegacy('created_at')}<div class="resize-handle"></div></th>
            <th style="width:14%">Azioni</th>
          </tr></thead>
          <tbody id="legacyTbody"></tbody>
        </table>`;
      initResizeHandles('#legacyTable', _colWidthsLegacy, value => { _resizing = value; });
      const tbody = document.getElementById('legacyTbody');
      sorted.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${escHtml(r.numero_tessera||'–')}</strong></td>
          <td title="${escHtml(r.nome+' '+r.cognome)}">${escHtml(r.nome)} ${escHtml(r.cognome)}</td>
          <td>${escHtml(birthPlaceAndDateLabel(r))}</td>
          <td title="${escHtml(residenceLabel(r))}">${escHtml(residenceLabel(r))}</td>
          <td title="${escHtml(r.email)}">${escHtml(r.email)}</td>
          <td>${escHtml(r.telefono)}</td>
          <td>${fmtDate(r.created_at)}</td>
          <td style="white-space:nowrap;">
            <button class="action-btn" title="Approva" onclick="handleApproveLegacy('${escJs(r.id)}','${escJs(r.nome+' '+r.cognome)}','${escJs(r.numero_tessera)}')">
              <span class="material-icons-outlined">check_circle</span>
            </button>
            <button class="action-btn danger" title="Rifiuta" onclick="handleRejectLegacy('${escJs(r.id)}','${escJs(r.nome+' '+r.cognome)}')">
              <span class="material-icons-outlined">close</span>
            </button>
          </td>`;
        tbody.appendChild(tr);
      });
    }

    // --- Approved (last 30) ---
    function renderApprovedTable() {
      const wrap = document.getElementById('approvedTableWrap');
      if (!_approvedMembers.length) {
        wrap.innerHTML = '<div class="empty-state">Nessun socio approvato.</div>';
        return;
      }
      const sorted = _sortRows(_approvedMembers, _sortApprovedKey, _sortApprovedAsc);
      wrap.innerHTML = `
        <table id="approvedTable">
          <thead><tr>
            <th onclick="sortByApproved('numero_tessera')" style="width:6%">Tessera ${sortIconApproved('numero_tessera')}<div class="resize-handle"></div></th>
            <th onclick="sortByApproved('cognome')" style="width:16%">Nome ${sortIconApproved('cognome')}<div class="resize-handle"></div></th>
            <th onclick="sortByApproved('data_nascita')" style="width:14%">Nascita ${sortIconApproved('data_nascita')}<div class="resize-handle"></div></th>
            <th onclick="sortByApproved('comune')" style="width:14%">Residenza ${sortIconApproved('comune')}<div class="resize-handle"></div></th>
            <th onclick="sortByApproved('email')" style="width:18%">Email ${sortIconApproved('email')}<div class="resize-handle"></div></th>
            <th style="width:10%">Telefono<div class="resize-handle"></div></th>
            <th onclick="sortByApproved('created_at')" style="width:8%">Data ${sortIconApproved('created_at')}<div class="resize-handle"></div></th>
            <th style="width:14%">Azioni</th>
          </tr></thead>
          <tbody id="approvedTbody"></tbody>
        </table>`;
      initResizeHandles('#approvedTable', _colWidthsApproved, value => { _resizing = value; });
      const tbody = document.getElementById('approvedTbody');
      sorted.forEach(m => {
        cacheMember(m);
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${escHtml(m.numero_tessera||'–')}</strong></td>
          <td title="${escHtml(m.nome+' '+m.cognome)}">${escHtml(m.nome)} ${escHtml(m.cognome)}</td>
          <td>${escHtml(birthPlaceAndDateLabel(m))}</td>
          <td title="${escHtml(residenceLabel(m))}">${escHtml(residenceLabel(m))}</td>
          <td title="${escHtml(m.email)}">${escHtml(m.email)}</td>
          <td>${escHtml(m.telefono)}</td>
          <td>${fmtDate(m.created_at)}</td>
          <td style="white-space:nowrap;">
            <button class="action-btn" title="Modifica" onclick="openEditModal(getCached('${escJs(m.id)}'))">
              <span class="material-icons-outlined">edit</span>
            </button>
            <button class="action-btn" title="Genera PDF" onclick="exportMemberPdf(getCached('${escJs(m.id)}'))">
              <span class="material-icons-outlined">picture_as_pdf</span>
            </button>
            <button class="action-btn danger" title="Archivia" onclick="handleDeleteMember('${escJs(m.id)}','${escJs(m.nome+' '+m.cognome)}')">
              <span class="material-icons-outlined">delete</span>
            </button>
          </td>`;
        tbody.appendChild(tr);
      });
    }

    /* ===========================================================
       Actions: members
    =========================================================== */
    async function handleApproveMember(memberId, fullName) {
      return runAdminMutation({
        title: 'Approva socio',
        text: `Approvare ${fullName}? Verrà assegnato il prossimo numero tessera disponibile.`,
        okLabel: 'Approva',
        mutate: () => approveMember(memberId),
        successMessage: num => `Tessera n° ${num} assegnata a ${fullName}. ✓`,
        onSuccess: loadDashboardData,
      });
    }

    async function handleDeleteMember(memberId, fullName) {
      return runAdminMutation({
        title: 'Archivia socio',
        text: `Archiviare ${fullName}? Il record verrà conservato ma il numero tessera non sarà più riutilizzato.`,
        okLabel: 'Archivia',
        mutate: () => deleteMemberSoft(memberId),
        successMessage: 'Socio archiviato.',
        onSuccess: loadDashboardData,
      });
    }

    async function handleApproveLegacy(requestId, fullName, tesseraNum) {
      return runAdminMutation({
        title: 'Approva richiesta legacy',
        text: `Approvare la richiesta di ${fullName} per la tessera n° ${tesseraNum}?`,
        okLabel: 'Approva',
        mutate: () => approveLegacyRequest(requestId),
        successMessage: num => `Tessera n° ${num} approvata per ${fullName}. ✓`,
        onSuccess: loadDashboardData,
      });
    }

    async function handleRejectLegacy(requestId, fullName) {
      return runAdminMutation({
        title: 'Rifiuta richiesta legacy',
        text: `Rifiutare la richiesta di ${fullName}?`,
        okLabel: 'Rifiuta',
        mutate: () => rejectLegacyRequest(requestId),
        successMessage: 'Richiesta rifiutata.',
        onSuccess: loadDashboardData,
      });
    }

    async function handleRejectMember(memberId, fullName) {
      return runAdminMutation({
        title: 'Rifiuta richiesta',
        text: `Rifiutare la richiesta di ${fullName}?`,
        okLabel: 'Rifiuta',
        mutate: () => updateMember(memberId, { stato: 'rejected' }),
        successMessage: 'Richiesta rifiutata.',
        onSuccess: loadDashboardData,
      });
    }

    /* ===========================================================
       Edit member modal
    =========================================================== */
    function openEditModal(member) {
      document.getElementById('editMemberId').value     = member.id ?? '';
      document.getElementById('editNome').value         = member.nome ?? '';
      document.getElementById('editCognome').value      = member.cognome ?? '';
      document.getElementById('editLuogoNascita').value = member.luogo_nascita ?? '';
      document.getElementById('editDataNascita').value  = birthToInput(member.data_nascita);
      document.getElementById('editResidenza').value    = member.residenza ?? '';
      document.getElementById('editComune').value       = member.comune ?? '';
      document.getElementById('editCap').value          = member.cap ?? '';
      document.getElementById('editEmail').value        = member.email ?? '';
      document.getElementById('editTelefono').value     = member.telefono ?? '';
      document.getElementById('editModal').classList.add('active');
    }
    function closeEditModal() {
      document.getElementById('editModal').classList.remove('active');
    }

    async function submitEditMember() {
      const memberId = document.getElementById('editMemberId').value;
      const dataNascitaRaw = document.getElementById('editDataNascita').value.trim();
      const dataNascitaIso = dataNascitaRaw ? dateToIso(dataNascitaRaw) : null;

      if (dataNascitaRaw && !dataNascitaIso) {
        showSnackbar('Formato data non valido (gg/mm/aaaa).', true);
        return;
      }

      const fields = {
        nome:          document.getElementById('editNome').value.trim(),
        cognome:       document.getElementById('editCognome').value.trim(),
        luogo_nascita: document.getElementById('editLuogoNascita').value.trim(),
        residenza:     document.getElementById('editResidenza').value.trim(),
        comune:        document.getElementById('editComune').value.trim(),
        cap:           document.getElementById('editCap').value.trim(),
        email:         document.getElementById('editEmail').value.trim().toLowerCase(),
        telefono:      document.getElementById('editTelefono').value.trim(),
      };
      if (dataNascitaIso) fields.data_nascita = dataNascitaIso;

      const btn = document.getElementById('editSaveBtn');
      btn.disabled = true;
      _localActionInProgress = true;
      try {
        await updateMember(memberId, fields);
        closeEditModal();
        showSnackbar('Socio aggiornato.');
        await loadDashboardData();
      } catch (e) {
        showSnackbar(e.message || 'Aggiornamento fallito.', true);
      } finally {
        btn.disabled = false;
        _localActionInProgress = false;
      }
    }

    // Date input formatter for edit modal
    document.getElementById('editDataNascita').addEventListener('input', function() {
      let digits = this.value.replace(/\D/g, '').slice(0, 8);
      let formatted = '';
      for (let i = 0; i < digits.length; i++) {
        formatted += digits[i];
        if ((i === 1 || i === 3) && i !== digits.length - 1) formatted += '/';
      }
      this.value = formatted;
    });

    /* ===========================================================
       Settings
    =========================================================== */
    let _selectedColorHex = null;
    let _carouselUrls = [];

    async function loadSettingsValues() {
      try {
        const [start, instagram, colorHex, carouselRaw] = await Promise.all([
          getAppSetting(SETTING_MEMBERSHIP_START),
          getAppSetting(SETTING_INSTAGRAM_URL),
          getAppSetting(SETTING_THEME_COLOR),
          getAppSetting(SETTING_CAROUSEL_CONFIG),
        ]);

        if (start)     document.getElementById('membershipStartInput').value = start;
        if (instagram) document.getElementById('instagramInput').value = instagram;

        if (colorHex) {
          _selectedColorHex = colorHex;
          setColorFromSaved(colorHex);
        }

        if (carouselRaw) {
          try {
            const cfg = JSON.parse(carouselRaw);
            _carouselUrls = cfg.image_urls || [];
            document.getElementById('sliderHeight').value  = cfg.widget_height   || 230;
            document.getElementById('valHeight').textContent = cfg.widget_height  || 230;
            document.getElementById('sliderItems').value   = cfg.visible_items   || 2;
            document.getElementById('valItems').textContent  = cfg.visible_items  || 2;
            document.getElementById('sliderAutoplay').value = cfg.autoplay_seconds || 4;
            document.getElementById('valAutoplay').textContent = cfg.autoplay_seconds || 4;
          } catch (_) {}
        }
        renderCarouselImageList();
        updateCarouselPreview();
      } catch (e) {
        showSnackbar('Errore caricamento impostazioni.', true);
      }
    }

    async function saveMembershipStart() {
      const val = document.getElementById('membershipStartInput').value.trim();
      if (!val || isNaN(parseInt(val, 10)) || parseInt(val, 10) <= 0) {
        showSnackbar('Inserisci un numero valido maggiore di zero.', true); return;
      }
      const btn = document.getElementById('saveMembershipStartBtn');
      btn.disabled = true;
      try {
        await saveAppSetting(SETTING_MEMBERSHIP_START, val);
        showSnackbar('Numero iniziale salvato.');
      } catch (e) {
        showSnackbar(e.message || 'Salvataggio fallito.', true);
      } finally { btn.disabled = false; }
    }

    async function saveInstagram() {
      const val = document.getElementById('instagramInput').value.trim();
      const btn = document.getElementById('saveInstagramBtn');
      btn.disabled = true;
      try {
        await saveAppSetting(SETTING_INSTAGRAM_URL, val);
        showSnackbar('Link Instagram salvato.');
      } catch (e) {
        showSnackbar(e.message || 'Salvataggio fallito.', true);
      } finally { btn.disabled = false; }
    }

    /* ---- Color picker logic ---- */
    let _colorAlpha = 255;

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
      const r = parseInt(hex6.slice(1,3), 16);
      const g = parseInt(hex6.slice(3,5), 16);
      const b = parseInt(hex6.slice(5,7), 16);
      document.getElementById('colorPreviewBar').style.background =
        `rgba(${r},${g},${b},${(_colorAlpha/255).toFixed(2)})`;
      // Build #AARRGGBB for Flutter
      const aa = _colorAlpha.toString(16).padStart(2,'0').toUpperCase();
      _selectedColorHex = '#' + aa + hex6.slice(1).toUpperCase();
      // Highlight matching preset
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
      // Parse #AARRGGBB → alpha + #RRGGBB
      if (!aarrggbb || aarrggbb.length < 9) return;
      const aa = parseInt(aarrggbb.slice(1,3), 16);
      const rgb = '#' + aarrggbb.slice(3);
      _colorAlpha = aa;
      document.getElementById('colorWheel').value = rgb;
      document.getElementById('colorHexInput').value = rgb.toUpperCase();
      document.getElementById('colorAlpha').value = aa;
      document.getElementById('colorAlphaVal').textContent = Math.round(aa / 255 * 100) + '%';
      updateColorPreview();
    }

    async function saveThemeColor() {
      if (!_selectedColorHex) { showSnackbar('Seleziona un colore.', true); return; }
      const btn = document.getElementById('saveColorBtn');
      btn.disabled = true;
      try {
        await saveAppSetting(SETTING_THEME_COLOR, _selectedColorHex);
        applySeedColor(_selectedColorHex);
        showSnackbar('Colore tema salvato.');
      } catch (e) {
        showSnackbar(e.message || 'Salvataggio fallito.', true);
      } finally { btn.disabled = false; }
    }

    /* ---- Carousel image list ---- */
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
          <img src="${escHtml(url)}" alt="" onerror="this.style.background='#ddd'">
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
      // Delete from Supabase storage
      try {
        await deleteCarouselImageByPublicUrl(url);
      } catch (e) {
        console.warn('Eliminazione immagine dallo storage fallita:', e);
      }
    }

    /* ---- Live carousel preview (identical to index.html) ---- */
    let _previewRealCount = 0;
    let _previewIndex = 0;
    let _previewTimer = null;
    let _previewFraction = 1;
    let _previewEnlarge = true;
    const ENLARGE_FACTOR = 0.34;

    function updateSlideScales() {
      const track = document.getElementById('carouselTrack');
      const slides = track.querySelectorAll('.carousel-slide');
      slides.forEach((slide, i) => {
        if (_previewEnlarge && _previewRealCount > 1) {
          const isCenter = i === _previewIndex;
          slide.style.transform = isCenter ? 'scale(1)' : `scale(${1 - ENLARGE_FACTOR})`;
          slide.style.zIndex    = isCenter ? '2' : '1';
        } else {
          slide.style.transform = 'scale(1)';
          slide.style.zIndex    = '1';
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
      const slideW   = _previewFraction * 100;
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

      // Build track: [clones] [real] [clones] for infinite loop
      const allUrls = _carouselUrls.length > 1
        ? [..._carouselUrls, ..._carouselUrls, ..._carouselUrls]
        : _carouselUrls;

      track.innerHTML = '';
      allUrls.forEach(url => {
        const slide = document.createElement('div');
        slide.className = 'carousel-slide';
        slide.style.flex   = '0 0 ' + (_previewFraction * 100) + '%';
        slide.style.width  = (_previewFraction * 100) + '%';
        slide.style.height = height + 'px';
        const img = document.createElement('img');
        img.src = url;
        img.alt = '';
        img.onerror = function() { this.style.background = '#ddd'; };
        slide.appendChild(img);
        track.appendChild(slide);
      });

      // transitionend: loop back silently when on a clone
      track.ontransitionend = function() {
        if (_previewIndex < _previewRealCount) {
          goToPreviewSlide(_previewIndex + _previewRealCount, false);
        } else if (_previewIndex >= 2 * _previewRealCount) {
          goToPreviewSlide(_previewIndex - _previewRealCount, false);
        }
      };

      // Start from center of real section
      const startReal = Math.floor(_previewRealCount / 2);
      const startIdx  = _carouselUrls.length > 1 ? _previewRealCount + startReal : 0;
      goToPreviewSlide(startIdx, false);

      // Autoplay
      if (_carouselUrls.length > 1) {
        _previewTimer = setInterval(() => {
          goToPreviewSlide(_previewIndex + 1);
        }, seconds * 1000);
      }
    }

    async function optimizeCarouselImage(file) {
      const MAX_DIM = 1920;
      const JPEG_QUALITY = 0.82;
      if (file.type === 'image/gif') return file; // preserve animation
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
          showSnackbar(`Upload fallito: ${e.message}`, true);
        }
      }
      input.value = '';
      renderCarouselImageList();
      updateCarouselPreview();
    }

    async function saveCarouselConfig() {
      const config = {
        image_urls:      _carouselUrls,
        widget_height:   parseInt(document.getElementById('sliderHeight').value, 10),
        visible_items:   parseInt(document.getElementById('sliderItems').value, 10),
        autoplay_seconds: parseInt(document.getElementById('sliderAutoplay').value, 10),
      };
      try {
        await saveAppSetting(SETTING_CAROUSEL_CONFIG, JSON.stringify(config));
        showSnackbar('Configurazione carosello salvata.');
      } catch (e) {
        showSnackbar(e.message || 'Salvataggio fallito.', true);
      }
    }

    /* ===========================================================
       Auth flows
    =========================================================== */
    document.getElementById('loginForm').addEventListener('submit', async function(e) {
      e.preventDefault();
      const email    = document.getElementById('loginEmail').value;
      const password = document.getElementById('loginPassword').value;
      const btn = document.getElementById('loginBtn');

      if (!email || !password) {
        if (!email) document.getElementById('loginEmail').closest('.form-group').classList.add('has-error');
        if (!password) document.getElementById('loginPassword').closest('.form-group').classList.add('has-error');
        return;
      }

      btn.disabled = true;
      btn.innerHTML = '<span class="material-icons-outlined spin">sync</span> Accesso…';
      try {
        await signInAdmin(email, password);
        showAuthenticatedUI();
      } catch (e) {
        showSnackbar(e.message || 'Credenziali non valide.', true);
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<span class="material-icons-outlined">lock_open</span> Accedi';
      }
    });

    async function showAuthenticatedUI() {
      document.getElementById('loginView').style.display   = 'none';
      document.getElementById('mainView').style.display    = 'block';
      document.getElementById('signOutBtn').style.display  = 'inline-flex';
      const { data: { session } } = await supabase.auth.getSession();
      const email = session?.user?.email;
      if (email) document.getElementById('appbarUser').textContent = email;

      // Fetch initial data + subscribe realtime
      loadDashboardData();
      initRealtime();
    }

    async function handleSignOut() {
      await signOutAdmin();
      // Stop realtime channel
      if (_rtChannel) { await supabase.removeChannel(_rtChannel).catch(() => {}); _rtChannel = null; }
      document.getElementById('mainView').style.display   = 'none';
      document.getElementById('loginView').style.display  = 'flex';
      document.getElementById('signOutBtn').style.display = 'none';
      document.getElementById('appbarUser').textContent   = '';
      document.getElementById('rtDot').classList.remove('connected');
    }

    /* ===========================================================
       Init
    =========================================================== */
    (async function init() {
      await loadThemeAndReady({
        onError: err => console.error('[admin] init color error:', err),
        beforeReady: async () => {
          try {
            const savedLimit = await getAppSetting(SETTING_APPROVED_LIMIT);
            if (savedLimit && [30, 60, 100].includes(Number(savedLimit))) {
              _approvedLimit = Number(savedLimit);
              updateLimitUI();
            }
          } catch (err) {
            console.error('[admin] init limit error:', err);
          }
        },
      });

      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        showAuthenticatedUI();
      }
    })();
  




