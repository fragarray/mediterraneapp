(async function () {
  'use strict';

  /* ── Auth check ─────────────────────────────────────────────── */
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    document.getElementById('authGuard').style.display = 'flex';
    document.body.classList.add('ready');
    return;
  }

  const userId = session.user.id;
  document.getElementById('fotoMain').style.display = '';

  /* ── DOM refs ────────────────────────────────────────────────── */
  const connectionDot  = document.getElementById('connectionDot');
  const connectionLabel= document.getElementById('connectionLabel');
  const desktopBadge   = document.getElementById('desktopBadge');
  const desktopLabel   = document.getElementById('desktopLabel');
  const stateWaiting   = document.getElementById('stateWaiting');
  const stateReady     = document.getElementById('stateReady');
  const stateUploading = document.getElementById('stateUploading');
  const stateSent      = document.getElementById('stateSent');
  const fotoNumero     = document.getElementById('fotoNumero');
  const cameraBtn      = document.getElementById('cameraBtn');
  const fileInput      = document.getElementById('fileInput');

  let currentNumber = null;

  /* ── UI helpers ──────────────────────────────────────────────── */
  const STATES = { stateWaiting, stateReady, stateUploading, stateSent };

  function showState(id) {
    Object.entries(STATES).forEach(([key, el]) => {
      el.style.display = key === id ? '' : 'none';
    });
  }

  function showSnack(msg, isError = false) {
    const s = document.getElementById('snackbar');
    s.textContent = msg;
    s.className = `snackbar visible${isError ? ' error' : ''}`;
    clearTimeout(s._timer);
    s._timer = setTimeout(() => s.classList.remove('visible'), 3500);
  }

  function setDesktopPresence(connected) {
    desktopLabel.textContent = connected ? 'Desktop connesso' : 'Desktop non connesso';
    desktopBadge.classList.toggle('connected', connected);
  }

  /* ── Realtime channel ────────────────────────────────────────── */
  // Channel name is scoped to the admin's user ID so different admins never interfere
  const channel = supabase.channel(`digit-${userId}`);

  channel
    .on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      // Check if any tracked presence has role 'desktop'
      const desktopOnline = Object.values(state).flat().some(p => p.role === 'desktop');
      setDesktopPresence(desktopOnline);
    })

    // Desktop verified a free membership number → activate camera
    .on('broadcast', { event: 'number_verified' }, ({ payload }) => {
      currentNumber = String(payload.numero);
      fotoNumero.textContent = currentNumber;
      showState('stateReady');
      if (navigator.vibrate) navigator.vibrate(100);
    })

    // Desktop saved or reset the form → return to waiting
    .on('broadcast', { event: 'form_reset' }, () => {
      currentNumber = null;
      showState('stateWaiting');
    })

    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        connectionDot.classList.add('connected');
        connectionLabel.textContent = 'Connesso';
        await channel.track({ role: 'mobile' });
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        connectionDot.classList.remove('connected');
        connectionLabel.textContent = 'Disconnesso';
        setDesktopPresence(false);
      }
    });

  /* ── Camera button ───────────────────────────────────────────── */
  cameraBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    fileInput.value = ''; // reset so same file can be re-selected on retry

    showState('stateUploading');

    try {
      const url = await uploadSchedaStorica(file);

      // Notify the desktop that the image is ready
      await channel.send({
        type: 'broadcast',
        event: 'image_ready',
        payload: { url, numero: currentNumber },
      });

      showState('stateSent');
      if (navigator.vibrate) navigator.vibrate([100, 50, 200]);

    } catch (err) {
      showSnack(err.message || 'Errore durante il caricamento.', true);
      showState('stateReady'); // allow retry
    }
  });

  /* ── Ready ───────────────────────────────────────────────────── */
  document.body.classList.add('ready');

})();
