/* ═══════════════════════════════════════════════════
   pages/sample-feature.js — CONTRIBUTOR DEMO

   This page is a deliberately minimal but complete walkthrough of the
   Docker Dash patterns. Read it side-by-side with src/services/sample-
   feature.js + src/routes/sample-feature.js to see the full flow.
   ═══════════════════════════════════════════════════ */
'use strict';

const SampleFeaturePage = {
  _wsUnsub: null,
  _lastSource: 'manual',
  _count: 0,

  // ─── Configuration ──────────────────────────────────
  // The 7 layers we exercise. Keep this in sync with the actual files
  // (CI doesn't enforce it — it's documentation, kept short on purpose).
  _layers: [
    { id: 'service',  icon: 'fa-cog',         titleKey: 'pages.sampleFeature.layers.service.title',  descKey: 'pages.sampleFeature.layers.service.desc',  file: 'src/services/sample-feature.js' },
    { id: 'route',    icon: 'fa-road',        titleKey: 'pages.sampleFeature.layers.route.title',    descKey: 'pages.sampleFeature.layers.route.desc',    file: 'src/routes/sample-feature.js' },
    { id: 'page',     icon: 'fa-window-maximize', titleKey: 'pages.sampleFeature.layers.page.title', descKey: 'pages.sampleFeature.layers.page.desc',     file: 'public/js/pages/sample-feature.js' },
    { id: 'ws',       icon: 'fa-broadcast-tower', titleKey: 'pages.sampleFeature.layers.ws.title',   descKey: 'pages.sampleFeature.layers.ws.desc',       file: 'src/services/sample-feature.js#L62-L78' },
    { id: 'cron',     icon: 'fa-clock',       titleKey: 'pages.sampleFeature.layers.cron.title',     descKey: 'pages.sampleFeature.layers.cron.desc',     file: 'src/jobs/index.js' },
    { id: 'audit',    icon: 'fa-clipboard-list', titleKey: 'pages.sampleFeature.layers.audit.title', descKey: 'pages.sampleFeature.layers.audit.desc',    file: 'src/routes/sample-feature.js#L42-L52' },
    { id: 'tests',    icon: 'fa-vial',        titleKey: 'pages.sampleFeature.layers.tests.title',    descKey: 'pages.sampleFeature.layers.tests.desc',    file: 'src/__tests__/sample-feature.test.js' },
  ],

  _ghBase: 'https://github.com/bogdanpricop/docker-dash/blob/main/',

  // ─── Lifecycle ──────────────────────────────────────
  async render(container) {
    const isAdmin = (window.App?.user?.role === 'admin');

    container.innerHTML = this._renderShell(isAdmin);

    // Initial load — fetch the counter
    try {
      const data = await Api.get('/sample-feature/counter');
      this._count = data.count || 0;
      this._renderCounter();
    } catch (err) {
      this._showError(err.message);
    }

    // Wire button handlers
    container.querySelector('#sf-increment')?.addEventListener('click', () => this._increment());
    container.querySelector('#sf-reset')?.addEventListener('click', () => this._reset());

    // Wire layer-checklist clicks → scroll to card
    container.querySelectorAll('.sf-layer-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const id = pill.dataset.layer;
        const card = container.querySelector(`#sf-card-${id}`);
        if (card) {
          card.open = true;
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          card.style.transition = 'background 0.5s';
          card.style.background = 'rgba(56,139,253,0.15)';
          setTimeout(() => { card.style.background = ''; }, 1500);
        }
      });
    });

    // Wire "View source" buttons
    container.querySelectorAll('.sf-view-source').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const file = btn.dataset.file;
        this._showSourceModal(file);
      });
    });

    // Subscribe to live counter updates from the cron tick + other tabs
    WS.subscribe('sample-feature:counter');
    this._wsUnsub = WS.on('sample-feature:counter', (msg) => {
      if (typeof msg?.count !== 'number') return;
      this._count = msg.count;
      this._lastSource = msg.source || 'manual';
      this._renderCounter(true);
    });
  },

  destroy() {
    if (this._wsUnsub) { this._wsUnsub(); this._wsUnsub = null; }
    try { WS.unsubscribe('sample-feature:counter'); } catch { /* ignore */ }
  },

  // ─── Rendering ──────────────────────────────────────
  _renderShell(isAdmin) {
    return `
      <div class="page-header">
        <h2><i class="fas fa-flask" style="color:var(--accent)"></i> ${i18n.t('pages.sampleFeature.title')}</h2>
        <div class="page-actions">
          <a href="${this._ghBase}docs/CONTRIBUTING.md" target="_blank" rel="noopener" class="btn btn-sm btn-secondary" style="display:inline-flex;align-items:center;gap:6px;text-decoration:none">
            <i class="fas fa-book"></i> ${i18n.t('pages.sampleFeature.contributingGuide')}
            <i class="fas fa-external-link-alt" style="font-size:10px"></i>
          </a>
          <a href="#/howto/contributing" class="btn btn-sm btn-secondary" style="display:inline-flex;align-items:center;gap:6px;text-decoration:none">
            <i class="fas fa-graduation-cap"></i> ${i18n.t('pages.sampleFeature.howtoContributing')}
          </a>
          <a href="${this._ghBase}examples/sample-feature/README.md" target="_blank" rel="noopener" class="btn btn-sm btn-secondary" style="display:inline-flex;align-items:center;gap:6px;text-decoration:none">
            <i class="fab fa-github"></i> ${i18n.t('pages.sampleFeature.viewExample')}
            <i class="fas fa-external-link-alt" style="font-size:10px"></i>
          </a>
        </div>
      </div>

      <div class="card" style="margin-bottom:14px">
        <div class="card-body">
          <p class="text-muted text-sm" style="margin-bottom:12px">
            <i class="fas fa-info-circle"></i> ${i18n.t('pages.sampleFeature.intro')}
          </p>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${this._layers.map(l => `
              <span class="sf-layer-pill" data-layer="${l.id}" style="display:inline-flex;align-items:center;gap:5px;padding:5px 10px;background:rgba(46,160,67,0.15);color:var(--green);border-radius:14px;font-size:11px;font-weight:600;cursor:pointer" title="${i18n.t('pages.sampleFeature.scrollToLayer')}">
                <i class="fas fa-check" style="font-size:9px"></i>
                <i class="fas ${l.icon}" style="font-size:10px"></i>
                ${i18n.t(l.titleKey)}
              </span>
            `).join('')}
          </div>
        </div>
      </div>

      <div class="card" style="margin-bottom:14px">
        <div class="card-header">
          <h3><i class="fas fa-bolt" style="color:var(--accent)"></i> ${i18n.t('pages.sampleFeature.demoTitle')}</h3>
          <span class="text-muted text-sm" id="sf-source-label"></span>
        </div>
        <div class="card-body" style="text-align:center;padding:32px 16px">
          <div style="font-size:64px;font-weight:700;color:var(--accent);font-family:'JetBrains Mono',monospace;line-height:1" id="sf-counter">…</div>
          <div class="text-muted text-sm" style="margin-top:6px" id="sf-counter-status">${i18n.t('pages.sampleFeature.loading')}</div>
          <div style="margin-top:18px;display:flex;justify-content:center;gap:10px;flex-wrap:wrap">
            <button class="btn btn-primary" id="sf-increment">
              <i class="fas fa-plus"></i> ${i18n.t('pages.sampleFeature.increment')}
            </button>
            ${isAdmin ? `
              <button class="btn btn-warning" id="sf-reset">
                <i class="fas fa-undo"></i> ${i18n.t('pages.sampleFeature.reset')}
              </button>
            ` : `
              <button class="btn btn-warning" disabled title="${i18n.t('pages.sampleFeature.adminOnly')}">
                <i class="fas fa-lock"></i> ${i18n.t('pages.sampleFeature.reset')}
              </button>
            `}
          </div>
          <p class="text-muted text-sm" style="margin-top:14px;font-size:11px">
            <i class="fas fa-clock" style="margin-right:4px"></i>
            ${i18n.t('pages.sampleFeature.cronHint')}
          </p>
        </div>
      </div>

      <h3 style="margin:24px 0 12px;font-size:14px;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:1px">
        <i class="fas fa-layer-group" style="margin-right:8px"></i> ${i18n.t('pages.sampleFeature.layersTitle')}
      </h3>

      <div id="sf-layers" style="display:flex;flex-direction:column;gap:10px">
        ${this._layers.map(l => this._renderLayerCard(l)).join('')}
      </div>

      <div class="card" style="margin-top:18px">
        <div class="card-body" style="text-align:center;padding:18px">
          <p class="text-muted text-sm" style="margin-bottom:12px">${i18n.t('pages.sampleFeature.nextSteps')}</p>
          <a href="${this._ghBase}docs/CONTRIBUTING.md" target="_blank" rel="noopener" class="btn btn-primary" style="display:inline-flex;align-items:center;gap:8px;text-decoration:none">
            <i class="fas fa-rocket"></i> ${i18n.t('pages.sampleFeature.startContributing')}
          </a>
        </div>
      </div>
    `;
  },

  _renderLayerCard(layer) {
    const filePath = layer.file.split('#')[0];
    const fileLabel = layer.file.replace('#L', ' (lines ').replace(/-L/, '–') + (layer.file.includes('#L') ? ')' : '');
    return `
      <details class="card" id="sf-card-${layer.id}" style="border:1px solid var(--border);border-radius:var(--radius-sm)">
        <summary style="cursor:pointer;padding:12px 14px;display:flex;align-items:center;gap:10px;list-style:none;user-select:none">
          <i class="fas ${layer.icon}" style="color:var(--accent);width:20px;text-align:center"></i>
          <strong>${i18n.t(layer.titleKey)}</strong>
          <code style="font-size:11px;color:var(--text-dim);margin-left:auto;font-family:'JetBrains Mono',monospace">${Utils.escapeHtml(fileLabel)}</code>
        </summary>
        <div style="padding:0 14px 14px 44px">
          <p class="text-sm" style="margin:0 0 10px;color:var(--text)">${i18n.t(layer.descKey)}</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <a href="${this._ghBase}${filePath}${layer.file.includes('#') ? layer.file.substring(layer.file.indexOf('#')) : ''}" target="_blank" rel="noopener" class="btn btn-sm btn-secondary" style="display:inline-flex;align-items:center;gap:6px;text-decoration:none">
              <i class="fab fa-github"></i> ${i18n.t('pages.sampleFeature.viewOnGithub')}
              <i class="fas fa-external-link-alt" style="font-size:9px"></i>
            </a>
            <button class="btn btn-sm sf-view-source" data-file="${filePath}">
              <i class="fas fa-code"></i> ${i18n.t('pages.sampleFeature.viewSource')}
            </button>
          </div>
        </div>
      </details>
    `;
  },

  _renderCounter(animate = false) {
    const el = document.getElementById('sf-counter');
    const status = document.getElementById('sf-counter-status');
    const sourceEl = document.getElementById('sf-source-label');
    if (!el) return;
    el.textContent = String(this._count);
    if (status) status.textContent = i18n.t('pages.sampleFeature.counterStatus');
    if (sourceEl) {
      const label = this._lastSource === 'cron' ? i18n.t('pages.sampleFeature.sourceCron')
        : this._lastSource === 'reset' ? i18n.t('pages.sampleFeature.sourceReset')
        : i18n.t('pages.sampleFeature.sourceManual');
      sourceEl.innerHTML = `<i class="fas fa-broadcast-tower" style="color:var(--green);margin-right:4px;font-size:10px"></i> ${i18n.t('pages.sampleFeature.lastUpdate', { source: label })}`;
    }
    if (animate) {
      el.style.transition = 'transform 0.2s, color 0.2s';
      el.style.transform = 'scale(1.15)';
      setTimeout(() => { el.style.transform = ''; }, 180);
    }
  },

  _showError(msg) {
    const el = document.getElementById('sf-counter');
    if (el) el.textContent = '?';
    const status = document.getElementById('sf-counter-status');
    if (status) status.innerHTML = `<span style="color:var(--red)">${Utils.escapeHtml(msg)}</span>`;
  },

  // ─── Actions ────────────────────────────────────────
  async _increment() {
    try {
      const result = await Api.post('/sample-feature/increment', {});
      // The WS broadcast will also fire and update us; this just gives an
      // immediate optimistic update for snappier UX.
      this._count = result.count;
      this._lastSource = 'manual';
      this._renderCounter(true);
    } catch (err) {
      Toast.error(err.message);
    }
  },

  async _reset() {
    if (!confirm(i18n.t('pages.sampleFeature.resetConfirm'))) return;
    try {
      const result = await Api.post('/sample-feature/reset', {});
      this._count = result.count;
      this._lastSource = 'reset';
      this._renderCounter(true);
      Toast.success(i18n.t('pages.sampleFeature.resetSuccess'));
    } catch (err) {
      Toast.error(err.message);
    }
  },

  // ─── "View source" modal ─────────────────────────────
  // Fetches the file from the local /js or /public path. Backend doesn't
  // expose src/ directly (intentional — no source leakage in production),
  // so we link to GitHub for those, and only show local for public/js files.
  _showSourceModal(file) {
    const isLocal = file.startsWith('public/js/');
    const localPath = isLocal ? '/' + file.replace(/^public\//, '') : null;

    Modal.open(`
      <div class="modal-header">
        <h3><i class="fas fa-code" style="color:var(--accent);margin-right:10px"></i>
          <code style="font-size:14px;font-family:'JetBrains Mono',monospace">${Utils.escapeHtml(file)}</code>
        </h3>
        <button class="modal-close-btn" id="modal-x"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-body" id="sf-source-body">
        <div class="text-muted text-sm" style="text-align:center;padding:20px">
          <i class="fas fa-spinner fa-spin"></i> ${i18n.t('pages.sampleFeature.loadingSource')}
        </div>
      </div>
      <div class="modal-footer" style="display:flex;justify-content:space-between;gap:8px">
        <a href="${this._ghBase}${file}" target="_blank" rel="noopener" class="btn btn-sm">
          <i class="fab fa-github"></i> ${i18n.t('pages.sampleFeature.viewOnGithub')}
        </a>
        <button class="btn btn-sm btn-primary" id="sf-source-close">${i18n.t('common.close')}</button>
      </div>
    `, { size: 'lg' });

    document.getElementById('sf-source-close')?.addEventListener('click', () => Modal.close());
    document.getElementById('modal-x')?.addEventListener('click', () => Modal.close());

    const body = document.getElementById('sf-source-body');
    if (isLocal) {
      fetch(localPath)
        .then(r => r.text())
        .then(text => {
          body.innerHTML = `<pre style="margin:0;background:var(--bg);padding:14px;border-radius:var(--radius-sm);max-height:60vh;overflow:auto;font-size:12px;line-height:1.5;font-family:'JetBrains Mono',monospace"><code>${Utils.escapeHtml(text)}</code></pre>`;
        })
        .catch(err => {
          body.innerHTML = `<div class="text-muted text-sm" style="text-align:center;padding:20px;color:var(--red)">${Utils.escapeHtml(err.message)}</div>`;
        });
    } else {
      // Server-side files aren't directly fetchable; point users to GitHub.
      body.innerHTML = `
        <div class="text-muted text-sm" style="text-align:center;padding:20px">
          <i class="fas fa-info-circle"></i> ${i18n.t('pages.sampleFeature.serverSideHint')}
        </div>
      `;
    }
  },
};

window.SampleFeaturePage = SampleFeaturePage;
