'use strict';

// Login → forgot-password reveal + submit handler. Lives on the login screen
// before the main app loads, so it can't depend on Api/Toast/i18n. Pure
// vanilla DOM + fetch.
//
// Extracted from inline <script> in index.html in v7.3.7 to comply with the
// Content Security Policy (no 'unsafe-inline' for script-src).
(function () {
  function init() {
    var link = document.getElementById('login-forgot-link');
    var form = document.getElementById('login-reset-form');
    var cancelBtn = document.getElementById('login-reset-cancel');
    var submitBtn = document.getElementById('login-reset-submit');
    var emailInput = document.getElementById('login-reset-email');
    var errorEl = document.getElementById('login-reset-error');
    var successEl = document.getElementById('login-reset-success');

    if (!link || !form || !cancelBtn || !submitBtn || !emailInput || !errorEl || !successEl) {
      return;  // Login markup not present (rare in non-app contexts) — bail
    }

    link.addEventListener('click', function (e) {
      e.preventDefault();
      form.style.display = 'block';
      link.parentElement.style.display = 'none';
      emailInput.focus();
    });

    cancelBtn.addEventListener('click', function () {
      form.style.display = 'none';
      link.parentElement.style.display = 'block';
      emailInput.value = '';
      errorEl.style.display = 'none';
      successEl.style.display = 'none';
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send reset link';
    });

    submitBtn.addEventListener('click', async function () {
      var email = emailInput.value.trim();
      errorEl.style.display = 'none';
      successEl.style.display = 'none';
      if (!email) {
        errorEl.textContent = 'Please enter your email address.';
        errorEl.style.display = 'block';
        return;
      }
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
      try {
        await fetch('/api/auth/request-password-reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email }),
        });
      } catch (e) { /* ignore network errors — show generic message regardless */ }
      successEl.textContent = "If an account exists with that email, you'll receive a reset link.";
      successEl.style.display = 'block';
      submitBtn.style.display = 'none';
      cancelBtn.textContent = 'Close';
    });

    emailInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') submitBtn.click();
    });
  }

  // The script tag is loaded after the markup, so DOM is already parsed,
  // but tolerate both timings.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
