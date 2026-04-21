const {
  escHtml,
  fmtDate,
  birthPlaceAndDateLabel,
  residenceLabel,
  createRecordCache,
  sortRows,
  initResizeHandles,
  loadThemeAndReady,
} = AdminShared;

let sortKey = 'created_at';
let sortAsc = false;
let resizing = false;
let members = [];
const recordCache = createRecordCache();
const colWidths = {};

function sortBy(key) {
  if (resizing) return;
  if (sortKey === key) sortAsc = !sortAsc;
  else {
    sortKey = key;
    sortAsc = true;
  }
  renderTable();
}

function sortIcon(key) {
  if (sortKey !== key) return '';
  return `<span class="sort-icon material-icons-outlined">${sortAsc ? 'arrow_upward' : 'arrow_downward'}</span>`;
}

function bindResizeHandles() {
  initResizeHandles('#storicoTable', colWidths, value => {
    resizing = value;
  });
}

function renderTable() {
  const wrap = document.getElementById('tableWrap');
  if (!members.length) {
    wrap.innerHTML = '<div class="empty-state">Nessun socio approvato in questa data.</div>';
    return;
  }

  const sorted = sortRows(members, sortKey, sortAsc);
  wrap.innerHTML = `
    <table id="storicoTable">
      <thead><tr>
        <th onclick="sortBy('numero_tessera')" style="width:7%">Tessera ${sortIcon('numero_tessera')}<div class="resize-handle"></div></th>
        <th onclick="sortBy('cognome')" style="width:16%">Nome ${sortIcon('cognome')}<div class="resize-handle"></div></th>
        <th onclick="sortBy('data_nascita')" style="width:14%">Nascita ${sortIcon('data_nascita')}<div class="resize-handle"></div></th>
        <th onclick="sortBy('comune')" style="width:15%">Residenza ${sortIcon('comune')}<div class="resize-handle"></div></th>
        <th onclick="sortBy('email')" style="width:18%">Email ${sortIcon('email')}<div class="resize-handle"></div></th>
        <th style="width:11%">Telefono<div class="resize-handle"></div></th>
        <th onclick="sortBy('created_at')" style="width:10%">Data ${sortIcon('created_at')}<div class="resize-handle"></div></th>
        <th style="width:9%">Azioni</th>
      </tr></thead>
      <tbody id="storicoTbody"></tbody>
    </table>`;

  const tbody = document.getElementById('storicoTbody');
  sorted.forEach(member => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escHtml(member.numero_tessera || '–')}</strong></td>
      <td title="${escHtml(member.nome + ' ' + member.cognome)}">${escHtml(member.nome)} ${escHtml(member.cognome)}</td>
      <td>${escHtml(birthPlaceAndDateLabel(member))}</td>
      <td title="${escHtml(residenceLabel(member))}">${escHtml(residenceLabel(member))}</td>
      <td title="${escHtml(member.email)}">${escHtml(member.email)}</td>
      <td>${escHtml(member.telefono)}</td>
      <td>${fmtDate(member.created_at)}</td>
      <td style="white-space:nowrap;">
        <button class="action-btn" title="Genera PDF" onclick="handlePdf('${escHtml(member.id)}')">
          <span class="material-icons-outlined">picture_as_pdf</span>
        </button>
      </td>`;
    tbody.appendChild(tr);
  });

  bindResizeHandles();
}

function handlePdf(id) {
  const member = recordCache.getRecord(id);
  if (member) exportMemberPdf(member);
}

(async function init() {
  const params = new URLSearchParams(window.location.search);
  const dateStr = params.get('data');
  if (!dateStr) {
    document.getElementById('badgeSub').textContent = 'nessuna data selezionata';
    document.getElementById('tableWrap').innerHTML = '<div class="empty-state">Nessuna data specificata.</div>';
    document.body.classList.add('ready');
    return;
  }

  const [y, m, d] = dateStr.split('-');
  const label = `${d}/${m}/${y}`;
  document.getElementById('badgeLabel').textContent = `Approvati il ${label}`;

  try {
    const [count, approvedMembers] = await Promise.all([
      fetchApprovedByDateCount(dateStr),
      fetchApprovedByDate(dateStr),
    ]);

    members = approvedMembers;
    approvedMembers.forEach(member => recordCache.cacheRecord(member));

    document.getElementById('badgeCount').textContent = count;
    document.getElementById('badgeSub').textContent = count === 1 ? '1 socio approvato' : `${count} soci approvati`;
    renderTable();
  } catch (error) {
    document.getElementById('badgeCount').textContent = '–';
    document.getElementById('badgeSub').textContent = 'errore nel caricamento';
    document.getElementById('tableWrap').innerHTML = `<div class="empty-state">${escHtml(error.message)}</div>`;
  }

  await loadThemeAndReady({ onError: () => {} });
})();

