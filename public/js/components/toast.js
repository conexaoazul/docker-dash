/* ═══════════════════════════════════════════════════
   components/toast.js — Toast Notifications
   ═══════════════════════════════════════════════════ */
'use strict';

const Toast = {
  _container: null,
  _muteErrorsUntil: 0,  // v7.3.1: drop error/warning toasts during auth transitions

  _getContainer() {
    if (!this._container) {
      this._container = document.getElementById('toast-container');
    }
    return this._container;
  },

  /**
   * Suppress error + warning toasts for `ms` milliseconds. Used by the
   * auth layer when a 401 fires: in-flight parallel requests would
   * otherwise each spawn a "Failed to load X: Unauthorized" toast,
   * burying the login form.
   */
  muteErrorsForMs(ms) {
    const until = Date.now() + ms;
    if (until > this._muteErrorsUntil) this._muteErrorsUntil = until;
  },

  show(message, type = 'info', duration = 4000) {
    if ((type === 'error' || type === 'warning') && Date.now() < this._muteErrorsUntil) {
      return null;
    }
    const container = this._getContainer();
    if (!container) return;

    const icons = {
      success: 'fa-check-circle',
      error: 'fa-exclamation-circle',
      warning: 'fa-exclamation-triangle',
      info: 'fa-info-circle',
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');
    toast.innerHTML = `
      <i class="fas ${icons[type] || icons.info}"></i>
      <span class="toast-msg">${Utils.escapeHtml(message)}</span>
      <button class="toast-close" aria-label="Close">
        <i class="fas fa-times"></i>
      </button>
    `;

    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => this._remove(toast));

    container.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => toast.classList.add('toast-show'));

    if (duration > 0) {
      setTimeout(() => this._remove(toast), duration);
    }

    return toast;
  },

  success(msg, dur) { return this.show(msg, 'success', dur); },
  error(msg, dur)   { return this.show(msg, 'error', dur || 6000); },
  warning(msg, dur) { return this.show(msg, 'warning', dur || 5000); },
  info(msg, dur)    { return this.show(msg, 'info', dur); },

  _remove(toast) {
    if (!toast || !toast.parentNode) return;
    toast.classList.add('toast-hide');
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  },
};

window.Toast = Toast;
