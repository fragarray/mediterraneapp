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
      fmtBirthLabel,
      residenceLabel,
      createRecordCache,
      sortRows: _sortRows,
      initResizeHandles,
    } = AdminShared;
    window.confirmResolve = confirmResolve;

    /* ===========================================================
       Data state
    =========================================================== */
    let _filtered     = [];   // risultati della pagina corrente
    let _sortKey      = 'created_at';
    let _sortAsc      = false;
    let _currentPage  = 0;
    let _totalCount   = 0;
    const _PAGE_SIZE  = 50;

    /* ===========================================================
       Load
    =========================================================== */
    async function loadAllMembers() {
      _currentPage = 0;
      await _fetchPage();
    }

    function _buildFilters() {
      return {
        general:      document.getElementById('fGeneral').value.trim(),
        nome:         document.getElementById('fNome').value.trim(),
        cognome:      document.getElementById('fCognome').value.trim(),
        luogoNascita: document.getElementById('fLuogo').value.trim(),
        dataNascita:  document.getElementById('fDataNascita').value.trim(),
        residenza:    document.getElementById('fResidenza').value.trim(),
        comune:       document.getElementById('fComune').value.trim(),
        cap:          document.getElementById('fCap').value.trim(),
        email:        document.getElementById('fEmail').value.trim(),
        telefono:     document.getElementById('fTelefono').value.trim(),
        stato:        document.getElementById('fStato').value,
        dateFrom:     document.getElementById('fDateFrom').value,
        dateTo:       document.getElementById('fDateTo').value,
      };
    }

    async function _fetchPage() {
      const wrap = document.getElementById('resultsTableWrap');
      wrap.innerHTML = '<div class="empty-state"><span class="spin" style="font-size:22px;color:var(--seed);" class="material-icons-outlined">sync</span> Caricamento…</div>';
      try {
        const { data, count } = await fetchAllMembers({
          filters: _buildFilters(),
          page: _currentPage,
          pageSize: _PAGE_SIZE,
        });
        _filtered   = data;
        _totalCount = count;
        data.forEach(m => cacheMember(m));
        renderTable(_filtered);
        _renderPagination();
      } catch (e) {
        showSnackbar(e.message || 'Errore caricamento.', true);
        wrap.innerHTML = '<div class="empty-state">Errore nel caricamento dei soci.</div>';
      }
    }

    async function fetchExportMembers() {
      const { data } = await fetchAllMembers({
        filters: _buildFilters(),
        pageSize: 0,
      });
      return data ?? [];
    }

    function _renderPagination() {
      const from = _totalCount === 0 ? 0 : _currentPage * _PAGE_SIZE + 1;
      const to   = Math.min((_currentPage + 1) * _PAGE_SIZE, _totalCount);
      document.getElementById('resultCount').textContent =
        _totalCount === 0 ? '0 risultati' : `${from}–${to} di ${_totalCount}`;
      document.getElementById('pagePrev').disabled = _currentPage === 0;
      document.getElementById('pageNext').disabled = to >= _totalCount;
    }

    function changePage(delta) {
      _currentPage += delta;
      _fetchPage();
    }

    /* ===========================================================
       Sorting
    =========================================================== */
    function sortBy(key) {
      if (_resizing) return;
      if (_sortKey === key) { _sortAsc = !_sortAsc; }
      else { _sortKey = key; _sortAsc = true; }
      renderTable(_filtered);
    }

    function sortIcon(key) {
      if (_sortKey !== key) return '';
      return `<span class="sort-icon material-icons-outlined">${_sortAsc ? 'arrow_upward' : 'arrow_downward'}</span>`;
    }

    /* ===========================================================
       Filters
    =========================================================== */
    function applyFilters() {
      _currentPage = 0;
      _fetchPage();
    }

    function toggleAdvanced() {
      const panel = document.getElementById('advancedPanel');
      const btn = document.getElementById('tuneBtn');
      panel.classList.toggle('show');
      btn.classList.toggle('active');
    }

    function resetFilters() {
      ['fGeneral','fNome','fCognome','fLuogo','fDataNascita','fResidenza',
       'fComune','fCap','fEmail','fTelefono','fDateFrom','fDateTo'].forEach(id => {
        document.getElementById(id).value = '';
      });
      document.getElementById('fStato').value = '';
      applyFilters();
    }

    /* ===========================================================
       Render table
    =========================================================== */
    const _memberCache = createRecordCache();
    function cacheMember(m) { _memberCache.cacheRecord(m); }
    function getCached(id) { return _memberCache.getRecord(id); }
    window.getCached = getCached;

    function renderTable(rows) {
      const wrap = document.getElementById('resultsTableWrap');
      if (!rows.length) {
        wrap.innerHTML = '<div class="empty-state">Nessun risultato trovato.</div>';
        return;
      }
      const sorted = _sortRows(rows, _sortKey, _sortAsc);
      wrap.innerHTML = `
        <table>
          <thead><tr>
            <th onclick="sortBy('numero_tessera')" style="width:6%">Tessera ${sortIcon('numero_tessera')}<div class="resize-handle"></div></th>
            <th onclick="sortBy('cognome')" style="width:15%">Nome ${sortIcon('cognome')}<div class="resize-handle"></div></th>
            <th onclick="sortBy('data_nascita')" style="width:14%">Nascita ${sortIcon('data_nascita')}<div class="resize-handle"></div></th>
            <th onclick="sortBy('comune')" style="width:14%">Residenza ${sortIcon('comune')}<div class="resize-handle"></div></th>
            <th onclick="sortBy('email')" style="width:17%">Email ${sortIcon('email')}<div class="resize-handle"></div></th>
            <th style="width:10%">Telefono<div class="resize-handle"></div></th>
            <th onclick="sortBy('stato')" style="width:5%">Stato ${sortIcon('stato')}<div class="resize-handle"></div></th>
            <th onclick="sortBy('created_at')" style="width:8%">Data ${sortIcon('created_at')}<div class="resize-handle"></div></th>
            <th style="width:11%">Azioni</th>
          </tr></thead>
          <tbody id="resultsTbody"></tbody>
        </table>`;
      initResizeHandles('#resultsTableWrap table', _colWidths, value => { _resizing = value; });
      const tbody = document.getElementById('resultsTbody');
      sorted.forEach(m => {
        cacheMember(m);
        const tr = document.createElement('tr');
        const statusColor = {approved:'#4CAF50',deleted:'#F44336',rejected:'#212121',pending:'#607D8B'}[m.stato] ?? '#607D8B';
        const normalizedStatus = (m.stato || '').trim().toLowerCase();
        const isApproved = normalizedStatus === 'approved';
        const isDeleted  = normalizedStatus === 'deleted';
        const isPending  = normalizedStatus === 'pending';

        // Build actions: approved→edit+pdf+archive, pending→pdf+archive+approve+reject, deleted→pdf only
        let actionsHtml = '';
        if (isApproved) {
          actionsHtml = `
            <button class="action-btn" title="Modifica" onclick="openEditModal(getCached('${escJs(m.id)}'))">
              <span class="material-icons-outlined">edit</span>
            </button>
            <button class="action-btn" title="Genera PDF" onclick="exportMemberPdf(getCached('${escJs(m.id)}'))">
              <span class="material-icons-outlined">picture_as_pdf</span>
            </button>
            <button class="action-btn danger" title="Archivia" onclick="handleDeleteMember('${escJs(m.id)}','${escJs(m.nome+' '+m.cognome)}')">
              <span class="material-icons-outlined">delete</span>
            </button>`;
        } else if (isPending) {
          actionsHtml = `
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
            </button>`;
        } else if (normalizedStatus === 'rejected') {
          actionsHtml = `
            <button class="action-btn" title="Genera PDF" onclick="exportMemberPdf(getCached('${escJs(m.id)}'))">
              <span class="material-icons-outlined">picture_as_pdf</span>
            </button>
            <button class="action-btn" title="Riapprova" onclick="handleReapproveMember('${escJs(m.id)}','${escJs(m.nome+' '+m.cognome)}')">
              <span class="material-icons-outlined">check_circle</span>
            </button>
            <button class="action-btn danger" title="Elimina definitivamente" onclick="handleHardDeleteMember('${escJs(m.id)}','${escJs(m.nome+' '+m.cognome)}')">
              <span class="material-icons-outlined">delete_forever</span>
            </button>`;
        } else {
          // deleted → PDF + restore + hard delete
          actionsHtml = `
            <button class="action-btn" title="Genera PDF" onclick="exportMemberPdf(getCached('${escJs(m.id)}'))">
              <span class="material-icons-outlined">picture_as_pdf</span>
            </button>
            <button class="action-btn" title="Ripristina tesseramento" onclick="handleRestoreDeletedMember('${escJs(m.id)}','${escJs(m.nome+' '+m.cognome)}')">
              <span class="material-icons-outlined">restore</span>
            </button>
            <button class="action-btn danger" title="Elimina definitivamente" onclick="handleHardDeleteMember('${escJs(m.id)}','${escJs(m.nome+' '+m.cognome)}')">
              <span class="material-icons-outlined">delete_forever</span>
            </button>`;
        }

        tr.innerHTML = `
          <td><strong>${escHtml(m.numero_tessera||'–')}</strong></td>
          <td title="${escHtml(m.nome+' '+m.cognome)}">${escHtml(m.nome)} ${escHtml(m.cognome)}</td>
          <td>${escHtml(fmtBirthLabel(m))}</td>
          <td title="${escHtml(residenceLabel(m))}">${escHtml(residenceLabel(m))}</td>
          <td title="${escHtml(m.email)}">${escHtml(m.email)}</td>
          <td>${escHtml(m.telefono)}</td>
          <td><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${statusColor};" title="${escHtml(m.stato)}"></span></td>
          <td>${fmtDate(m.created_at)}</td>
          <td style="white-space:nowrap;">${actionsHtml}</td>`;
        tbody.appendChild(tr);
      });
    }

    /* ===========================================================
       Column resize
    =========================================================== */
    let _resizing = false;
    let _colWidths = {};

    /* ===========================================================
       Actions
    =========================================================== */
    async function handleDeleteMember(memberId, fullName) {
      return runConfirmedMutation({
        title: 'Archivia socio',
        text: `Archiviare ${fullName}?`,
        okLabel: 'Archivia',
        mutate: () => deleteMemberSoft(memberId),
        successMessage: 'Socio archiviato.',
        onSuccess: loadAllMembers,
      });
    }

    async function handleApproveMember(memberId, fullName) {
      return runConfirmedMutation({
        title: 'Approva socio',
        text: `Approvare ${fullName}? Verrà assegnato il prossimo numero tessera disponibile.`,
        okLabel: 'Approva',
        mutate: () => approveMember(memberId),
        successMessage: num => `Tessera n° ${num} assegnata a ${fullName}. ✓`,
        onSuccess: loadAllMembers,
      });
    }

    async function handleRejectMember(memberId, fullName) {
      return runConfirmedMutation({
        title: 'Rifiuta richiesta',
        text: `Rifiutare la richiesta di ${fullName}?`,
        okLabel: 'Rifiuta',
        mutate: () => updateMember(memberId, { stato: 'rejected' }),
        successMessage: 'Richiesta rifiutata.',
        onSuccess: loadAllMembers,
      });
    }

    async function handleReapproveMember(memberId, fullName) {
      return runConfirmedMutation({
        title: 'Riapprova socio',
        text: `Riapprovare ${fullName}? Verrà assegnato un nuovo numero tessera.`,
        okLabel: 'Riapprova',
        mutate: () => reapproveMember(memberId),
        successMessage: num => `Tessera n° ${num} assegnata a ${fullName}.`,
        onSuccess: loadAllMembers,
      });
    }

    async function handleRestoreDeletedMember(memberId, fullName) {
      return runConfirmedMutation({
        title: 'Ripristina tesseramento',
        text: `Ripristinare il tesseramento di ${fullName}? Verrà verificato il numero tessera precedente.`,
        okLabel: 'Ripristina',
        mutate: () => restoreDeletedMember(memberId),
        successMessage: ({ numero, reused }) => reused
          ? `${fullName} ripristinato con tessera n° ${numero} (numero originale).`
          : `Tessera originale non più disponibile. ${fullName} riapprovato con nuovo n° ${numero}.`,
        onSuccess: loadAllMembers,
      });
    }

    async function handleHardDeleteMember(memberId, fullName) {
      return runConfirmedMutation({
        title: 'Elimina definitivamente',
        text: `Eliminare definitivamente ${fullName}? Questa azione è irreversibile.`,
        okLabel: 'Elimina',
        mutate: () => deleteMemberHard(memberId),
        successMessage: 'Socio eliminato definitivamente.',
        onSuccess: loadAllMembers,
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
        showSnackbar('Formato data non valido (gg/mm/aaaa).', true); return;
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
      try {
        await updateMember(memberId, fields);
        closeEditModal();
        showSnackbar('Socio aggiornato.');
        await loadAllMembers();
      } catch (e) {
        showSnackbar(e.message || 'Aggiornamento fallito.', true);
      } finally { btn.disabled = false; }
    }

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
       Export Excel
    =========================================================== */
    function buildExportRows(rows) {
      return rows.map(m => ({
        'N° Tessera':    m.numero_tessera || '',
        'Nome':          m.nome || '',
        'Cognome':       m.cognome || '',
        'Luogo nascita': m.luogo_nascita || '',
        'Data nascita':  fmtBirth(m.data_nascita),
        'Residenza':     m.residenza || '',
        'Comune':        m.comune || '',
        'CAP':           m.cap || '',
        'Email':         m.email || '',
        'Telefono':      m.telefono || '',
        'Stato':         m.stato || '',
        'Privacy':       m.privacy_accepted ? 'Sì' : 'No',
        'Data reg.':     fmtDate(m.created_at),
        'Firma URL':     m.firma_url || '',
      }));
    }

    function exportExcel() {
      if (_totalCount === 0) { showSnackbar('Nessun risultato da esportare.', true); return; }
      showSnackbar('Preparazione Excel…');
      fetchExportMembers().then(data => {
        try {
          const rows = buildExportRows(data);
          const ws = XLSX.utils.json_to_sheet(rows);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, 'Soci');
          XLSX.writeFile(wb, `soci_${new Date().toISOString().slice(0,10)}.xlsx`);
          showSnackbar(`${data.length} soci esportati in Excel.`);
        } catch (e) {
          showSnackbar('Errore generazione Excel: ' + e.message, true);
        }
      }).catch(e => showSnackbar('Errore recupero dati: ' + e.message, true));
    }

    /* ===========================================================
       Export PDF (elenco tabellare per tutti i risultati)
    =========================================================== */
    function exportPdf() {
      if (_totalCount === 0) { showSnackbar('Nessun risultato da esportare.', true); return; }
      showSnackbar('Preparazione PDF…');
      fetchExportMembers().then(data => {
        try {
          const { jsPDF } = window.jspdf;
          const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
          doc.setFontSize(14);
          doc.text('Elenco soci – JATA APS', 14, 14);
          doc.setFontSize(9);
          doc.text(`Esportato il ${new Date().toLocaleDateString('it-IT')} – ${data.length} risultati`, 14, 20);

          const head = [['Tessera','Nome','Cognome','Nascita','Comune','Email','Telefono','Stato','Data']];
          const body = data.map(m => [
            m.numero_tessera || '–',
            m.nome || '',
            m.cognome || '',
            fmtBirth(m.data_nascita),
            m.comune || '',
            m.email || '',
            m.telefono || '',
            m.stato || '',
            fmtDate(m.created_at),
          ]);

          doc.autoTable({
            head, body,
            startY: 24,
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [46, 125, 50], textColor: 255, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [244, 246, 243] },
            margin: { left: 10, right: 10 },
          });

          doc.save(`soci_${new Date().toISOString().slice(0,10)}.pdf`);
          showSnackbar(`${data.length} soci esportati in PDF.`);
        } catch (e) {
          showSnackbar('Errore generazione PDF: ' + e.message, true);
        }
      }).catch(e => showSnackbar('Errore recupero dati: ' + e.message, true));
    }

    function ensureUniqueZipName(filename, usedNames) {
      if (!usedNames.has(filename)) {
        usedNames.add(filename);
        return filename;
      }

      const dotIndex = filename.toLowerCase().lastIndexOf('.pdf');
      const base = dotIndex >= 0 ? filename.slice(0, dotIndex) : filename;
      let suffix = 2;
      let candidate = `${base}_${suffix}.pdf`;
      while (usedNames.has(candidate)) {
        suffix += 1;
        candidate = `${base}_${suffix}.pdf`;
      }
      usedNames.add(candidate);
      return candidate;
    }

    async function exportPdfZip() {
      if (_totalCount === 0) {
        showSnackbar('Nessun risultato da esportare.', true);
        return;
      }

      if (typeof JSZip === 'undefined') {
        showSnackbar('Libreria ZIP non disponibile.', true);
        return;
      }

      const btn = document.getElementById('exportPdfZipBtn');
      const originalHtml = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="material-icons-outlined spin">sync</span> PDF ZIP';

      try {
        showSnackbar('Preparazione PDF ZIP…');
        const members = await fetchExportMembers();
        if (!members.length) {
          showSnackbar('Nessun risultato da esportare.', true);
          return;
        }

        const zip = new JSZip();
        const usedNames = new Set();
        const failures = [];

        for (let i = 0; i < members.length; i++) {
          const member = members[i];
          if (i % 5 === 0 || i === members.length - 1) {
            showSnackbar(`Generazione PDF ${i + 1}/${members.length}…`);
          }

          try {
            const { doc, filename } = await createMemberPdfDocument(member);
            const zipName = ensureUniqueZipName(filename, usedNames);
            zip.file(zipName, doc.output('blob'));
          } catch (err) {
            failures.push({
              tessera: member.numero_tessera || '–',
              nome: `${member.nome || ''} ${member.cognome || ''}`.trim() || 'Senza nome',
              error: err.message || 'Errore sconosciuto',
            });
          }
        }

        if (!Object.keys(zip.files).length) {
          throw new Error('Nessun PDF è stato generato.');
        }

        if (failures.length) {
          zip.file(
            'report_errori.txt',
            failures.map(f => `Tessera: ${f.tessera} | ${f.nome} | ${f.error}`).join('\n')
          );
        }

        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pdf_soci_${new Date().toISOString().slice(0, 10)}.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);

        if (failures.length) {
          showSnackbar(`ZIP scaricato con ${failures.length} PDF non generati.`, true);
        } else {
          showSnackbar(`${members.length} PDF esportati in ZIP.`);
        }
      } catch (e) {
        showSnackbar(e.message || 'Errore generazione ZIP PDF.', true);
      } finally {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
      }
    }

    /* ===========================================================
       Sign out
    =========================================================== */
    async function handleSignOut() {
      await signOutAdmin();
      window.location.href = 'admin-shell.html?view=dashboard';
    }

    /* ===========================================================
       Init
    =========================================================== */
    (async function init() {
      await loadThemeAndReady({
        onError: err => console.error('[ricerca] init color error:', err),
      });

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        return;
      }

      document.getElementById('authGate').style.display = 'none';
      document.getElementById('pageBody').style.display  = 'block';
      document.getElementById('signOutBtn').style.display = 'inline-flex';
      const email = session.user?.email;
      if (email) document.getElementById('appbarUser').textContent = email;

      await loadAllMembers();
    })();
  


