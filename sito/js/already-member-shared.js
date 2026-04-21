const { showSnackbar: showLookupSnackbar, loadThemeAndReady } = CodexUi;

function initAlreadyMemberPage(config) {
  loadThemeAndReady();

  document.getElementById('memberForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    const input = document.getElementById('membershipNumber');
    const group = input.closest('.form-group');
    const raw = input.value.trim();
    const num = parseInt(raw, 10);

    if (!raw || Number.isNaN(num) || num <= 0) {
      group.classList.add('has-error');
      return;
    }
    group.classList.remove('has-error');

    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.innerHTML = `<span class="material-icons-outlined spin">sync</span> ${config.loadingLabel}`;

    try {
      const result = await canRequestLegacyMembershipNumber(num);
      if (!result.ok) {
        showLookupSnackbar(result.reason, true);
        return;
      }
      window.location.href = config.targetPage + '?tessera=' + encodeURIComponent(num);
    } catch (err) {
      showLookupSnackbar(err.message || config.errorMessage, true);
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<span class="material-icons-outlined">arrow_forward</span> ${config.submitLabel}`;
    }
  });
}

