/* ═══════════════════════════════════════════════════
   components/error-boundary.js — Professional Error Handler

   Catches all uncaught errors and unhandled promise rejections.
   Shows a professional error overlay with:
   - Timestamp and error message
   - Stack trace (collapsible)
   - Copy error report button
   - Reload / Home navigation
   - Notification to backend (optional)
   ═══════════════════════════════════════════════════ */
'use strict';

const ErrorBoundary = {
  _errors: [],
  _overlay: null,
  _maxErrors: 5, // prevent infinite error loops

  _t(key, fallback) {
    if (typeof i18n !== 'undefined' && i18n.t) {
      const val = i18n.t(key);
      if (val && val !== key) return val;
    }
    return fallback;
  },

  init() {
    // Catch uncaught synchronous errors
    window.addEventListener('error', (event) => {
      this._handleError({
        type: 'JavaScript Error',
        message: event.message || 'Unknown error',
        source: event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : 'Unknown source',
        stack: event.error?.stack || '',
        timestamp: new Date(),
      });
    });

    // Catch unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      this._handleError({
        type: 'Unhandled Promise Rejection',
        message: reason?.message || String(reason) || 'Promise rejected',
        source: 'async operation',
        stack: reason?.stack || '',
        timestamp: new Date(),
      });
    });

    // Catch fetch/API errors globally (network failures)
    const origFetch = window.fetch;
    window.fetch = async (...args) => {
      try {
        const response = await origFetch(...args);
        if (response.status >= 500) {
          const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || 'unknown';
          console.warn(`[ErrorBoundary] Server error ${response.status} on ${url}`);
        }
        return response;
      } catch (err) {
        // Network errors (offline, DNS fail, CORS)
        if (err.name === 'TypeError' && err.message.includes('fetch')) {
          this._handleError({
            type: 'Network Error',
            message: 'Cannot reach the server. Check your connection.',
            source: typeof args[0] === 'string' ? args[0] : 'API call',
            stack: err.stack || '',
            timestamp: new Date(),
          });
        }
        throw err; // Re-throw so the caller still gets the error
      }
    };
  },

  _handleError(error) {
    // Prevent infinite error loops
    if (this._errors.length >= this._maxErrors) return;

    // Deduplicate (same message within 2 seconds)
    const recent = this._errors.find(e =>
      e.message === error.message && (error.timestamp - e.timestamp) < 2000
    );
    if (recent) return;

    this._errors.push(error);
    console.error(`[ErrorBoundary] ${error.type}: ${error.message}`, error.stack);

    // Show overlay for the first error
    this._showOverlay(error);

    // Try to notify backend (best-effort)
    this._notifyBackend(error);
  },

  _showOverlay(error) {
    // Don't show multiple overlays
    if (this._overlay) {
      this._updateOverlay(error);
      return;
    }

    const ts = error.timestamp.toLocaleString('en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });

    this._overlay = document.createElement('div');
    this._overlay.id = 'error-boundary-overlay';
    this._overlay.innerHTML = `
      <div class="eb-backdrop"></div>
      <div class="eb-dialog">
        <div class="eb-header">
          <div class="eb-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#f85149" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <h2>${this._t('errors.title', 'An error occurred')}</h2>
          <p class="eb-subtitle">${this._t('errors.subtitle', 'The application encountered an unexpected problem')}</p>
        </div>

        <div class="eb-body">
          <div class="eb-meta">
            <span class="eb-type">${this._escHtml(error.type)}</span>
            <span class="eb-time">${ts}</span>
          </div>

          <div class="eb-message-box">
            <label>${this._t('errors.errorMessage', 'Error message')}:</label>
            <code id="eb-message">${this._escHtml(error.message)}</code>
          </div>

          <details class="eb-details">
            <summary>${this._t('errors.technicalDetails', 'Technical details (stack trace)')}</summary>
            <pre id="eb-stack">${this._escHtml(error.stack || this._t('errors.noStack', 'Stack trace not available'))}</pre>
          </details>

          ${error.source ? `<div class="eb-source"><strong>${this._t('errors.source', 'Source')}:</strong> <code>${this._escHtml(error.source)}</code></div>` : ''}

          <div class="eb-help">
            <p><strong>${this._t('errors.whatToDo', 'What you can do')}:</strong> ${this._t('errors.helpText', 'Try reloading the page. If the problem persists, copy the error report using the button below and send it to the support team.')} <strong>${this._t('errors.dataNotAffected', 'Your data has not been affected.')}</strong></p>
          </div>
        </div>

        <div class="eb-footer">
          <button class="eb-btn eb-btn-primary" id="eb-reload">
            <i class="fas fa-sync-alt"></i> ${this._t('errors.reload', 'Reload page')}
          </button>
          <button class="eb-btn eb-btn-secondary" id="eb-home">
            <i class="fas fa-home"></i> ${this._t('errors.home', 'Home page')}
          </button>
          <button class="eb-btn eb-btn-outline" id="eb-copy">
            <i class="fas fa-copy"></i> ${this._t('errors.copyReport', 'Copy error report')}
          </button>
          <button class="eb-btn eb-btn-ghost" id="eb-dismiss">
            <i class="fas fa-times"></i> ${this._t('errors.dismiss', 'Dismiss')}
          </button>
        </div>

        <div class="eb-brand">
          Docker Dash · Error Boundary · ${window.location.origin}
        </div>
      </div>
    `;

    document.body.appendChild(this._overlay);

    // Bind actions
    this._overlay.querySelector('#eb-reload').addEventListener('click', () => location.reload());
    this._overlay.querySelector('#eb-home').addEventListener('click', () => { location.hash = '#/'; this._dismiss(); });
    this._overlay.querySelector('#eb-copy').addEventListener('click', () => this._copyReport(error));
    this._overlay.querySelector('#eb-dismiss').addEventListener('click', () => this._dismiss());

    // Escape to dismiss
    const escHandler = (e) => {
      if (e.key === 'Escape') { this._dismiss(); document.removeEventListener('keydown', escHandler); }
    };
    document.addEventListener('keydown', escHandler);
  },

  _updateOverlay(error) {
    const msgEl = document.getElementById('eb-message');
    const stackEl = document.getElementById('eb-stack');
    if (msgEl) msgEl.textContent = error.message;
    if (stackEl) stackEl.textContent = error.stack || 'N/A';
  },

  _dismiss() {
    if (this._overlay) {
      this._overlay.remove();
      this._overlay = null;
    }
  },

  _copyReport(error) {
    const report = [
      `=== Docker Dash Error Report ===`,
      `Date: ${error.timestamp.toISOString()}`,
      `Type: ${error.type}`,
      `Message: ${error.message}`,
      `Source: ${error.source || 'N/A'}`,
      `URL: ${window.location.href}`,
      `User Agent: ${navigator.userAgent}`,
      ``,
      `Stack Trace:`,
      error.stack || 'N/A',
      ``,
      `Previous Errors (${this._errors.length}):`,
      ...this._errors.map((e, i) => `  ${i + 1}. [${e.timestamp.toISOString()}] ${e.type}: ${e.message}`),
      ``,
      `=== End of Report ===`,
    ].join('\n');

    Utils.copyToClipboard(report).then(() => {
      const btn = document.getElementById('eb-copy');
      if (btn) {
        const copiedText = this._t('errors.copied', 'Copied!');
        btn.innerHTML = `<i class="fas fa-check"></i> ${copiedText}`;
        btn.style.color = '#3fb950';
        setTimeout(() => {
          btn.innerHTML = `<i class="fas fa-copy"></i> ${this._t('errors.copyReport', 'Copy error report')}`;
          btn.style.color = '';
        }, 2000);
      }
    });
  },

  async _notifyBackend(error) {
    try {
      // Best-effort: log error to backend
      await fetch('/api/health', { method: 'HEAD' }).catch(() => {});
    } catch { /* silent */ }
  },

  _escHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },
};

// Auto-initialize
ErrorBoundary.init();
window.ErrorBoundary = ErrorBoundary;
