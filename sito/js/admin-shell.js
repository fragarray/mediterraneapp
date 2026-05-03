const {
  loadThemeAndReady,
} = AdminShared;

const shellFrame = document.getElementById('adminFrame');
const shellViewLabel = document.getElementById('shellViewLabel');
const shellButtons = Array.from(document.querySelectorAll('[data-view]'));
const shellHistoryPicker = document.getElementById('shellHistoryPicker');
const shellRouteMap = {
  dashboard: 'admin.html?embedded=1',
  search: 'admin-ricerca.html?embedded=1',
  settings: 'settings.html?embedded=1',
  digitizzazione: 'admin-digitalizzazione.html?embedded=1',
};
const shellTitleMap = {
  dashboard: 'Dashboard',
  search: 'Ricerca',
  settings: 'Impostazioni',
  digitizzazione: 'Digitalizzazione',
};

let shellCurrentView = 'dashboard';

function shellNormalizeView(view) {
  return Object.prototype.hasOwnProperty.call(shellRouteMap, view) ? view : 'dashboard';
}

function shellBuildFrameUrl(view) {
  return shellRouteMap[shellNormalizeView(view)];
}

function shellSetActiveView(view) {
  const normalized = shellNormalizeView(view);
  shellCurrentView = normalized;
  shellButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === normalized);
  });
  if (shellViewLabel) {
    shellViewLabel.textContent = shellTitleMap[normalized] || '';
  }
  document.title = `${shellTitleMap[normalized]} – Mediterranea`;
}

function shellNavigate(view, options = {}) {
  const normalized = shellNormalizeView(view);
  const frameUrl = shellBuildFrameUrl(normalized);
  const replaceHistory = Boolean(options.replaceHistory);
  const addCacheBuster = Boolean(options.cacheBuster);

  shellSetActiveView(normalized);

  let targetUrl = frameUrl;
  if (addCacheBuster) {
    const separator = frameUrl.includes('?') ? '&' : '?';
    targetUrl = `${frameUrl}${separator}ts=${Date.now()}`;
  }

  shellFrame.src = targetUrl;

  const shellUrl = `?view=${encodeURIComponent(normalized)}`;
  if (replaceHistory) {
    history.replaceState({ view: normalized }, '', shellUrl);
  } else {
    history.pushState({ view: normalized }, '', shellUrl);
  }
}

async function shellSignOut() {
  await signOutAdmin();
  shellNavigate(shellCurrentView, { replaceHistory: true, cacheBuster: true });
}

function shellOpenHistoryPicker(buttonRect) {
  if (!shellHistoryPicker) return;

  // Translate button coords from iframe-space to shell-space
  const iframeRect = shellFrame.getBoundingClientRect();
  const top  = iframeRect.top  + (buttonRect?.top  ?? 0);
  const left = iframeRect.left + (buttonRect?.left ?? 0);
  const w    = buttonRect?.width  ?? 44;
  const h    = buttonRect?.height ?? 44;

  // Reset all styles at once so the browser commits the new position before showPicker() runs
  shellHistoryPicker.style.cssText =
    `position:fixed;top:${top}px;left:${left}px;width:${w}px;height:${h}px;` +
    `opacity:0;pointer-events:none;border:0;padding:0;box-sizing:border-box;`;

  // Force a reflow so the browser registers the new coordinates before opening the picker
  shellHistoryPicker.getBoundingClientRect();

  try {
    shellHistoryPicker.showPicker();
  } catch (_) {
    shellHistoryPicker.click();
  }
}

function shellCloseHistoryPicker() {
  if (!shellHistoryPicker) return;
  shellHistoryPicker.value = '';
}

function shellSendHistorySelection(isoDate) {
  const frameWindow = shellFrame?.contentWindow;
  if (!frameWindow) return;
  frameWindow.postMessage({ type: 'admin-history-date-selected', isoDate }, '*');
}

shellButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const view = btn.dataset.view;
    if (view === shellCurrentView && shellFrame.src) {
      return;
    }
    shellNavigate(view);
  });
});

document.getElementById('shellSignOutBtn').addEventListener('click', shellSignOut);

if (shellHistoryPicker) {
  shellHistoryPicker.addEventListener('change', () => {
    const isoDate = shellHistoryPicker.value;
    if (!isoDate) return;
    shellSendHistorySelection(isoDate);
    shellCloseHistoryPicker();
  });
}

window.addEventListener('message', event => {
  // Allow messages from same-origin frames and null-origin frames (file:// protocol)
  const sameOrigin = event.origin === window.location.origin || event.origin === 'null';
  if (!sameOrigin) return;
  const data = event.data || {};
  if (data.type === 'admin-open-history-picker') {
    shellOpenHistoryPicker(data.rect);
  }
});

window.addEventListener('popstate', event => {
  const view = shellNormalizeView(event.state?.view || new URLSearchParams(window.location.search).get('view'));
  shellNavigate(view, { replaceHistory: true });
});

(async function initShell() {
  await loadThemeAndReady({
    onError: error => console.error('[admin-shell] theme init error:', error),
  });

  const initialView = shellNormalizeView(new URLSearchParams(window.location.search).get('view'));
  shellNavigate(initialView, { replaceHistory: true });

  // Check backup reminder after navigation is set up
  await checkBackupReminder();
})();

async function checkBackupReminder() {
  try {
    const [intervalRaw, lastBackupRaw] = await Promise.all([
      getAppSetting(SETTING_BACKUP_INTERVAL),
      getAppSetting(SETTING_LAST_BACKUP),
    ]);

    const intervalDays = parseInt(intervalRaw, 10);
    if (!intervalDays || intervalDays < 1) return; // reminder not configured

    // Don't show if already dismissed today (stored in sessionStorage)
    const dismissedToday = sessionStorage.getItem('backup_reminder_dismissed');
    const todayStr = new Date().toISOString().slice(0, 10);
    if (dismissedToday === todayStr) return;

    let daysSinceLast = Infinity;
    if (lastBackupRaw) {
      const last = new Date(lastBackupRaw + 'T00:00:00');
      const now  = new Date();
      daysSinceLast = Math.floor((now - last) / (1000 * 60 * 60 * 24));
    }

    if (daysSinceLast < intervalDays) return;

    const bar  = document.getElementById('backupReminderBar');
    const text = document.getElementById('backupReminderText');
    const closeBtn = document.getElementById('backupReminderClose');
    if (!bar) return;

    if (lastBackupRaw) {
      const [y, m, d] = lastBackupRaw.split('-');
      text.textContent = `Ultimo backup: ${d}/${m}/${y} — sono passati ${daysSinceLast} giorni (intervallo: ${intervalDays}). È ora di generare un nuovo backup.`;
    } else {
      text.textContent = `Nessun backup ancora registrato. Si consiglia di generarne uno ora.`;
    }
    bar.style.display = 'flex';

    closeBtn.addEventListener('click', () => {
      bar.style.display = 'none';
      sessionStorage.setItem('backup_reminder_dismissed', todayStr);
    });
  } catch (_) {
    // Reminder non bloccante: non fare nulla in caso di errore
  }
}
