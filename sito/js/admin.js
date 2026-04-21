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
      const overlayCloseBtn = document.getElementById('historyFrameCloseBtn');
      const titleEl  = document.getElementById('historyFrameTitle');

      if (!calBtn || !picker || !overlay || !iframe || !overlayCloseBtn || !titleEl) return;

      const isEmbedded = window !== window.top;

      calBtn.addEventListener('click', () => {
        if (isEmbedded) {
          const r = calBtn.getBoundingClientRect();
          window.parent.postMessage({
            type: 'admin-open-history-picker',
            rect: { top: r.top, left: r.left, width: r.width, height: r.height },
          }, '*');
        } else {
          try { picker.showPicker?.(); } catch (_) { picker.click(); }
        }
      });

      calBtn.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        calBtn.click();
      });

      function openHistoryByDate(isoDate) {
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
      }

      picker.addEventListener('change', () => {
        if (isEmbedded) return; // shell handles date selection when embedded
        const isoDate = picker.value;
        openHistoryByDate(isoDate);
        picker.value = '';
      });

      window.addEventListener('message', event => {
        const data = event.data || {};
        if (data.type === 'admin-history-date-selected' && data.isoDate) {
          openHistoryByDate(data.isoDate);
        }
      });

      overlayCloseBtn.addEventListener('click', () => {
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
      const dashboardTab = document.getElementById('tabDashboard');
      const settingsTab = document.getElementById('tabSettings');
      if (name === 'settings' && !settingsTab) {
        window.location.href = 'admin-shell.html?view=settings';
        return;
      }
      if (!dashboardTab && !settingsTab) return;
      document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === name);
      });
      if (dashboardTab) dashboardTab.style.display = name === 'dashboard' ? '' : 'none';
      if (settingsTab) {
        settingsTab.style.display = name === 'settings' ? '' : 'none';
        if (name === 'settings' && typeof loadSettingsValues === 'function') loadSettingsValues();
      }
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

    const limitEditBtn = document.getElementById('limitEditBtn');
    if (limitEditBtn) {
      limitEditBtn.addEventListener('click', function() {
        const opts = document.getElementById('limitOptions');
        opts.classList.toggle('active');
      });
    }

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
    const editDataNascitaInput = document.getElementById('editDataNascita');
    if (editDataNascitaInput) {
      editDataNascitaInput.addEventListener('input', function() {
        let digits = this.value.replace(/\D/g, '').slice(0, 8);
        let formatted = '';
        for (let i = 0; i < digits.length; i++) {
          formatted += digits[i];
          if ((i === 1 || i === 3) && i !== digits.length - 1) formatted += '/';
        }
        this.value = formatted;
      });
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

      if (document.getElementById('tabDashboard')) {
        // Fetch initial data + subscribe realtime
        loadDashboardData();
        initRealtime();
      } else {
        if (typeof loadSettingsValues === 'function') loadSettingsValues();
      }
    }

    async function handleSignOut() {
      await signOutAdmin();
      // Stop realtime channel
      if (_rtChannel) { await supabase.removeChannel(_rtChannel).catch(() => {}); _rtChannel = null; }
      if (typeof _previewTimer !== 'undefined' && _previewTimer) {
        clearInterval(_previewTimer);
        _previewTimer = null;
      }
      window.location.href = 'admin-shell.html?view=dashboard';
    }

    /* ===========================================================
       Init
    =========================================================== */
    (async function init() {
      await loadThemeAndReady({
        onError: err => console.error('[admin] init color error:', err),
        beforeReady: async () => {
          if (!document.getElementById('tabDashboard')) return;
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
  




