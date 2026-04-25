/* ═══════════════════════════════════════════════════
   pages/system.js — System Information & Resources
   ═══════════════════════════════════════════════════ */
'use strict';

const SystemPage = {
  _tab: 'info',
  _charts: {},

  async render(container) {
    container.innerHTML = `
      <div class="page-header">
        <h2><i class="fas fa-server"></i> ${i18n.t('pages.system.title')}</h2>
        <div class="page-actions">
          <button class="btn btn-sm btn-secondary" id="sys-refresh">
            <i class="fas fa-sync-alt"></i>
          </button>
        </div>
      </div>
      <div class="tabs" id="sys-tabs">
        <button class="tab active" data-tab="info">${i18n.t('pages.system.tabInfo')}</button>
        <button class="tab" data-tab="health">${i18n.t('pages.system.tabHealth')}</button>
        <button class="tab" data-tab="disk">${i18n.t('pages.system.tabDisk')}</button>
        <button class="tab" data-tab="events">${i18n.t('pages.system.tabEvents')}</button>
        <button class="tab" data-tab="schedules">${i18n.t('pages.system.tabSchedules')}</button>
        <button class="tab" data-tab="backup">${i18n.t('pages.system.tabBackup')}</button>
        <button class="tab" data-tab="database"><i class="fas fa-database" style="margin-right:4px"></i> Database</button>
        <button class="tab" data-tab="tools"><i class="fas fa-toolbox" style="margin-right:4px"></i> Tools</button>
        <button class="tab" data-tab="templates"><i class="fas fa-rocket" style="margin-right:4px"></i> Templates</button>
        <button class="tab" data-tab="ssl"><i class="fas fa-shield-alt" style="margin-right:4px"></i> SSL/TLS</button>
        <button class="tab" data-tab="cis"><i class="fas fa-clipboard-check" style="margin-right:4px"></i> CIS Benchmark</button>
        <button class="tab" data-tab="secrets"><i class="fas fa-user-secret" style="margin-right:4px"></i> Secrets</button>
        <button class="tab" data-tab="egress"><i class="fas fa-network-wired" style="margin-right:4px"></i> Egress</button>
        <button class="tab" data-tab="translations"><i class="fas fa-language" style="margin-right:4px"></i> Translations</button>
        <button class="tab" data-tab="prune">${i18n.t('pages.system.tabPrune')}</button>
        <button class="tab" data-tab="audit">${i18n.t('pages.system.tabAudit')}</button>
      </div>
      <div id="sys-content">Loading...</div>
    `;

    container.querySelectorAll('.tab').forEach(t => {
      t.addEventListener('click', () => {
        container.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        this._tab = t.dataset.tab;
        this._renderTab();
      });
    });

    container.querySelector('#sys-refresh').addEventListener('click', () => this._renderTab());
    await this._renderTab();
  },

  async _renderTab() {
    const el = document.getElementById('sys-content');
    if (!el) return;

    try {
      if (this._tab === 'info') await this._renderInfo(el);
      else if (this._tab === 'health') await this._renderHealth(el);
      else if (this._tab === 'disk') await this._renderDisk(el);
      else if (this._tab === 'events') await this._renderEvents(el);
      else if (this._tab === 'schedules') await this._renderSchedules(el);
      else if (this._tab === 'backup') this._renderBackup(el);
      else if (this._tab === 'database') await this._renderDatabase(el);
      else if (this._tab === 'tools') this._renderTools(el);
      else if (this._tab === 'templates') await this._renderTemplates(el);
      else if (this._tab === 'ssl') await this._renderSsl(el);
      else if (this._tab === 'cis') await this._renderCisBenchmark(el);
      else if (this._tab === 'secrets') await this._renderSecretsAudit(el);
      else if (this._tab === 'egress') await this._renderEgressAudit(el);
      else if (this._tab === 'translations') await this._renderTranslations(el);
      else if (this._tab === 'prune') this._renderPrune(el);
      else if (this._tab === 'audit') await this._renderAudit(el);
    } catch (err) {
      el.innerHTML = `<div class="empty-msg">Error: ${err.message}</div>`;
    }
  },

  async _renderInfo(el) {
    const info = await Api.getSystemInfo();
    // Backend maps to lowercase: hostname, os, kernelVersion, dockerVersion, apiVersion, etc.
    const containersTotal = info.containers || info.Containers || 0;
    const containersRunning = info.containersRunning || info.ContainersRunning || 0;
    el.innerHTML = `
      <div class="info-grid">
        <div class="card">
          <div class="card-header"><h3>${i18n.t('pages.system.dockerEngine')}</h3></div>
          <div class="card-body">
            <table class="info-table">
              <tr><td>${i18n.t('pages.system.version')}</td><td>${info.dockerVersion || info.ServerVersion || '—'}</td></tr>
              <tr><td>${i18n.t('pages.system.apiVersion')}</td><td>${info.apiVersion || info.ApiVersion || '—'}</td></tr>
              <tr><td>${i18n.t('pages.system.os')}</td><td>${info.os || info.OperatingSystem || '—'}</td></tr>
              <tr><td>${i18n.t('pages.system.kernel')}</td><td>${info.kernelVersion || info.KernelVersion || '—'}</td></tr>
              <tr><td>${i18n.t('pages.system.storageDriver')}</td><td>${info.storageDriver || info.Driver || '—'}</td></tr>
            </table>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><h3>${i18n.t('pages.system.hostTitle')}</h3></div>
          <div class="card-body">
            <table class="info-table">
              <tr><td>${i18n.t('pages.system.hostname')}</td><td>${info.hostname || info.Name || '—'}</td></tr>
              <tr><td>${i18n.t('pages.system.cpus')}</td><td>${info.cpus || info.NCPU || '—'}</td></tr>
              <tr><td>${i18n.t('pages.system.memoryLabel')}</td><td>${Utils.formatBytes(info.memTotal || info.MemTotal)}</td></tr>
              <tr><td>${i18n.t('pages.system.containersLabel')}</td><td>${containersTotal} (${i18n.t('pages.system.runningCount', { count: containersRunning })})</td></tr>
              <tr><td>${i18n.t('pages.system.imagesLabel')}</td><td>${info.images || info.Images || 0}</td></tr>
              <tr><td>${i18n.t('pages.system.uptime')}</td><td>${info.uptime ? Utils.formatDuration(info.uptime) : '—'}</td></tr>
              <tr><td>${i18n.t('pages.system.serverTime')}</td><td>${info.serverTime ? Utils.formatDate(info.serverTime) : '—'}</td></tr>
            </table>
          </div>
        </div>
      </div>
      <!-- Updates Card -->
      <div class="card" style="margin-top:16px">
        <div class="card-header">
          <h3><i class="fas fa-arrow-circle-up text-dim" style="margin-right:8px"></i>${i18n.t('pages.system.updatesTitle')}</h3>
          <button class="btn btn-sm btn-secondary" id="check-updates-btn">
            <i class="fas fa-sync-alt"></i> ${i18n.t('pages.system.checkUpdates')}
          </button>
        </div>
        <div class="card-body" id="updates-content">
          <div class="text-muted text-sm">${i18n.t('pages.system.updatesClickCheck')}</div>
        </div>
      </div>
    `;
    el.querySelector('#check-updates-btn').addEventListener('click', () => this._loadUpdates());
    // Auto-check updates
    this._loadUpdates();

    // MOTD editor (admin only) — simple: one textarea, one message per line, checkbox for random
    const motdCard = document.createElement('div');
    motdCard.className = 'card';
    motdCard.style.marginTop = '16px';
    motdCard.innerHTML = `
      <div class="card-header"><h3><i class="fas fa-bullhorn" style="margin-right:8px;color:var(--yellow)"></i>Login Banner (MOTD)</h3></div>
      <div class="card-body">
        <p class="text-muted text-sm" style="margin-bottom:10px">Enter one message per line. If "Pick random" is checked, a random line is shown on the login page each time. Otherwise the first line is always shown.</p>
        <textarea id="motd-editor" class="form-control" rows="6" placeholder="Welcome to Docker Dash!&#10;Maintenance window: Sunday 02:00-04:00&#10;Contact admin@example.com for access" style="font-family:var(--mono);font-size:12px"></textarea>
        <div style="display:flex;align-items:center;gap:12px;margin-top:10px">
          <label class="toggle-label"><input type="checkbox" id="motd-random"> Pick random line each login</label>
          <span style="flex:1"></span>
          <button class="btn btn-sm btn-primary" id="motd-save"><i class="fas fa-save"></i> Save</button>
          <button class="btn btn-sm btn-secondary" id="motd-clear"><i class="fas fa-times"></i> Clear</button>
        </div>
      </div>
    `;
    el.appendChild(motdCard);

    // Load
    try {
      const cfg = await Api.getMotdConfig();
      motdCard.querySelector('#motd-editor').value = cfg.lines || '';
      motdCard.querySelector('#motd-random').checked = !!cfg.random;
    } catch {}

    motdCard.querySelector('#motd-save')?.addEventListener('click', async () => {
      const lines = motdCard.querySelector('#motd-editor')?.value || '';
      const random = motdCard.querySelector('#motd-random')?.checked || false;
      try {
        await Api.setMotd({ lines, random });
        Toast.success('Login banner saved');
      } catch (err) { Toast.error(err.message); }
    });

    motdCard.querySelector('#motd-clear')?.addEventListener('click', async () => {
      try {
        await Api.setMotd({ lines: '', random: false });
        motdCard.querySelector('#motd-editor').value = '';
        motdCard.querySelector('#motd-random').checked = false;
        Toast.success('Login banner cleared');
      } catch (err) { Toast.error(err.message); }
    });

    // Theme Customizer card (all users)
    const themeCard = document.createElement('div');
    themeCard.className = 'card';
    themeCard.style.marginTop = '16px';
    themeCard.innerHTML = `
      <div class="card-header"><h3><i class="fas fa-palette" style="margin-right:8px;color:var(--accent)"></i>Theme Customizer</h3></div>
      <div class="card-body">
        <p class="text-muted text-sm" style="margin-bottom:12px">Choose an accent color or select a preset theme. Changes apply instantly and are saved per user.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
          <button class="theme-preset-btn" data-accent="#388bfd" title="Default Blue" style="width:32px;height:32px;border-radius:50%;border:2px solid var(--border);background:#388bfd;cursor:pointer"></button>
          <button class="theme-preset-btn" data-accent="#3fb950" title="Green" style="width:32px;height:32px;border-radius:50%;border:2px solid var(--border);background:#3fb950;cursor:pointer"></button>
          <button class="theme-preset-btn" data-accent="#d29922" title="Amber" style="width:32px;height:32px;border-radius:50%;border:2px solid var(--border);background:#d29922;cursor:pointer"></button>
          <button class="theme-preset-btn" data-accent="#f85149" title="Red" style="width:32px;height:32px;border-radius:50%;border:2px solid var(--border);background:#f85149;cursor:pointer"></button>
          <button class="theme-preset-btn" data-accent="#a371f7" title="Purple" style="width:32px;height:32px;border-radius:50%;border:2px solid var(--border);background:#a371f7;cursor:pointer"></button>
          <button class="theme-preset-btn" data-accent="#79c0ff" title="Sky" style="width:32px;height:32px;border-radius:50%;border:2px solid var(--border);background:#79c0ff;cursor:pointer"></button>
          <button class="theme-preset-btn" data-accent="#f778ba" title="Pink" style="width:32px;height:32px;border-radius:50%;border:2px solid var(--border);background:#f778ba;cursor:pointer"></button>
          <button class="theme-preset-btn" data-accent="#ffa657" title="Orange" style="width:32px;height:32px;border-radius:50%;border:2px solid var(--border);background:#ffa657;cursor:pointer"></button>
        </div>
        <div style="display:flex;align-items:center;gap:12px">
          <label class="text-sm" style="font-weight:600">Custom:</label>
          <input type="color" id="theme-accent-picker" value="#388bfd" style="width:40px;height:28px;border:1px solid var(--border);border-radius:4px;cursor:pointer;background:none">
          <button class="btn btn-sm btn-secondary" id="theme-reset">Reset to Default</button>
        </div>
      </div>
    `;
    el.appendChild(themeCard);

    // Highlight active preset
    const currentAccent = localStorage.getItem('dd-accent') || getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    const picker = themeCard.querySelector('#theme-accent-picker');
    if (picker && currentAccent) picker.value = currentAccent;

    themeCard.querySelectorAll('.theme-preset-btn').forEach(btn => {
      if (btn.dataset.accent === currentAccent) {
        btn.style.borderColor = '#fff';
        btn.style.boxShadow = '0 0 0 2px var(--text-bright)';
      }
      btn.addEventListener('click', () => {
        this._applyAccent(btn.dataset.accent);
        themeCard.querySelectorAll('.theme-preset-btn').forEach(b => { b.style.borderColor = 'var(--border)'; b.style.boxShadow = 'none'; });
        btn.style.borderColor = '#fff';
        btn.style.boxShadow = '0 0 0 2px var(--text-bright)';
        if (picker) picker.value = btn.dataset.accent;
      });
    });

    picker?.addEventListener('input', (e) => {
      this._applyAccent(e.target.value);
      themeCard.querySelectorAll('.theme-preset-btn').forEach(b => { b.style.borderColor = 'var(--border)'; b.style.boxShadow = 'none'; });
    });

    themeCard.querySelector('#theme-reset')?.addEventListener('click', () => {
      this._applyAccent('#388bfd');
      themeCard.querySelectorAll('.theme-preset-btn').forEach(b => { b.style.borderColor = 'var(--border)'; b.style.boxShadow = 'none'; });
      const defaultBtn = themeCard.querySelector('.theme-preset-btn[data-accent="#388bfd"]');
      if (defaultBtn) { defaultBtn.style.borderColor = '#fff'; defaultBtn.style.boxShadow = '0 0 0 2px var(--text-bright)'; }
      if (picker) picker.value = '#388bfd';
    });
  },

  _applyAccent(color) {
    document.documentElement.style.setProperty('--accent', color);
    document.documentElement.style.setProperty('--accent-hover', color);
    document.documentElement.style.setProperty('--accent-dim', color + '26');
    localStorage.setItem('dd-accent', color);
    Api.saveUserPreference('accent', color).catch(() => {});
  },

  async _loadUpdates() {
    const el = document.getElementById('updates-content');
    if (!el) return;
    el.innerHTML = `<div class="text-muted text-sm"><i class="fas fa-spinner fa-spin"></i> ${i18n.t('pages.system.updatesChecking')}</div>`;
    try {
      const data = await Api.checkUpdates();
      const d = data.docker || {};
      const o = data.os || {};
      const app = data.app || {};

      const dockerBadge = d.updateAvailable
        ? `<span class="badge badge-warning"><i class="fas fa-arrow-up"></i> ${i18n.t('pages.system.updateAvailable')}</span>`
        : `<span class="badge badge-running"><i class="fas fa-check"></i> ${i18n.t('pages.system.upToDate')}</span>`;

      const osBadge = o.updateAvailable
        ? `<span class="badge badge-warning"><i class="fas fa-arrow-up"></i> ${i18n.t('pages.system.osUpdatesCount', { count: o.total })}</span>`
        : `<span class="badge badge-running"><i class="fas fa-check"></i> ${i18n.t('pages.system.upToDate')}</span>`;

      let osPackageList = '';
      if (o.packages && o.packages.length > 0) {
        osPackageList = `
          <details style="margin-top:8px">
            <summary class="text-sm" style="cursor:pointer;color:var(--accent)">${i18n.t('pages.system.showPackages', { count: o.total })}</summary>
            <div style="max-height:200px;overflow-y:auto;margin-top:6px">
              <table class="data-table compact">
                <thead><tr><th>${i18n.t('pages.system.packageName')}</th><th>${i18n.t('pages.system.packageNew')}</th></tr></thead>
                <tbody>${o.packages.map(p => `
                  <tr>
                    <td class="mono text-sm">${Utils.escapeHtml(p.name)}</td>
                    <td class="mono text-sm">${Utils.escapeHtml(p.newVersion)}</td>
                  </tr>
                `).join('')}</tbody>
              </table>
            </div>
          </details>`;
      }

      el.innerHTML = `
        <table class="info-table">
          <tr>
            <td><i class="fas fa-whale" style="margin-right:6px"></i> ${i18n.t('pages.system.dockerVersionLabel')}</td>
            <td>
              <span class="mono">${Utils.escapeHtml(d.current || '?')}</span>
              ${d.latest ? `<span class="text-dim text-sm" style="margin-left:8px">(${i18n.t('pages.system.latest')}: ${Utils.escapeHtml(d.latest)})</span>` : ''}
              <span style="margin-left:8px">${dockerBadge}</span>
            </td>
          </tr>
          <tr>
            <td><i class="fas fa-server" style="margin-right:6px"></i> ${i18n.t('pages.system.osUpdatesLabel')}</td>
            <td>${osBadge}</td>
          </tr>
          <tr>
            <td><i class="fas fa-code-branch" style="margin-right:6px"></i> ${i18n.t('pages.system.appVersionLabel')}</td>
            <td>
              <span class="mono">v${Utils.escapeHtml(app.current || app.version || '?')}</span>
              ${app.latest ? `<span class="text-dim text-sm" style="margin-left:8px">(${i18n.t('pages.system.latest')}: ${Utils.escapeHtml(app.latest)})</span>` : ''}
              <span style="margin-left:8px">${
                app.updateAvailable
                  ? `<a href="#" id="app-update-modal-link" class="badge badge-warning" style="text-decoration:none"><i class="fas fa-arrow-up"></i> ${i18n.t('pages.system.updateAvailable')}</a>`
                  : (app.enabled === false
                      ? `<span class="badge" style="background:var(--surface2);color:var(--text-dim)"><i class="fas fa-pause"></i> ${i18n.t('common.disabled')}</span>`
                      : `<span class="badge badge-running"><i class="fas fa-check"></i> ${i18n.t('pages.system.upToDate')}</span>`)
              }</span>
            </td>
          </tr>
        </table>
        ${osPackageList}
      `;

      // Open the update-notifier modal when the user clicks the "Update available" badge.
      // Re-init() first so the modal reflects the freshly-fetched cache (the
      // /check-updates endpoint just forced a refresh).
      el.querySelector('#app-update-modal-link')?.addEventListener('click', async (e) => {
        e.preventDefault();
        try { await window.UpdateNotifier?.init(); } catch { /* fall through to openModal anyway */ }
        window.UpdateNotifier?.openModal();
      });
    } catch (err) {
      el.innerHTML = `<div class="text-muted text-sm"><i class="fas fa-exclamation-triangle" style="color:var(--yellow)"></i> ${i18n.t('pages.system.updatesError', { message: err.message })}</div>`;
    }
  },

  async _renderDisk(el) {
    const du = await Api.getDiskUsage();
    const images = (du.Images || []).reduce((sum, i) => sum + (i.Size || 0), 0);
    const containers = (du.Containers || []).reduce((sum, c) => sum + (c.SizeRw || 0), 0);
    const volumes = (du.Volumes || []).reduce((sum, v) => sum + (v.UsageData?.Size || 0), 0);
    const cache = du.BuildCache?.reduce((sum, b) => sum + (b.Size || 0), 0) || 0;

    el.innerHTML = `
      <div class="info-grid">
        <div class="card">
          <div class="card-header"><h3>${i18n.t('pages.system.diskBreakdown')}</h3></div>
          <div class="card-body chart-container" style="height:250px">
            <canvas id="disk-chart"></canvas>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><h3>${i18n.t('pages.system.summary')}</h3></div>
          <div class="card-body">
            <table class="info-table">
              <tr><td>${i18n.t('pages.system.diskImages')}</td><td>${Utils.formatBytes(images)}</td></tr>
              <tr><td>${i18n.t('pages.system.diskContainers')}</td><td>${Utils.formatBytes(containers)}</td></tr>
              <tr><td>${i18n.t('pages.system.diskVolumes')}</td><td>${Utils.formatBytes(volumes)}</td></tr>
              <tr><td>${i18n.t('pages.system.buildCache')}</td><td>${Utils.formatBytes(cache)}</td></tr>
              <tr><td><strong>${i18n.t('pages.system.total')}</strong></td><td><strong>${Utils.formatBytes(images + containers + volumes + cache)}</strong></td></tr>
            </table>
          </div>
        </div>
      </div>
    `;

    // Render pie chart
    if (this._charts.disk) this._charts.disk.destroy();
    const canvas = document.getElementById('disk-chart');
    if (canvas) {
      this._charts.disk = new Chart(canvas, {
        type: 'doughnut',
        data: {
          labels: [i18n.t('pages.system.diskImages'), i18n.t('pages.system.diskContainers'), i18n.t('pages.system.diskVolumes'), i18n.t('pages.system.buildCache')],
          datasets: [{ data: [images, containers, volumes, cache], backgroundColor: ['#0ea5e9', '#22c55e', '#a855f7', '#eab308'], borderWidth: 0 }],
        },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '60%',
          plugins: {
            legend: { display: true, position: 'bottom', labels: { color: '#8899aa' } },
            tooltip: { callbacks: { label: ctx => `${ctx.label}: ${Utils.formatBytes(ctx.raw)}` } },
          },
        },
      });
    }
  },

  async _renderEvents(el) {
    const res = await Api.get('/system/events?limit=50');
    const events = res.events || res || [];

    if (events.length === 0) {
      el.innerHTML = `<div class="empty-msg">${i18n.t('pages.system.noRecentEvents')}</div>`;
      return;
    }

    el.innerHTML = `<table class="data-table">
      <thead><tr><th>${i18n.t('pages.system.eventTime')}</th><th>${i18n.t('pages.system.eventType')}</th><th>${i18n.t('pages.system.eventAction')}</th><th>${i18n.t('pages.system.eventActor')}</th></tr></thead>
      <tbody>${events.map(e => `
        <tr>
          <td>${Utils.formatDate(e.event_time || e.eventTime)}</td>
          <td>${e.event_type || e.eventType || ''}</td>
          <td><span class="badge event-${e.action}">${e.action}</span></td>
          <td class="mono text-sm">${Utils.escapeHtml(e.actor_name || e.actorName || Utils.shortId(e.actor_id || e.actorId))}</td>
        </tr>
      `).join('')}</tbody>
    </table>`;
  },

  // ─── Stacks Tab ──────────────────────────────
  async _renderStacks(el) {
    el.innerHTML = `<div class="text-muted"><i class="fas fa-spinner fa-spin"></i> Loading stacks...</div>`;
    try {
      const stacks = await Api.getStacks();

      el.innerHTML = `
        <div style="margin-bottom:12px;display:flex;justify-content:flex-end">
          <button class="btn btn-sm btn-primary" id="create-stack-btn"><i class="fas fa-plus"></i> Create Stack</button>
        </div>
        ${stacks.length === 0 ? '<div class="empty-msg"><i class="fas fa-layer-group"></i><p>No Docker Compose stacks found. Create one above.</p></div>' : `
        <div class="info-grid" style="margin-top:0">
          ${stacks.map(s => `
            <div class="card stack-card" data-stack="${Utils.escapeHtml(s.name)}" style="cursor:pointer">
              <div class="card-header">
                <h3><i class="fas fa-layer-group" style="margin-right:8px;color:var(--accent)"></i>${Utils.escapeHtml(s.name)}</h3>
                <span class="badge ${s.running === s.total ? 'badge-running' : s.running > 0 ? 'badge-warning' : 'badge-stopped'}">${s.running}/${s.total}</span>
              </div>
              <div class="card-body">
                <div class="text-sm text-muted" style="margin-bottom:8px">${Utils.escapeHtml(s.workingDir || 'Unknown directory')}</div>
                <div style="display:flex;flex-wrap:wrap;gap:4px">
                  ${s.containers.map(c => `<span class="badge ${c.state === 'running' ? 'badge-running' : 'badge-stopped'}" style="font-size:10px">${Utils.escapeHtml(c.name)}</span>`).join('')}
                </div>
              </div>
            </div>
          `).join('')}
        </div>`}
      `;

      el.querySelectorAll('.stack-card').forEach(card => {
        card.addEventListener('click', () => this._openStackDetail(card.dataset.stack));
      });
      el.querySelector('#create-stack-btn').addEventListener('click', () => this._createStackDialog());
    } catch (err) {
      el.innerHTML = `<div class="empty-msg">Error: ${err.message}</div>`;
    }
  },

  async _createStackDialog() {
    const result = await Modal.form(`
      <div class="form-group">
        <label>Stack Name</label>
        <input type="text" id="stack-name" class="form-control" placeholder="my-stack" required>
      </div>
      <div class="form-group">
        <label>Directory Path (on server)</label>
        <input type="text" id="stack-dir" class="form-control" placeholder="/opt/my-stack">
      </div>
      <div class="form-group">
        <label>docker-compose.yml</label>
        <textarea id="stack-yaml" class="form-control" rows="14" style="font-family:var(--mono);font-size:12px" placeholder="services:
  web:
    image: nginx:alpine
    ports:
      - '8080:80'
    restart: unless-stopped"></textarea>
      </div>
      <div class="form-group">
        <label>Environment Variables <span class="text-muted text-sm">(optional, one per line: KEY=value)</span></label>
        <textarea id="stack-env" class="form-control" rows="4" style="font-family:var(--mono);font-size:12px" placeholder="DB_HOST=localhost
DB_PASS=secret"></textarea>
      </div>
    `, {
      title: 'Create New Stack',
      width: '650px',
      onSubmit: (content) => {
        const name = content.querySelector('#stack-name').value.trim();
        const dir = content.querySelector('#stack-dir').value.trim();
        const yaml = content.querySelector('#stack-yaml').value;
        const env = content.querySelector('#stack-env').value;
        if (!name || !yaml) { Toast.warning('Stack name and compose YAML are required'); return false; }
        return { name, dir: dir || `/opt/${name}`, yaml, env };
      },
    });

    if (!result) return;

    try {
      await Api.post('/system/stacks', result);
      Toast.success(`Stack "${result.name}" created and deployed`);
      await this._renderStacks(document.getElementById('sys-content'));
    } catch (err) {
      Toast.error(err.message);
    }
  },

  async _openStackDetail(name) {
    const el = document.getElementById('sys-content');
    el.innerHTML = `<div class="text-muted"><i class="fas fa-spinner fa-spin"></i> Loading...</div>`;
    try {
      const stack = await Api.getStack(name);

      el.innerHTML = `
        <div style="margin-bottom:12px">
          <button class="btn btn-sm btn-secondary" id="stack-back"><i class="fas fa-arrow-left"></i> Back to Stacks</button>
        </div>
        <div class="card">
          <div class="card-header">
            <h3><i class="fas fa-layer-group" style="margin-right:8px"></i>${Utils.escapeHtml(name)}</h3>
            <div class="btn-group">
              ${stack.config ? '<button class="btn btn-sm btn-secondary" id="stack-validate"><i class="fas fa-check-circle"></i> Validate</button>' : ''}
              ${stack.config ? '<button class="btn btn-sm btn-primary" id="stack-save"><i class="fas fa-save"></i> Save</button>' : ''}
              <button class="btn btn-sm btn-accent" id="stack-deploy"><i class="fas fa-rocket"></i> Deploy</button>
            </div>
          </div>
          <div class="card-body" style="padding:0">
            ${stack.config
              ? `<textarea id="stack-editor" style="width:100%;min-height:400px;border:none;background:var(--surface2);color:var(--text);font-family:var(--mono);font-size:12px;padding:16px;resize:vertical;outline:none">${Utils.escapeHtml(stack.config)}</textarea>`
              : '<div class="empty-msg">Compose file not found on server</div>'
            }
          </div>
        </div>
        <div class="card" style="margin-top:12px">
          <div class="card-header">
            <h3><i class="fas fa-key" style="margin-right:8px"></i>Environment Variables (.env)</h3>
            <button class="btn btn-sm btn-secondary" id="stack-save-env"><i class="fas fa-save"></i> Save .env</button>
          </div>
          <div class="card-body" style="padding:0">
            <textarea id="stack-env-editor" style="width:100%;min-height:120px;border:none;background:var(--surface2);color:var(--text);font-family:var(--mono);font-size:12px;padding:16px;resize:vertical;outline:none" placeholder="KEY=value (one per line)">${Utils.escapeHtml(stack.envFile || '')}</textarea>
          </div>
        </div>
        <div class="card" style="margin-top:12px">
          <div class="card-header"><h3>Services</h3></div>
          <div class="card-body" style="padding:0">
            <table class="data-table">
              <thead><tr><th style="text-align:left">Container</th><th>Image</th><th>State</th></tr></thead>
              <tbody>${stack.containers.map(c => `
                <tr style="cursor:pointer" data-nav-container="${c.id}">
                  <td style="text-align:left" class="mono text-sm">${Utils.escapeHtml(c.name)}</td>
                  <td class="text-sm">${Utils.escapeHtml(c.image)}</td>
                  <td><span class="badge ${c.state === 'running' ? 'badge-running' : 'badge-stopped'}">${c.state}</span></td>
                </tr>
              `).join('')}</tbody>
            </table>
          </div>
        </div>
      `;

      el.querySelector('#stack-back').addEventListener('click', () => this._renderStacks(el));

      // Wire up container navigation clicks
      el.querySelectorAll('[data-nav-container]').forEach(row => {
        row.addEventListener('click', () => { location.hash = '#/containers/' + row.dataset.navContainer; });
      });

      const validateBtn = el.querySelector('#stack-validate');
      if (validateBtn) {
        validateBtn.addEventListener('click', async () => {
          const editor = el.querySelector('#stack-editor');
          try {
            const result = await Api.validateStackConfig(name, { config: editor.value, workingDir: stack.workingDir });
            if (result.valid) {
              Toast.success('Valid YAML configuration');
            } else {
              Toast.error('Validation failed: ' + (result.error || 'Unknown error'));
            }
          } catch (err) { Toast.error(err.message); }
        });
      }

      const saveBtn = el.querySelector('#stack-save');
      if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
          const editor = el.querySelector('#stack-editor');
          try {
            await Api.saveStackConfig(name, { config: editor.value, workingDir: stack.workingDir });
            Toast.success('Configuration saved');
          } catch (err) { Toast.error(err.message); }
        });
      }

      el.querySelector('#stack-save-env').addEventListener('click', async () => {
        const envContent = el.querySelector('#stack-env-editor').value;
        try {
          await Api.post(`/system/stacks/${encodeURIComponent(name)}/env`, { env: envContent, workingDir: stack.workingDir });
          Toast.success('.env file saved');
        } catch (err) { Toast.error(err.message); }
      });

      el.querySelector('#stack-deploy').addEventListener('click', async () => {
        const ok = await Modal.confirm(`Deploy stack "${name}"? This will run docker compose up -d.`, { confirmText: 'Deploy' });
        if (!ok) return;
        try {
          const result = await Api.deployStack(name, { workingDir: stack.workingDir });
          Toast.success('Stack deployed');
        } catch (err) { Toast.error(err.message); }
      });
    } catch (err) {
      el.innerHTML = `<div class="empty-msg">Error: ${err.message}</div>`;
    }
  },

  // ─── Database Tab ──────────────────────────────
  async _renderDatabase(el) {
    el.innerHTML = `<div class="text-muted"><i class="fas fa-spinner fa-spin"></i> Loading database info...</div>`;
    try {
      const data = await Api.getDatabaseInfo();
      const f = data.file;
      const e = data.engine;
      const tables = data.tables || [];
      const ret = data.retention || {};

      // Top 10 tables by size (or by row count if sizes unavailable)
      const topTables = tables
        .filter(t => t.rows > 0 || t.size > 0)
        .sort((a, b) => (b.size || b.rows) - (a.size || a.rows))
        .slice(0, 10);

      const totalRows = tables.reduce((s, t) => s + t.rows, 0);
      const totalDataSize = tables.reduce((s, t) => s + (t.size || 0), 0);

      el.innerHTML = `
        <!-- Quick Actions -->
        <div style="display:flex;justify-content:flex-end;margin-bottom:12px">
          <button class="btn btn-sm btn-primary" id="db-backup-now"><i class="fas fa-download"></i> Create Backup Now</button>
        </div>
        <!-- Overview Cards -->
        <div class="stat-cards" style="display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap">
          <div class="card" style="flex:1;min-width:140px;padding:16px;text-align:center">
            <div style="font-size:24px;font-weight:700;color:var(--accent)">${Utils.formatBytes(f.size)}</div>
            <div class="text-muted text-sm">DB File Size</div>
          </div>
          <div class="card" style="flex:1;min-width:140px;padding:16px;text-align:center">
            <div style="font-size:24px;font-weight:700;color:${f.walSize > 50 * 1024 * 1024 ? 'var(--yellow)' : 'var(--green)'}">${Utils.formatBytes(f.walSize)}</div>
            <div class="text-muted text-sm">WAL Size</div>
          </div>
          <div class="card" style="flex:1;min-width:140px;padding:16px;text-align:center">
            <div style="font-size:24px;font-weight:700;color:var(--text)">${tables.length}</div>
            <div class="text-muted text-sm">Tables</div>
          </div>
          <div class="card" style="flex:1;min-width:140px;padding:16px;text-align:center">
            <div style="font-size:24px;font-weight:700;color:${totalRows > 1000000 ? 'var(--yellow)' : 'var(--text)'}">${totalRows.toLocaleString()}</div>
            <div class="text-muted text-sm">Total Rows</div>
          </div>
        </div>

        <div class="info-grid">
          <!-- Top 10 Tables -->
          <div class="card">
            <div class="card-header"><h3><i class="fas fa-table" style="margin-right:8px"></i>Top 10 Tables</h3></div>
            <div class="card-body" style="padding:0">
              <table class="data-table">
                <thead><tr><th style="text-align:left">Table</th><th>Rows</th><th>Size</th><th>Indexes</th></tr></thead>
                <tbody>${topTables.map(t => {
                  const pct = totalDataSize > 0 ? ((t.size / totalDataSize) * 100).toFixed(1) : 0;
                  const sizeColor = t.size > 100 * 1024 * 1024 ? 'color:var(--yellow);font-weight:600' : '';
                  return `<tr>
                    <td style="text-align:left" class="mono text-sm">${Utils.escapeHtml(t.name)}</td>
                    <td>${t.rows.toLocaleString()}</td>
                    <td style="${sizeColor}">${t.size > 0 ? Utils.formatBytes(t.size) : '—'}${pct > 1 ? ` <span class="text-muted text-sm">(${pct}%)</span>` : ''}</td>
                    <td>${t.indexes}</td>
                  </tr>`;
                }).join('')}</tbody>
              </table>
            </div>
          </div>

          <!-- Engine Info & Retention -->
          <div class="card">
            <div class="card-header"><h3><i class="fas fa-cog" style="margin-right:8px"></i>Engine & Retention</h3></div>
            <div class="card-body">
              <table class="info-table">
                <tr><td>SQLite Version</td><td class="mono">${Utils.escapeHtml(e.sqliteVersion)}</td></tr>
                <tr><td>Journal Mode</td><td class="mono">${Utils.escapeHtml(e.journalMode)}</td></tr>
                <tr><td>Page Size</td><td>${Utils.formatBytes(e.pageSize)}</td></tr>
                <tr><td>Total Pages</td><td>${e.pageCount.toLocaleString()}</td></tr>
                <tr><td>Free Pages</td><td>${e.freelistCount.toLocaleString()} ${e.freelistBytes > 0 ? `(${Utils.formatBytes(e.freelistBytes)})` : ''}</td></tr>
                <tr><td>Last Modified</td><td>${Utils.formatDate(f.modified)}</td></tr>
              </table>

              <h4 style="margin:16px 0 8px;font-size:13px;text-transform:uppercase;color:var(--text-muted)">Data Retention</h4>
              <table class="info-table">
                <tr><td>Raw Stats</td><td>${ret.statsRawHours}h</td></tr>
                <tr><td>1-min Stats</td><td>${ret.stats1mDays}d</td></tr>
                <tr><td>1-hour Stats</td><td>${ret.stats1hDays}d</td></tr>
                <tr><td>Audit Log</td><td>${ret.auditDays}d</td></tr>
                <tr><td>Docker Events</td><td>${ret.eventDays}d</td></tr>
              </table>
            </div>
          </div>
        </div>

        <!-- Maintenance Actions -->
        <div class="card" style="margin-top:16px">
          <div class="card-header"><h3><i class="fas fa-tools" style="margin-right:8px"></i>Maintenance</h3></div>
          <div class="card-body">
            <div style="display:flex;gap:16px;flex-wrap:wrap">
              <div class="card" style="flex:1;min-width:260px;padding:20px">
                <h4><i class="fas fa-broom" style="color:var(--accent);margin-right:8px"></i>Cleanup Old Data</h4>
                <p class="text-muted text-sm" style="margin:8px 0">Delete all logs, stats, events, and audit entries older than retention limits. This runs automatically every hour.</p>
                <button class="btn btn-sm btn-warning" id="db-cleanup-btn">
                  <i class="fas fa-broom"></i> Run Cleanup Now
                </button>
                <div id="db-cleanup-result" style="margin-top:8px"></div>
              </div>
              <div class="card" style="flex:1;min-width:260px;padding:20px">
                <h4><i class="fas fa-fire" style="color:var(--red);margin-right:8px"></i>Deep Cleanup (24h)</h4>
                <p class="text-muted text-sm" style="margin:8px 0">Delete <strong>everything</strong> except the last 24 hours: stats, logs, audit trail, alerts, events, scan results, notifications. Useful to free up disk space quickly.</p>
                <button class="btn btn-sm btn-danger" id="db-deep-cleanup-btn">
                  <i class="fas fa-fire"></i> Deep Cleanup
                </button>
                <div id="db-deep-cleanup-result" style="margin-top:8px"></div>
              </div>
              <div class="card" style="flex:1;min-width:260px;padding:20px">
                <h4><i class="fas fa-compress-arrows-alt" style="color:var(--green);margin-right:8px"></i>Vacuum Database</h4>
                <p class="text-muted text-sm" style="margin:8px 0">Reclaim disk space by compacting the database file. Runs automatically daily at 03:30. May briefly slow down the app.</p>
                <button class="btn btn-sm btn-secondary" id="db-vacuum-btn">
                  <i class="fas fa-compress-arrows-alt"></i> Run Vacuum Now
                </button>
                <div id="db-vacuum-result" style="margin-top:8px"></div>
              </div>
              <div class="card" style="flex:1;min-width:260px;padding:20px">
                <h4><i class="fas fa-file-archive" style="color:var(--accent);margin-right:8px"></i>Diagnostic Bundle</h4>
                <p class="text-muted text-sm" style="margin:8px 0">Download a JSON file with Docker info, container states, recent logs, database stats, and system health. Useful for troubleshooting or support.</p>
                <button class="btn btn-sm btn-secondary" id="db-diagnostics-btn">
                  <i class="fas fa-download"></i> Download Diagnostics
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Active Sessions -->
        <div class="card" style="margin-top:16px">
          <div class="card-header"><h3><i class="fas fa-users" style="margin-right:8px"></i>Active Sessions</h3></div>
          <div class="card-body" id="sessions-panel">
            <div class="text-muted"><i class="fas fa-spinner fa-spin"></i> Loading sessions...</div>
          </div>
        </div>

        <!-- Docker Engine Versions -->
        <div class="card" style="margin-top:16px">
          <div class="card-header"><h3><i class="fab fa-docker" style="margin-right:8px;color:#2496ed"></i>Docker Engine Versions</h3></div>
          <div class="card-body" id="docker-versions-panel">
            <div class="text-muted"><i class="fas fa-spinner fa-spin"></i> Checking Docker versions...</div>
          </div>
        </div>

        <!-- Local Backup Files -->
        <div class="card" style="margin-top:16px">
          <div class="card-header"><h3><i class="fas fa-hdd" style="margin-right:8px;color:var(--accent)"></i>Local Backup Files</h3></div>
          <div class="card-body" id="backup-list-panel">
            <div class="text-muted"><i class="fas fa-spinner fa-spin"></i> Loading backup files...</div>
          </div>
        </div>

        <!-- TLS Certificates -->
        <div class="card" style="margin-top:16px">
          <div class="card-header"><h3><i class="fas fa-certificate" style="margin-right:8px;color:var(--green)"></i>TLS Certificates</h3></div>
          <div class="card-body" id="certs-panel">
            <div class="text-muted"><i class="fas fa-spinner fa-spin"></i> Loading certificates...</div>
          </div>
        </div>
      `;

      // Load sessions
      try {
        const sessions = await Api.getSessions();
        const sessionsEl = el.querySelector('#sessions-panel');
        if (sessionsEl && sessions.length > 0) {
          sessionsEl.innerHTML = `
            <table class="data-table compact">
              <thead><tr><th>User</th><th>IP</th><th>Started</th><th>Browser / Client</th><th></th></tr></thead>
              <tbody>
                ${sessions.map(s => `
                  <tr>
                    <td><i class="fas fa-user-circle" style="margin-right:6px;color:var(--accent)"></i>${Utils.escapeHtml(s.username)}${s.isCurrent ? ' <span class="badge badge-info" style="font-size:9px">you</span>' : ''}</td>
                    <td class="mono text-sm">${Utils.escapeHtml(s.ip || '—')}</td>
                    <td class="text-sm text-muted">${s.createdAt ? Utils.timeAgo(s.createdAt) : '—'}</td>
                    <td class="text-sm text-muted" style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${Utils.escapeHtml(s.userAgent || '')}">${Utils.escapeHtml((s.userAgent || '—').substring(0, 60))}${(s.userAgent || '').length > 60 ? '…' : ''}</td>
                    <td>${!s.isCurrent ? `<button class="action-btn danger" data-terminate-session="${s.id}" title="Terminate session"><i class="fas fa-times"></i></button>` : ''}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `;
          sessionsEl.querySelectorAll('[data-terminate-session]').forEach(btn => {
            btn.addEventListener('click', async () => {
              const ok = await Modal.confirm('Terminate this session? The user will be logged out.', { danger: true, confirmText: 'Terminate' });
              if (!ok) return;
              try {
                await Api.terminateSession(btn.dataset.terminateSession);
                Toast.success('Session terminated');
                btn.closest('tr').remove();
              } catch (err) { Toast.error(err.message); }
            });
          });
        } else if (sessionsEl) {
          sessionsEl.innerHTML = '<div class="text-muted text-sm">No active sessions found.</div>';
        }
      } catch { /* sessions not available */ }

      // Load Docker Engine versions
      try {
        const versionData = await Api.getDockerVersions();
        const versionsEl = el.querySelector('#docker-versions-panel');
        if (versionsEl) {
          const versions = versionData.versions || [];
          if (versions.length === 0) {
            versionsEl.innerHTML = '<div class="text-muted text-sm">No Docker hosts found.</div>';
          } else {
            // Detect if all versions are the same
            const uniqueVersions = new Set(versions.filter(v => !v.error).map(v => v.serverVersion));
            const allSame = uniqueVersions.size <= 1;
            versionsEl.innerHTML = `
              ${!allSame ? '<div class="alert alert-warning" style="margin-bottom:12px;padding:10px 14px;background:rgba(255,193,7,0.1);border:1px solid var(--yellow);border-radius:6px;color:var(--yellow);font-size:13px"><i class="fas fa-exclamation-triangle" style="margin-right:6px"></i>Docker versions differ across hosts — consider upgrading to a consistent version.</div>' : ''}
              <table class="data-table compact">
                <thead><tr><th>Host</th><th>Docker Version</th><th>API Version</th><th>OS</th><th>Arch</th><th>Kernel</th><th>Go</th></tr></thead>
                <tbody>
                  ${versions.map(v => v.error
                    ? `<tr><td><strong>${Utils.escapeHtml(v.hostName)}</strong></td><td colspan="6"><span class="badge badge-stopped">unreachable</span></td></tr>`
                    : `<tr>
                        <td><strong>${Utils.escapeHtml(v.hostName)}</strong></td>
                        <td class="mono" style="font-weight:600;color:${!allSame && uniqueVersions.size > 1 ? 'var(--yellow)' : 'var(--green)'}">${Utils.escapeHtml(v.serverVersion)}</td>
                        <td class="mono text-sm">${Utils.escapeHtml(v.apiVersion)}</td>
                        <td class="text-sm">${Utils.escapeHtml(v.os)}</td>
                        <td class="mono text-sm">${Utils.escapeHtml(v.arch)}</td>
                        <td class="mono text-sm">${Utils.escapeHtml(v.kernelVersion)}</td>
                        <td class="mono text-sm">${Utils.escapeHtml(v.goVersion)}</td>
                      </tr>`
                  ).join('')}
                </tbody>
              </table>
            `;
          }
        }
      } catch { /* docker versions not available */ }

      // Load local backup files
      try {
        const backupData = await Api.getBackupList();
        const backupListEl = el.querySelector('#backup-list-panel');
        if (backupListEl) {
          const files = backupData.files || [];
          if (files.length === 0) {
            backupListEl.innerHTML = `<div class="text-muted text-sm">No backup files found in <code>${Utils.escapeHtml(backupData.dir || '/data')}</code>. Backups run daily at 02:00.</div>`;
          } else {
            backupListEl.innerHTML = `
              <div class="text-muted text-sm" style="margin-bottom:10px">
                <i class="fas fa-info-circle" style="margin-right:4px"></i>
                Backups stored in <code>${Utils.escapeHtml(backupData.dir || '/data')}</code> — last 7 daily backups are kept automatically.
              </div>
              <table class="data-table compact">
                <thead><tr><th style="text-align:left">File</th><th>Size</th><th>Created</th></tr></thead>
                <tbody>
                  ${files.map(f => `
                    <tr>
                      <td style="text-align:left" class="mono text-sm">${Utils.escapeHtml(f.name)}</td>
                      <td>${Utils.formatBytes(f.size)}</td>
                      <td class="text-sm text-muted">${Utils.timeAgo(f.created)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            `;
          }
        }
      } catch { /* backup list not available */ }

      // Load TLS certificates
      try {
        const certData = await Api.getCertificates();
        const certsEl = el.querySelector('#certs-panel');
        if (certsEl) {
          const certs = certData.certificates || [];
          if (certs.length === 0) {
            certsEl.innerHTML = '<div class="text-muted text-sm">No TLS certificates configured. Connections use unencrypted HTTP.</div>';
          } else {
            certsEl.innerHTML = `
              <table class="data-table compact">
                <thead><tr><th>Host</th><th>Type</th><th>Status</th><th>Details</th></tr></thead>
                <tbody>
                  ${certs.map(c => `
                    <tr>
                      <td>${Utils.escapeHtml(c.host)}</td>
                      <td><span class="badge badge-info" style="font-size:10px">${Utils.escapeHtml(c.type)}</span></td>
                      <td><span style="color:var(--green)"><i class="fas fa-check-circle"></i></span> ${c.hasCert ? 'Valid' : 'Missing'}</td>
                      <td class="text-sm text-muted">
                        ${c.hasCa ? '<i class="fas fa-shield-alt" title="CA cert" style="margin-right:4px;color:var(--accent)"></i>' : ''}
                        ${c.hasKey ? '<i class="fas fa-key" title="Private key" style="margin-right:4px;color:var(--yellow)"></i>' : ''}
                        ${c.path ? Utils.escapeHtml(c.path) : (c.subject || '')}
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            `;
          }
        }
      } catch { /* certs not available */ }

      // Backup button
      el.querySelector('#db-backup-now')?.addEventListener('click', async () => {
        try {
          Toast.info('Creating backup...');
          const result = await Api.post('/backup/database');
          if (result.ok) Toast.success('Backup created: ' + Utils.formatBytes(result.size));
          else Toast.error('Backup failed');
        } catch (err) { Toast.error(err.message); }
      });

      // Cleanup button
      el.querySelector('#db-cleanup-btn').addEventListener('click', async () => {
        const ok = await Modal.confirm(
          'Run database cleanup? This will delete all data older than the configured retention limits.',
          { confirmText: 'Run Cleanup' }
        );
        if (!ok) return;

        const btn = el.querySelector('#db-cleanup-btn');
        const resultEl = el.querySelector('#db-cleanup-result');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cleaning...';

        try {
          const result = await Api.databaseCleanup();
          const entries = Object.entries(result.deleted || {});
          if (entries.length > 0) {
            resultEl.innerHTML = `<div class="text-sm" style="color:var(--green)"><i class="fas fa-check"></i> Deleted ${result.totalDeleted.toLocaleString()} rows: ${entries.map(([k, v]) => `${k} (${v})`).join(', ')}</div>`;
          } else {
            resultEl.innerHTML = `<div class="text-sm" style="color:var(--green)"><i class="fas fa-check"></i> Nothing to clean — all data is within retention limits.</div>`;
          }
          Toast.success(`Cleanup done: ${result.totalDeleted} rows deleted`);
        } catch (err) {
          resultEl.innerHTML = `<div class="text-sm" style="color:var(--red)"><i class="fas fa-times"></i> ${err.message}</div>`;
          Toast.error(err.message);
        }
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-broom"></i> Run Cleanup Now';
      });

      // Deep cleanup button (keep last 24h only)
      el.querySelector('#db-deep-cleanup-btn').addEventListener('click', async () => {
        const ok = await Modal.confirm(
          `<p style="margin:0 0 12px"><strong style="color:var(--red)">Deep Cleanup — Keep last 24 hours only</strong></p>
            <p class="text-sm" style="margin:0 0 12px">This will <strong>permanently delete</strong> all data older than 24 hours from:</p>
            <ul class="text-sm" style="margin:0 0 12px;padding-left:20px;color:var(--text)">
              <li>Container stats, aggregated stats</li>
              <li>Audit log, Docker events</li>
              <li>Alert and health events, webhooks</li>
              <li>Scan results, notifications</li>
              <li>Schedule history, login attempts</li>
            </ul>
            <p class="text-sm" style="margin:0;color:var(--red)"><i class="fas fa-exclamation-triangle" style="margin-right:4px"></i>This action is irreversible.</p>`,
          { confirmText: 'Delete Everything Older Than 24h', danger: true, html: true }
        );
        if (!ok) return;

        const btn = el.querySelector('#db-deep-cleanup-btn');
        const resultEl = el.querySelector('#db-deep-cleanup-result');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cleaning...';

        try {
          const result = await Api.databaseCleanupAggressive(24);
          const entries = Object.entries(result.deleted || {});
          if (entries.length > 0) {
            resultEl.innerHTML = `<div class="text-sm" style="color:var(--green)"><i class="fas fa-check"></i> Deleted ${result.totalDeleted.toLocaleString()} rows: ${entries.map(([k, v]) => `${k} (${v})`).join(', ')}</div>`;
          } else {
            resultEl.innerHTML = `<div class="text-sm" style="color:var(--green)"><i class="fas fa-check"></i> Nothing to delete — all data is already within 24 hours.</div>`;
          }
          Toast.success(`Deep cleanup done: ${result.totalDeleted} rows deleted`);
        } catch (err) {
          resultEl.innerHTML = `<div class="text-sm" style="color:var(--red)"><i class="fas fa-times"></i> ${err.message}</div>`;
          Toast.error(err.message);
        }
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-fire"></i> Deep Cleanup';
      });

      // Vacuum button
      el.querySelector('#db-vacuum-btn').addEventListener('click', async () => {
        const ok = await Modal.confirm(
          'Run VACUUM? This compacts the database file to reclaim disk space. The app may be briefly unresponsive.',
          { confirmText: 'Run Vacuum' }
        );
        if (!ok) return;

        const btn = el.querySelector('#db-vacuum-btn');
        const resultEl = el.querySelector('#db-vacuum-result');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Vacuuming...';

        try {
          const result = await Api.databaseVacuum();
          const freedStr = Utils.formatBytes(result.freed);
          const afterStr = Utils.formatBytes(result.sizeAfter);
          if (result.freed > 0) {
            resultEl.innerHTML = `<div class="text-sm" style="color:var(--green)"><i class="fas fa-check"></i> Freed ${freedStr}. New size: ${afterStr}</div>`;
            Toast.success(`Vacuum done: freed ${freedStr}`);
          } else {
            resultEl.innerHTML = `<div class="text-sm" style="color:var(--green)"><i class="fas fa-check"></i> Database is already compact (${afterStr}).</div>`;
            Toast.success('Database is already compact');
          }
        } catch (err) {
          resultEl.innerHTML = `<div class="text-sm" style="color:var(--red)"><i class="fas fa-times"></i> ${err.message}</div>`;
          Toast.error(err.message);
        }
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-compress-arrows-alt"></i> Run Vacuum Now';
      });

      // Diagnostics download button
      el.querySelector('#db-diagnostics-btn')?.addEventListener('click', () => {
        window.open('/api/system/database/diagnostics', '_blank');
        Toast.success('Generating diagnostic bundle...');
      });
    } catch (err) {
      el.innerHTML = `<div class="empty-msg">Error: ${err.message}</div>`;
    }
  },

  // ─── Tools Tab ─────────────────────────────────────
  _toolsDef() {
    return [
      // Docker tools (existing)
      { id: 'docker-run', name: 'docker run → Compose', icon: 'fa-terminal', color: '#388bfd', cat: 'docker', desc: 'Convert docker run commands to docker-compose YAML' },
      { id: 'proxy-labels', name: 'Reverse Proxy Labels', icon: 'fa-tags', color: '#3fb950', cat: 'docker', desc: 'Generate Traefik or Caddy reverse proxy labels' },
      { id: 'ai-logs', name: 'AI Log Analysis', icon: 'fa-robot', color: '#a371f7', cat: 'docker', desc: 'Generate diagnostic prompts from container logs' },
      // Security
      { id: 'password-gen', name: 'Password Generator', icon: 'fa-key', color: '#f85149', cat: 'security', desc: 'Generate secure random passwords with custom rules' },
      { id: 'password-strength', name: 'Password Strength', icon: 'fa-shield-alt', color: '#db6d28', cat: 'security', desc: 'Check password entropy, crack time and strength' },
      { id: 'hash-gen', name: 'Hash Generator', icon: 'fa-hashtag', color: '#a371f7', cat: 'security', desc: 'Generate SHA-1, SHA-256, SHA-512 hashes' },
      // Network
      { id: 'ip-calc', name: 'IP/Subnet Calculator', icon: 'fa-network-wired', color: '#0ea5e9', cat: 'network', desc: 'Calculate network, broadcast, host range from CIDR' },
      { id: 'url-codec', name: 'URL Encoder/Decoder', icon: 'fa-link', color: '#3fb950', cat: 'network', desc: 'Encode and decode URL components' },
      // Converters
      { id: 'base64', name: 'Base64 Encode/Decode', icon: 'fa-exchange-alt', color: '#388bfd', cat: 'converters', desc: 'Convert text to/from Base64 encoding' },
      { id: 'json-fmt', name: 'JSON Formatter', icon: 'fa-code', color: '#d29922', cat: 'converters', desc: 'Format, minify and validate JSON data' },
      { id: 'epoch', name: 'Epoch/Date Converter', icon: 'fa-clock', color: '#8b5cf6', cat: 'converters', desc: 'Convert between epoch timestamps and dates' },
      { id: 'storage-conv', name: 'Storage Unit Converter', icon: 'fa-hdd', color: '#39d0d8', cat: 'converters', desc: 'Convert between B, KB, MB, GB, TB (binary & decimal)' },
      // Text Tools
      { id: 'regex', name: 'Regex Tester', icon: 'fa-asterisk', color: '#f472b6', cat: 'text', desc: 'Test regex patterns with match highlighting' },
      { id: 'text-diff', name: 'Text Diff', icon: 'fa-columns', color: '#6366f1', cat: 'text', desc: 'Compare two texts with line-by-line diff' },
      { id: 'lorem', name: 'Lorem Ipsum Generator', icon: 'fa-paragraph', color: '#14b8a6', cat: 'text', desc: 'Generate placeholder text (paragraphs, sentences, words)' },
      // Reference
      { id: 'http-codes', name: 'HTTP Status Codes', icon: 'fa-globe', color: '#06b6d4', cat: 'reference', desc: 'Searchable reference of HTTP status codes' },
      { id: 'port-ref', name: 'Port Reference', icon: 'fa-server', color: '#ec4899', cat: 'reference', desc: 'Common network ports and their services' },
      // Converters (extra)
      { id: 'html2md', name: 'HTML → Markdown', icon: 'fa-file-code', color: '#f97316', cat: 'converters', desc: 'Convert HTML to Markdown with live preview' },
      { id: 'md2html', name: 'Markdown → HTML', icon: 'fa-file-alt', color: '#10b981', cat: 'converters', desc: 'Convert Markdown to HTML with live preview' },
    ];
  },

  _renderTools(el) {
    const tools = this._toolsDef();
    const cats = [
      { key: '', label: 'All', count: tools.length },
      { key: 'docker', label: 'Docker', count: tools.filter(t => t.cat === 'docker').length },
      { key: 'security', label: 'Security', count: tools.filter(t => t.cat === 'security').length },
      { key: 'network', label: 'Network', count: tools.filter(t => t.cat === 'network').length },
      { key: 'converters', label: 'Converters', count: tools.filter(t => t.cat === 'converters').length },
      { key: 'text', label: 'Text Tools', count: tools.filter(t => t.cat === 'text').length },
      { key: 'reference', label: 'Reference', count: tools.filter(t => t.cat === 'reference').length },
    ];

    el.innerHTML = `
      <div class="tool-filter-bar">
        <div class="search-box" style="flex:1;min-width:200px;max-width:320px">
          <i class="fas fa-search"></i>
          <input type="text" id="tools-search" placeholder="Search tools...">
        </div>
        ${cats.map(c => `<button class="tool-filter-btn${c.key === '' ? ' active' : ''}" data-cat="${c.key}">${c.label}<span class="tool-filter-count">${c.count}</span></button>`).join('')}
      </div>
      <div class="tools-grid" id="tools-grid">
        ${tools.map(t => `
          <div class="tool-card" data-tool="${t.id}" data-cat="${t.cat}" data-search="${t.name.toLowerCase()} ${t.desc.toLowerCase()}">
            <div class="tool-card-icon" style="background:${t.color}"><i class="fas ${t.icon}"></i></div>
            <div class="tool-card-title">${t.name}</div>
            <span class="tool-cat-badge tool-cat-${t.cat}">${t.cat}</span>
            <div class="tool-card-desc">${t.desc}</div>
          </div>
        `).join('')}
      </div>
    `;

    // Filter by category
    el.querySelectorAll('.tool-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        el.querySelectorAll('.tool-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const cat = btn.dataset.cat;
        el.querySelectorAll('.tool-card').forEach(card => {
          card.style.display = (!cat || card.dataset.cat === cat) ? '' : 'none';
        });
      });
    });

    // Search
    el.querySelector('#tools-search').addEventListener('input', Utils.debounce((e) => {
      const q = e.target.value.toLowerCase();
      const activeCat = el.querySelector('.tool-filter-btn.active')?.dataset?.cat || '';
      el.querySelectorAll('.tool-card').forEach(card => {
        const matchSearch = !q || card.dataset.search.includes(q);
        const matchCat = !activeCat || card.dataset.cat === activeCat;
        card.style.display = (matchSearch && matchCat) ? '' : 'none';
      });
    }, 150));

    // Card click → open tool modal
    el.querySelectorAll('.tool-card').forEach(card => {
      card.addEventListener('click', () => this._openToolModal(card.dataset.tool));
    });
  },

  _openToolModal(toolId) {
    const tool = this._toolsDef().find(t => t.id === toolId);
    if (!tool) return;

    const modalBody = this._getToolModalBody(toolId);
    Modal.open(`
      <div class="modal-header">
        <h3><i class="fas ${tool.icon}" style="margin-right:10px;color:${tool.color}"></i>${tool.name}</h3>
        <button class="modal-close-btn" id="tool-modal-close-x"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-body tool-modal-content">${modalBody}</div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="tool-modal-close-btn">Close</button>
      </div>
    `, { width: '650px' });

    Modal._content.querySelector('#tool-modal-close-x').addEventListener('click', () => Modal.close());
    Modal._content.querySelector('#tool-modal-close-btn').addEventListener('click', () => Modal.close());

    // Initialize tool interactions after modal is open
    setTimeout(() => this._initToolModal(toolId), 50);
  },

  _getToolModalBody(id) {
    switch (id) {
      case 'docker-run': return `
        <p class="text-sm text-muted" style="margin-bottom:12px">Paste a <code>docker run</code> command to convert to docker-compose YAML.</p>
        <textarea id="tm-run-input" class="form-control" rows="4" placeholder="docker run -d --name myapp -p 8080:80 -v data:/app/data nginx:alpine"></textarea>
        <button class="btn btn-sm btn-primary" id="tm-run-convert" style="margin-top:8px"><i class="fas fa-exchange-alt"></i> Convert</button>
        <div id="tm-run-output" style="margin-top:12px;display:none">
          <textarea id="tm-run-yaml" class="form-control" rows="12" readonly></textarea>
          <button class="btn btn-sm btn-secondary" id="tm-run-copy" style="margin-top:4px"><i class="fas fa-copy"></i> Copy</button>
        </div>`;
      case 'proxy-labels': return `
        <p class="text-sm text-muted" style="margin-bottom:12px">Generate Traefik or Caddy reverse proxy labels.</p>
        <div class="form-group"><label>Proxy Type</label>
          <select id="tm-proxy-type" class="form-control"><option value="traefik">Traefik v2</option><option value="caddy">Caddy</option></select></div>
        <div style="display:flex;gap:8px">
          <div class="form-group" style="flex:1"><label>Domain</label><input type="text" id="tm-proxy-domain" class="form-control" placeholder="app.example.com"></div>
          <div class="form-group" style="flex:1"><label>Container Port</label><input type="number" id="tm-proxy-port" class="form-control" value="80"></div>
        </div>
        <div class="form-group"><label><input type="checkbox" id="tm-proxy-tls" checked> Enable HTTPS</label></div>
        <button class="btn btn-sm btn-primary" id="tm-proxy-gen"><i class="fas fa-magic"></i> Generate</button>
        <div id="tm-proxy-output" style="margin-top:12px;display:none">
          <textarea id="tm-proxy-labels" class="form-control" rows="10" readonly></textarea>
          <button class="btn btn-sm btn-secondary" id="tm-proxy-copy" style="margin-top:4px"><i class="fas fa-copy"></i> Copy</button>
        </div>`;
      case 'ai-logs': return `
        <p class="text-sm text-muted" style="margin-bottom:12px">Generate a diagnostic prompt from container logs for AI analysis.</p>
        <div class="form-group"><label>Container</label>
          <select id="tm-ai-container" class="form-control"><option value="">Loading...</option></select></div>
        <div class="form-group"><label>Log lines (last N)</label><input type="number" id="tm-ai-lines" class="form-control" value="50" min="10" max="200"></div>
        <button class="btn btn-sm btn-primary" id="tm-ai-gen"><i class="fas fa-magic"></i> Generate Prompt</button>
        <div id="tm-ai-output" style="margin-top:12px;display:none">
          <textarea id="tm-ai-prompt" class="form-control" rows="14" readonly></textarea>
          <button class="btn btn-sm btn-secondary" id="tm-ai-copy" style="margin-top:4px"><i class="fas fa-copy"></i> Copy</button>
        </div>`;
      case 'password-gen': return `
        <div class="form-group"><label>Length: <span id="tm-pw-len-val">16</span></label>
          <input type="range" id="tm-pw-len" min="8" max="128" value="16" style="width:100%"></div>
        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:12px">
          <label><input type="checkbox" id="tm-pw-upper" checked> Uppercase (A-Z)</label>
          <label><input type="checkbox" id="tm-pw-lower" checked> Lowercase (a-z)</label>
          <label><input type="checkbox" id="tm-pw-digits" checked> Digits (0-9)</label>
          <label><input type="checkbox" id="tm-pw-symbols" checked> Symbols (!@#$...)</label>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:12px">
          <button class="btn btn-sm btn-primary" id="tm-pw-gen"><i class="fas fa-sync-alt"></i> Generate</button>
          <button class="btn btn-sm btn-secondary" id="tm-pw-copy"><i class="fas fa-copy"></i> Copy</button>
        </div>
        <div class="tool-output" id="tm-pw-result" style="font-size:16px;letter-spacing:1px;text-align:center;padding:16px"></div>`;
      case 'password-strength': return `
        <div class="form-group"><label>Enter password</label>
          <input type="text" id="tm-ps-input" class="form-control" placeholder="Type or paste a password..." autocomplete="off"></div>
        <div class="strength-bar"><div class="strength-bar-fill" id="tm-ps-bar" style="width:0"></div></div>
        <div id="tm-ps-result" style="margin-top:12px"></div>`;
      case 'hash-gen': return `
        <div class="form-group"><label>Input text</label>
          <textarea id="tm-hash-input" class="form-control" rows="3" placeholder="Type or paste text to hash..."></textarea></div>
        <button class="btn btn-sm btn-primary" id="tm-hash-gen" style="margin-bottom:12px"><i class="fas fa-hashtag"></i> Generate Hashes</button>
        <div id="tm-hash-output"></div>`;
      case 'ip-calc': return `
        <div class="form-group"><label>IP Address / CIDR</label>
          <input type="text" id="tm-ip-input" class="form-control" placeholder="192.168.1.0/24"></div>
        <button class="btn btn-sm btn-primary" id="tm-ip-calc"><i class="fas fa-calculator"></i> Calculate</button>
        <div id="tm-ip-output" style="margin-top:12px"></div>`;
      case 'url-codec': return `
        <div class="form-group"><label>Decoded</label>
          <textarea id="tm-url-decoded" class="form-control" rows="3" placeholder="Hello World! foo=bar&baz=qux"></textarea></div>
        <div style="display:flex;gap:8px;margin-bottom:12px">
          <button class="btn btn-sm btn-primary" id="tm-url-encode"><i class="fas fa-arrow-down"></i> Encode ↓</button>
          <button class="btn btn-sm btn-primary" id="tm-url-decode"><i class="fas fa-arrow-up"></i> Decode ↑</button>
        </div>
        <div class="form-group"><label>Encoded</label>
          <textarea id="tm-url-encoded" class="form-control" rows="3" placeholder="Hello%20World%21%20foo%3Dbar%26baz%3Dqux"></textarea></div>`;
      case 'base64': return `
        <div class="form-group"><label>Text</label>
          <textarea id="tm-b64-text" class="form-control" rows="3" placeholder="Plain text..."></textarea></div>
        <div style="display:flex;gap:8px;margin-bottom:12px">
          <button class="btn btn-sm btn-primary" id="tm-b64-encode"><i class="fas fa-arrow-down"></i> Encode ↓</button>
          <button class="btn btn-sm btn-primary" id="tm-b64-decode"><i class="fas fa-arrow-up"></i> Decode ↑</button>
        </div>
        <div class="form-group"><label>Base64</label>
          <textarea id="tm-b64-b64" class="form-control" rows="3" placeholder="Base64 encoded..."></textarea></div>`;
      case 'json-fmt': return `
        <div class="form-group"><label>JSON Input</label>
          <textarea id="tm-json-input" class="form-control" rows="10" placeholder='{"key":"value","arr":[1,2,3]}'></textarea></div>
        <div style="display:flex;gap:8px;margin-bottom:8px">
          <button class="btn btn-sm btn-primary" id="tm-json-format"><i class="fas fa-indent"></i> Format</button>
          <button class="btn btn-sm btn-secondary" id="tm-json-minify"><i class="fas fa-compress-alt"></i> Minify</button>
          <button class="btn btn-sm btn-secondary" id="tm-json-validate"><i class="fas fa-check"></i> Validate</button>
          <button class="btn btn-sm btn-secondary" id="tm-json-copy"><i class="fas fa-copy"></i> Copy</button>
        </div>
        <div id="tm-json-msg" style="font-size:12px;margin-top:4px"></div>`;
      case 'epoch': return `
        <div class="form-group"><label>Epoch (seconds)</label>
          <div style="display:flex;gap:8px"><input type="number" id="tm-epoch-input" class="form-control" placeholder="1711612800">
          <button class="btn btn-sm btn-primary" id="tm-epoch-now"><i class="fas fa-clock"></i> Now</button>
          <button class="btn btn-sm btn-secondary" id="tm-epoch-to-date">→ Date</button></div></div>
        <div id="tm-epoch-date-result" style="margin-bottom:12px"></div>
        <div class="form-group"><label>Date/Time</label>
          <div style="display:flex;gap:8px"><input type="datetime-local" id="tm-epoch-date" class="form-control">
          <button class="btn btn-sm btn-secondary" id="tm-epoch-to-epoch">→ Epoch</button></div></div>
        <div id="tm-epoch-epoch-result"></div>`;
      case 'storage-conv': return `
        <div style="display:flex;gap:8px;margin-bottom:16px">
          <div class="form-group" style="flex:1"><label>Value</label>
            <input type="number" id="tm-stor-val" class="form-control" value="1" min="0" step="any"></div>
          <div class="form-group" style="flex:0 0 120px"><label>Unit</label>
            <select id="tm-stor-unit" class="form-control">
              <option value="B">Bytes (B)</option><option value="KB">KB</option><option value="MB">MB</option>
              <option value="GB" selected>GB</option><option value="TB">TB</option>
            </select></div>
        </div>
        <button class="btn btn-sm btn-primary" id="tm-stor-calc" style="margin-bottom:12px"><i class="fas fa-calculator"></i> Convert</button>
        <div id="tm-stor-output"></div>`;
      case 'regex': return `
        <div style="display:flex;gap:8px;margin-bottom:12px">
          <div class="form-group" style="flex:1"><label>Pattern</label>
            <input type="text" id="tm-regex-pattern" class="form-control" placeholder="\\d+"></div>
          <div class="form-group" style="flex:0 0 100px"><label>Flags</label>
            <input type="text" id="tm-regex-flags" class="form-control" value="g" placeholder="g, i, m"></div>
        </div>
        <div class="form-group"><label>Test String</label>
          <textarea id="tm-regex-input" class="form-control" rows="4" placeholder="Enter text to test against..."></textarea></div>
        <button class="btn btn-sm btn-primary" id="tm-regex-test"><i class="fas fa-play"></i> Test</button>
        <div id="tm-regex-output" style="margin-top:12px"></div>`;
      case 'text-diff': return `
        <div style="display:flex;gap:12px;margin-bottom:12px">
          <div class="form-group" style="flex:1"><label>Original</label>
            <textarea id="tm-diff-a" class="form-control" rows="8" placeholder="Original text..."></textarea></div>
          <div class="form-group" style="flex:1"><label>Modified</label>
            <textarea id="tm-diff-b" class="form-control" rows="8" placeholder="Modified text..."></textarea></div>
        </div>
        <button class="btn btn-sm btn-primary" id="tm-diff-compare"><i class="fas fa-columns"></i> Compare</button>
        <div id="tm-diff-output" class="diff-result" style="margin-top:12px"></div>`;
      case 'lorem': return `
        <div style="display:flex;gap:8px;margin-bottom:12px">
          <div class="form-group" style="flex:1"><label>Type</label>
            <select id="tm-lorem-type" class="form-control">
              <option value="paragraphs">Paragraphs</option><option value="sentences">Sentences</option><option value="words">Words</option>
            </select></div>
          <div class="form-group" style="flex:0 0 100px"><label>Count</label>
            <input type="number" id="tm-lorem-count" class="form-control" value="3" min="1" max="50"></div>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:12px">
          <button class="btn btn-sm btn-primary" id="tm-lorem-gen"><i class="fas fa-paragraph"></i> Generate</button>
          <button class="btn btn-sm btn-secondary" id="tm-lorem-copy"><i class="fas fa-copy"></i> Copy</button>
        </div>
        <div class="tool-output" id="tm-lorem-output" style="max-height:300px;overflow:auto;white-space:pre-wrap"></div>`;
      case 'http-codes': return `
        <div class="form-group" style="margin-bottom:12px">
          <input type="text" id="tm-http-search" class="form-control" placeholder="Search by code or name...">
        </div>
        <div style="max-height:450px;overflow:auto"><table class="ref-table" id="tm-http-table">
          <thead><tr><th style="width:70px">Code</th><th>Name</th><th>Description</th></tr></thead>
          <tbody></tbody></table></div>`;
      case 'port-ref': return `
        <div class="form-group" style="margin-bottom:12px">
          <input type="text" id="tm-port-search" class="form-control" placeholder="Search by port, protocol, or service...">
        </div>
        <div style="max-height:450px;overflow:auto"><table class="ref-table" id="tm-port-table">
          <thead><tr><th style="width:70px">Port</th><th style="width:60px">Proto</th><th>Service</th><th>Description</th></tr></thead>
          <tbody></tbody></table></div>`;
      case 'html2md': return `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="form-group" style="margin:0">
            <label>HTML Input</label>
            <textarea id="tm-h2m-input" class="form-control" rows="14" style="font-family:var(--mono);font-size:12px" placeholder="<h1>Hello</h1>\n<p>Paste your <strong>HTML</strong> here</p>"></textarea>
          </div>
          <div class="form-group" style="margin:0">
            <label>Markdown Output</label>
            <textarea id="tm-h2m-output" class="form-control" rows="14" style="font-family:var(--mono);font-size:12px" readonly></textarea>
          </div>
        </div>
        <div style="margin-top:12px;display:flex;gap:8px;align-items:center">
          <button class="btn btn-sm btn-primary" id="tm-h2m-convert"><i class="fas fa-arrow-right"></i> Convert</button>
          <button class="btn btn-sm btn-secondary" id="tm-h2m-copy"><i class="fas fa-copy"></i> Copy</button>
          <label style="margin-left:auto;font-size:12px"><input type="checkbox" id="tm-h2m-live"> Live preview</label>
        </div>
        <div style="margin-top:12px">
          <label>Preview</label>
          <div id="tm-h2m-preview" style="padding:12px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);min-height:60px;font-size:13px"></div>
        </div>`;
      case 'md2html': return `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="form-group" style="margin:0">
            <label>Markdown Input</label>
            <textarea id="tm-m2h-input" class="form-control" rows="14" style="font-family:var(--mono);font-size:12px" placeholder="# Hello\n\nType your **Markdown** here"></textarea>
          </div>
          <div class="form-group" style="margin:0">
            <label>HTML Output</label>
            <textarea id="tm-m2h-output" class="form-control" rows="14" style="font-family:var(--mono);font-size:12px" readonly></textarea>
          </div>
        </div>
        <div style="margin-top:12px;display:flex;gap:8px;align-items:center">
          <button class="btn btn-sm btn-primary" id="tm-m2h-convert"><i class="fas fa-arrow-right"></i> Convert</button>
          <button class="btn btn-sm btn-secondary" id="tm-m2h-copy"><i class="fas fa-copy"></i> Copy</button>
          <label style="margin-left:auto;font-size:12px"><input type="checkbox" id="tm-m2h-live"> Live preview</label>
        </div>
        <div style="margin-top:12px">
          <label>Preview</label>
          <div id="tm-m2h-preview" style="padding:12px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);min-height:60px;font-size:13px"></div>
        </div>`;
      default: return '<p>Tool not implemented yet.</p>';
    }
  },

  _initToolModal(id) {
    const mc = Modal._content;
    if (!mc) return;

    switch (id) {
      case 'docker-run': {
        mc.querySelector('#tm-run-convert').addEventListener('click', () => {
          const input = mc.querySelector('#tm-run-input').value.trim();
          if (!input) { Toast.warning('Paste a docker run command'); return; }
          try {
            const yaml = this._dockerRunToCompose(input);
            mc.querySelector('#tm-run-yaml').value = yaml;
            mc.querySelector('#tm-run-output').style.display = '';
          } catch (err) { Toast.error('Parse error: ' + err.message); }
        });
        mc.querySelector('#tm-run-copy').addEventListener('click', () => {
          Utils.copyToClipboard(mc.querySelector('#tm-run-yaml').value); Toast.success('Copied!');
        });
        break;
      }
      case 'proxy-labels': {
        mc.querySelector('#tm-proxy-gen').addEventListener('click', () => {
          const type = mc.querySelector('#tm-proxy-type').value;
          const domain = mc.querySelector('#tm-proxy-domain').value.trim();
          const port = mc.querySelector('#tm-proxy-port').value;
          const tls = mc.querySelector('#tm-proxy-tls').checked;
          if (!domain) { Toast.warning('Enter a domain'); return; }
          const labels = this._generateProxyLabels(type, domain, port, tls);
          mc.querySelector('#tm-proxy-labels').value = labels;
          mc.querySelector('#tm-proxy-output').style.display = '';
        });
        mc.querySelector('#tm-proxy-copy').addEventListener('click', () => {
          Utils.copyToClipboard(mc.querySelector('#tm-proxy-labels').value); Toast.success('Copied!');
        });
        break;
      }
      case 'ai-logs': {
        Api.getContainers().then(containers => {
          const sel = mc.querySelector('#tm-ai-container');
          if (sel) sel.innerHTML = containers.map(c => {
            const name = Utils.containerName(c.Names || c.names);
            return `<option value="${c.Id || c.id}">${Utils.escapeHtml(name)} (${c.State || c.state})</option>`;
          }).join('');
        }).catch(() => {});
        mc.querySelector('#tm-ai-gen').addEventListener('click', async () => {
          const containerId = mc.querySelector('#tm-ai-container').value;
          const lines = parseInt(mc.querySelector('#tm-ai-lines').value) || 50;
          if (!containerId) { Toast.warning('Select a container'); return; }
          try {
            const [logs, inspect] = await Promise.all([Api.getContainerLogs(containerId, lines), Api.getContainer(containerId)]);
            const name = Utils.containerName(inspect.Name || inspect.name);
            const image = inspect.Config?.Image || inspect.config?.Image || '';
            const state = inspect.State?.Status || inspect.state?.Status || '';
            const exitCode = inspect.State?.ExitCode ?? '';
            const logText = typeof logs === 'string' ? logs : (logs.logs || logs.stdout || '');
            const prompt = `I have a Docker container that needs diagnosis. Please analyze the following information and provide:\n1. What the likely issue is\n2. Recommended fixes (most likely first)\n3. Any preventive measures\n\n**Container:** ${name}\n**Image:** ${image}\n**State:** ${state}${exitCode !== '' ? ` (exit code: ${exitCode})` : ''}\n\n**Last ${lines} log lines:**\n\`\`\`\n${logText.substring(0, 3000)}\n\`\`\`\n\n**Container Config:**\n- Restart Policy: ${inspect.HostConfig?.RestartPolicy?.Name || 'none'}\n- Memory Limit: ${inspect.HostConfig?.Memory ? Utils.formatBytes(inspect.HostConfig.Memory) : 'unlimited'}\n- CPU Shares: ${inspect.HostConfig?.CpuShares || 'default'}`;
            mc.querySelector('#tm-ai-prompt').value = prompt;
            mc.querySelector('#tm-ai-output').style.display = '';
          } catch (err) { Toast.error(err.message); }
        });
        mc.querySelector('#tm-ai-copy').addEventListener('click', () => {
          Utils.copyToClipboard(mc.querySelector('#tm-ai-prompt').value); Toast.success('Copied!');
        });
        break;
      }
      case 'password-gen': {
        const generate = () => {
          const len = parseInt(mc.querySelector('#tm-pw-len').value);
          let chars = '';
          if (mc.querySelector('#tm-pw-upper').checked) chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
          if (mc.querySelector('#tm-pw-lower').checked) chars += 'abcdefghijklmnopqrstuvwxyz';
          if (mc.querySelector('#tm-pw-digits').checked) chars += '0123456789';
          if (mc.querySelector('#tm-pw-symbols').checked) chars += '!@#$%^&*()_+-=[]{}|;:,.<>?';
          if (!chars) { Toast.warning('Select at least one character set'); return; }
          const arr = new Uint32Array(len);
          crypto.getRandomValues(arr);
          let pw = '';
          for (let i = 0; i < len; i++) pw += chars[arr[i] % chars.length];
          mc.querySelector('#tm-pw-result').textContent = pw;
        };
        mc.querySelector('#tm-pw-gen').addEventListener('click', generate);
        mc.querySelector('#tm-pw-copy').addEventListener('click', () => {
          const pw = mc.querySelector('#tm-pw-result').textContent;
          if (pw) { Utils.copyToClipboard(pw); Toast.success('Copied!'); }
        });
        mc.querySelector('#tm-pw-len').addEventListener('input', (e) => {
          mc.querySelector('#tm-pw-len-val').textContent = e.target.value;
          generate();
        });
        ['#tm-pw-upper','#tm-pw-lower','#tm-pw-digits','#tm-pw-symbols'].forEach(s => {
          mc.querySelector(s).addEventListener('change', generate);
        });
        generate();
        break;
      }
      case 'password-strength': {
        const commonPasswords = ['password','123456','12345678','qwerty','abc123','monkey','master','dragon','111111',
          'baseball','iloveyou','trustno1','sunshine','princess','football','shadow','superman','letmein','welcome',
          'admin','login','passw0rd','starwars','hello','charlie','donald','password1','password123','1234567890'];
        mc.querySelector('#tm-ps-input').addEventListener('input', (e) => {
          const pw = e.target.value;
          const bar = mc.querySelector('#tm-ps-bar');
          const result = mc.querySelector('#tm-ps-result');
          if (!pw) { bar.style.width = '0'; result.innerHTML = ''; return; }
          // Calculate charset size
          let poolSize = 0;
          if (/[a-z]/.test(pw)) poolSize += 26;
          if (/[A-Z]/.test(pw)) poolSize += 26;
          if (/[0-9]/.test(pw)) poolSize += 10;
          if (/[^a-zA-Z0-9]/.test(pw)) poolSize += 33;
          const entropy = Math.floor(pw.length * Math.log2(poolSize || 1));
          const isCommon = commonPasswords.includes(pw.toLowerCase());
          let strength, color, pct;
          if (isCommon) { strength = 'Common password!'; color = '#f85149'; pct = 5; }
          else if (entropy < 28) { strength = 'Weak'; color = '#f85149'; pct = 15; }
          else if (entropy < 36) { strength = 'Fair'; color = '#db6d28'; pct = 35; }
          else if (entropy < 60) { strength = 'Good'; color = '#d29922'; pct = 55; }
          else if (entropy < 80) { strength = 'Strong'; color = '#3fb950'; pct = 80; }
          else { strength = 'Very Strong'; color = '#3fb950'; pct = 100; }
          // Crack time estimation
          const guessesPerSec = 1e10; // 10 billion/sec for modern hardware
          const totalGuesses = Math.pow(2, entropy);
          const seconds = totalGuesses / guessesPerSec;
          let crackTime;
          if (seconds < 1) crackTime = 'Instant';
          else if (seconds < 60) crackTime = Math.round(seconds) + ' seconds';
          else if (seconds < 3600) crackTime = Math.round(seconds / 60) + ' minutes';
          else if (seconds < 86400) crackTime = Math.round(seconds / 3600) + ' hours';
          else if (seconds < 31536000) crackTime = Math.round(seconds / 86400) + ' days';
          else if (seconds < 31536000 * 1000) crackTime = Math.round(seconds / 31536000) + ' years';
          else if (seconds < 31536000 * 1e6) crackTime = Math.round(seconds / (31536000 * 1000)) + 'K years';
          else crackTime = 'Centuries+';
          bar.style.width = pct + '%';
          bar.style.background = color;
          result.innerHTML = `
            <table class="info-table" style="margin-top:8px;font-size:12px">
              <tr><td>Strength</td><td><strong style="color:${color}">${strength}</strong></td></tr>
              <tr><td>Entropy</td><td>${entropy} bits</td></tr>
              <tr><td>Crack time</td><td>${crackTime} (10B guesses/sec)</td></tr>
              <tr><td>Length</td><td>${pw.length} characters</td></tr>
              <tr><td>Charset size</td><td>${poolSize} characters</td></tr>
              ${isCommon ? '<tr><td colspan="2" style="color:#f85149"><i class="fas fa-exclamation-triangle"></i> This is a commonly used password!</td></tr>' : ''}
            </table>`;
        });
        break;
      }
      case 'hash-gen': {
        mc.querySelector('#tm-hash-gen').addEventListener('click', async () => {
          const text = mc.querySelector('#tm-hash-input').value;
          if (!text) { Toast.warning('Enter some text'); return; }
          const enc = new TextEncoder().encode(text);
          if (!crypto.subtle) {
            // crypto.subtle not available on non-secure origins (HTTP with IP)
            // Fallback: simple hash via server or show warning
            mc.querySelector('#tm-hash-output').innerHTML = '<div class="text-muted" style="padding:12px"><i class="fas fa-exclamation-triangle" style="color:var(--yellow);margin-right:6px"></i>Hash generation requires HTTPS or localhost. Enable SSL in System &gt; SSL/TLS or access via localhost.</div>';
            return;
          }
          const [sha1, sha256, sha512] = await Promise.all([
            crypto.subtle.digest('SHA-1', enc),
            crypto.subtle.digest('SHA-256', enc),
            crypto.subtle.digest('SHA-512', enc),
          ]);
          const toHex = (buf) => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
          const hashes = [
            { label: 'SHA-1', value: toHex(sha1) },
            { label: 'SHA-256', value: toHex(sha256) },
            { label: 'SHA-512', value: toHex(sha512) },
          ];
          mc.querySelector('#tm-hash-output').innerHTML = hashes.map(h => `
            <div class="hash-row">
              <span class="hash-label">${h.label}</span>
              <code>${h.value}</code>
              <button class="btn btn-xs btn-secondary hash-copy-btn" data-val="${h.value}"><i class="fas fa-copy"></i></button>
            </div>`).join('');
          mc.querySelectorAll('.hash-copy-btn').forEach(btn => {
            btn.addEventListener('click', () => { Utils.copyToClipboard(btn.dataset.val); Toast.success('Copied!'); });
          });
        });
        break;
      }
      case 'ip-calc': {
        mc.querySelector('#tm-ip-calc').addEventListener('click', () => {
          const input = mc.querySelector('#tm-ip-input').value.trim();
          const match = input.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/);
          if (!match) { Toast.warning('Enter IP in CIDR format (e.g. 192.168.1.0/24)'); return; }
          const octets = [parseInt(match[1]), parseInt(match[2]), parseInt(match[3]), parseInt(match[4])];
          const cidr = parseInt(match[5]);
          if (octets.some(o => o > 255) || cidr > 32) { Toast.error('Invalid IP or CIDR'); return; }
          const ip = (octets[0] << 24 | octets[1] << 16 | octets[2] << 8 | octets[3]) >>> 0;
          const mask = cidr === 0 ? 0 : (~0 << (32 - cidr)) >>> 0;
          const network = (ip & mask) >>> 0;
          const broadcast = (network | ~mask) >>> 0;
          const firstHost = cidr >= 31 ? network : (network + 1) >>> 0;
          const lastHost = cidr >= 31 ? broadcast : (broadcast - 1) >>> 0;
          const totalHosts = cidr >= 31 ? Math.pow(2, 32 - cidr) : Math.pow(2, 32 - cidr) - 2;
          const wildcard = (~mask) >>> 0;
          const toIP = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
          mc.querySelector('#tm-ip-output').innerHTML = `
            <table class="info-table" style="font-size:12px">
              <tr><td>Network Address</td><td><strong>${toIP(network)}</strong></td></tr>
              <tr><td>Broadcast Address</td><td>${toIP(broadcast)}</td></tr>
              <tr><td>First Host</td><td>${toIP(firstHost)}</td></tr>
              <tr><td>Last Host</td><td>${toIP(lastHost)}</td></tr>
              <tr><td>Total Hosts</td><td>${totalHosts.toLocaleString()}</td></tr>
              <tr><td>Subnet Mask</td><td>${toIP(mask)}</td></tr>
              <tr><td>Wildcard Mask</td><td>${toIP(wildcard)}</td></tr>
              <tr><td>CIDR Notation</td><td>/${cidr}</td></tr>
            </table>`;
        });
        break;
      }
      case 'url-codec': {
        mc.querySelector('#tm-url-encode').addEventListener('click', () => {
          mc.querySelector('#tm-url-encoded').value = encodeURIComponent(mc.querySelector('#tm-url-decoded').value);
        });
        mc.querySelector('#tm-url-decode').addEventListener('click', () => {
          try {
            mc.querySelector('#tm-url-decoded').value = decodeURIComponent(mc.querySelector('#tm-url-encoded').value);
          } catch (e) { Toast.error('Invalid encoded string'); }
        });
        break;
      }
      case 'base64': {
        mc.querySelector('#tm-b64-encode').addEventListener('click', () => {
          try {
            mc.querySelector('#tm-b64-b64').value = btoa(unescape(encodeURIComponent(mc.querySelector('#tm-b64-text').value)));
          } catch (e) { Toast.error('Encoding failed'); }
        });
        mc.querySelector('#tm-b64-decode').addEventListener('click', () => {
          try {
            mc.querySelector('#tm-b64-text').value = decodeURIComponent(escape(atob(mc.querySelector('#tm-b64-b64').value)));
          } catch (e) { Toast.error('Invalid Base64 string'); }
        });
        break;
      }
      case 'json-fmt': {
        mc.querySelector('#tm-json-format').addEventListener('click', () => {
          try {
            const obj = JSON.parse(mc.querySelector('#tm-json-input').value);
            mc.querySelector('#tm-json-input').value = JSON.stringify(obj, null, 2);
            mc.querySelector('#tm-json-msg').innerHTML = '<span style="color:#3fb950"><i class="fas fa-check"></i> Formatted</span>';
          } catch (e) { mc.querySelector('#tm-json-msg').innerHTML = `<span style="color:#f85149"><i class="fas fa-times"></i> ${Utils.escapeHtml(e.message)}</span>`; }
        });
        mc.querySelector('#tm-json-minify').addEventListener('click', () => {
          try {
            const obj = JSON.parse(mc.querySelector('#tm-json-input').value);
            mc.querySelector('#tm-json-input').value = JSON.stringify(obj);
            mc.querySelector('#tm-json-msg').innerHTML = '<span style="color:#3fb950"><i class="fas fa-check"></i> Minified</span>';
          } catch (e) { mc.querySelector('#tm-json-msg').innerHTML = `<span style="color:#f85149"><i class="fas fa-times"></i> ${Utils.escapeHtml(e.message)}</span>`; }
        });
        mc.querySelector('#tm-json-validate').addEventListener('click', () => {
          try {
            JSON.parse(mc.querySelector('#tm-json-input').value);
            mc.querySelector('#tm-json-msg').innerHTML = '<span style="color:#3fb950"><i class="fas fa-check-circle"></i> Valid JSON</span>';
          } catch (e) { mc.querySelector('#tm-json-msg').innerHTML = `<span style="color:#f85149"><i class="fas fa-times-circle"></i> Invalid: ${Utils.escapeHtml(e.message)}</span>`; }
        });
        mc.querySelector('#tm-json-copy').addEventListener('click', () => {
          Utils.copyToClipboard(mc.querySelector('#tm-json-input').value); Toast.success('Copied!');
        });
        break;
      }
      case 'epoch': {
        mc.querySelector('#tm-epoch-now').addEventListener('click', () => {
          mc.querySelector('#tm-epoch-input').value = Math.floor(Date.now() / 1000);
        });
        mc.querySelector('#tm-epoch-to-date').addEventListener('click', () => {
          const epoch = parseInt(mc.querySelector('#tm-epoch-input').value);
          if (isNaN(epoch)) { Toast.warning('Enter an epoch timestamp'); return; }
          const ms = epoch > 1e12 ? epoch : epoch * 1000;
          const d = new Date(ms);
          mc.querySelector('#tm-epoch-date-result').innerHTML = `
            <table class="info-table" style="font-size:12px">
              <tr><td>UTC</td><td>${d.toUTCString()}</td></tr>
              <tr><td>Local</td><td>${d.toLocaleString()}</td></tr>
              <tr><td>ISO 8601</td><td>${d.toISOString()}</td></tr>
              <tr><td>Milliseconds</td><td>${ms}</td></tr>
            </table>`;
        });
        mc.querySelector('#tm-epoch-to-epoch').addEventListener('click', () => {
          const dateVal = mc.querySelector('#tm-epoch-date').value;
          if (!dateVal) { Toast.warning('Select a date'); return; }
          const d = new Date(dateVal);
          mc.querySelector('#tm-epoch-epoch-result').innerHTML = `
            <table class="info-table" style="font-size:12px">
              <tr><td>Epoch (seconds)</td><td><strong>${Math.floor(d.getTime() / 1000)}</strong></td></tr>
              <tr><td>Epoch (milliseconds)</td><td>${d.getTime()}</td></tr>
            </table>`;
        });
        break;
      }
      case 'storage-conv': {
        mc.querySelector('#tm-stor-calc').addEventListener('click', () => {
          const val = parseFloat(mc.querySelector('#tm-stor-val').value);
          const unit = mc.querySelector('#tm-stor-unit').value;
          if (isNaN(val) || val < 0) { Toast.warning('Enter a valid number'); return; }
          const decimalMap = { B: 1, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12 };
          const bytes = val * (decimalMap[unit] || 1);
          const fmt = (v) => v % 1 === 0 ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 4 });
          mc.querySelector('#tm-stor-output').innerHTML = `
            <table class="info-table" style="font-size:12px">
              <tr><td colspan="2" style="font-weight:600;color:var(--text-muted)">Decimal (SI)</td></tr>
              <tr><td>Bytes</td><td>${fmt(bytes)}</td></tr>
              <tr><td>KB (10<sup>3</sup>)</td><td>${fmt(bytes / 1e3)}</td></tr>
              <tr><td>MB (10<sup>6</sup>)</td><td>${fmt(bytes / 1e6)}</td></tr>
              <tr><td>GB (10<sup>9</sup>)</td><td>${fmt(bytes / 1e9)}</td></tr>
              <tr><td>TB (10<sup>12</sup>)</td><td>${fmt(bytes / 1e12)}</td></tr>
              <tr><td colspan="2" style="font-weight:600;color:var(--text-muted);padding-top:12px">Binary (IEC)</td></tr>
              <tr><td>KiB (2<sup>10</sup>)</td><td>${fmt(bytes / 1024)}</td></tr>
              <tr><td>MiB (2<sup>20</sup>)</td><td>${fmt(bytes / (1024 ** 2))}</td></tr>
              <tr><td>GiB (2<sup>30</sup>)</td><td>${fmt(bytes / (1024 ** 3))}</td></tr>
              <tr><td>TiB (2<sup>40</sup>)</td><td>${fmt(bytes / (1024 ** 4))}</td></tr>
            </table>`;
        });
        break;
      }
      case 'regex': {
        mc.querySelector('#tm-regex-test').addEventListener('click', () => {
          const pattern = mc.querySelector('#tm-regex-pattern').value;
          const flags = mc.querySelector('#tm-regex-flags').value;
          const text = mc.querySelector('#tm-regex-input').value;
          if (!pattern) { Toast.warning('Enter a pattern'); return; }
          try {
            const re = new RegExp(pattern, flags);
            const matches = [];
            let m;
            if (flags.includes('g')) {
              while ((m = re.exec(text)) !== null) {
                matches.push({ index: m.index, length: m[0].length, value: m[0], groups: m.slice(1) });
                if (m[0].length === 0) re.lastIndex++;
              }
            } else {
              m = re.exec(text);
              if (m) matches.push({ index: m.index, length: m[0].length, value: m[0], groups: m.slice(1) });
            }
            // Build highlighted text
            let highlighted = '';
            let lastIdx = 0;
            matches.forEach(match => {
              highlighted += Utils.escapeHtml(text.substring(lastIdx, match.index));
              highlighted += `<span class="regex-match">${Utils.escapeHtml(match.value)}</span>`;
              lastIdx = match.index + match.length;
            });
            highlighted += Utils.escapeHtml(text.substring(lastIdx));
            let groupsHtml = '';
            if (matches.length > 0 && matches[0].groups.length > 0) {
              groupsHtml = '<div style="margin-top:8px;font-size:12px"><strong>Groups:</strong><br>' +
                matches.map((m, i) => m.groups.map((g, j) => `Match ${i + 1}, Group ${j + 1}: <code>${Utils.escapeHtml(g || '')}</code>`).join('<br>')).join('<br>') + '</div>';
            }
            mc.querySelector('#tm-regex-output').innerHTML = `
              <div style="font-size:12px;margin-bottom:8px;color:var(--text-muted)">${matches.length} match${matches.length !== 1 ? 'es' : ''} found</div>
              <div class="tool-output" style="white-space:pre-wrap">${highlighted || '<span class="text-muted">No matches</span>'}</div>
              ${groupsHtml}`;
          } catch (e) { mc.querySelector('#tm-regex-output').innerHTML = `<span style="color:#f85149"><i class="fas fa-times"></i> ${Utils.escapeHtml(e.message)}</span>`; }
        });
        break;
      }
      case 'text-diff': {
        mc.querySelector('#tm-diff-compare').addEventListener('click', () => {
          const a = mc.querySelector('#tm-diff-a').value.split('\n');
          const b = mc.querySelector('#tm-diff-b').value.split('\n');
          const maxLen = Math.max(a.length, b.length);
          let html = '<div class="diff-result" style="border:1px solid var(--border);border-radius:6px;overflow:auto;max-height:350px">';
          for (let i = 0; i < maxLen; i++) {
            const lineA = i < a.length ? a[i] : undefined;
            const lineB = i < b.length ? b[i] : undefined;
            if (lineA === lineB) {
              html += `<div class="diff-line diff-same">&nbsp; ${Utils.escapeHtml(lineA)}</div>`;
            } else {
              if (lineA !== undefined) html += `<div class="diff-line diff-del">- ${Utils.escapeHtml(lineA)}</div>`;
              if (lineB !== undefined) html += `<div class="diff-line diff-add">+ ${Utils.escapeHtml(lineB)}</div>`;
            }
          }
          html += '</div>';
          mc.querySelector('#tm-diff-output').innerHTML = html;
        });
        break;
      }
      case 'lorem': {
        const words = ['lorem','ipsum','dolor','sit','amet','consectetur','adipiscing','elit','sed','do','eiusmod','tempor','incididunt','ut','labore','et','dolore','magna','aliqua','enim','ad','minim','veniam','quis','nostrud','exercitation','ullamco','laboris','nisi','aliquip','ex','ea','commodo','consequat','duis','aute','irure','in','reprehenderit','voluptate','velit','esse','cillum','fugiat','nulla','pariatur','excepteur','sint','occaecat','cupidatat','non','proident','sunt','culpa','qui','officia','deserunt','mollit','anim','id','est','laborum','porta','nibh','venenatis','cras','pulvinar','mattis','nunc','pellentesque','habitant','morbi','tristique','senectus','netus','malesuada','fames','ac','turpis','egestas','maecenas','pharetra','convallis','posuere','orci','leo','faucibus','pretium','vulputate','sapien','nec','sagittis','feugiat','vivamus','at','augue'];
        const randWord = () => words[Math.floor(Math.random() * words.length)];
        const genSentence = () => {
          const len = 8 + Math.floor(Math.random() * 12);
          const s = Array.from({ length: len }, randWord).join(' ');
          return s.charAt(0).toUpperCase() + s.slice(1) + '.';
        };
        const genParagraph = () => Array.from({ length: 4 + Math.floor(Math.random() * 4) }, genSentence).join(' ');
        mc.querySelector('#tm-lorem-gen').addEventListener('click', () => {
          const type = mc.querySelector('#tm-lorem-type').value;
          const count = parseInt(mc.querySelector('#tm-lorem-count').value) || 1;
          let result;
          if (type === 'paragraphs') result = Array.from({ length: count }, genParagraph).join('\n\n');
          else if (type === 'sentences') result = Array.from({ length: count }, genSentence).join(' ');
          else result = Array.from({ length: count }, randWord).join(' ');
          mc.querySelector('#tm-lorem-output').textContent = result;
        });
        mc.querySelector('#tm-lorem-copy').addEventListener('click', () => {
          const text = mc.querySelector('#tm-lorem-output').textContent;
          if (text) { Utils.copyToClipboard(text); Toast.success('Copied!'); }
        });
        mc.querySelector('#tm-lorem-gen').click(); // auto-generate
        break;
      }
      case 'http-codes': {
        const codes = [
          [200, 'OK', 'The request succeeded'],
          [201, 'Created', 'The request succeeded and a new resource was created'],
          [204, 'No Content', 'The request succeeded with no response body'],
          [301, 'Moved Permanently', 'The resource has been permanently moved to a new URL'],
          [302, 'Found', 'The resource resides temporarily at a different URL'],
          [304, 'Not Modified', 'The resource has not been modified since the last request'],
          [400, 'Bad Request', 'The server cannot process the request due to client error'],
          [401, 'Unauthorized', 'Authentication is required and has failed or not been provided'],
          [403, 'Forbidden', 'The server understood the request but refuses to authorize it'],
          [404, 'Not Found', 'The requested resource could not be found'],
          [405, 'Method Not Allowed', 'The HTTP method is not supported for the requested resource'],
          [408, 'Request Timeout', 'The server timed out waiting for the request'],
          [409, 'Conflict', 'The request conflicts with the current state of the resource'],
          [429, 'Too Many Requests', 'The user has sent too many requests in a given time (rate limiting)'],
          [500, 'Internal Server Error', 'The server encountered an unexpected condition'],
          [502, 'Bad Gateway', 'The server received an invalid response from an upstream server'],
          [503, 'Service Unavailable', 'The server is temporarily unable to handle the request'],
          [504, 'Gateway Timeout', 'The upstream server failed to respond in time'],
        ];
        const renderTable = (filter) => {
          const f = (filter || '').toLowerCase();
          const filtered = codes.filter(([code, name, desc]) => !f || String(code).includes(f) || name.toLowerCase().includes(f) || desc.toLowerCase().includes(f));
          const tbody = mc.querySelector('#tm-http-table tbody');
          tbody.innerHTML = filtered.map(([code, name, desc]) => {
            const cls = code < 300 ? 'http-2xx' : code < 400 ? 'http-3xx' : code < 500 ? 'http-4xx' : 'http-5xx';
            return `<tr><td><strong class="${cls}">${code}</strong></td><td>${name}</td><td class="text-muted">${desc}</td></tr>`;
          }).join('');
        };
        renderTable('');
        mc.querySelector('#tm-http-search').addEventListener('input', (e) => renderTable(e.target.value));
        break;
      }
      case 'port-ref': {
        const ports = [
          [20, 'TCP', 'FTP Data', 'File Transfer Protocol data transfer'],
          [21, 'TCP', 'FTP Control', 'File Transfer Protocol command control'],
          [22, 'TCP', 'SSH/SFTP', 'Secure Shell remote login, SFTP file transfer'],
          [23, 'TCP', 'Telnet', 'Unencrypted text communications (legacy)'],
          [25, 'TCP', 'SMTP', 'Simple Mail Transfer Protocol for email routing'],
          [53, 'TCP/UDP', 'DNS', 'Domain Name System name resolution'],
          [67, 'UDP', 'DHCP Server', 'Dynamic Host Configuration Protocol server'],
          [68, 'UDP', 'DHCP Client', 'Dynamic Host Configuration Protocol client'],
          [69, 'UDP', 'TFTP', 'Trivial File Transfer Protocol'],
          [80, 'TCP', 'HTTP', 'Hypertext Transfer Protocol for web traffic'],
          [110, 'TCP', 'POP3', 'Post Office Protocol v3 for email retrieval'],
          [123, 'UDP', 'NTP', 'Network Time Protocol for clock synchronization'],
          [137, 'UDP', 'NetBIOS NS', 'NetBIOS Name Service (Windows networking)'],
          [143, 'TCP', 'IMAP', 'Internet Message Access Protocol for email'],
          [161, 'UDP', 'SNMP', 'Simple Network Management Protocol'],
          [162, 'UDP', 'SNMP Trap', 'SNMP Trap notifications'],
          [389, 'TCP', 'LDAP', 'Lightweight Directory Access Protocol'],
          [443, 'TCP', 'HTTPS', 'HTTP Secure (TLS/SSL encrypted web traffic)'],
          [445, 'TCP', 'SMB', 'Server Message Block (Windows file sharing)'],
          [465, 'TCP', 'SMTPS', 'SMTP over SSL for secure email submission'],
          [514, 'UDP', 'Syslog', 'System logging protocol'],
          [587, 'TCP', 'SMTP Submission', 'Email message submission with STARTTLS'],
          [636, 'TCP', 'LDAPS', 'LDAP over SSL/TLS'],
          [873, 'TCP', 'Rsync', 'Remote file synchronization'],
          [993, 'TCP', 'IMAPS', 'IMAP over SSL for secure email access'],
          [995, 'TCP', 'POP3S', 'POP3 over SSL for secure email retrieval'],
          [1080, 'TCP', 'SOCKS', 'SOCKS proxy protocol'],
          [1433, 'TCP', 'MSSQL', 'Microsoft SQL Server database'],
          [1521, 'TCP', 'Oracle DB', 'Oracle Database listener'],
          [1883, 'TCP', 'MQTT', 'Message Queuing Telemetry Transport (IoT)'],
          [2049, 'TCP/UDP', 'NFS', 'Network File System'],
          [2375, 'TCP', 'Docker', 'Docker daemon API (unencrypted)'],
          [2376, 'TCP', 'Docker TLS', 'Docker daemon API (TLS encrypted)'],
          [3000, 'TCP', 'Grafana/Dev', 'Grafana, Node.js dev servers, Gitea'],
          [3306, 'TCP', 'MySQL', 'MySQL / MariaDB database server'],
          [3389, 'TCP', 'RDP', 'Remote Desktop Protocol (Windows)'],
          [4222, 'TCP', 'NATS', 'NATS messaging system'],
          [5000, 'TCP', 'Docker Registry', 'Docker container registry, Flask dev'],
          [5432, 'TCP', 'PostgreSQL', 'PostgreSQL database server'],
          [5672, 'TCP', 'AMQP', 'RabbitMQ / Advanced Message Queuing Protocol'],
          [5900, 'TCP', 'VNC', 'Virtual Network Computing remote desktop'],
          [6379, 'TCP', 'Redis', 'Redis in-memory data structure store'],
          [6443, 'TCP', 'Kubernetes API', 'Kubernetes API server (HTTPS)'],
          [8080, 'TCP', 'HTTP Alt', 'Alternative HTTP (proxies, Tomcat, Jenkins)'],
          [8443, 'TCP', 'HTTPS Alt', 'Alternative HTTPS port'],
          [8883, 'TCP', 'MQTT TLS', 'MQTT over TLS/SSL'],
          [9000, 'TCP', 'Portainer', 'Portainer, SonarQube, PHP-FPM'],
          [9090, 'TCP', 'Prometheus', 'Prometheus monitoring server'],
          [9200, 'TCP', 'Elasticsearch', 'Elasticsearch REST API'],
          [9300, 'TCP', 'ES Transport', 'Elasticsearch node-to-node communication'],
          [9418, 'TCP', 'Git', 'Git protocol (unencrypted)'],
          [10250, 'TCP', 'Kubelet', 'Kubernetes Kubelet API'],
          [11211, 'TCP/UDP', 'Memcached', 'Memcached distributed cache'],
          [15672, 'TCP', 'RabbitMQ Mgmt', 'RabbitMQ management console'],
          [27017, 'TCP', 'MongoDB', 'MongoDB NoSQL database server'],
          [50000, 'TCP', 'Jenkins Agent', 'Jenkins JNLP agent communication'],
          [51820, 'UDP', 'WireGuard', 'WireGuard VPN tunnel'],
        ];
        const renderTable = (filter) => {
          const f = (filter || '').toLowerCase();
          const filtered = ports.filter(([port, proto, svc, desc]) => !f || String(port).includes(f) || proto.toLowerCase().includes(f) || svc.toLowerCase().includes(f) || desc.toLowerCase().includes(f));
          const tbody = mc.querySelector('#tm-port-table tbody');
          tbody.innerHTML = filtered.map(([port, proto, svc, desc]) =>
            `<tr><td><strong>${port}</strong></td><td>${proto}</td><td>${svc}</td><td class="text-muted">${desc}</td></tr>`
          ).join('');
        };
        renderTable('');
        mc.querySelector('#tm-port-search').addEventListener('input', (e) => renderTable(e.target.value));
        break;
      }
      case 'html2md': {
        const convert = () => {
          const html = mc.querySelector('#tm-h2m-input').value;
          // Simple HTML to Markdown conversion
          let md = html
            .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n')
            .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n')
            .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n')
            .replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n')
            .replace(/<h5[^>]*>(.*?)<\/h5>/gi, '##### $1\n\n')
            .replace(/<h6[^>]*>(.*?)<\/h6>/gi, '###### $1\n\n')
            .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
            .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
            .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
            .replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*')
            .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
            .replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '```\n$1\n```\n\n')
            .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, '```\n$1\n```\n\n')
            .replace(/<a[^>]+href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
            .replace(/<img[^>]+src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/gi, '![$2]($1)')
            .replace(/<img[^>]+src="([^"]*)"[^>]*\/?>/gi, '![]($1)')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<hr\s*\/?>/gi, '\n---\n\n')
            .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
            .replace(/<\/?(ul|ol)[^>]*>/gi, '\n')
            .replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (m, c) => c.trim().split('\n').map(l => '> ' + l.trim()).join('\n') + '\n\n')
            .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
            .replace(/<\/?(div|span|section|article|header|footer|main|nav)[^>]*>/gi, '')
            .replace(/<[^>]+>/g, '')
            .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
            .replace(/\n{3,}/g, '\n\n').trim();
          mc.querySelector('#tm-h2m-output').value = md;
          mc.querySelector('#tm-h2m-preview').textContent = md;
        };
        mc.querySelector('#tm-h2m-convert').addEventListener('click', convert);
        mc.querySelector('#tm-h2m-copy').addEventListener('click', () => {
          Utils.copyToClipboard(mc.querySelector('#tm-h2m-output').value); Toast.success('Copied!');
        });
        mc.querySelector('#tm-h2m-input').addEventListener('input', () => {
          if (mc.querySelector('#tm-h2m-live').checked) convert();
        });
        break;
      }
      case 'md2html': {
        const convert = () => {
          const md = mc.querySelector('#tm-m2h-input').value;
          // Simple Markdown to HTML conversion
          let html = md
            .replace(/^######\s+(.+)$/gm, '<h6>$1</h6>')
            .replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>')
            .replace(/^####\s+(.+)$/gm, '<h4>$1</h4>')
            .replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
            .replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
            .replace(/^#\s+(.+)$/gm, '<h1>$1</h1>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
            .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">')
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
            .replace(/^---$/gm, '<hr>')
            .replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>')
            .replace(/^- (.+)$/gm, '<li>$1</li>')
            .replace(/(<li>.*<\/li>\n?)+/g, (m) => '<ul>' + m + '</ul>')
            .replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>')
            .replace(/^(?!<[hupblo]|<hr|<li|<blockquote|<pre)(.+)$/gm, '<p>$1</p>')
            .replace(/\n{2,}/g, '\n').trim();
          mc.querySelector('#tm-m2h-output').value = html;
          mc.querySelector('#tm-m2h-preview').innerHTML = html;
        };
        mc.querySelector('#tm-m2h-convert').addEventListener('click', convert);
        mc.querySelector('#tm-m2h-copy').addEventListener('click', () => {
          Utils.copyToClipboard(mc.querySelector('#tm-m2h-output').value); Toast.success('Copied!');
        });
        mc.querySelector('#tm-m2h-input').addEventListener('input', () => {
          if (mc.querySelector('#tm-m2h-live').checked) convert();
        });
        break;
      }
    }
  },

  _dockerRunToCompose(cmd) {
    // Parse docker run command into compose YAML
    const args = this._parseDockerArgs(cmd);
    const svc = { image: args.image || 'unknown' };

    if (args.name) svc.container_name = args.name;
    if (args.ports.length) svc.ports = args.ports;
    if (args.volumes.length) svc.volumes = args.volumes;
    if (Object.keys(args.env).length) svc.environment = args.env;
    if (args.restart) svc.restart = args.restart;
    if (args.network) svc.networks = [args.network];
    if (args.hostname) svc.hostname = args.hostname;
    if (args.workdir) svc.working_dir = args.workdir;
    if (args.entrypoint) svc.entrypoint = args.entrypoint;
    if (args.command) svc.command = args.command;
    if (args.labels.length) {
      svc.labels = {};
      args.labels.forEach(l => { const [k, ...v] = l.split('='); svc.labels[k] = v.join('='); });
    }

    const name = (args.name || 'app').replace(/[^a-z0-9-]/g, '-');
    let yaml = `services:\n  ${name}:\n`;
    for (const [key, val] of Object.entries(svc)) {
      if (typeof val === 'string') {
        yaml += `    ${key}: ${val}\n`;
      } else if (Array.isArray(val)) {
        yaml += `    ${key}:\n`;
        val.forEach(v => { yaml += `      - "${v}"\n`; });
      } else if (typeof val === 'object') {
        yaml += `    ${key}:\n`;
        for (const [k, v] of Object.entries(val)) {
          yaml += `      ${k}: "${v}"\n`;
        }
      }
    }
    return yaml;
  },

  _parseDockerArgs(cmd) {
    // Tokenize respecting quotes
    const tokens = [];
    let current = '';
    let inQuote = false;
    let quoteChar = '';
    for (const ch of cmd) {
      if (inQuote) {
        if (ch === quoteChar) { inQuote = false; } else { current += ch; }
      } else if (ch === '"' || ch === "'") {
        inQuote = true; quoteChar = ch;
      } else if (ch === ' ' || ch === '\t') {
        if (current) { tokens.push(current); current = ''; }
      } else { current += ch; }
    }
    if (current) tokens.push(current);

    // Skip "docker run" prefix
    let i = 0;
    while (i < tokens.length && (tokens[i] === 'docker' || tokens[i] === 'run')) i++;

    const result = { ports: [], volumes: [], env: {}, labels: [], name: '', image: '', restart: '', network: '', hostname: '', workdir: '', entrypoint: '', command: '' };
    let imageFound = false;

    while (i < tokens.length) {
      const t = tokens[i];
      if (imageFound) {
        result.command = tokens.slice(i).join(' ');
        break;
      }
      if (t === '-d' || t === '--detach') { i++; continue; }
      if (t === '-it' || t === '-i' || t === '-t') { i++; continue; }
      if (t === '--rm') { i++; continue; }
      if (t === '-p' || t === '--publish') { result.ports.push(tokens[++i]); i++; continue; }
      if (t === '-v' || t === '--volume') { result.volumes.push(tokens[++i]); i++; continue; }
      if (t === '-e' || t === '--env') { const kv = tokens[++i]; const eq = kv.indexOf('='); if (eq > 0) result.env[kv.substring(0, eq)] = kv.substring(eq + 1); i++; continue; }
      if (t === '-l' || t === '--label') { result.labels.push(tokens[++i]); i++; continue; }
      if (t === '--name') { result.name = tokens[++i]; i++; continue; }
      if (t === '--restart') { result.restart = tokens[++i]; i++; continue; }
      if (t === '--network' || t === '--net') { result.network = tokens[++i]; i++; continue; }
      if (t === '-h' || t === '--hostname') { result.hostname = tokens[++i]; i++; continue; }
      if (t === '-w' || t === '--workdir') { result.workdir = tokens[++i]; i++; continue; }
      if (t === '--entrypoint') { result.entrypoint = tokens[++i]; i++; continue; }
      if (t.startsWith('-')) { if (t.includes('=')) { i++; } else { i += 2; } continue; } // skip unknown flags
      result.image = t;
      imageFound = true;
      i++;
    }
    return result;
  },

  _generateProxyLabels(type, domain, port, tls) {
    if (type === 'traefik') {
      const router = domain.replace(/[^a-z0-9]/g, '-');
      let labels = `labels:\n`;
      labels += `  - "traefik.enable=true"\n`;
      labels += `  - "traefik.http.routers.${router}.rule=Host(\\\`${domain}\\\`)"\n`;
      if (tls) {
        labels += `  - "traefik.http.routers.${router}.entrypoints=websecure"\n`;
        labels += `  - "traefik.http.routers.${router}.tls.certresolver=letsencrypt"\n`;
      } else {
        labels += `  - "traefik.http.routers.${router}.entrypoints=web"\n`;
      }
      labels += `  - "traefik.http.services.${router}.loadbalancer.server.port=${port}"\n`;
      return labels;
    } else {
      // Caddy labels (via caddy-docker-proxy)
      let labels = `labels:\n`;
      labels += `  caddy: "${domain}"\n`;
      labels += `  caddy.reverse_proxy: "{{upstreams ${port}}}"\n`;
      if (tls) {
        labels += `  caddy.tls: "internal"  # or remove for Let's Encrypt auto\n`;
      }
      return labels;
    }
  },

  // ─── Templates Tab ────────────────────────────────
  async _renderTemplates(el) {
    el.innerHTML = `<div class="text-muted"><i class="fas fa-spinner fa-spin"></i> Loading templates...</div>`;
    try {
      const data = await Api.getTemplates();
      const templates = data.templates || [];
      const categories = data.categories || [];

      const renderCard = (t) => {
        const modifiedBadge = t.isModified
          ? `<span class="badge badge-warning" style="font-size:9px;margin-left:6px" title="Modified by ${Utils.escapeHtml(t.updatedBy || '?')} on ${Utils.escapeHtml(t.updatedAt || '?')}"><i class="fas fa-pen" style="margin-right:3px"></i>modified</span>`
          : '';
        const customBadge = t.isCustom
          ? `<span class="badge badge-info" style="font-size:9px;margin-left:6px"><i class="fas fa-user" style="margin-right:3px"></i>custom</span>`
          : '';
        // Logo: show image with graceful fallback to FontAwesome icon
        const logoHtml = t.logoUrl
          ? `<img src="${Utils.escapeHtml(t.logoUrl)}" alt="${Utils.escapeHtml(t.name)}" style="width:28px;height:28px;object-fit:contain;flex-shrink:0" onerror="this.style.display='none';this.nextElementSibling.style.display='inline'">`
          + `<i class="${t.icon || 'fas fa-cube'}" style="display:none;font-size:18px;color:var(--accent)"></i>`
          : `<i class="${t.icon || 'fas fa-cube'}" style="font-size:18px;color:var(--accent)"></i>`;
        return `
          <div class="card tpl-card" data-id="${t.id}" data-cat="${Utils.escapeHtml((t.category || '').toLowerCase())}" data-name="${Utils.escapeHtml((t.name || '').toLowerCase())} ${Utils.escapeHtml((t.description || '').toLowerCase())}">
            <div class="card-header" style="gap:10px">
              <div style="display:flex;align-items:center;gap:8px;min-width:0">
                ${logoHtml}
                <h3 style="margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${Utils.escapeHtml(t.name)}${modifiedBadge}${customBadge}</h3>
              </div>
              <span class="badge badge-info" style="font-size:10px;flex-shrink:0">${Utils.escapeHtml(t.category)}</span>
            </div>
            <div class="card-body">
              <p class="text-sm text-muted" style="margin-bottom:12px">${Utils.escapeHtml(t.description)}</p>
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button class="btn btn-sm btn-primary tpl-deploy" data-id="${t.id}"><i class="fas fa-rocket"></i> Deploy</button>
                <button class="btn btn-sm btn-secondary tpl-view" data-id="${t.id}" title="View YAML"><i class="fas fa-eye"></i> View</button>
                <button class="btn btn-sm btn-secondary tpl-configure" data-id="${t.id}" title="Configure & Deploy"><i class="fas fa-sliders-h"></i> Configure</button>
                <button class="btn btn-sm btn-secondary tpl-edit" data-id="${t.id}" title="Edit template"><i class="fas fa-edit"></i> Edit</button>
                ${t.isModified ? `<button class="btn btn-sm btn-secondary tpl-reset" data-id="${t.id}" title="Reset to built-in default"><i class="fas fa-undo"></i></button>` : ''}
                ${t.isCustom ? `<button class="btn btn-sm btn-danger tpl-delete" data-id="${t.id}" title="Delete custom template"><i class="fas fa-trash"></i></button>` : ''}
              </div>
            </div>
          </div>`;
      };

      el.innerHTML = `
        <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;align-items:center">
          <div class="search-box" style="flex:1;min-width:200px">
            <i class="fas fa-search"></i>
            <input type="text" id="tpl-search" placeholder="Search templates...">
          </div>
          <select id="tpl-category" class="form-control" style="width:auto;min-width:150px">
            <option value="">All categories</option>
            ${categories.map(c => `<option value="${Utils.escapeHtml(c)}">${Utils.escapeHtml(c)}</option>`).join('')}
          </select>
          <button class="btn btn-sm btn-primary" id="tpl-add"><i class="fas fa-plus"></i> Add Template</button>
          <button class="btn btn-sm btn-secondary" id="tpl-import-portainer"><i class="fas fa-file-import"></i> Import from Portainer</button>
        </div>
        <div class="info-grid" id="tpl-grid" style="margin-top:0">
          ${templates.map(renderCard).join('')}
        </div>
      `;

      // Search + filter
      const filterFn = () => {
        const q = el.querySelector('#tpl-search')?.value?.toLowerCase() || '';
        const cat = el.querySelector('#tpl-category')?.value?.toLowerCase() || '';
        el.querySelectorAll('.tpl-card').forEach(card => {
          const matchName = card.dataset.name.includes(q);
          const matchCat = !cat || card.dataset.cat === cat;
          card.style.display = matchName && matchCat ? '' : 'none';
        });
      };
      el.querySelector('#tpl-search')?.addEventListener('input', Utils.debounce(filterFn, 200));
      el.querySelector('#tpl-category')?.addEventListener('change', filterFn);

      // Add new template
      el.querySelector('#tpl-add').addEventListener('click', () => this._templateFormDialog(null, el));

      // Import from Portainer
      el.querySelector('#tpl-import-portainer').addEventListener('click', () => this._portainerImportDialog(el));

      // Delegated click handler
      el.addEventListener('click', async (e) => {
        const id = e.target.closest('[data-id]')?.dataset?.id;
        if (!id) return;
        const t = templates.find(t => t.id === id);

        // View — read-only YAML
        if (e.target.closest('.tpl-view') && t) {
          Modal.open(`
            <div class="modal-header">
              <h3><i class="${t.icon}" style="margin-right:8px;color:var(--accent)"></i>${Utils.escapeHtml(t.name)}</h3>
              <button class="modal-close-btn" id="tpl-v-close"><i class="fas fa-times"></i></button>
            </div>
            <div class="modal-body">
              <pre class="inspect-json" style="max-height:60vh;overflow:auto;white-space:pre-wrap;font-size:12px">${Utils.escapeHtml(t.compose)}</pre>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" id="tpl-v-copy"><i class="fas fa-copy"></i> Copy</button>
              <button class="btn btn-primary" id="tpl-v-ok">Close</button>
            </div>
          `, { width: '600px' });
          Modal._content.querySelector('#tpl-v-close').addEventListener('click', () => Modal.close());
          Modal._content.querySelector('#tpl-v-ok').addEventListener('click', () => Modal.close());
          Modal._content.querySelector('#tpl-v-copy').addEventListener('click', () => {
            Utils.copyToClipboard(t.compose).then(() => Toast.success('Copied!'));
          });
        }

        // Configure — dynamic configurator with deploy
        if (e.target.closest('.tpl-configure') && t) {
          TemplateConfigurator.open(t, {
            mode: 'deploy',
            onDeploy: async ({ name, compose }) => {
              try {
                Toast.info('Deploying ' + t.name + '...');
                await Api.post(`/templates/${id}/deploy`, { name, compose });
                Toast.success(t.name + ' deployed!');
              } catch (err) { Toast.error(err.message); }
            },
          });
        }

        // Edit — edit template definition (name, icon, YAML)
        if (e.target.closest('.tpl-edit') && t) {
          this._templateFormDialog(t, el);
        }

        if (e.target.closest('.tpl-reset') && t) {
          const ok = await Modal.confirm(`Reset "${t.name}" to its original built-in configuration?`);
          if (!ok) return;
          try {
            await Api.post(`/templates/${id}/reset`);
            Toast.success('Template reset to default');
            this._renderTemplates(el);
          } catch (err) { Toast.error(err.message); }
        }

        if (e.target.closest('.tpl-delete') && t) {
          const ok = await Modal.confirm(`Delete custom template "${t.name}"?`, { danger: true });
          if (!ok) return;
          try {
            await Api.delete(`/templates/${id}`);
            Toast.success('Template deleted');
            this._renderTemplates(el);
          } catch (err) { Toast.error(err.message); }
        }

        // Deploy — direct with defaults
        if (e.target.closest('.tpl-deploy') && t) {
          const result = await Modal.form(`
            <div class="form-group">
              <label>Stack Name *</label>
              <input type="text" id="tpl-name" class="form-control" value="${t.id}" placeholder="my-${t.id}">
              <small class="text-muted">Letters, numbers, dashes and underscores only</small>
            </div>
          `, {
            title: 'Deploy ' + t.name,
            width: '400px',
            onSubmit: (content) => {
              const name = content.querySelector('#tpl-name').value.trim();
              if (!name || !/^[a-zA-Z0-9_-]+$/.test(name)) { Toast.error('Invalid stack name'); return false; }
              return { name };
            },
          });
          if (result) {
            try {
              Toast.info('Deploying ' + t.name + '...');
              await Api.post(`/templates/${id}/deploy`, result);
              Toast.success(t.name + ' deployed!');
            } catch (err) { Toast.error(err.message); }
          }
        }
      });
    } catch (err) {
      el.innerHTML = '<div class="empty-msg">Error: ' + err.message + '</div>';
    }
  },

  async _templateFormDialog(template, parentEl) {
    const isEdit = !!template;
    const isBuiltin = template?.isBuiltin;
    const title = isEdit ? `Edit: ${template.name}` : 'Add Custom Template';

    const result = await Modal.form(`
      <div class="form-group">
        <label>Template ID *</label>
        <input type="text" id="tf-id" class="form-control" value="${isEdit ? Utils.escapeHtml(template.id) : ''}" ${isEdit ? 'readonly style="opacity:0.6"' : ''} placeholder="my-template">
        ${!isEdit ? '<small class="text-muted">Unique identifier (letters, numbers, dashes, underscores)</small>' : ''}
      </div>
      <div class="form-group">
        <label>Name *</label>
        <input type="text" id="tf-name" class="form-control" value="${isEdit ? Utils.escapeHtml(template.name) : ''}" placeholder="My Template">
      </div>
      <div class="form-group">
        <label>Category</label>
        <input type="text" id="tf-category" class="form-control" value="${isEdit ? Utils.escapeHtml(template.category) : 'Custom'}" placeholder="Database, Web Server, Tool...">
      </div>
      <div class="form-group">
        <label>Icon (FontAwesome class)</label>
        <input type="text" id="tf-icon" class="form-control" value="${isEdit ? Utils.escapeHtml(template.icon) : 'fas fa-cube'}" placeholder="fas fa-cube">
      </div>
      <div class="form-group">
        <label>Description</label>
        <input type="text" id="tf-desc" class="form-control" value="${isEdit ? Utils.escapeHtml(template.description) : ''}" placeholder="What this template does">
      </div>
      <div class="form-group">
        <label>Compose YAML *</label>
        <textarea id="tf-compose" class="form-control" rows="12" style="font-family:var(--mono);font-size:12px">${isEdit ? Utils.escapeHtml(template.compose) : 'services:\n  my-app:\n    image: nginx:alpine\n    ports:\n      - "8080:80"\n    restart: unless-stopped'}</textarea>
      </div>
    `, {
      title,
      width: '650px',
      onSubmit: (content) => {
        const id = content.querySelector('#tf-id').value.trim();
        const name = content.querySelector('#tf-name').value.trim();
        const compose = content.querySelector('#tf-compose').value.trim();
        if (!id || !name || !compose) { Toast.error('ID, Name, and Compose YAML are required'); return false; }
        if (!isEdit && !/^[a-zA-Z0-9_-]+$/.test(id)) { Toast.error('ID must be alphanumeric with dashes/underscores'); return false; }
        return {
          id, name, compose,
          category: content.querySelector('#tf-category').value.trim() || 'Custom',
          icon: content.querySelector('#tf-icon').value.trim() || 'fas fa-cube',
          description: content.querySelector('#tf-desc').value.trim(),
        };
      },
    });

    if (!result) return;

    try {
      if (isEdit) {
        await Api.put(`/templates/${result.id}`, result);
        Toast.success('Template updated');
      } else {
        await Api.post('/templates', result);
        Toast.success('Template created');
      }
      this._renderTemplates(parentEl);
    } catch (err) {
      Toast.error(err.message);
    }
  },

  async _portainerImportDialog(parentEl) {
    const defaultUrl = 'https://raw.githubusercontent.com/portainer/templates/master/templates-2.0.json';

    // Step 1: Ask for URL
    const urlResult = await Modal.form(`
      <div class="form-group">
        <label>Portainer Templates URL</label>
        <input type="url" id="pi-url" class="form-control" value="${defaultUrl}" placeholder="https://...">
        <small class="text-muted">The official Portainer templates URL is pre-filled. You can also use custom template repositories.</small>
      </div>
    `, { title: 'Import from Portainer', width: '600px', submitText: 'Fetch Templates',
      onSubmit: (content) => {
        const url = content.querySelector('#pi-url').value.trim();
        if (!url) { Toast.error('URL is required'); return false; }
        return { url };
      },
    });
    if (!urlResult) return;

    // Step 2: Fetch and preview
    Toast.info('Fetching templates...');
    let preview;
    try {
      preview = await Api.previewPortainerImport(urlResult.url);
    } catch (err) {
      Toast.error('Failed to fetch: ' + err.message);
      return;
    }

    if (!preview.templates || preview.templates.length === 0) {
      Toast.warning('No templates found at that URL');
      return;
    }

    // Step 3: Show checkboxes for selection
    const tpls = preview.templates;
    const selectResult = await Modal.form(`
      <div style="margin-bottom:12px">
        <strong>${tpls.length} templates found.</strong> Select which to import:
        <div style="margin-top:8px;display:flex;gap:8px">
          <button class="btn btn-xs btn-secondary" id="pi-select-all">Select All</button>
          <button class="btn btn-xs btn-secondary" id="pi-select-none">Select None</button>
        </div>
      </div>
      <div style="max-height:400px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;padding:8px">
        ${tpls.map((t, i) => `
          <label style="display:flex;align-items:flex-start;gap:8px;padding:6px 4px;border-bottom:1px solid var(--border);cursor:pointer;font-size:13px">
            <input type="checkbox" class="pi-check" data-idx="${i}" ${t.alreadyExists ? '' : 'checked'}>
            <div>
              <strong>${Utils.escapeHtml(t.name)}</strong>
              <span class="badge badge-info" style="font-size:9px;margin-left:6px">${Utils.escapeHtml(t.category)}</span>
              ${t.alreadyExists ? '<span class="badge badge-warning" style="font-size:9px;margin-left:4px">exists</span>' : ''}
              <div class="text-sm text-muted" style="margin-top:2px">${Utils.escapeHtml((t.description || '').substring(0, 100))}</div>
            </div>
          </label>
        `).join('')}
      </div>
    `, {
      title: `Import Templates (${tpls.length} found)`,
      width: '650px',
      submitText: 'Import Selected',
      onMount: (content) => {
        content.querySelector('#pi-select-all').addEventListener('click', () => {
          content.querySelectorAll('.pi-check').forEach(cb => cb.checked = true);
        });
        content.querySelector('#pi-select-none').addEventListener('click', () => {
          content.querySelectorAll('.pi-check').forEach(cb => cb.checked = false);
        });
      },
      onSubmit: (content) => {
        const selected = [];
        content.querySelectorAll('.pi-check:checked').forEach(cb => {
          selected.push(tpls[parseInt(cb.dataset.idx)]);
        });
        if (selected.length === 0) { Toast.warning('No templates selected'); return false; }
        return { selected };
      },
    });
    if (!selectResult) return;

    // Step 4: Import
    try {
      const result = await Api.importPortainerTemplates(selectResult.selected);
      Toast.success(`Imported ${result.imported} templates` + (result.skipped ? `, ${result.skipped} skipped (duplicates)` : ''));
      this._renderTemplates(parentEl);
    } catch (err) {
      Toast.error('Import failed: ' + err.message);
    }
  },

  _renderPrune(el) {
    el.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h3>${i18n.t('pages.system.systemPrune')}</h3>
          <button class="prune-help-btn" id="prune-help" title="${i18n.t('pages.system.pruneHelpTooltip')}">?</button>
        </div>
        <div class="card-body">
          <p class="text-muted mb-md">${i18n.t('pages.system.pruneDesc')}</p>
          <div class="prune-grid">
            <div class="prune-item">
              <h4><i class="fas fa-cube"></i> ${i18n.t('pages.system.pruneContainers')}</h4>
              <p>${i18n.t('pages.system.pruneContainersDesc')}</p>
              <button class="btn btn-sm btn-warning" data-prune="containers">${i18n.t('pages.system.pruneContainersBtn')}</button>
            </div>
            <div class="prune-item">
              <h4><i class="fas fa-layer-group"></i> ${i18n.t('pages.system.pruneImages')}</h4>
              <p>${i18n.t('pages.system.pruneImagesDesc')}</p>
              <button class="btn btn-sm btn-warning" data-prune="images">${i18n.t('pages.system.pruneImagesBtn')}</button>
            </div>
            <div class="prune-item">
              <h4><i class="fas fa-database"></i> ${i18n.t('pages.system.pruneVolumes')}</h4>
              <p>${i18n.t('pages.system.pruneVolumesDesc')}</p>
              <button class="btn btn-sm btn-danger" data-prune="volumes">${i18n.t('pages.system.pruneVolumesBtn')}</button>
            </div>
            <div class="prune-item">
              <h4><i class="fas fa-network-wired"></i> ${i18n.t('pages.system.pruneNetworks')}</h4>
              <p>${i18n.t('pages.system.pruneNetworksDesc')}</p>
              <button class="btn btn-sm btn-warning" data-prune="networks">${i18n.t('pages.system.pruneNetworksBtn')}</button>
            </div>
            <div class="prune-item">
              <h4><i class="fas fa-broom"></i> ${i18n.t('pages.system.pruneEverything')}</h4>
              <p>${i18n.t('pages.system.pruneEverythingDesc')}</p>
              <button class="btn btn-sm btn-danger" data-prune="all">${i18n.t('pages.system.pruneAllBtn')}</button>
            </div>
          </div>
        </div>
      </div>
    `;

    el.querySelector('#prune-help').addEventListener('click', () => this._showPruneHelp());

    // Wire up prune buttons
    el.querySelectorAll('[data-prune]').forEach(btn => {
      btn.addEventListener('click', () => SystemPage._prune(btn.dataset.prune));
    });
  },

  _showPruneHelp() {
    const html = `
      <div class="modal-header">
        <h3><i class="fas fa-info-circle" style="color:var(--accent);margin-right:8px"></i> ${i18n.t('pages.system.pruneHelp.title')}</h3>
        <button class="modal-close-btn" id="modal-x"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-body prune-help-content">
        <p>${i18n.t('pages.system.pruneHelp.intro')}</p>

        <h4><i class="fas fa-cube"></i> ${i18n.t('pages.system.pruneHelp.containersTitle')}</h4>
        <p>${i18n.t('pages.system.pruneHelp.containersBody')}</p>
        <p class="warn-text"><i class="fas fa-exclamation-triangle"></i> ${i18n.t('pages.system.pruneHelp.containersWarning')}</p>

        <h4><i class="fas fa-layer-group"></i> ${i18n.t('pages.system.pruneHelp.imagesTitle')}</h4>
        <p>${i18n.t('pages.system.pruneHelp.imagesBody')}</p>
        <p class="warn-text"><i class="fas fa-exclamation-triangle"></i> ${i18n.t('pages.system.pruneHelp.imagesWarning')}</p>

        <h4><i class="fas fa-database"></i> ${i18n.t('pages.system.pruneHelp.volumesTitle')}</h4>
        <p>${i18n.t('pages.system.pruneHelp.volumesBody')}</p>
        <p class="danger-text"><i class="fas fa-exclamation-circle"></i> ${i18n.t('pages.system.pruneHelp.volumesWarning')}</p>

        <h4><i class="fas fa-network-wired"></i> ${i18n.t('pages.system.pruneHelp.networksTitle')}</h4>
        <p>${i18n.t('pages.system.pruneHelp.networksBody')}</p>
        <p>${i18n.t('pages.system.pruneHelp.networksSafe')}</p>

        <h4><i class="fas fa-broom"></i> ${i18n.t('pages.system.pruneHelp.allTitle')}</h4>
        <p>${i18n.t('pages.system.pruneHelp.allBody')}</p>
        <p class="danger-text"><i class="fas fa-exclamation-circle"></i> ${i18n.t('pages.system.pruneHelp.allWarning')}</p>

        <div class="tip-box">
          <i class="fas fa-lightbulb"></i>
          ${i18n.t('pages.system.pruneHelp.tipText')}
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" id="modal-ok">${i18n.t('common.understood')}</button>
      </div>
    `;
    Modal.open(html, { width: '620px' });
    Modal._content.querySelector('#modal-x').addEventListener('click', () => Modal.close());
    Modal._content.querySelector('#modal-ok').addEventListener('click', () => Modal.close());
  },

  async _prune(type) {
    const msg = type === 'all'
      ? i18n.t('pages.system.pruneAllConfirm')
      : i18n.t('pages.system.pruneConfirm', { type });
    const ok = await Modal.confirm(
      msg,
      { danger: true, confirmText: i18n.t('common.prune') }
    );
    if (!ok) return;
    try {
      const result = await Api.prune(type);
      const freed = result.SpaceReclaimed || result.space_reclaimed || 0;
      Toast.success(freed
        ? i18n.t('pages.system.pruneSuccess', { freed: Utils.formatBytes(freed) })
        : i18n.t('pages.system.pruneDone')
      );
    } catch (err) { Toast.error(err.message); }
  },

  async _renderAudit(el) {
    try {
      const data = await Api.getAuditLog(1, 100);
      const entries = data.rows || data.entries || data.logs || (Array.isArray(data) ? data : []);

      if (entries.length === 0) {
        el.innerHTML = `<div class="empty-msg">${i18n.t('pages.system.noAuditEntries')}</div>`;
        return;
      }

      el.innerHTML = `
      <div style="display:flex;justify-content:flex-end;margin-bottom:12px;gap:8px">
        <button class="btn btn-sm btn-secondary" id="audit-export-csv"><i class="fas fa-download"></i> Export CSV</button>
        <button class="btn btn-sm btn-secondary" id="audit-analytics-btn"><i class="fas fa-chart-bar"></i> Analytics</button>
      </div>
      <table class="data-table">
        <thead><tr><th>${i18n.t('pages.system.eventTime')}</th><th>${i18n.t('pages.system.auditUser')}</th><th>${i18n.t('pages.system.auditAction')}</th><th>${i18n.t('pages.system.auditTarget')}</th><th>${i18n.t('pages.system.auditIp')}</th></tr></thead>
        <tbody>${entries.map(e => `
          <tr>
            <td>${Utils.formatDate(e.created_at || e.timestamp)}</td>
            <td>${Utils.escapeHtml(e.username || '')}</td>
            <td><span class="badge badge-info">${Utils.escapeHtml(e.action)}</span></td>
            <td class="mono text-sm">${Utils.escapeHtml(e.target_type ? e.target_type + ':' + Utils.shortId(e.target_id) : '')}</td>
            <td class="mono text-sm">${Utils.escapeHtml(e.ip || '')}</td>
          </tr>
        `).join('')}</tbody>
      </table>`;

      el.querySelector('#audit-export-csv')?.addEventListener('click', () => {
        window.open('/api/audit/export?days=30', '_blank');
      });

      el.querySelector('#audit-analytics-btn')?.addEventListener('click', async () => {
        try {
          const analytics = await Api.getAuditAnalytics(7);
          const html = `
            <div class="modal-header"><h3><i class="fas fa-chart-bar" style="margin-right:8px;color:var(--accent)"></i>Audit Analytics (${analytics.days} days)</h3>
              <button class="modal-close-btn" id="audit-modal-close-x"><i class="fas fa-times"></i></button></div>
            <div class="modal-body">
              <p><strong>${analytics.total}</strong> total actions</p>
              <h4 style="margin-top:12px">Top Users</h4>
              <table class="data-table"><thead><tr><th style="text-align:left">User</th><th>Actions</th></tr></thead>
              <tbody>${(analytics.topUsers || []).map(u => `<tr><td style="text-align:left">${Utils.escapeHtml(u.username)}</td><td>${u.action_count}</td></tr>`).join('')}</tbody></table>
              <h4 style="margin-top:12px">Top Actions</h4>
              <table class="data-table"><thead><tr><th style="text-align:left">Action</th><th>Count</th></tr></thead>
              <tbody>${(analytics.topActions || []).slice(0, 10).map(a => `<tr><td style="text-align:left"><span class="badge badge-info">${Utils.escapeHtml(a.action)}</span></td><td>${a.count}</td></tr>`).join('')}</tbody></table>
            </div>
            <div class="modal-footer"><button class="btn btn-primary" id="audit-modal-close-btn">Close</button></div>`;
          Modal.open(html, { width: '500px' });
          Modal._content.querySelector('#audit-modal-close-x').addEventListener('click', () => Modal.close());
          Modal._content.querySelector('#audit-modal-close-btn').addEventListener('click', () => Modal.close());
        } catch (err) { Toast.error(err.message); }
      });
    } catch (err) {
      el.innerHTML = `<div class="empty-msg">Error: ${err.message}</div>`;
    }
  },

  // ─── Health Overview Tab ─────────────────────────
  async _renderHealth(el) {
    el.innerHTML = `<div class="text-muted"><i class="fas fa-spinner fa-spin"></i> ${i18n.t('common.loading')}</div>`;
    try {
      const data = await Api.getHealthOverview();
      const containers = data.containers || [];

      if (containers.length === 0) {
        el.innerHTML = `<div class="empty-msg">${i18n.t('pages.system.noHealthData')}</div>`;
        return;
      }

      const running = containers.filter(c => c.state === 'running').length;
      const unhealthy = containers.filter(c => c.health?.status === 'unhealthy').length;
      const totalRestarts = containers.reduce((sum, c) => sum + (c.restartCount || 0), 0);

      el.innerHTML = `
        <div class="stat-cards" style="display:flex;gap:16px;margin-bottom:16px">
          <div class="card" style="flex:1;padding:16px;text-align:center">
            <div style="font-size:28px;font-weight:700;color:var(--green)">${running}</div>
            <div class="text-muted text-sm">${i18n.t('pages.system.totalRunning', { count: running })}</div>
          </div>
          <div class="card" style="flex:1;padding:16px;text-align:center">
            <div style="font-size:28px;font-weight:700;color:${unhealthy > 0 ? 'var(--red)' : 'var(--green)'}">${unhealthy}</div>
            <div class="text-muted text-sm">${i18n.t('pages.system.totalUnhealthy', { count: unhealthy })}</div>
          </div>
          <div class="card" style="flex:1;padding:16px;text-align:center">
            <div style="font-size:28px;font-weight:700;color:${totalRestarts > 10 ? 'var(--yellow)' : 'var(--text)'}">${totalRestarts}</div>
            <div class="text-muted text-sm">${i18n.t('pages.system.totalRestarts', { count: totalRestarts })}</div>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><h3>${i18n.t('pages.system.healthTitle')}</h3></div>
          <div class="card-body">
            <table class="data-table">
              <thead>
                <tr>
                  <th>${i18n.t('pages.system.colContainer')}</th>
                  <th>${i18n.t('pages.system.colState')}</th>
                  <th>${i18n.t('pages.system.colHealth')}</th>
                  <th>${i18n.t('pages.system.colRestarts')}</th>
                  <th>${i18n.t('pages.system.colUptime')}</th>
                  <th>${i18n.t('pages.system.colStarted')}</th>
                </tr>
              </thead>
              <tbody>${containers.map(c => {
                const healthBadge = c.health
                  ? `<span class="health-badge ${c.health.status}"><i class="fas fa-circle"></i> ${c.health.status}</span>`
                  : `<span class="text-muted text-sm">—</span>`;
                const uptimeStr = c.uptime > 0 ? Utils.formatDuration(Math.floor(c.uptime / 1000)) : '—';
                return `<tr>
                  <td class="mono text-sm">${Utils.escapeHtml(c.name)}</td>
                  <td><span class="badge ${Utils.statusBadgeClass(c.state)}">${c.state}</span></td>
                  <td>${healthBadge}</td>
                  <td style="${c.restartCount > 5 ? 'color:var(--yellow);font-weight:600' : ''}">${c.restartCount}</td>
                  <td class="text-sm">${uptimeStr}</td>
                  <td class="text-sm text-muted">${c.startedAt ? Utils.timeAgo(c.startedAt) : '—'}</td>
                </tr>`;
              }).join('')}</tbody>
            </table>
          </div>
        </div>
      `;
    } catch (err) {
      el.innerHTML = `<div class="empty-msg">Error: ${err.message}</div>`;
    }
  },

  // ─── Schedules Tab ──────────────────────────────
  async _renderSchedules(el) {
    try {
      const schedules = await Api.getSchedules();
      const containers = await Api.getContainers(true);

      el.innerHTML = `
        <div class="card">
          <div class="card-header">
            <h3><i class="fas fa-clock" style="margin-right:8px"></i>${i18n.t('pages.system.schedulesTitle')}</h3>
            <button class="btn btn-sm btn-primary" id="add-schedule">
              <i class="fas fa-plus"></i> ${i18n.t('pages.containers.newSchedule')}
            </button>
          </div>
          <div class="card-body" id="schedules-list">
            ${schedules.length === 0 ? `<div class="text-muted text-sm">${i18n.t('pages.containers.noSchedules')}</div>` : `
            <table class="data-table">
              <thead><tr>
                <th>${i18n.t('pages.system.colContainer')}</th>
                <th>${i18n.t('pages.containers.scheduleAction')}</th>
                <th>${i18n.t('pages.containers.scheduleCron')}</th>
                <th>${i18n.t('common.status')}</th>
                <th>Last Run</th>
                <th>Runs</th>
                <th></th>
              </tr></thead>
              <tbody>${schedules.map(s => `
                <tr>
                  <td class="mono text-sm">${Utils.escapeHtml(s.containerName || s.containerId?.substring(0, 12))}</td>
                  <td><span class="badge badge-info">${s.action}</span></td>
                  <td class="mono text-sm">${Utils.escapeHtml(s.cron)}</td>
                  <td>
                    <label class="toggle-label" style="margin:0">
                      <input type="checkbox" class="sched-toggle" data-sched-id="${s.id}" ${s.enabled ? 'checked' : ''}>
                      <span class="text-sm">${s.enabled ? i18n.t('common.enabled') : i18n.t('common.disabled')}</span>
                    </label>
                  </td>
                  <td class="text-sm">${s.lastRunAt ? `<span class="${s.lastRunStatus === 'error' ? 'text-danger' : ''}">${Utils.timeAgo(s.lastRunAt)}</span>` : '—'}</td>
                  <td class="text-sm">${s.runCount || 0}</td>
                  <td style="white-space:nowrap">
                    <button class="action-btn" data-run-schedule="${s.id}" title="Run Now"><i class="fas fa-play"></i></button>
                    <button class="action-btn" data-history-schedule="${s.id}" title="History"><i class="fas fa-history"></i></button>
                    <button class="action-btn danger" data-del-schedule="${s.id}" title="${i18n.t('common.delete')}"><i class="fas fa-trash"></i></button>
                  </td>
                </tr>
              `).join('')}</tbody>
            </table>`}
          </div>
        </div>
      `;

      // Toggle schedule enabled/disabled
      el.querySelectorAll('.sched-toggle').forEach(checkbox => {
        checkbox.addEventListener('change', async () => {
          try {
            await Api.updateSchedule(checkbox.dataset.schedId, { enabled: checkbox.checked });
            Toast.success(checkbox.checked ? 'Schedule enabled' : 'Schedule disabled');
          } catch (err) { Toast.error(err.message); checkbox.checked = !checkbox.checked; }
        });
      });

      // Run now
      el.querySelectorAll('[data-run-schedule]').forEach(btn => {
        btn.addEventListener('click', async () => {
          try {
            Toast.info('Executing schedule...');
            await Api.runScheduleNow(btn.dataset.runSchedule);
            Toast.success('Schedule executed');
            this._renderSchedules(el);
          } catch (err) { Toast.error('Execution failed: ' + err.message); }
        });
      });

      // History
      el.querySelectorAll('[data-history-schedule]').forEach(btn => {
        btn.addEventListener('click', async () => {
          try {
            const history = await Api.getScheduleHistory(btn.dataset.historySchedule);
            if (history.length === 0) {
              Toast.info('No execution history yet.');
              return;
            }
            Modal.open(`
              <div class="modal-header">
                <h3><i class="fas fa-history" style="color:var(--accent);margin-right:8px"></i>Execution History</h3>
                <button class="modal-close-btn" id="modal-x"><i class="fas fa-times"></i></button>
              </div>
              <div class="modal-body">
                <table class="data-table compact">
                  <thead><tr><th>Time</th><th>Action</th><th>Status</th><th>Duration</th><th>Error</th></tr></thead>
                  <tbody>${history.map(h => `
                    <tr>
                      <td class="text-sm">${Utils.formatDate(h.executed_at)}</td>
                      <td><span class="badge badge-info">${h.action}</span></td>
                      <td><span class="badge ${h.status === 'success' ? 'badge-running' : 'badge-stopped'}">${h.status}</span></td>
                      <td class="text-sm">${h.duration_ms ? h.duration_ms + 'ms' : '—'}</td>
                      <td class="text-sm text-danger">${Utils.escapeHtml(h.error_message || '')}</td>
                    </tr>
                  `).join('')}</tbody>
                </table>
              </div>
              <div class="modal-footer"><button class="btn btn-secondary" id="modal-ok">Close</button></div>
            `, { width: '700px' });
            Modal._content.querySelector('#modal-x').addEventListener('click', () => Modal.close());
            Modal._content.querySelector('#modal-ok').addEventListener('click', () => Modal.close());
          } catch (err) { Toast.error(err.message); }
        });
      });

      // Add schedule
      el.querySelector('#add-schedule').addEventListener('click', async () => {
        const containerOpts = containers.map(c =>
          `<option value="${c.id}" data-name="${Utils.escapeHtml(c.name)}">${Utils.escapeHtml(c.name)} (${c.state})</option>`
        ).join('');

        const result = await Modal.form(`
          <div class="form-group">
            <label>${i18n.t('pages.system.colContainer')}</label>
            <select id="sched-container" class="form-control">${containerOpts}</select>
          </div>
          <div class="form-group">
            <label>${i18n.t('pages.containers.scheduleAction')}</label>
            <select id="sched-action" class="form-control">
              <option value="restart">${i18n.t('common.restart')}</option>
              <option value="stop">${i18n.t('common.stop')}</option>
              <option value="start">${i18n.t('common.start')}</option>
              <option value="pause">${i18n.t('common.pause')}</option>
              <option value="unpause">${i18n.t('common.unpause')}</option>
            </select>
          </div>
          <div class="form-group">
            <label>${i18n.t('pages.containers.scheduleCron')}</label>
            <input type="text" id="sched-cron" class="form-control" placeholder="${i18n.t('pages.containers.cronPlaceholder')}">
            <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">
              <button type="button" class="btn btn-sm btn-secondary cron-preset" data-cron="*/5 * * * *">Every 5 min</button>
              <button type="button" class="btn btn-sm btn-secondary cron-preset" data-cron="0 * * * *">Every hour</button>
              <button type="button" class="btn btn-sm btn-secondary cron-preset" data-cron="0 0 * * *">Daily midnight</button>
              <button type="button" class="btn btn-sm btn-secondary cron-preset" data-cron="0 3 * * 0">Sun 3 AM</button>
            </div>
          </div>
          <div class="form-group">
            <label>Description <span class="text-muted text-sm">(optional)</span></label>
            <input type="text" id="sched-desc" class="form-control" placeholder="e.g. Weekly restart">
          </div>
        `, {
          title: i18n.t('pages.containers.scheduleCreate'),
          width: '500px',
          onSubmit: (content) => {
            const sel = content.querySelector('#sched-container');
            return {
              containerId: sel.value,
              containerName: sel.options[sel.selectedIndex]?.dataset?.name || '',
              action: content.querySelector('#sched-action').value,
              cron: content.querySelector('#sched-cron').value.trim(),
              description: content.querySelector('#sched-desc').value.trim(),
              enabled: true,
            };
          },
          onMount: (content) => {
            content.querySelectorAll('.cron-preset').forEach(btn => {
              btn.addEventListener('click', (e) => {
                e.preventDefault();
                content.querySelector('#sched-cron').value = btn.dataset.cron;
              });
            });
          },
        });

        if (result && result.cron) {
          try {
            await Api.createSchedule(result);
            Toast.success(i18n.t('pages.containers.scheduleCreated'));
            this._renderSchedules(el);
          } catch (err) { Toast.error(err.message); }
        }
      });

      // Delete schedule
      el.querySelectorAll('[data-del-schedule]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const ok = await Modal.confirm(i18n.t('pages.containers.scheduleDeleteConfirm'), { danger: true });
          if (!ok) return;
          try {
            await Api.deleteSchedule(btn.dataset.delSchedule);
            Toast.success(i18n.t('pages.containers.scheduleDeleted'));
            this._renderSchedules(el);
          } catch (err) { Toast.error(err.message); }
        });
      });
    } catch (err) {
      el.innerHTML = `<div class="empty-msg">Error: ${err.message}</div>`;
    }
  },

  // ─── Backup & Restore Tab ──────────────────────
  _renderBackup(el) {
    el.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h3><i class="fas fa-archive" style="margin-right:8px"></i>${i18n.t('pages.system.backupTitle')}</h3>
        </div>
        <div class="card-body">
          <p class="text-muted mb-md">${i18n.t('pages.system.backupDesc')}</p>
          <div style="display:flex;gap:16px;flex-wrap:wrap">
            <div class="card" style="flex:1;min-width:240px;padding:20px;text-align:center">
              <i class="fas fa-download" style="font-size:32px;color:var(--accent);margin-bottom:12px"></i>
              <h4>${i18n.t('pages.system.exportConfig')}</h4>
              <p class="text-muted text-sm" style="margin:8px 0">${i18n.t('pages.system.backupDesc')}</p>
              <a href="/api/system/backup/config" class="btn btn-sm btn-primary" download>
                <i class="fas fa-download"></i> ${i18n.t('pages.system.exportConfig')}
              </a>
            </div>
            <div class="card" style="flex:1;min-width:240px;padding:20px;text-align:center">
              <i class="fas fa-upload" style="font-size:32px;color:var(--green);margin-bottom:12px"></i>
              <h4>${i18n.t('pages.system.importConfig')}</h4>
              <p class="text-muted text-sm" style="margin:8px 0">${i18n.t('pages.system.selectBackupFile')}</p>
              <input type="file" id="restore-file" accept=".json" style="display:none">
              <button class="btn btn-sm btn-secondary" id="restore-btn">
                <i class="fas fa-upload"></i> ${i18n.t('pages.system.importConfig')}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="card mt-md">
        <div class="card-header">
          <h3><i class="fas fa-database" style="margin-right:8px"></i>Database Backup & Restore</h3>
        </div>
        <div class="card-body">
          <p class="text-muted mb-md">Full database backup and restore. This includes all data: users, audit logs, settings, container metadata, and more.</p>
          <div style="display:flex;gap:16px;flex-wrap:wrap">
            <div class="card" style="flex:1;min-width:240px;padding:20px;text-align:center">
              <i class="fas fa-download" style="font-size:32px;color:var(--accent);margin-bottom:12px"></i>
              <h4>Create Backup</h4>
              <p class="text-muted text-sm" style="margin:8px 0">Download a full copy of the SQLite database.</p>
              <button class="btn btn-sm btn-primary" id="db-backup-tab-btn">
                <i class="fas fa-download"></i> Download Backup
              </button>
            </div>
            <div class="card" style="flex:1;min-width:240px;padding:20px;text-align:center">
              <i class="fas fa-upload" style="font-size:32px;color:var(--red);margin-bottom:12px"></i>
              <h4>Restore Database</h4>
              <p class="text-muted text-sm" style="margin:8px 0">Upload a .db file to replace the current database. A safety backup is created first.</p>
              <input type="file" id="db-restore-file" accept=".db,.sqlite,.sqlite3" style="display:none">
              <button class="btn btn-sm btn-danger" id="db-restore-btn">
                <i class="fas fa-upload"></i> Restore Database
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="card mt-md" id="s3-backup-section">
        <div class="card-header">
          <h3><i class="fab fa-aws" style="margin-right:8px"></i>S3 Cloud Backup</h3>
        </div>
        <div class="card-body">
          <p class="text-muted mb-md">Automatically backup the database to S3-compatible storage (AWS S3, MinIO, Backblaze B2).</p>
          <div class="form-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;max-width:700px">
            <div class="form-group">
              <label>Endpoint URL</label>
              <input type="text" id="s3-endpoint" class="form-control" placeholder="https://s3.amazonaws.com">
            </div>
            <div class="form-group">
              <label>Bucket</label>
              <input type="text" id="s3-bucket" class="form-control" placeholder="my-backups">
            </div>
            <div class="form-group">
              <label>Access Key</label>
              <input type="text" id="s3-access-key" class="form-control" placeholder="AKIA...">
            </div>
            <div class="form-group">
              <label>Secret Key</label>
              <input type="password" id="s3-secret-key" class="form-control" placeholder="secret">
            </div>
            <div class="form-group">
              <label>Region</label>
              <input type="text" id="s3-region" class="form-control" placeholder="us-east-1" value="us-east-1">
            </div>
            <div class="form-group">
              <label>Schedule (cron)</label>
              <input type="text" id="s3-schedule" class="form-control" placeholder="0 3 * * *" value="0 3 * * *">
            </div>
          </div>
          <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">
            <button class="btn btn-sm btn-primary" id="s3-save-btn"><i class="fas fa-save"></i> Save Config</button>
            <button class="btn btn-sm btn-secondary" id="s3-test-btn"><i class="fas fa-plug"></i> Test Connection</button>
            <button class="btn btn-sm btn-secondary" id="s3-upload-btn"><i class="fas fa-cloud-upload-alt"></i> Backup Now</button>
          </div>
          <div id="s3-status" class="mt-sm" style="margin-top:12px"></div>
        </div>
      </div>
    `;

    // S3 backup handlers
    (async () => {
      try {
        const status = await Api.get('/system/backup/s3-status');
        const statusEl = el.querySelector('#s3-status');
        if (status.enabled) {
          statusEl.innerHTML = '<span class="badge badge-running">Enabled</span>';
          if (status.lastBackup && status.lastBackup.time) {
            const lb = status.lastBackup;
            const badge = lb.status === 'success' ? 'badge-running' : 'badge-stopped';
            statusEl.innerHTML += ` &mdash; Last backup: <span class="badge ${badge}">${lb.status}</span> ${Utils.timeAgo(lb.time)}`;
            if (lb.size) statusEl.innerHTML += ` (${Utils.formatBytes(lb.size)})`;
            if (lb.error) statusEl.innerHTML += ` <span class="text-red">${Utils.escapeHtml(lb.error)}</span>`;
          }
        } else {
          statusEl.innerHTML = '<span class="text-muted">Not configured — fill in the fields above and save.</span>';
        }
      } catch { /* ignore */ }
    })();

    el.querySelector('#s3-save-btn').addEventListener('click', async () => {
      try {
        const cfg = {
          endpoint: el.querySelector('#s3-endpoint').value.trim(),
          bucket: el.querySelector('#s3-bucket').value.trim(),
          accessKey: el.querySelector('#s3-access-key').value.trim(),
          secretKey: el.querySelector('#s3-secret-key').value.trim(),
          region: el.querySelector('#s3-region').value.trim(),
          schedule: el.querySelector('#s3-schedule').value.trim(),
        };
        if (!cfg.endpoint || !cfg.bucket || !cfg.accessKey || !cfg.secretKey) {
          Toast.error('Endpoint, bucket, access key, and secret key are required');
          return;
        }
        await Api.put('/system/backup/s3-config', cfg);
        Toast.success('S3 configuration saved');
        this._renderTab();
      } catch (err) { Toast.error(err.message); }
    });

    el.querySelector('#s3-test-btn').addEventListener('click', async () => {
      try {
        Toast.info('Testing S3 connection...');
        const result = await Api.post('/system/backup/s3-test');
        Toast.success(result.message || 'S3 connection successful');
      } catch (err) { Toast.error('S3 test failed: ' + err.message); }
    });

    el.querySelector('#s3-upload-btn').addEventListener('click', async () => {
      try {
        Toast.info('Uploading backup to S3...');
        const result = await Api.post('/system/backup/s3-upload');
        Toast.success('Backup uploaded to S3 (' + Utils.formatBytes(result.size) + ')');
      } catch (err) { Toast.error('S3 upload failed: ' + err.message); }
    });

    // Database backup from backup tab
    el.querySelector('#db-backup-tab-btn')?.addEventListener('click', async () => {
      try {
        Toast.info('Creating backup...');
        const result = await Api.post('/backup/database');
        if (result.ok) Toast.success('Backup created: ' + Utils.formatBytes(result.size));
        else Toast.error('Backup failed');
      } catch (err) { Toast.error(err.message); }
    });

    const fileInput = el.querySelector('#restore-file');
    el.querySelector('#restore-btn').addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const ok = await Modal.confirm(`Restore from "${file.name}"? This will overwrite current settings.`, { danger: true });
      if (!ok) return;

      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const result = await Api.restoreConfig(data);
        const r = result.restored || {};
        Toast.success(i18n.t('pages.containers.restoreSuccess', {
          details: `Settings: ${r.settings || 0}, Rules: ${r.alertRules || 0}, Schedules: ${r.schedules || 0}`
        }));
      } catch (err) {
        Toast.error(i18n.t('pages.containers.restoreFailed', { message: err.message }));
      }
    });

    // Database restore
    const dbFileInput = el.querySelector('#db-restore-file');
    el.querySelector('#db-restore-btn').addEventListener('click', () => dbFileInput.click());

    dbFileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      // Validate file extension
      if (!file.name.endsWith('.db') && !file.name.endsWith('.sqlite') && !file.name.endsWith('.sqlite3')) {
        Toast.error('Please select a .db, .sqlite, or .sqlite3 file');
        dbFileInput.value = '';
        return;
      }

      const ok = await Modal.confirm(
        `<div style="text-align:left">
          <p><strong>Restore database from "${Utils.escapeHtml(file.name)}"?</strong></p>
          <p style="color:var(--red);margin-top:8px"><i class="fas fa-exclamation-triangle" style="margin-right:4px"></i>
          This will replace ALL current data (containers metadata, audit logs, settings, users, etc.).</p>
          <p class="text-muted text-sm" style="margin-top:8px">A safety backup of the current database will be created automatically before replacing.</p>
          <p style="margin-top:8px"><strong>The application will restart after restore.</strong></p>
        </div>`,
        { danger: true }
      );
      if (!ok) { dbFileInput.value = ''; return; }

      try {
        Toast.info('Reading database file...');
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.onerror = () => reject(new Error('Failed to read file'));
          reader.readAsDataURL(file);
        });

        Toast.info('Uploading and restoring database...');
        const result = await Api.restoreDatabase(base64);

        if (result.ok) {
          Toast.success('Database restored! Application is restarting...');
          // Wait for the server to restart, then reload
          setTimeout(() => {
            const checkRestart = setInterval(async () => {
              try {
                await fetch('/api/health');
                clearInterval(checkRestart);
                window.location.reload();
              } catch (_) { /* server still restarting */ }
            }, 2000);
          }, 2000);
        }
      } catch (err) {
        Toast.error('Restore failed: ' + err.message);
        dbFileInput.value = '';
      }
    });
  },

  // ═══════════════════════════════════════════════════
  // SSL/TLS WIZARD
  // ═══════════════════════════════════════════════════

  async _renderSsl(el) {
    let status, caddyStatus;
    try {
      [status, caddyStatus] = await Promise.all([Api.getSslStatus(), Api.getCaddyStatus()]);
    } catch {
      status = { mode: 'none', hasCert: false, hasKey: false, hasCaddyfile: false };
      caddyStatus = { exists: false, running: false, status: 'unknown' };
    }

    const modeLabel = {
      'none': '<span class="text-muted"><i class="fas fa-unlock"></i> HTTP Only (No SSL)</span>',
      'self-signed': '<span class="text-yellow"><i class="fas fa-shield-alt"></i> Self-Signed Certificate</span>',
      'caddy': '<span class="text-green"><i class="fas fa-lock"></i> Caddy Reverse Proxy (Auto-TLS)</span>',
    };

    let certHtml = '';
    if (status.certInfo && !status.certInfo.error) {
      const ci = status.certInfo;
      const expiryClass = ci.expired ? 'text-red' : (ci.daysUntilExpiry < 30 ? 'text-yellow' : 'text-green');
      certHtml = `
        <div class="card" style="margin-top:16px">
          <div class="card-header"><h3><i class="fas fa-certificate" style="margin-right:8px"></i>Current Certificate</h3></div>
          <div class="card-body">
            <table class="info-table">
              <tr><td>Subject</td><td class="mono">${Utils.escapeHtml(ci.subject || '')}</td></tr>
              <tr><td>Issuer</td><td class="mono">${Utils.escapeHtml(ci.issuer || '')}</td></tr>
              <tr><td>Valid From</td><td>${ci.notBefore || '—'}</td></tr>
              <tr><td>Expires</td><td class="${expiryClass}">${ci.notAfter || '—'} ${ci.daysUntilExpiry != null ? `(${ci.daysUntilExpiry} days)` : ''}</td></tr>
              <tr><td>Self-Signed</td><td>${ci.selfSigned ? '<span class="text-yellow">Yes</span>' : '<span class="text-green">No</span>'}</td></tr>
              <tr><td>Fingerprint</td><td class="mono text-sm">${Utils.escapeHtml(ci.fingerprint || '')}</td></tr>
            </table>
            <div style="margin-top:12px">
              <a href="/api/system/ssl/cert/server.crt" download class="btn btn-sm btn-secondary"><i class="fas fa-download" style="margin-right:4px"></i>Download Certificate</a>
              <a href="/api/system/ssl/cert/server.key" download class="btn btn-sm btn-secondary" style="margin-left:8px"><i class="fas fa-download" style="margin-right:4px"></i>Download Key</a>
            </div>
          </div>
        </div>
      `;
    } else if (status.certInfo?.error) {
      certHtml = `<div class="card" style="margin-top:16px"><div class="card-body"><span class="text-muted">${Utils.escapeHtml(status.certInfo.error)}</span></div></div>`;
    }

    let caddyHtml = '';
    if (status.caddyfileContent) {
      caddyHtml = `
        <div class="card" style="margin-top:16px">
          <div class="card-header"><h3><i class="fas fa-file-code" style="margin-right:8px"></i>Caddyfile</h3></div>
          <div class="card-body">
            <pre class="code-block" style="max-height:200px;overflow:auto">${Utils.escapeHtml(status.caddyfileContent)}</pre>
          </div>
        </div>
      `;
    }

    el.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h3><i class="fas fa-shield-alt" style="margin-right:8px"></i>SSL/TLS Configuration</h3>
        </div>
        <div class="card-body">
          <table class="info-table">
            <tr><td>Current Mode</td><td>${modeLabel[status.mode] || modeLabel.none}</td></tr>
            <tr><td>Certificate</td><td>${status.hasCert ? '<span class="text-green">Present</span>' : '<span class="text-muted">Not configured</span>'}</td></tr>
            <tr><td>Private Key</td><td>${status.hasKey ? '<span class="text-green">Present</span>' : '<span class="text-muted">Not configured</span>'}</td></tr>
            <tr><td>Certs Directory</td><td class="mono text-sm">${Utils.escapeHtml(status.certsDir || '/data/certs')}</td></tr>
          </table>
        </div>
      </div>

      ${certHtml}
      ${caddyHtml}

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin-top:20px">
        <!-- Option 1: No SSL -->
        <div class="card">
          <div class="card-header"><h3><i class="fas fa-unlock" style="margin-right:8px"></i>No SSL</h3></div>
          <div class="card-body">
            <p class="text-sm text-muted" style="margin-bottom:12px">
              Use HTTP only. Suitable for local/internal networks behind a trusted reverse proxy.
            </p>
            ${status.mode !== 'none' ? '<button class="btn btn-sm btn-danger" id="ssl-remove"><i class="fas fa-trash" style="margin-right:4px"></i>Remove SSL Config</button>' : '<span class="badge badge-info">Current</span>'}
          </div>
        </div>

        <!-- Option 2: Self-Signed -->
        <div class="card">
          <div class="card-header"><h3><i class="fas fa-certificate" style="margin-right:8px"></i>Self-Signed Certificate</h3></div>
          <div class="card-body">
            <p class="text-sm text-muted" style="margin-bottom:12px">
              Generate a self-signed certificate for development or internal use. Browsers will show a warning.
            </p>
            <div class="form-group">
              <label>Domain / Hostname</label>
              <input type="text" id="ssl-domain" class="form-control" placeholder="e.g. docker-dash.local" value="${window.location.hostname}">
            </div>
            <button class="btn btn-sm btn-primary" id="ssl-generate"><i class="fas fa-magic" style="margin-right:4px"></i>Generate Certificate</button>
          </div>
        </div>

        <!-- Option 3: Caddy Zero-Config HTTPS -->
        <div class="card" style="${caddyStatus.running ? 'border-color:var(--green)' : ''}">
          <div class="card-header">
            <h3><i class="fas fa-lock" style="margin-right:8px"></i>Automatic HTTPS (Let's Encrypt)</h3>
            <span class="badge" style="font-size:10px;background:${caddyStatus.running ? 'var(--green)' : 'var(--surface2)'}; color:${caddyStatus.running ? '#000' : 'var(--text-dim)'}">
              <i class="fas fa-circle" style="font-size:8px;margin-right:3px"></i>
              Caddy ${caddyStatus.running ? 'running' : (caddyStatus.exists ? caddyStatus.status : 'not started')}
            </span>
          </div>
          <div class="card-body">
            <p class="text-sm text-muted" style="margin-bottom:12px">
              Enter your public domain and click <strong>Enable HTTPS</strong>. Docker Dash will write the Caddyfile and reload Caddy automatically — no manual steps needed.
            </p>
            <div class="form-group">
              <label>Public Domain</label>
              <input type="text" id="caddy-domain" class="form-control" placeholder="e.g. dash.example.com" ${!caddyStatus.running ? 'disabled' : ''}>
              <small class="text-muted">Must resolve to this server's public IP for Let's Encrypt to work</small>
            </div>
            <div class="form-group">
              <label>Docker Dash Port</label>
              <input type="number" id="caddy-port" class="form-control" value="8101" ${!caddyStatus.running ? 'disabled' : ''}>
            </div>
            ${caddyStatus.running
              ? `<button class="btn btn-sm btn-primary" id="caddy-enable"><i class="fas fa-magic" style="margin-right:4px"></i>Enable HTTPS</button>`
              : `<div class="tip-box" style="margin-bottom:0">
                  <i class="fas fa-terminal"></i>
                  <div>Start Caddy first:<br><code>docker compose --profile tls up -d</code><br>
                  <small class="text-muted" style="margin-top:4px;display:block">Then refresh this page — the button will activate.</small></div>
                </div>`
            }
          </div>
        </div>
      </div>
    `;

    // Event handlers
    el.querySelector('#ssl-generate')?.addEventListener('click', async () => {
      const domain = el.querySelector('#ssl-domain').value.trim();
      if (!domain) { Toast.warning('Enter a domain'); return; }
      try {
        Toast.info('Generating self-signed certificate...');
        const result = await Api.generateSelfSigned(domain);
        Toast.success('Certificate generated for ' + domain);
        await this._renderSsl(el);
      } catch (err) { Toast.error(err.message); }
    });

    el.querySelector('#caddy-enable')?.addEventListener('click', async () => {
      const domain = el.querySelector('#caddy-domain').value.trim();
      const port = el.querySelector('#caddy-port').value.trim();
      if (!domain) { Toast.warning('Enter a domain'); return; }
      try {
        Toast.info('Enabling HTTPS for ' + domain + '...');
        await Api.enableHttps(domain, parseInt(port) || 8101);
        Toast.success('HTTPS enabled — Caddy is now serving ' + domain);
        await this._renderSsl(el);
      } catch (err) {
        if (err.message?.includes('caddy_not_running')) {
          Toast.warning('Caddy is not running. Start it with: docker compose --profile tls up -d');
        } else {
          Toast.error(err.message);
        }
      }
    });

    el.querySelector('#ssl-remove')?.addEventListener('click', async () => {
      if (!confirm('Remove all SSL configuration? This cannot be undone.')) return;
      try {
        await Api.removeSsl();
        Toast.success('SSL configuration removed');
        await this._renderSsl(el);
      } catch (err) { Toast.error(err.message); }
    });
  },

  async _renderCisBenchmark(el) {
    el.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h3><i class="fas fa-clipboard-check" style="margin-right:8px;color:var(--accent)"></i>CIS Docker Benchmark <span class="badge badge-info" style="font-size:10px;margin-left:6px">v1.6</span></h3>
          <button class="btn btn-sm btn-primary" id="cis-run"><i class="fas fa-play" style="margin-right:4px"></i>Run Benchmark</button>
        </div>
        <div class="card-body" style="padding-bottom:0">
          <div id="cis-score-bar" style="display:none;margin-bottom:16px"></div>
          <!-- sub-tabs -->
          <div class="tabs" id="cis-tabs" style="border-bottom:1px solid var(--border);margin:0 -16px;padding:0 16px">
            <button class="tab active" data-cis-tab="guide"><i class="fas fa-book-open" style="margin-right:4px"></i>Guide</button>
            <button class="tab" data-cis-tab="daemon"><i class="fas fa-cog" style="margin-right:4px"></i>Daemon <span id="cis-badge-daemon" class="badge" style="margin-left:4px;font-size:9px;display:none"></span></button>
            <button class="tab" data-cis-tab="container"><i class="fas fa-box" style="margin-right:4px"></i>Containers <span id="cis-badge-container" class="badge" style="margin-left:4px;font-size:9px;display:none"></span></button>
            <button class="tab" data-cis-tab="all"><i class="fas fa-list" style="margin-right:4px"></i>All results</button>
          </div>
        </div>
        <div class="card-body" id="cis-tab-content" style="padding-top:16px">
          <div id="cis-guide-panel">${this._cisBenchmarkGuide()}</div>
          <div id="cis-daemon-panel" style="display:none"><p class="text-muted text-sm">Run the benchmark first.</p></div>
          <div id="cis-container-panel" style="display:none"><p class="text-muted text-sm">Run the benchmark first.</p></div>
          <div id="cis-all-panel" style="display:none"><p class="text-muted text-sm">Run the benchmark first.</p></div>
        </div>
      </div>
    `;

    // Sub-tab switching
    let _cisTab = 'guide';
    el.querySelectorAll('[data-cis-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        el.querySelectorAll('[data-cis-tab]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _cisTab = btn.dataset.cisTab;
        el.querySelectorAll('#cis-guide-panel,#cis-daemon-panel,#cis-container-panel,#cis-all-panel')
          .forEach(p => p.style.display = 'none');
        el.querySelector(`#cis-${_cisTab}-panel`).style.display = '';
      });
    });

    const statusIcon = s => ({
      pass: '<i class="fas fa-check-circle" style="color:var(--green)"></i>',
      warn: '<i class="fas fa-exclamation-triangle" style="color:var(--yellow)"></i>',
      fail: '<i class="fas fa-times-circle" style="color:var(--red)"></i>',
      info: '<i class="fas fa-info-circle" style="color:var(--accent)"></i>',
    }[s] || '');

    const statusBadge = s => ({
      pass: '<span class="badge" style="background:rgba(74,222,128,.15);color:var(--green)">PASS</span>',
      warn: '<span class="badge" style="background:rgba(234,179,8,.15);color:var(--yellow)">WARN</span>',
      fail: '<span class="badge" style="background:rgba(239,68,68,.15);color:var(--red)">FAIL</span>',
      info: '<span class="badge" style="background:rgba(56,139,253,.12);color:var(--accent)">INFO</span>',
    }[s] || '');

    // Render a flat list of checks (daemon or all-daemon)
    const renderDaemonChecks = (checks) => checks.map(item => `
      <div style="display:grid;grid-template-columns:auto 1fr;gap:10px;padding:12px 0;border-bottom:1px solid var(--surface2)">
        <span style="width:22px;flex-shrink:0;margin-top:2px">${statusIcon(item.status)}</span>
        <div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span style="font-size:13px;font-weight:600">${Utils.escapeHtml(item.id)}</span>
            ${statusBadge(item.status)}
            <span style="font-size:13px">${Utils.escapeHtml(item.title)}</span>
          </div>
          <div style="font-size:12px;color:var(--text-dim);margin-top:4px">${Utils.escapeHtml(item.details)}</div>
          ${item.status !== 'pass' ? `<div style="font-size:11px;margin-top:6px;padding:6px 10px;background:rgba(56,139,253,.07);border-left:3px solid var(--accent);border-radius:0 var(--radius-sm) var(--radius-sm) 0"><i class="fas fa-wrench" style="margin-right:5px;color:var(--accent)"></i><strong>Fix:</strong> ${Utils.escapeHtml(item.remediation || '')}</div>` : ''}
        </div>
      </div>
    `).join('');

    // Render per-container accordion
    const renderContainerChecks = (checks) => {
      if (!checks.length) return '<div class="empty-msg">No running containers to check.</div>';
      return checks.map(item => {
        const findings = item.findings || [];
        const failCount = findings.filter(f => f.severity === 'fail').length;
        const warnCount = findings.filter(f => f.severity === 'warn').length;
        const passAll = item.status === 'pass';
        return `
          <details style="margin-bottom:8px;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden" ${item.status === 'fail' ? 'open' : ''}>
            <summary style="cursor:pointer;padding:10px 14px;display:flex;align-items:center;gap:10px;list-style:none;background:var(--surface2)">
              <span>${statusIcon(item.status)}</span>
              <span style="font-weight:600;flex:1">${Utils.escapeHtml(item.title)}</span>
              ${item.image ? `<span class="text-muted" style="font-size:11px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${Utils.escapeHtml(item.image)}">${Utils.escapeHtml(item.image.split('/').pop())}</span>` : ''}
              ${failCount ? `<span class="badge" style="background:rgba(239,68,68,.15);color:var(--red)">${failCount} fail</span>` : ''}
              ${warnCount ? `<span class="badge" style="background:rgba(234,179,8,.15);color:var(--yellow)">${warnCount} warn</span>` : ''}
              ${passAll ? `<span class="badge" style="background:rgba(74,222,128,.15);color:var(--green)">all clear</span>` : ''}
            </summary>
            <div style="padding:12px 14px">
              ${passAll
                ? '<div style="color:var(--green);font-size:13px"><i class="fas fa-check-circle" style="margin-right:6px"></i>All container security checks passed.</div>'
                : findings.map(f => `
                    <div style="display:flex;gap:8px;padding:6px 0;border-bottom:1px solid var(--surface2)">
                      <span style="width:16px;flex-shrink:0;margin-top:1px">${statusIcon(f.severity)}</span>
                      <div style="flex:1">
                        <div style="font-size:12px">${Utils.escapeHtml(f.msg)}</div>
                        ${this._cisContainerRemediation(f.msg)}
                      </div>
                    </div>
                  `).join('')
              }
              ${!passAll ? `<div style="margin-top:12px;text-align:right;display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap">
                ${item.containerId ? `<button class="btn btn-sm btn-primary cis-remediate-btn" data-container-id="${Utils.escapeHtml(item.containerId)}" data-container-name="${Utils.escapeHtml(item.title)}" style="font-size:11px" title="Open Remediation Wizard for this container"><i class="fas fa-tools" style="margin-right:5px"></i>Fix with Wizard</button>` : ''}
                ${item.containerId && item.stack ? `<button class="btn btn-sm btn-secondary cis-remediate-stack-btn" data-stack="${Utils.escapeHtml(item.stack)}" style="font-size:11px" title="Remediate whole stack"><i class="fas fa-cubes" style="margin-right:5px"></i>Stack</button>` : ''}
                <button class="btn btn-sm btn-accent cis-hardened-btn" data-container="${Utils.escapeHtml(item.title)}" style="font-size:11px"><i class="fas fa-shield-alt" style="margin-right:5px"></i>Generate CIS-hardened compose</button>
              </div>` : ''}
            </div>
          </details>
        `;
      }).join('');
    };

    const renderResults = (data) => {
      const { checks, summary, score, runAt } = data;
      const scoreColor = score >= 80 ? 'var(--green)' : score >= 50 ? 'var(--yellow)' : 'var(--red)';
      const daemonChecks = checks.filter(c => c.category === 'Daemon');
      const containerChecks = checks.filter(c => c.category === 'Container');

      // Score bar
      el.querySelector('#cis-score-bar').style.display = '';
      el.querySelector('#cis-score-bar').innerHTML = `
        <div style="display:flex;align-items:center;gap:20px;padding:14px 16px;background:var(--surface2);border-radius:var(--radius);flex-wrap:wrap">
          <div style="text-align:center;min-width:70px">
            <div style="font-size:32px;font-weight:700;color:${scoreColor};line-height:1">${score}%</div>
            <div class="text-muted" style="font-size:10px;margin-top:2px">Security Score</div>
          </div>
          <div style="display:flex;gap:12px;flex-wrap:wrap">
            <span class="badge" style="background:rgba(74,222,128,.15);color:var(--green);font-size:11px"><i class="fas fa-check" style="margin-right:4px"></i>${summary.pass || 0} passed</span>
            <span class="badge" style="background:rgba(234,179,8,.15);color:var(--yellow);font-size:11px"><i class="fas fa-exclamation-triangle" style="margin-right:4px"></i>${summary.warn || 0} warnings</span>
            <span class="badge" style="background:rgba(239,68,68,.15);color:var(--red);font-size:11px"><i class="fas fa-times" style="margin-right:4px"></i>${summary.fail || 0} failures</span>
            <span class="badge" style="font-size:11px"><i class="fas fa-info-circle" style="margin-right:4px"></i>${summary.info || 0} info</span>
          </div>
          <div class="text-muted" style="font-size:11px;margin-left:auto">Run at ${new Date(runAt).toLocaleTimeString()}</div>
        </div>
      `;

      // Update badges on sub-tabs
      const daemonIssues = daemonChecks.filter(c => c.status !== 'pass' && c.status !== 'info').length;
      const containerIssues = containerChecks.filter(c => c.status !== 'pass').length;
      const daemonBadge = el.querySelector('#cis-badge-daemon');
      const containerBadge = el.querySelector('#cis-badge-container');
      if (daemonIssues) { daemonBadge.textContent = daemonIssues; daemonBadge.style.display = ''; daemonBadge.style.background = 'rgba(234,179,8,.25)'; daemonBadge.style.color = 'var(--yellow)'; }
      if (containerIssues) { containerBadge.textContent = containerIssues; containerBadge.style.display = ''; containerBadge.style.background = 'rgba(239,68,68,.2)'; containerBadge.style.color = 'var(--red)'; }

      // Daemon panel
      el.querySelector('#cis-daemon-panel').innerHTML = `
        <h4 style="margin:0 0 12px;font-size:13px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.05em">
          <i class="fas fa-cog" style="margin-right:6px"></i>Docker Daemon Configuration (${daemonChecks.length} checks)
        </h4>
        ${renderDaemonChecks(daemonChecks)}
      `;

      // Container panel
      el.querySelector('#cis-container-panel').innerHTML = `
        <h4 style="margin:0 0 12px;font-size:13px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.05em">
          <i class="fas fa-box" style="margin-right:6px"></i>Running Containers (${containerChecks.length} containers checked)
        </h4>
        ${renderContainerChecks(containerChecks)}
      `;

      // All panel
      el.querySelector('#cis-all-panel').innerHTML = `
        <h4 style="margin:0 0 12px;font-size:13px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.05em">
          <i class="fas fa-list" style="margin-right:6px"></i>All Results (${checks.length} total)
        </h4>
        ${renderDaemonChecks(daemonChecks)}
        <h4 style="margin:16px 0 12px;font-size:13px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.05em">
          <i class="fas fa-box" style="margin-right:6px"></i>Containers
        </h4>
        ${renderContainerChecks(containerChecks)}
      `;

      // Auto-switch to daemon tab after first run
      const daemonBtn = el.querySelector('[data-cis-tab="daemon"]');
      daemonBtn?.click();
    };

    el.querySelector('#cis-run').addEventListener('click', async () => {
      const runBtn = el.querySelector('#cis-run');
      runBtn.disabled = true;
      runBtn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:4px"></i>Running...';
      try {
        const data = await Api.runCisBenchmark(this._hostId);
        renderResults(data);
      } catch (err) {
        el.querySelector('#cis-daemon-panel').innerHTML = `<div class="alert alert-danger">Error: ${Utils.escapeHtml(err.message)}</div>`;
        el.querySelector('[data-cis-tab="daemon"]')?.click();
      } finally {
        runBtn.disabled = false;
        runBtn.innerHTML = '<i class="fas fa-sync-alt" style="margin-right:4px"></i>Run Again';
      }
    });

    // Remediation Wizard — container entry point
    el.querySelector('#cis-container-panel').addEventListener('click', (e) => {
      const fixBtn = e.target.closest('.cis-remediate-btn');
      if (fixBtn) {
        if (typeof RemediateWizard === 'undefined') { Toast.error('Remediation Wizard not loaded'); return; }
        RemediateWizard.open({
          scope: { type: 'container', id: fixBtn.dataset.containerId, hostId: Api.getHostId(), displayName: fixBtn.dataset.containerName },
        });
        return;
      }
      const stackBtn = e.target.closest('.cis-remediate-stack-btn');
      if (stackBtn) {
        if (typeof RemediateWizard === 'undefined') { Toast.error('Remediation Wizard not loaded'); return; }
        RemediateWizard.open({
          scope: { type: 'stack', name: stackBtn.dataset.stack, hostId: Api.getHostId(), displayName: 'stack: ' + stackBtn.dataset.stack },
        });
        return;
      }
    });

    // CIS hardened compose — event delegation on the container panel
    el.querySelector('#cis-container-panel').addEventListener('click', async (e) => {
      const btn = e.target.closest('.cis-hardened-btn');
      if (!btn) return;
      const containerName = btn.dataset.container;
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:5px"></i>Generating...';
      try {
        const data = await Api.getCisHardenedCompose(containerName, this._hostId);
        const changesHtml = data.changes.length
          ? `<div style="margin-bottom:12px;padding:10px 14px;background:rgba(74,222,128,.07);border:1px solid rgba(74,222,128,.25);border-radius:var(--radius-sm)">
              <div style="font-size:11px;font-weight:600;color:var(--green);margin-bottom:6px"><i class="fas fa-check-circle" style="margin-right:5px"></i>CIS fixes applied (${data.changes.length})</div>
              <ul style="margin:0;padding-left:18px;font-size:11px;color:var(--text-dim)">
                ${data.changes.map(c => `<li>${Utils.escapeHtml(c)}</li>`).join('')}
              </ul>
            </div>`
          : '';
        Modal.open(`
          <div class="modal-header">
            <h3><i class="fas fa-shield-alt" style="color:var(--green);margin-right:8px"></i>CIS-hardened compose — ${Utils.escapeHtml(containerName)}</h3>
            <button class="modal-close-btn" id="modal-x"><i class="fas fa-times"></i></button>
          </div>
          <div class="modal-body">
            <div style="margin-bottom:10px;padding:8px 12px;background:rgba(56,139,253,.08);border:1px solid var(--accent);border-radius:var(--radius-sm);font-size:12px;color:var(--text-dim)">
              <i class="fas fa-info-circle" style="margin-right:6px;color:var(--accent)"></i>
              <strong>Generated &amp; hardened from container metadata.</strong> Review carefully before deploying — adjust <code>mem_limit</code>, <code>cpus</code>, <code>user</code>, and <code>tmpfs</code> to match your app.
            </div>
            ${changesHtml}
            <textarea id="cis-compose-out" style="width:100%;min-height:420px;border:1px solid var(--border);background:var(--surface2);color:var(--text);font-family:var(--mono);font-size:12px;padding:12px;resize:vertical;outline:none;border-radius:var(--radius-sm);tab-size:2">${Utils.escapeHtml(data.compose)}</textarea>
          </div>
          <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end">
            <button class="btn btn-secondary" id="cis-copy"><i class="fas fa-copy"></i> Copy</button>
            <button class="btn btn-secondary" id="modal-ok">${i18n.t('common.close')}</button>
          </div>
        `, { width: '800px' });
        Modal._content.querySelector('#modal-x').addEventListener('click', () => Modal.close());
        Modal._content.querySelector('#modal-ok').addEventListener('click', () => Modal.close());
        Modal._content.querySelector('#cis-copy').addEventListener('click', () => {
          const val = Modal._content.querySelector('#cis-compose-out').value;
          Utils.copyToClipboard(val).then(() => Toast.success(i18n.t('common.copied')));
        });
      } catch (err) {
        Toast.error(err.message);
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-shield-alt" style="margin-right:5px"></i>Generate CIS-hardened compose';
      }
    });
  },

  async _renderSecretsAudit(rootEl) {
    // NOTE: `rootEl` is the outer container (held by the page). Do NOT reassign
    // it — the subtab click handler's closure captures this variable, and if
    // it points at the inner sub-content div, subsequent clicks render the
    // tab bar INSIDE the inner div (tabs duplicate).
    const activeSub = this._secretsSubtab || 'audit';
    const tabBar = '<div style="display:flex;gap:8px;margin-bottom:16px;border-bottom:1px solid var(--border)">'
      + '<button class="secrets-subtab-btn" data-sub="audit" style="padding:8px 14px;border:none;background:none;cursor:pointer;border-bottom:2px solid ' + (activeSub === 'audit' ? 'var(--accent)' : 'transparent') + ';color:' + (activeSub === 'audit' ? 'var(--text-bright)' : 'var(--text-dim)') + ';font-weight:' + (activeSub === 'audit' ? '600' : '400') + '"><i class="fas fa-shield-alt" style="margin-right:6px"></i>Audit &amp; Wizard</button>'
      + '<button class="secrets-subtab-btn" data-sub="rotation" style="padding:8px 14px;border:none;background:none;cursor:pointer;border-bottom:2px solid ' + (activeSub === 'rotation' ? 'var(--accent)' : 'transparent') + ';color:' + (activeSub === 'rotation' ? 'var(--text-bright)' : 'var(--text-dim)') + ';font-weight:' + (activeSub === 'rotation' ? '600' : '400') + '"><i class="fas fa-sync-alt" style="margin-right:6px"></i>Rotation Tracker</button>'
      + '<button class="secrets-subtab-btn" data-sub="certs" style="padding:8px 14px;border:none;background:none;cursor:pointer;border-bottom:2px solid ' + (activeSub === 'certs' ? 'var(--accent)' : 'transparent') + ';color:' + (activeSub === 'certs' ? 'var(--text-bright)' : 'var(--text-dim)') + ';font-weight:' + (activeSub === 'certs' ? '600' : '400') + '"><i class="fas fa-certificate" style="margin-right:6px"></i>Certificates</button>'
      + '</div><div id="secrets-sub-content"></div>';
    rootEl.innerHTML = tabBar;
    rootEl.querySelectorAll('.secrets-subtab-btn').forEach(btn => btn.addEventListener('click', () => {
      this._secretsSubtab = btn.dataset.sub;
      this._renderSecretsAudit(rootEl);
    }));

    const sub = rootEl.querySelector('#secrets-sub-content');
    if (activeSub === 'rotation') return this._renderSecretRotations(sub);
    if (activeSub === 'certs') return this._renderCertificates(sub);

    sub.innerHTML = '<div class="text-muted"><i class="fas fa-spinner fa-spin"></i> Scanning containers for secret hygiene...</div>';
    // Render the audit view INTO sub; use a local `el` alias for the rest of
    // the function to minimize diff vs. original code.
    const el = sub;

    try {
      const data = await Api.getSecretsAudit();
      const scoreColor = data.avgScore >= 80 ? 'var(--green)' : data.avgScore >= 50 ? 'var(--yellow)' : 'var(--red)';

      el.innerHTML = `
        <div class="card" style="margin-bottom:16px;border-left:4px solid var(--accent)">
          <div class="card-body" style="display:flex;align-items:center;gap:16px;padding:14px 18px">
            <i class="fas fa-magic" style="font-size:32px;color:var(--accent)"></i>
            <div style="flex:1">
              <div style="font-weight:700;font-size:15px">Secrets Setup Wizard</div>
              <div class="text-sm text-muted">Paste your .env file → auto-classify secrets → generate setup script + docker-compose secrets block</div>
            </div>
            <button class="btn btn-primary" id="secrets-wizard-btn"><i class="fas fa-rocket"></i> Launch Wizard</button>
          </div>
        </div>
        <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap">
          <div class="card" style="padding:14px;text-align:center;min-width:120px;flex:1">
            <div style="font-size:28px;font-weight:700;color:${scoreColor}">${data.avgScore}</div>
            <div class="text-sm text-muted">Security Score</div>
          </div>
          <div class="card" style="padding:14px;text-align:center;min-width:120px;flex:1">
            <div style="font-size:28px;font-weight:700;color:var(--red)">${data.criticalCount}</div>
            <div class="text-sm text-muted">Critical Issues</div>
          </div>
          <div class="card" style="padding:14px;text-align:center;min-width:120px;flex:1">
            <div style="font-size:28px;font-weight:700;color:var(--yellow)">${data.warningCount}</div>
            <div class="text-sm text-muted">Warnings</div>
          </div>
          <div class="card" style="padding:14px;text-align:center;min-width:120px;flex:1">
            <div style="font-size:28px;font-weight:700;color:var(--text)">${data.total}</div>
            <div class="text-sm text-muted">Containers Scanned</div>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><h3><i class="fas fa-shield-alt" style="margin-right:8px;color:var(--accent)"></i>Container Secret Hygiene</h3></div>
          <div class="card-body" style="padding:0;overflow-x:auto">
            <table class="data-table compact" style="width:100%">
              <thead><tr>
                <th>Container</th>
                <th>Score</th>
                <th>Secret Mounts</th>
                <th>_FILE Pattern</th>
                <th>Plain Secrets</th>
                <th>Issues</th>
                <th>Actions</th>
              </tr></thead>
              <tbody>
                ${data.containers.map(c => {
                  const sColor = c.score >= 80 ? 'var(--green)' : c.score >= 50 ? 'var(--yellow)' : 'var(--red)';
                  const issuesHtml = c.issues.length > 0 ? c.issues.map(i => {
                    const iColor = i.severity === 'critical' ? 'var(--red)' : i.severity === 'warning' ? 'var(--yellow)' : 'var(--text-dim)';
                    return '<div style="padding:4px 0;font-size:11px;border-top:1px dashed var(--border)"><span class="badge" style="font-size:9px;background:' + iColor + '22;color:' + iColor + '">' + i.severity.toUpperCase() + '</span> ' + Utils.escapeHtml(i.message) + '<br><span class="text-muted" style="font-size:10px;margin-left:8px"><i class="fas fa-wrench" style="margin-right:3px"></i>' + Utils.escapeHtml(i.fix) + '</span></div>';
                  }).join('') : '<span class="text-muted text-sm">No issues</span>';

                  const remediateBtn = c.issues.length > 0
                    ? '<button class="btn btn-xs btn-primary remediate-btn" data-container-id="' + Utils.escapeHtml(c.id) + '" data-container-name="' + Utils.escapeHtml(c.name) + '" title="Open Remediation Wizard"><i class="fas fa-tools"></i> Fix</button>'
                    + (c.stack ? ' <button class="btn btn-xs btn-secondary remediate-stack-btn" data-stack="' + Utils.escapeHtml(c.stack) + '" title="Remediate whole stack"><i class="fas fa-cubes"></i></button>' : '')
                    : '<span class="text-muted text-sm">—</span>';

                  return '<tr>'
                    + '<td><div style="font-weight:600">' + Utils.escapeHtml(c.name) + '</div><div class="text-xs text-muted" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + Utils.escapeHtml(c.image) + '</div>' + (c.stack ? '<div class="text-xs" style="color:var(--accent)"><i class="fas fa-cubes"></i> ' + Utils.escapeHtml(c.stack) + '</div>' : '') + '</td>'
                    + '<td><strong style="color:' + sColor + ';font-size:14px">' + c.score + '</strong></td>'
                    + '<td>' + (c.secretMounts > 0 ? '<span style="color:var(--green)"><i class="fas fa-check"></i> ' + c.secretMounts + '</span>' : '<span class="text-muted">0</span>') + '</td>'
                    + '<td>' + (c.filePatternVars > 0 ? '<span style="color:var(--green)">' + c.filePatternVars + '</span>' : '<span class="text-muted">0</span>') + '</td>'
                    + '<td>' + (c.plainSecrets > 0 ? '<span style="color:var(--red)"><i class="fas fa-exclamation-triangle"></i> ' + c.plainSecrets + '</span>' : '<span style="color:var(--green)">0</span>') + '</td>'
                    + '<td style="max-width:400px">' + (c.issues.length > 0 ? '<details><summary style="cursor:pointer;font-size:12px">' + c.issues.length + ' issue(s)</summary>' + issuesHtml + '</details>' : '<span style="color:var(--green)"><i class="fas fa-check-circle"></i> Clean</span>') + '</td>'
                    + '<td>' + remediateBtn + '</td>'
                    + '</tr>';
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div class="card" style="margin-top:16px">
          <div class="card-header"><h3><i class="fas fa-clipboard-check" style="margin-right:8px;color:var(--green)"></i>Pre-Deploy Validation</h3></div>
          <div class="card-body">
            <p class="text-muted text-sm" style="margin-bottom:12px">Paste your <code>.env</code> and/or <code>docker-compose.yml</code> to validate before deploying. Checks for: unfilled placeholders, plain-text secrets, missing health checks, resource limits, and security options.</p>
            <div class="form-row">
              <div class="form-group" style="flex:1">
                <label>.env file content</label>
                <textarea id="validate-env" class="form-control" rows="8" placeholder="APP_SECRET=my-secret&#10;DB_PASSWORD_FILE=/run/secrets/db_pass&#10;..." style="font-family:var(--mono);font-size:11px"></textarea>
              </div>
              <div class="form-group" style="flex:1">
                <label>docker-compose.yml content</label>
                <textarea id="validate-compose" class="form-control" rows="8" placeholder="services:&#10;  app:&#10;    image: myapp&#10;    restart: unless-stopped&#10;    ..." style="font-family:var(--mono);font-size:11px"></textarea>
              </div>
            </div>
            <button class="btn btn-sm btn-primary" id="validate-deploy-btn"><i class="fas fa-check-circle"></i> Run Validation</button>
            <div id="validate-results" style="margin-top:12px"></div>
          </div>
        </div>
      `;

      el.querySelector('#validate-deploy-btn')?.addEventListener('click', async () => {
        const envContent = el.querySelector('#validate-env')?.value || '';
        const composeContent = el.querySelector('#validate-compose')?.value || '';
        if (!envContent && !composeContent) { Toast.warning('Paste at least one file to validate'); return; }

        const resultsEl = el.querySelector('#validate-results');
        resultsEl.innerHTML = '<div class="text-muted"><i class="fas fa-spinner fa-spin"></i> Validating...</div>';

        try {
          const data = await Api.validateDeploy({ envContent, composeContent });
          const checks = data.checks || [];
          resultsEl.innerHTML = '<div style="display:flex;gap:12px;margin-bottom:12px;font-size:13px">'
            + '<span style="color:var(--green)"><i class="fas fa-check-circle"></i> ' + data.summary.passed + ' passed</span>'
            + '<span style="color:var(--red)"><i class="fas fa-times-circle"></i> ' + data.summary.failed + ' failed</span>'
            + '<span style="color:var(--yellow)"><i class="fas fa-exclamation-triangle"></i> ' + data.summary.warned + ' warnings</span>'
            + '</div>'
            + checks.map(c => {
                const icon = c.status === 'pass' ? '<i class="fas fa-check-circle" style="color:var(--green)"></i>' : c.status === 'fail' ? '<i class="fas fa-times-circle" style="color:var(--red)"></i>' : c.status === 'warn' ? '<i class="fas fa-exclamation-triangle" style="color:var(--yellow)"></i>' : '<i class="fas fa-info-circle" style="color:var(--accent)"></i>';
                return '<div style="display:flex;align-items:flex-start;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)">' + icon + '<div style="flex:1"><strong style="font-size:12px">' + Utils.escapeHtml(c.name) + '</strong><div class="text-sm text-muted" style="margin-top:2px">' + Utils.escapeHtml(c.details) + '</div></div></div>';
              }).join('');
        } catch (err) {
          resultsEl.innerHTML = '<div style="color:var(--red)">' + err.message + '</div>';
        }
      });

      el.querySelector('#secrets-wizard-btn')?.addEventListener('click', async () => {
        // FIX #32 — run openssl preflight before opening wizard; default to allow on failure
        let preflightOk = true;
        try {
          const pf = await Api.secretsWizardPreflight();
          if (pf && pf.openssl === false) preflightOk = false;
        } catch (_) { /* network/backend not ready — allow wizard to open */ }

        if (!preflightOk) {
          // Show a non-blocking warning banner above the wizard card and still open wizard
          const existingBanner = el.querySelector('#wz-openssl-banner');
          if (!existingBanner) {
            const banner = document.createElement('div');
            banner.id = 'wz-openssl-banner';
            banner.style.cssText = 'background:var(--yellow-bg,rgba(234,179,8,.12));border:1px solid var(--yellow,#ca8a04);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:13px;display:flex;align-items:center;gap:10px';
            banner.innerHTML = '<i class="fas fa-exclamation-triangle" style="color:var(--yellow,#ca8a04);flex-shrink:0"></i>'
              + '<span>\u26a0 Certificate features (CSR generation, PEM parsing) require <code>openssl</code> in the runtime image. Wizard is still functional for script generation.</span>';
            el.querySelector('.card')?.before(banner);
          }
        }
        this._showSecretsWizard();
      });
    } catch (err) {
      el.innerHTML = '<div class="empty-msg is-error">Error: ' + err.message + '</div>';
    }

    // Remediate Wizard entry points on Secrets Audit rows
    el.querySelectorAll('.remediate-btn').forEach(btn => btn.addEventListener('click', () => {
      if (typeof RemediateWizard === 'undefined') { Toast.error('Remediation Wizard not loaded'); return; }
      RemediateWizard.open({
        scope: { type: 'container', id: btn.dataset.containerId, hostId: Api.getHostId(), displayName: btn.dataset.containerName },
      });
    }));
    el.querySelectorAll('.remediate-stack-btn').forEach(btn => btn.addEventListener('click', () => {
      if (typeof RemediateWizard === 'undefined') { Toast.error('Remediation Wizard not loaded'); return; }
      RemediateWizard.open({
        scope: { type: 'stack', name: btn.dataset.stack, hostId: Api.getHostId(), displayName: 'stack: ' + btn.dataset.stack },
      });
    }));
  },

  _showSecretsWizard() {
    // Multi-step wizard: 1) Paste env, 2) Review classified, 3) Fill provider values, 4) Download script + compose
    let state = {
      step: 1,
      envContent: '',
      appName: 'myapp',
      secretDir: '/etc/myapp/secrets',
      analysis: null,
      providerValues: {},
    };

    const render = () => {
      const steps = ['Paste .env', 'Review & Classify', 'Provider Secrets', 'Download'];
      const stepBar = steps.map((label, i) => {
        const num = i + 1;
        const isActive = num === state.step;
        const isDone = num < state.step;
        const color = isDone ? 'var(--green)' : isActive ? 'var(--accent)' : 'var(--surface3)';
        const textColor = isActive ? 'var(--text-bright)' : isDone ? 'var(--text)' : 'var(--text-dim)';
        return '<div style="flex:1;display:flex;align-items:center;gap:6px">'
          + '<span style="width:26px;height:26px;border-radius:50%;background:' + color + ';color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:600">' + (isDone ? '✓' : num) + '</span>'
          + '<span style="font-size:12px;color:' + textColor + ';font-weight:' + (isActive ? '700' : '500') + '">' + label + '</span>'
          + (num < steps.length ? '<span style="flex:1;height:1px;background:var(--border);margin:0 4px"></span>' : '')
          + '</div>';
      }).join('');

      let content = '';
      if (state.step === 1) {
        content = '<div class="form-row">'
          + '<div class="form-group" style="flex:1"><label>App Name</label><input id="wz-appname" class="form-control" value="' + Utils.escapeHtml(state.appName) + '" placeholder="myapp"></div>'
          + '<div class="form-group" style="flex:2"><label>Secrets Directory on Host</label><input id="wz-secretdir" class="form-control" value="' + Utils.escapeHtml(state.secretDir) + '" placeholder="/etc/myapp/secrets"></div>'
          + '</div>'
          + '<div class="form-group"><label>Paste your .env file content</label>'
          + '<textarea id="wz-env" class="form-control" rows="16" placeholder="APP_ENV=live&#10;MSSQL_PASSWORD_FILE=/run/secrets/mssql_password_live&#10;JWT_SIGNING_KEY_FILE=/run/secrets/jwt_signing_key_live&#10;MS_CLIENT_SECRET_FILE=/run/secrets/ms_client_secret_live&#10;..." style="font-family:var(--mono);font-size:11px">' + Utils.escapeHtml(state.envContent) + '</textarea>'
          + '<p class="text-sm text-muted" style="margin-top:6px"><i class="fas fa-info-circle"></i> The wizard scans for <code>*_FILE=/run/secrets/*</code> entries and <code>&lt;TODO_*&gt;</code> placeholders.</p>'
          + '</div>';
      } else if (state.step === 2 && state.analysis) {
        const a = state.analysis;
        const actionColors = { generate: 'var(--green)', provider: 'var(--yellow)', upload: 'var(--accent)', inline: 'var(--purple, #a371f7)', 'ssh-keyscan': 'var(--yellow)', manual: 'var(--red)' };
        const actionLabels = { generate: 'Auto-Generate', provider: 'Manual Paste', upload: 'Upload File', inline: 'Replace Inline', 'ssh-keyscan': 'ssh-keyscan', manual: 'Manual' };

        content = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-bottom:16px">'
          + '<div class="card" style="padding:10px;text-align:center"><div style="font-size:20px;font-weight:700">' + a.summary.total + '</div><div class="text-sm text-muted">Total Items</div></div>'
          + '<div class="card" style="padding:10px;text-align:center"><div style="font-size:20px;font-weight:700;color:var(--green)">' + a.summary.generate + '</div><div class="text-sm text-muted">Auto-Generate</div></div>'
          + '<div class="card" style="padding:10px;text-align:center"><div style="font-size:20px;font-weight:700;color:var(--yellow)">' + a.summary.provider + '</div><div class="text-sm text-muted">Provider</div></div>'
          + '<div class="card" style="padding:10px;text-align:center"><div style="font-size:20px;font-weight:700;color:var(--accent)">' + a.summary.upload + '</div><div class="text-sm text-muted">Upload</div></div>'
          + '<div class="card" style="padding:10px;text-align:center"><div style="font-size:20px;font-weight:700;color:var(--red)">' + a.summary.unknown + '</div><div class="text-sm text-muted">Unknown</div></div>'
          + '</div>';

        content += '<div class="card"><div class="card-header"><h3>Secret Files (' + a.secretFiles.length + ')</h3></div><div class="card-body" style="padding:0;overflow-x:auto">';
        content += '<table class="data-table compact"><thead><tr><th>Env Key</th><th>Secret Name</th><th>Type</th><th>Action</th><th>Details</th></tr></thead><tbody>';
        a.secretFiles.forEach(s => {
          const color = actionColors[s.action] || 'var(--text-dim)';
          const badge = '<span class="badge" style="background:' + color + '22;color:' + color + ';font-size:10px">' + (actionLabels[s.action] || s.action) + '</span>';
          const details = s.action === 'generate' ? '<code style="font-size:10px">' + Utils.escapeHtml(s.generator || '') + '</code>' : (s.provider || s.label);
          content += '<tr><td><code style="font-size:11px">' + Utils.escapeHtml(s.envKey) + '</code></td>'
            + '<td class="mono text-sm">' + Utils.escapeHtml(s.secretName) + '</td>'
            + '<td class="text-sm">' + Utils.escapeHtml(s.label) + '</td>'
            + '<td>' + badge + '</td>'
            + '<td class="text-sm text-muted" style="max-width:400px">' + details + '</td></tr>';
        });
        content += '</tbody></table></div></div>';

        if (a.todoPlaceholders.length > 0) {
          content += '<div class="card" style="margin-top:12px"><div class="card-header"><h3>Inline Placeholders (' + a.todoPlaceholders.length + ')</h3></div><div class="card-body" style="padding:0"><table class="data-table compact"><thead><tr><th>Env Key</th><th>Placeholder</th><th>Action</th></tr></thead><tbody>';
          a.todoPlaceholders.forEach(s => {
            content += '<tr><td><code style="font-size:11px">' + Utils.escapeHtml(s.envKey) + '</code></td>'
              + '<td class="mono text-sm" style="color:var(--yellow)">' + Utils.escapeHtml(s.placeholder) + '</td>'
              + '<td class="text-sm text-muted">' + Utils.escapeHtml(s.provider || s.label) + '</td></tr>';
          });
          content += '</tbody></table></div></div>';
        }
      } else if (state.step === 3) {
        const providerSecrets = state.analysis.secretFiles.filter(s => s.action === 'provider');
        if (providerSecrets.length === 0) {
          content = '<div class="empty-msg"><i class="fas fa-check-circle" style="color:var(--green);font-size:32px"></i><p>No provider-issued secrets detected. All values will be auto-generated.</p><p class="text-muted text-sm">Click Next to download the setup script.</p></div>';
        } else {
          content = '<p class="text-muted text-sm" style="margin-bottom:12px"><i class="fas fa-lock" style="margin-right:4px;color:var(--yellow)"></i>Paste provider-issued values below. They will be embedded base64-encoded in the script. Leave blank to get manual instructions only.</p>';
          providerSecrets.forEach(s => {
            const val = state.providerValues[s.envKey] || '';
            content += '<div class="form-group">'
              + '<label><strong>' + Utils.escapeHtml(s.envKey) + '</strong> <span class="text-sm text-muted">— ' + Utils.escapeHtml(s.label) + '</span></label>'
              + '<div class="text-sm text-muted" style="margin-bottom:4px">' + Utils.escapeHtml(s.provider || '') + '</div>'
              + '<input type="password" class="form-control wz-provider-input" data-key="' + Utils.escapeHtml(s.envKey) + '" value="' + Utils.escapeHtml(val) + '" placeholder="Paste value (or leave blank for manual)" style="font-family:var(--mono);font-size:12px">'
              + '</div>';
          });
        }
      } else if (state.step === 4) {
        const genCount = state.analysis.secretFiles.filter(s => s.action === 'generate').length;
        const hostOpts = (state.hosts || []).map(h => '<option value="' + h.id + '">' + Utils.escapeHtml(h.name) + ' (' + Utils.escapeHtml(h.host || 'local') + ')</option>').join('');
        content = '<div class="empty-msg" style="padding:20px"><i class="fas fa-check-circle" style="color:var(--green);font-size:48px;margin-bottom:12px"></i>'
          + '<h3 style="margin:0 0 8px">Ready to Deploy</h3>'
          + '<p class="text-muted">Download the files, run via SSH, or execute remotely from Docker Dash.</p></div>'
          + '<div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;margin-top:16px">'
          + '<button class="btn btn-primary" id="wz-download-script"><i class="fas fa-download"></i> Download setup-secrets.sh</button>'
          + '<button class="btn btn-primary" id="wz-download-compose"><i class="fas fa-download"></i> Download compose-secrets.yml</button>'
          + '<button class="btn btn-secondary" id="wz-copy-script"><i class="fas fa-copy"></i> Copy Script</button>'
          + '</div>'
          + '<div class="card" style="margin-top:16px;border-left:4px solid var(--accent)"><div class="card-header"><h3><i class="fas fa-bolt" style="margin-right:6px;color:var(--accent)"></i>Remote Deploy via SSH</h3></div><div class="card-body">'
          + '<p class="text-sm text-muted" style="margin-bottom:10px">Upload + execute the script on a remote host via SSH (requires host with SSH config in Hosts → Add Host).</p>'
          + '<div class="form-row">'
          + '<div class="form-group" style="flex:1"><label>Target Host</label><select id="wz-remote-host" class="form-control"><option value="">— choose SSH host —</option>' + hostOpts + '</select></div>'
          + '<div class="form-group" style="flex:1"><label>Run as sudo</label><select id="wz-remote-sudo" class="form-control"><option value="1" selected>Yes (recommended)</option><option value="0">No</option></select></div>'
          + '</div>'
          + '<button class="btn btn-primary" id="wz-remote-deploy"><i class="fas fa-play"></i> Deploy to Remote Host</button>'
          + '<div id="wz-remote-log" style="margin-top:12px;display:none;background:#111;color:#eee;padding:10px;border-radius:4px;font-family:var(--mono);font-size:11px;max-height:280px;overflow:auto;white-space:pre-wrap"></div>'
          + '</div></div>'
          + '<div class="card" style="margin-top:16px;border-left:4px solid var(--green)"><div class="card-header"><h3><i class="fas fa-sync-alt" style="margin-right:6px;color:var(--green)"></i>Track for Rotation</h3></div><div class="card-body">'
          + '<p class="text-sm text-muted" style="margin-bottom:10px">Register these secrets with Docker Dash to get reminders before they expire. Rotation intervals are per-classifier (90–365 days).</p>'
          + '<label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" id="wz-track-rotation" checked> Track ' + state.analysis.secretFiles.length + ' secrets for rotation</label>'
          + '<div class="form-row" style="margin-top:10px">'
          + '<div class="form-group" style="flex:1"><label>Track on Host</label><select id="wz-track-host" class="form-control"><option value="0">This Docker Dash instance</option>' + hostOpts + '</select></div>'
          + '</div>'
          + '<button class="btn btn-sm btn-success" id="wz-register-rotation"><i class="fas fa-check"></i> Register for Tracking</button>'
          + '<span id="wz-rotation-feedback" style="margin-left:10px;font-size:12px"></span>'
          + '</div></div>'
          + '<div class="card" style="margin-top:16px"><div class="card-header"><h3>Next Steps</h3></div><div class="card-body">'
          + '<ol style="padding-left:20px;line-height:1.8">'
          + '<li>Upload <code>setup-secrets.sh</code> to your Docker host (or use <strong>Remote Deploy</strong> above)</li>'
          + '<li>Run: <code>sudo bash setup-secrets.sh</code></li>'
          + '<li>Complete any MANUAL/UPLOAD steps shown in the output</li>'
          + '<li>Append <code>compose-secrets.yml</code> content to your <code>docker-compose.yml</code></li>'
          + '<li>Add <code>secrets:</code> block to each service that needs the secret</li>'
          + '<li>Run: <code>docker compose up -d</code></li>'
          + '<li>Record deployment in your password manager; rotation reminders will appear in the <strong>Secrets → Rotation Tracker</strong> tab</li>'
          + '</ol></div></div>';
      }

      const footer = '<div style="display:flex;justify-content:space-between;gap:8px;margin-top:16px">'
        + (state.step > 1 ? '<button class="btn btn-secondary" id="wz-back"><i class="fas fa-arrow-left"></i> Back</button>' : '<div></div>')
        + '<div>'
        + (state.step < 4 ? '<button class="btn btn-primary" id="wz-next">Next <i class="fas fa-arrow-right"></i></button>' : '<button class="btn btn-primary" id="wz-close-done">Done</button>')
        + '</div></div>';

      Modal.open('<div class="modal-header"><h3><i class="fas fa-magic" style="margin-right:8px;color:var(--accent)"></i>Secrets Wizard</h3><button class="modal-close-btn" id="wz-close"><i class="fas fa-times"></i></button></div>'
        + '<div class="modal-body" style="max-height:75vh;overflow-y:auto">'
        + '<div style="display:flex;gap:4px;margin-bottom:20px">' + stepBar + '</div>'
        + content
        + footer
        + '</div>', { width: '900px' });

      const mc = Modal._content;
      mc.querySelector('#wz-close')?.addEventListener('click', () => Modal.close());
      mc.querySelector('#wz-close-done')?.addEventListener('click', () => Modal.close());

      mc.querySelector('#wz-back')?.addEventListener('click', () => { state.step--; render(); });

      mc.querySelector('#wz-next')?.addEventListener('click', async () => {
        if (state.step === 1) {
          const envContent = mc.querySelector('#wz-env')?.value?.trim() || '';
          if (!envContent) { Toast.warning('Paste your .env content first'); return; }
          state.envContent = envContent;
          state.appName = mc.querySelector('#wz-appname')?.value?.trim() || 'myapp';
          state.secretDir = mc.querySelector('#wz-secretdir')?.value?.trim() || ('/etc/' + state.appName + '/secrets');
          try {
            state.analysis = await Api.analyzeSecretsWizard(envContent);
            if (state.analysis.secretFiles.length === 0 && state.analysis.todoPlaceholders.length === 0) {
              Toast.warning('No secrets detected — check .env format');
              return;
            }
            state.step++;
            render();
          } catch (err) { Toast.error(err.message); }
        } else if (state.step === 2) {
          state.step++;
          render();
        } else if (state.step === 3) {
          mc.querySelectorAll('.wz-provider-input').forEach(input => {
            const key = input.dataset.key;
            const val = input.value;
            if (val) state.providerValues[key] = val;
          });
          state.step++;
          render();
        }
      });

      mc.querySelector('#wz-download-script')?.addEventListener('click', async () => {
        try {
          const script = await Api.generateSecretsScript({
            appName: state.appName,
            secretDir: state.secretDir,
            secretFiles: state.analysis.secretFiles,
            providerValues: state.providerValues,
          });
          const blob = new Blob([script], { type: 'text/plain' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'setup-secrets.sh';
          a.click();
          Toast.success('Script downloaded');
        } catch (err) { Toast.error(err.message); }
      });

      mc.querySelector('#wz-download-compose')?.addEventListener('click', async () => {
        try {
          const yaml = await Api.generateSecretsCompose({
            appName: state.appName,
            secretDir: state.secretDir,
            secretFiles: state.analysis.secretFiles,
          });
          const blob = new Blob([yaml], { type: 'text/yaml' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'compose-secrets.yml';
          a.click();
          Toast.success('Compose snippet downloaded');
        } catch (err) { Toast.error(err.message); }
      });

      mc.querySelector('#wz-copy-script')?.addEventListener('click', async () => {
        try {
          const script = await Api.generateSecretsScript({
            appName: state.appName,
            secretDir: state.secretDir,
            secretFiles: state.analysis.secretFiles,
            providerValues: state.providerValues,
          });
          await Utils.copyToClipboard(script);
          Toast.success('Script copied to clipboard');
        } catch (err) { Toast.error(err.message); }
      });

      mc.querySelector('#wz-register-rotation')?.addEventListener('click', async () => {
        try {
          const feedback = mc.querySelector('#wz-rotation-feedback');
          const hostId = Number(mc.querySelector('#wz-track-host')?.value || 0);
          const tracked = mc.querySelector('#wz-track-rotation')?.checked;
          if (!tracked) { Toast.warning('Tracking disabled — check the box first'); return; }
          feedback.textContent = 'Checking existing tracked secrets...';
          feedback.style.color = 'var(--text-muted)';

          // FIX #25 — warn if secrets for this app+host are already tracked
          let forceUpdateIntervals = false;
          try {
            const existing = await Api.getSecretRotations();
            const matches = (existing || []).filter(r => r.app_name === state.appName && Number(r.host_id) === hostId);
            if (matches.length > 0) {
              const answer = await new Promise(resolve => {
                const msg = matches.length + ' secret' + (matches.length === 1 ? ' is' : 's are')
                  + ' already tracked for this app. Update display labels (preserve intervals) or force-update intervals too?';
                const dlg = document.createElement('div');
                dlg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center';
                dlg.innerHTML = '<div style="background:var(--surface2,#1e2433);border:1px solid var(--border,#2a3040);border-radius:10px;padding:24px;max-width:420px;width:90%">'
                  + '<h4 style="margin:0 0 12px"><i class="fas fa-exclamation-triangle" style="color:var(--yellow,#ca8a04);margin-right:8px"></i>Already tracked</h4>'
                  + '<p style="margin:0 0 18px;font-size:13px;color:var(--text-muted)">' + msg + '</p>'
                  + '<div style="display:flex;gap:10px;justify-content:flex-end">'
                  + '<button id="wz-dup-cancel" class="btn btn-secondary btn-sm">Cancel</button>'
                  + '<button id="wz-dup-labels" class="btn btn-secondary btn-sm">Labels only</button>'
                  + '<button id="wz-dup-force" class="btn btn-primary btn-sm">Force-update intervals</button>'
                  + '</div></div>';
                document.body.appendChild(dlg);
                dlg.querySelector('#wz-dup-cancel').addEventListener('click', () => { document.body.removeChild(dlg); resolve(null); });
                dlg.querySelector('#wz-dup-labels').addEventListener('click', () => { document.body.removeChild(dlg); resolve(false); });
                dlg.querySelector('#wz-dup-force').addEventListener('click', () => { document.body.removeChild(dlg); resolve(true); });
              });
              if (answer === null) { feedback.textContent = ''; return; } // cancelled
              forceUpdateIntervals = answer;
            }
          } catch (_) { /* non-fatal — proceed without the check */ }

          feedback.textContent = 'Registering...';
          feedback.style.color = 'var(--text-muted)';
          const res = await Api.registerSecretRotations({
            appName: state.appName,
            hostId,
            force_update_intervals: forceUpdateIntervals,
            secrets: state.analysis.secretFiles.map(s => ({
              envKey: s.envKey, secretName: s.secretName, type: s.type,
              label: s.label, action: s.action, rotation_interval_days: s.rotation || 180,
            })),
          });
          feedback.textContent = '✓ Registered ' + res.count + ' secrets';
          feedback.style.color = 'var(--green)';
          Toast.success('Tracking ' + res.count + ' secrets for rotation');
        } catch (err) { Toast.error(err.message); }
      });

      mc.querySelector('#wz-remote-deploy')?.addEventListener('click', async () => {
        try {
          const hostId = Number(mc.querySelector('#wz-remote-host')?.value || 0);
          const useSudo = mc.querySelector('#wz-remote-sudo')?.value === '1';
          if (!hostId) { Toast.warning('Choose a target host first'); return; }
          const logEl = mc.querySelector('#wz-remote-log');
          logEl.style.display = 'block';
          logEl.textContent = '[*] Generating script...\n';
          const script = await Api.generateSecretsScript({
            appName: state.appName, secretDir: state.secretDir,
            secretFiles: state.analysis.secretFiles, providerValues: state.providerValues,
          });
          logEl.textContent += '[*] Uploading + executing on host ' + hostId + (useSudo ? ' (sudo)' : '') + '...\n';
          const res = await Api.deploySecretsRemote({ hostId, appName: state.appName, secretDir: state.secretDir, script, useSudo });
          logEl.textContent += '\n' + (res.output || '') + '\n\n[' + (res.exitCode === 0 ? '✓ SUCCESS' : '✗ FAILED exit=' + res.exitCode) + ']';
          logEl.scrollTop = logEl.scrollHeight;
          (res.exitCode === 0 ? Toast.success : Toast.error)(res.exitCode === 0 ? 'Remote deploy succeeded' : 'Remote deploy failed (exit ' + res.exitCode + ')');
        } catch (err) {
          const logEl = mc.querySelector('#wz-remote-log');
          if (logEl) { logEl.textContent += '\n[ERROR] ' + err.message; logEl.style.color = 'var(--red)'; }
          Toast.error(err.message);
        }
      });
    };

    // Preload hosts list for step 4
    if (!state.hosts) {
      Api.get('/hosts').then(hs => { state.hosts = (hs || []).filter(h => h.connection_type === 'ssh' || h.connectionType === 'ssh'); }).catch(() => { state.hosts = []; });
    }

    render();
  },

  async _renderSecretRotations(el) {
    el.innerHTML = '<div class="text-muted"><i class="fas fa-spinner fa-spin"></i> Loading rotation tracker...</div>';
    try {
      const [rows, summary] = await Promise.all([Api.getSecretRotations(), Api.getSecretRotationsSummary()]);
      if (!rows || rows.length === 0) {
        el.innerHTML = '<div class="empty-msg" style="padding:30px"><i class="fas fa-sync-alt" style="font-size:42px;color:var(--text-muted);margin-bottom:10px"></i>'
          + '<h3>No secrets tracked yet</h3>'
          + '<p class="text-muted">Use the Secrets Wizard to classify your <code>.env</code> and register secrets for rotation reminders.</p></div>';
        return;
      }

      const rowHtml = rows.map(r => {
        const statusColor = r.status === 'overdue' ? 'var(--red)' : r.status === 'due_soon' ? 'var(--yellow)' : 'var(--green)';
        const statusLabel = r.status === 'overdue' ? 'OVERDUE' : r.status === 'due_soon' ? 'DUE SOON' : 'OK';
        const daysTxt = r.daysUntilDue < 0 ? Math.abs(r.daysUntilDue) + ' days ago' : r.daysUntilDue + ' days';
        return '<tr>'
          + '<td><div style="font-weight:600;font-size:12px">' + Utils.escapeHtml(r.app_name || '—') + '</div>'
          + '<div class="text-xs text-muted">host ' + r.host_id + '</div></td>'
          + '<td><code style="font-size:11px">' + Utils.escapeHtml(r.env_key) + '</code><div class="text-xs text-muted">' + Utils.escapeHtml(r.label) + '</div></td>'
          + '<td class="text-sm">' + Utils.escapeHtml(r.secret_name) + '</td>'
          + '<td><span class="badge" style="background:' + statusColor + '22;color:' + statusColor + ';font-size:10px">' + statusLabel + '</span></td>'
          + '<td class="text-sm">' + daysTxt + '</td>'
          + '<td class="text-sm text-muted">' + (r.last_rotated_at || '—').replace('T', ' ').substring(0, 16) + '</td>'
          + '<td class="text-sm">' + r.rotation_interval_days + 'd</td>'
          + '<td>'
          + '<button class="btn btn-xs btn-success mark-rotated-btn" data-id="' + r.id + '" title="Mark Rotated"><i class="fas fa-check"></i></button> '
          + '<button class="btn btn-xs btn-secondary edit-rotation-btn" data-id="' + r.id + '" title="Edit interval"><i class="fas fa-cog"></i></button> '
          + '<button class="btn btn-xs btn-danger delete-rotation-btn" data-id="' + r.id + '" title="Untrack"><i class="fas fa-trash"></i></button>'
          + '</td></tr>';
      }).join('');

      el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:16px">'
        + '<div class="card" style="padding:14px;text-align:center"><div style="font-size:28px;font-weight:700">' + summary.total + '</div><div class="text-sm text-muted">Total Tracked</div></div>'
        + '<div class="card" style="padding:14px;text-align:center"><div style="font-size:28px;font-weight:700;color:var(--green)">' + summary.ok + '</div><div class="text-sm text-muted">OK</div></div>'
        + '<div class="card" style="padding:14px;text-align:center"><div style="font-size:28px;font-weight:700;color:var(--yellow)">' + summary.due_soon + '</div><div class="text-sm text-muted">Due Soon (≤14d)</div></div>'
        + '<div class="card" style="padding:14px;text-align:center"><div style="font-size:28px;font-weight:700;color:var(--red)">' + summary.overdue + '</div><div class="text-sm text-muted">Overdue</div></div>'
        + '</div>'
        + '<div class="card"><div class="card-header"><h3><i class="fas fa-sync-alt" style="margin-right:6px;color:var(--accent)"></i>Tracked Secrets</h3></div>'
        + '<div class="card-body" style="padding:0;overflow-x:auto">'
        + '<table class="data-table compact"><thead><tr><th>App</th><th>Env Key</th><th>Secret</th><th>Status</th><th>Next Due</th><th>Last Rotated</th><th>Interval</th><th>Actions</th></tr></thead>'
        + '<tbody>' + rowHtml + '</tbody></table></div></div>';

      el.querySelectorAll('.mark-rotated-btn').forEach(btn => btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const notes = prompt('Notes for this rotation (optional)?', '');
        if (notes === null) return;
        try {
          await Api.markSecretRotated(id, notes);
          Toast.success('Marked rotated');
          this._renderSecretRotations(el);
        } catch (err) { Toast.error(err.message); }
      }));
      el.querySelectorAll('.edit-rotation-btn').forEach(btn => btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const days = prompt('New rotation interval (days)?', '180');
        if (!days) return;
        try {
          await Api.updateSecretRotation(id, { rotation_interval_days: parseInt(days, 10) });
          Toast.success('Interval updated');
          this._renderSecretRotations(el);
        } catch (err) { Toast.error(err.message); }
      }));
      el.querySelectorAll('.delete-rotation-btn').forEach(btn => btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        if (!confirm('Stop tracking this secret?')) return;
        try {
          await Api.deleteSecretRotation(id);
          Toast.success('Untracked');
          this._renderSecretRotations(el);
        } catch (err) { Toast.error(err.message); }
      }));
    } catch (err) {
      el.innerHTML = '<div class="empty-msg is-error">Error: ' + err.message + '</div>';
    }
  },

  async _renderCertificates(el) {
    el.innerHTML = '<div class="text-muted"><i class="fas fa-spinner fa-spin"></i> Loading certificates...</div>';
    try {
      const certs = await Api.getTrackedCertificates();

      const headerActions = '<div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">'
        + '<button class="btn btn-primary" id="cert-le-btn" style="background:linear-gradient(135deg,#3a8fb7,#1a5478);border:none"><i class="fas fa-magic"></i> Request Let\'s Encrypt</button>'
        + '<button class="btn btn-secondary" id="cert-add-btn"><i class="fas fa-plus"></i> Track Certificate</button>'
        + '<button class="btn btn-secondary" id="cert-csr-btn"><i class="fas fa-file-signature"></i> Generate CSR</button>'
        + '</div>';

      const summary = certs.reduce((acc, c) => { acc[c.status] = (acc[c.status] || 0) + 1; return acc; },
        { ok: 0, warning: 0, critical: 0, expired: 0, unknown: 0 });
      const summaryCards = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:16px">'
        + '<div class="card" style="padding:14px;text-align:center"><div style="font-size:28px;font-weight:700">' + certs.length + '</div><div class="text-sm text-muted">Total Certs</div></div>'
        + '<div class="card" style="padding:14px;text-align:center"><div style="font-size:28px;font-weight:700;color:var(--green)">' + summary.ok + '</div><div class="text-sm text-muted">Healthy</div></div>'
        + '<div class="card" style="padding:14px;text-align:center"><div style="font-size:28px;font-weight:700;color:var(--yellow)">' + summary.warning + '</div><div class="text-sm text-muted">≤30 days</div></div>'
        + '<div class="card" style="padding:14px;text-align:center"><div style="font-size:28px;font-weight:700;color:var(--red)">' + (summary.critical + summary.expired) + '</div><div class="text-sm text-muted">≤7 days / Expired</div></div>'
        + '</div>';

      let body;
      if (certs.length === 0) {
        body = '<div class="empty-msg" style="padding:30px"><i class="fas fa-certificate" style="font-size:42px;color:var(--text-muted);margin-bottom:10px"></i>'
          + '<h3>No certificates tracked yet</h3>'
          + '<p class="text-muted">Add a PEM-encoded certificate to monitor expiry, or generate a CSR for a new cert request.</p></div>';
      } else {
        const colorMap = { ok: 'var(--green)', warning: 'var(--yellow)', critical: 'var(--red)', expired: 'var(--red)', unknown: 'var(--text-dim)' };
        const labelMap = { ok: 'OK', warning: 'WARN', critical: 'CRIT', expired: 'EXPIRED', unknown: '?' };
        body = '<div class="card"><div class="card-header"><h3><i class="fas fa-certificate" style="margin-right:6px;color:var(--accent)"></i>Tracked Certificates</h3></div>'
          + '<div class="card-body" style="padding:0;overflow-x:auto">'
          + '<table class="data-table compact"><thead><tr><th>Name</th><th>Subject / SANs</th><th>Issuer</th><th>Status</th><th>Expires</th><th>Days</th><th>Fingerprint (SHA-256)</th><th>Actions</th></tr></thead><tbody>'
          + certs.map(c => {
              const color = colorMap[c.status] || 'var(--text-dim)';
              const days = c.daysUntilExpiry == null ? '—' : (c.daysUntilExpiry < 0 ? Math.abs(c.daysUntilExpiry) + 'd ago' : c.daysUntilExpiry + 'd');
              const fp = (c.fingerprint_sha256 || '').replace(/^SHA256\s+/i, '').slice(0, 32) + '…';
              return '<tr>'
                + '<td><div style="font-weight:600">' + Utils.escapeHtml(c.name) + '</div>'
                + (c.self_signed ? '<div class="text-xs text-muted">self-signed</div>' : '')
                + '</td>'
                + '<td class="text-sm"><div style="max-width:280px;word-break:break-all">' + Utils.escapeHtml(c.subject || '—') + '</div>'
                + (c.sans ? '<div class="text-xs text-muted" style="max-width:280px;word-break:break-all">' + Utils.escapeHtml(c.sans) + '</div>' : '')
                + '</td>'
                + '<td class="text-sm" style="max-width:200px;overflow:hidden;text-overflow:ellipsis">' + Utils.escapeHtml(c.issuer || '—') + '</td>'
                + '<td><span class="badge" style="background:' + color + '22;color:' + color + ';font-size:10px">' + (labelMap[c.status] || c.status) + '</span></td>'
                + '<td class="text-sm">' + (c.not_after ? c.not_after.substring(0, 10) : '—') + '</td>'
                + '<td class="text-sm">' + days + '</td>'
                + '<td class="mono text-xs" style="max-width:180px;overflow:hidden;text-overflow:ellipsis" title="' + Utils.escapeHtml(c.fingerprint_sha256 || '') + '">' + Utils.escapeHtml(fp) + '</td>'
                + '<td>'
                + '<button class="btn btn-xs btn-secondary cert-refresh-btn" data-id="' + c.id + '" title="Re-parse"><i class="fas fa-sync"></i></button> '
                + '<button class="btn btn-xs btn-danger cert-delete-btn" data-id="' + c.id + '" title="Untrack"><i class="fas fa-trash"></i></button>'
                + '</td></tr>';
            }).join('')
          + '</tbody></table></div></div>';
      }

      // Render saved DNS credentials section (best-effort — silently empty on error)
      let credsSection = '';
      try {
        const credsRes = await Api.acmeListCredentials();
        const creds = (credsRes && credsRes.credentials) || [];
        if (creds.length > 0) {
          credsSection = '<div class="card" style="margin-top:16px"><div class="card-header"><h3><i class="fas fa-key" style="margin-right:6px;color:var(--accent)"></i>Saved DNS Credentials (' + creds.length + ')</h3></div>'
            + '<div class="card-body" style="padding:0;overflow-x:auto">'
            + '<table class="data-table compact"><thead><tr><th>Name</th><th>Provider</th><th>Last Validated</th><th>Status</th><th>Actions</th></tr></thead><tbody>'
            + creds.map(c => {
                const status = c.lastValidationStatus;
                const statusBadge = status === 'ok'
                  ? '<span class="badge" style="background:var(--green)22;color:var(--green);font-size:10px">OK</span>'
                  : status === 'failed'
                    ? '<span class="badge" style="background:var(--red)22;color:var(--red);font-size:10px" title="' + Utils.escapeHtml(c.lastValidationMessage || '') + '">FAILED</span>'
                    : '<span class="badge" style="background:var(--text-dim)22;color:var(--text-dim);font-size:10px">UNVERIFIED</span>';
                const lastVal = c.lastValidatedAt ? c.lastValidatedAt.replace('T', ' ').substring(0, 16) : '—';
                return '<tr>'
                  + '<td><strong>' + Utils.escapeHtml(c.name) + '</strong></td>'
                  + '<td class="text-sm">' + Utils.escapeHtml(c.providerId) + '</td>'
                  + '<td class="text-sm text-muted">' + lastVal + '</td>'
                  + '<td>' + statusBadge + '</td>'
                  + '<td>'
                  + '<button class="btn btn-xs btn-secondary acme-cred-validate-btn" data-id="' + c.id + '" title="Re-validate"><i class="fas fa-check-circle"></i></button> '
                  + '<button class="btn btn-xs btn-secondary acme-cred-rotate-btn" data-id="' + c.id + '" data-name="' + Utils.escapeHtml(c.name) + '" data-provider="' + Utils.escapeHtml(c.providerId) + '" title="Rotate credential value"><i class="fas fa-sync"></i></button> '
                  + '<button class="btn btn-xs btn-danger acme-cred-delete-btn" data-id="' + c.id + '" data-name="' + Utils.escapeHtml(c.name) + '" title="Delete"><i class="fas fa-trash"></i></button>'
                  + '</td></tr>';
              }).join('')
            + '</tbody></table></div></div>';
        }
      } catch { /* ACME endpoints may not be reachable — silently skip */ }

      // Render ACME-managed certs section
      let managedSection = '';
      try {
        const managedRes = await Api.acmeListManagedCerts();
        const managed = (managedRes && managedRes.certs) || [];
        if (managed.length > 0) {
          managedSection = '<div class="card" style="margin-top:16px"><div class="card-header"><h3><i class="fas fa-rocket" style="margin-right:6px;color:var(--accent)"></i>Let\'s Encrypt Managed Certificates (' + managed.length + ')</h3></div>'
            + '<div class="card-body" style="padding:0;overflow-x:auto">'
            + '<table class="data-table compact"><thead><tr><th>Domain(s)</th><th>Challenge</th><th>Provider</th><th>Credential</th><th>Env</th><th>Actions</th></tr></thead><tbody>'
            + managed.map(c => {
                const envBadge = c.staging
                  ? '<span class="badge" style="background:var(--yellow)22;color:var(--yellow);font-size:10px">STAGING</span>'
                  : '<span class="badge" style="background:var(--green)22;color:var(--green);font-size:10px">PROD</span>';
                return '<tr>'
                  + '<td class="mono text-sm" style="max-width:280px;word-break:break-all">' + Utils.escapeHtml(c.domain) + '</td>'
                  + '<td class="text-sm">' + Utils.escapeHtml(c.challengeType) + '</td>'
                  + '<td class="text-sm">' + (c.providerId ? Utils.escapeHtml(c.providerId) : '—') + '</td>'
                  + '<td class="text-sm">' + (c.credentialName ? Utils.escapeHtml(c.credentialName) : '—') + '</td>'
                  + '<td>' + envBadge + '</td>'
                  + '<td><button class="btn btn-xs btn-danger acme-cert-remove-btn" data-domain="' + Utils.escapeHtml(c.domain) + '" title="Remove"><i class="fas fa-trash"></i></button></td>'
                  + '</tr>';
              }).join('')
            + '</tbody></table></div></div>';
        }
      } catch { /* skip */ }

      el.innerHTML = headerActions + summaryCards + body + managedSection + credsSection;

      el.querySelector('#cert-le-btn')?.addEventListener('click', () => this._showLetsEncryptWizard(el));
      el.querySelector('#cert-add-btn')?.addEventListener('click', () => this._showAddCertificateModal(el));
      el.querySelector('#cert-csr-btn')?.addEventListener('click', () => this._showCsrModal());
      el.querySelectorAll('.cert-refresh-btn').forEach(btn => btn.addEventListener('click', async () => {
        try { await Api.refreshCertificate(btn.dataset.id); Toast.success('Refreshed'); this._renderCertificates(el); }
        catch (err) { Toast.error(err.message); }
      }));
      el.querySelectorAll('.cert-delete-btn').forEach(btn => btn.addEventListener('click', async () => {
        if (!confirm('Stop tracking this certificate?')) return;
        try { await Api.deleteTrackedCertificate(btn.dataset.id); Toast.success('Untracked'); this._renderCertificates(el); }
        catch (err) { Toast.error(err.message); }
      }));
      el.querySelectorAll('.acme-cred-validate-btn').forEach(btn => btn.addEventListener('click', async () => {
        try {
          const r = await Api.acmeValidateCredential(btn.dataset.id);
          (r.ok ? Toast.success : Toast.error)(r.message);
          this._renderCertificates(el);
        } catch (err) { Toast.error(err.message); }
      }));
      el.querySelectorAll('.acme-cred-rotate-btn').forEach(btn => btn.addEventListener('click', () => {
        this._showAcmeRotateModal({
          id: btn.dataset.id, name: btn.dataset.name, providerId: btn.dataset.provider, parentEl: el,
        });
      }));
      el.querySelectorAll('.acme-cred-delete-btn').forEach(btn => btn.addEventListener('click', async () => {
        if (!confirm('Delete credential "' + btn.dataset.name + '"?')) return;
        try { await Api.acmeDeleteCredential(btn.dataset.id); Toast.success('Deleted'); this._renderCertificates(el); }
        catch (err) { Toast.error(err.message); }
      }));
      el.querySelectorAll('.acme-cert-remove-btn').forEach(btn => btn.addEventListener('click', async () => {
        if (!confirm('Remove ACME certificate for "' + btn.dataset.domain + '"? This will remove the Caddy config block (cert files on disk are NOT deleted).')) return;
        try { await Api.acmeRemoveCert(btn.dataset.domain); Toast.success('Removed'); this._renderCertificates(el); }
        catch (err) { Toast.error(err.message); }
      }));
    } catch (err) {
      el.innerHTML = '<div class="empty-msg is-error">Error: ' + err.message + '</div>';
    }
  },

  _showAddCertificateModal(parentEl) {
    Modal.open('<div class="modal-header"><h3><i class="fas fa-plus" style="margin-right:6px"></i>Track Certificate</h3><button class="modal-close-btn" id="cert-add-close"><i class="fas fa-times"></i></button></div>'
      + '<div class="modal-body">'
      + '<div class="form-group"><label>Name</label><input id="cert-add-name" class="form-control" placeholder="e.g. api.example.com"></div>'
      + '<div class="form-group"><label>Source path on container (optional)</label><input id="cert-add-path" class="form-control" placeholder="/etc/letsencrypt/live/example/fullchain.pem"></div>'
      + '<div class="form-group"><label>Or paste PEM content</label><textarea id="cert-add-pem" class="form-control" rows="10" placeholder="-----BEGIN CERTIFICATE-----&#10;..." style="font-family:var(--mono);font-size:11px"></textarea></div>'
      + '<div class="form-group"><label>Notes</label><input id="cert-add-notes" class="form-control" placeholder="Optional notes"></div>'
      + '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:8px"><button class="btn btn-secondary" id="cert-add-cancel">Cancel</button><button class="btn btn-primary" id="cert-add-save"><i class="fas fa-save"></i> Track</button></div>'
      + '</div>', { width: '720px' });
    const mc = Modal._content;
    const close = () => Modal.close();
    mc.querySelector('#cert-add-close')?.addEventListener('click', close);
    mc.querySelector('#cert-add-cancel')?.addEventListener('click', close);
    mc.querySelector('#cert-add-save')?.addEventListener('click', async () => {
      const name = mc.querySelector('#cert-add-name').value.trim();
      const sourcePath = mc.querySelector('#cert-add-path').value.trim();
      const pemContent = mc.querySelector('#cert-add-pem').value.trim();
      const notes = mc.querySelector('#cert-add-notes').value.trim();
      if (!name) { Toast.warning('Name required'); return; }
      if (!sourcePath && !pemContent) { Toast.warning('Provide a path or paste PEM content'); return; }
      try {
        await Api.addTrackedCertificate({ name, sourcePath, pemContent, notes });
        Toast.success('Certificate tracked');
        close();
        this._renderCertificates(parentEl);
      } catch (err) { Toast.error(err.message); }
    });
  },

  _showCsrModal() {
    Modal.open('<div class="modal-header"><h3><i class="fas fa-file-signature" style="margin-right:6px"></i>Generate CSR</h3><button class="modal-close-btn" id="csr-close"><i class="fas fa-times"></i></button></div>'
      + '<div class="modal-body">'
      + '<div class="form-row">'
      + '<div class="form-group" style="flex:2"><label>Common Name (CN) *</label><input id="csr-cn" class="form-control" placeholder="api.example.com"></div>'
      + '<div class="form-group" style="flex:1"><label>Key Type</label><select id="csr-key" class="form-control"><option value="rsa">RSA 4096</option><option value="ec">EC P-256</option></select></div>'
      + '</div>'
      + '<div class="form-group"><label>Subject Alternative Names (comma-separated DNS / IPs)</label><input id="csr-sans" class="form-control" placeholder="api.example.com, www.api.example.com, 10.0.0.1"></div>'
      + '<div class="form-row">'
      + '<div class="form-group" style="flex:1"><label>Organization (O)</label><input id="csr-o" class="form-control"></div>'
      + '<div class="form-group" style="flex:1"><label>Org Unit (OU)</label><input id="csr-ou" class="form-control"></div>'
      + '</div>'
      + '<div class="form-row">'
      + '<div class="form-group" style="flex:1"><label>Country (C)</label><input id="csr-c" class="form-control" value="US" maxlength="2"></div>'
      + '<div class="form-group" style="flex:1"><label>State (ST)</label><input id="csr-st" class="form-control"></div>'
      + '<div class="form-group" style="flex:1"><label>Locality (L)</label><input id="csr-l" class="form-control"></div>'
      + '</div>'
      + '<div class="form-group"><label>Email</label><input id="csr-email" class="form-control" placeholder="admin@example.com"></div>'
      + '<button class="btn btn-primary" id="csr-generate"><i class="fas fa-cog"></i> Generate</button>'
      + '<div id="csr-result" style="margin-top:14px;display:none">'
      + '<div class="form-group"><label>Private Key (KEEP SECRET — store securely!)</label><textarea id="csr-key-out" class="form-control" rows="6" readonly style="font-family:var(--mono);font-size:11px"></textarea></div>'
      + '<div class="form-group"><label>CSR (submit to your CA)</label><textarea id="csr-out" class="form-control" rows="6" readonly style="font-family:var(--mono);font-size:11px"></textarea></div>'
      + '<div style="display:flex;gap:8px"><button class="btn btn-sm btn-secondary" id="csr-download-key"><i class="fas fa-download"></i> Download .key</button><button class="btn btn-sm btn-secondary" id="csr-download-csr"><i class="fas fa-download"></i> Download .csr</button></div>'
      + '</div>'
      + '</div>', { width: '780px' });

    const mc = Modal._content;
    mc.querySelector('#csr-close')?.addEventListener('click', () => Modal.close());
    mc.querySelector('#csr-generate')?.addEventListener('click', async () => {
      const data = {
        commonName: mc.querySelector('#csr-cn').value.trim(),
        organization: mc.querySelector('#csr-o').value.trim(),
        organizationalUnit: mc.querySelector('#csr-ou').value.trim(),
        country: mc.querySelector('#csr-c').value.trim() || 'US',
        state: mc.querySelector('#csr-st').value.trim(),
        locality: mc.querySelector('#csr-l').value.trim(),
        emailAddress: mc.querySelector('#csr-email').value.trim(),
        sans: mc.querySelector('#csr-sans').value.trim(),
        keyType: mc.querySelector('#csr-key').value,
      };
      if (!data.commonName) { Toast.warning('Common Name required'); return; }
      try {
        const res = await Api.generateCSR(data);
        mc.querySelector('#csr-result').style.display = 'block';
        mc.querySelector('#csr-key-out').value = res.privateKey;
        mc.querySelector('#csr-out').value = res.csr;
        Toast.success('CSR generated');

        const dl = (filename, content) => {
          const blob = new Blob([content], { type: 'text/plain' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob); a.download = filename; a.click();
        };
        mc.querySelector('#csr-download-key').onclick = () => dl(data.commonName + '.key', res.privateKey);
        mc.querySelector('#csr-download-csr').onclick = () => dl(data.commonName + '.csr', res.csr);
      } catch (err) { Toast.error(err.message); }
    });
  },

  // ─── ACME credential rotation modal (v6.6.1) ─────────
  _showAcmeRotateModal({ id, name, providerId, parentEl }) {
    Api.acmeListProviders().then(r => {
      const provider = (r.providers || []).find(p => p.id === providerId);
      if (!provider) { Toast.error('Unknown provider: ' + providerId); return; }

      const fieldsHtml = provider.fields.map(f =>
        '<div class="form-group"><label>' + Utils.escapeHtml(f.label) + (f.required ? ' <span style="color:var(--red)">*</span>' : '') + '</label>'
        + '<input id="rot-field-' + Utils.escapeHtml(f.key) + '" class="form-control" type="' + f.type + '" data-field="' + Utils.escapeHtml(f.key) + '" placeholder="' + Utils.escapeHtml(f.placeholder || '') + '" style="font-family:var(--mono);font-size:12px">'
        + (f.helpText ? '<div class="text-xs text-muted" style="margin-top:4px">' + Utils.escapeHtml(f.helpText) + '</div>' : '')
        + '</div>'
      ).join('');

      Modal.open('<div class="modal-header"><h3><i class="fas fa-sync" style="margin-right:6px"></i>Rotate Credential — <span class="text-muted text-sm">' + Utils.escapeHtml(name) + '</span></h3><button class="modal-close-btn" id="rot-close"><i class="fas fa-times"></i></button></div>'
        + '<div class="modal-body">'
        + '<div style="padding:10px 12px;background:var(--accent-dim);border-left:3px solid var(--accent);border-radius:4px;margin-bottom:12px;font-size:12px">'
        + '<i class="fas fa-info-circle"></i> Enter the NEW credential values below. Caddy reads credentials per-request, so <strong>zero downtime</strong> — no reload needed. Old value is replaced atomically.'
        + '</div>'
        + fieldsHtml
        + '<div class="form-group"><label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" id="rot-validate" checked> Validate new credential against provider API before saving</label></div>'
        + '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px"><button class="btn btn-secondary" id="rot-cancel">Cancel</button><button class="btn btn-primary" id="rot-save"><i class="fas fa-check"></i> Rotate</button></div>'
        + '</div>', { width: '560px' });

      const mc = Modal._content;
      mc.querySelector('#rot-close')?.addEventListener('click', () => Modal.close());
      mc.querySelector('#rot-cancel')?.addEventListener('click', () => Modal.close());
      mc.querySelector('#rot-save')?.addEventListener('click', async () => {
        const credentials = {};
        for (const f of provider.fields) {
          const val = mc.querySelector('#rot-field-' + f.key)?.value?.trim() || '';
          if (f.required && !val) { Toast.warning(f.label + ' required'); return; }
          if (val) credentials[f.key] = val;
        }
        try {
          await Api.acmeRotateCredential(id, credentials);
          if (mc.querySelector('#rot-validate')?.checked) {
            const validation = await Api.acmeValidateCredential(id);
            (validation.ok ? Toast.success : Toast.error)('Rotated — validation: ' + validation.message);
          } else {
            Toast.success('Credential rotated (zero downtime)');
          }
          Modal.close();
          this._renderCertificates(parentEl);
        } catch (err) { Toast.error(err.message); }
      });
    }).catch(err => Toast.error('Cannot load provider: ' + err.message));
  },

  // ─── Let's Encrypt Wizard (v6.5) ────────────────────────────
  _showLetsEncryptWizard(parentEl) {
    const state = {
      step: 1,
      // Step 1
      domains: [],
      email: '',
      challengeType: 'http-01',
      staging: true,
      // Step 2
      providers: [],
      providerId: null,
      providerSpec: null,
      credentialMode: 'new', // 'new' | 'existing'
      existingCredentials: [],
      existingCredentialId: null,
      newCredentialFields: {}, // {api_token: '...', etc.}
      saveCredentialAs: '',
      validateBeforeIssue: true,
      // Step 3
      jobId: null,
      jobStatus: null,
      jobOutput: '',
      pollTimer: null,
    };

    const cleanup = () => {
      if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; }
    };

    const stepBar = () => {
      const labels = ['Domain & Challenge', 'Provider Credentials', 'Issue Certificate'];
      return '<div style="display:flex;gap:4px;margin-bottom:18px">' + labels.map((label, i) => {
        const num = i + 1;
        const active = num === state.step;
        const done = num < state.step;
        const color = done ? 'var(--green)' : active ? 'var(--accent)' : 'var(--surface3)';
        const textColor = active ? 'var(--text-bright)' : done ? 'var(--text)' : 'var(--text-dim)';
        return '<div style="flex:1;display:flex;align-items:center;gap:6px">'
          + '<span style="width:26px;height:26px;border-radius:50%;background:' + color + ';color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:600">' + (done ? '✓' : num) + '</span>'
          + '<span style="font-size:12px;color:' + textColor + ';font-weight:' + (active ? '700' : '500') + '">' + label + '</span>'
          + (num < labels.length ? '<span style="flex:1;height:1px;background:var(--border);margin:0 4px"></span>' : '')
          + '</div>';
      }).join('') + '</div>';
    };

    const renderStep1 = () => {
      return '<div class="form-group"><label>Domains <span class="text-muted text-sm">(comma-separated; wildcards <code>*.example.com</code> require DNS-01)</span></label>'
        + '<input id="le-domains" class="form-control" value="' + Utils.escapeHtml(state.domains.join(', ')) + '" placeholder="api.example.com, www.example.com" style="font-family:var(--mono);font-size:12px"></div>'
        + '<div class="form-group"><label>Email for ACME notifications</label>'
        + '<input id="le-email" class="form-control" type="email" value="' + Utils.escapeHtml(state.email) + '" placeholder="admin@example.com"></div>'
        + '<div class="form-group"><label>Challenge type</label>'
        + '<div style="display:flex;gap:14px;margin-top:6px">'
        + '<label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="radio" name="le-challenge" value="http-01"' + (state.challengeType === 'http-01' ? ' checked' : '') + '> <span><strong>HTTP-01</strong> <span class="text-sm text-muted">— port 80 must be reachable from internet</span></span></label>'
        + '<label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="radio" name="le-challenge" value="dns-01"' + (state.challengeType === 'dns-01' ? ' checked' : '') + '> <span><strong>DNS-01</strong> <span class="text-sm text-muted">— DNS provider API; required for wildcards</span></span></label>'
        + '</div></div>'
        + '<div class="form-group"><label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" id="le-staging"' + (state.staging ? ' checked' : '') + '> <span><strong>Use Let\'s Encrypt staging</strong> <span class="text-sm text-muted">(recommended for first issuance — protects from rate limits, but cert won\'t be browser-trusted)</span></span></label></div>';
    };

    const renderStep2 = () => {
      if (state.challengeType === 'http-01') {
        return '<div class="empty-msg"><i class="fas fa-info-circle" style="font-size:32px;color:var(--accent)"></i>'
          + '<p>HTTP-01 challenge selected — no DNS provider configuration needed.</p>'
          + '<p class="text-muted text-sm">Make sure port 80 on this host is reachable from the public internet so Let\'s Encrypt can verify domain ownership. Click Next to issue.</p></div>';
      }

      let html = '';
      // Mode toggle
      html += '<div class="form-group"><label>Credential source</label>'
        + '<div style="display:flex;gap:14px;margin-top:6px">'
        + '<label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="radio" name="le-cred-mode" value="new"' + (state.credentialMode === 'new' ? ' checked' : '') + '> Create new</label>'
        + '<label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="radio" name="le-cred-mode" value="existing"' + (state.credentialMode === 'existing' ? ' checked' : '') + '> Use saved credential</label>'
        + '</div></div>';

      if (state.credentialMode === 'existing') {
        const filtered = state.existingCredentials.filter(c => !state.providerId || c.providerId === state.providerId);
        if (filtered.length === 0) {
          html += '<div class="empty-msg text-sm"><i class="fas fa-key" style="color:var(--text-dim)"></i><p>No saved credentials yet. Switch to "Create new" or save one first.</p></div>';
        } else {
          html += '<div class="form-group"><label>Saved credential</label>'
            + '<select id="le-existing-cred" class="form-control"><option value="">— select —</option>'
            + filtered.map(c => '<option value="' + c.id + '"' + (state.existingCredentialId === c.id ? ' selected' : '') + '>' + Utils.escapeHtml(c.name) + ' (' + Utils.escapeHtml(c.providerId) + ')</option>').join('')
            + '</select></div>';
        }
      } else {
        // Provider picker
        html += '<div class="form-group"><label>DNS Provider</label>'
          + '<select id="le-provider" class="form-control"><option value="">— select —</option>'
          + state.providers.map(p => '<option value="' + p.id + '"' + (state.providerId === p.id ? ' selected' : '') + '>' + Utils.escapeHtml(p.name) + '</option>').join('')
          + '</select></div>';

        if (state.providerSpec) {
          html += '<div style="padding:10px 12px;background:var(--accent-dim);border-left:3px solid var(--accent);border-radius:4px;margin-bottom:12px;font-size:12px">'
            + '<strong>📖 Get the API token:</strong> <a href="' + Utils.escapeHtml(state.providerSpec.docsUrl) + '" target="_blank" rel="noopener">' + Utils.escapeHtml(state.providerSpec.docsUrl) + '</a>'
            + '<br><strong style="color:var(--red)">⚠ Use a SCOPED token, NOT a Global API Key</strong> — Docker Dash will reject formats that look like global keys.'
            + '</div>';

          for (const f of state.providerSpec.fields) {
            const val = state.newCredentialFields[f.key] || '';
            html += '<div class="form-group"><label>' + Utils.escapeHtml(f.label) + (f.required ? ' <span style="color:var(--red)">*</span>' : '') + '</label>'
              + '<input id="le-field-' + Utils.escapeHtml(f.key) + '" class="form-control" type="' + f.type + '" data-field="' + Utils.escapeHtml(f.key) + '" value="' + Utils.escapeHtml(val) + '" placeholder="' + Utils.escapeHtml(f.placeholder || '') + '" style="font-family:var(--mono);font-size:12px">'
              + (f.helpText ? '<div class="text-xs text-muted" style="margin-top:4px">' + Utils.escapeHtml(f.helpText) + '</div>' : '')
              + '</div>';
          }

          html += '<div class="form-group"><label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" id="le-save-cred"' + (state.saveCredentialAs ? ' checked' : '') + '> Save this credential for reuse</label>'
            + '<input id="le-save-cred-name" class="form-control" placeholder="e.g. cloudflare-prod" value="' + Utils.escapeHtml(state.saveCredentialAs) + '" style="margin-top:6px;display:' + (state.saveCredentialAs ? 'block' : 'none') + '"></div>'
            + '<div class="form-group"><label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" id="le-validate"' + (state.validateBeforeIssue ? ' checked' : '') + '> Validate credential against provider API before issuing</label></div>';
        }
      }
      return html;
    };

    const renderStep3 = () => {
      if (state.jobId == null) {
        // Confirmation summary
        let credLine;
        if (state.challengeType === 'http-01') credLine = 'HTTP-01 challenge (no credential needed)';
        else if (state.credentialMode === 'existing') {
          const c = state.existingCredentials.find(c => c.id === state.existingCredentialId);
          credLine = 'Existing: ' + (c ? c.name + ' (' + c.providerId + ')' : '—');
        } else {
          credLine = 'New ' + (state.providerSpec?.name || state.providerId) + ' credential' + (state.saveCredentialAs ? ' (saved as "' + state.saveCredentialAs + '")' : '');
        }

        return '<div class="card" style="border-left:4px solid var(--accent)"><div class="card-body">'
          + '<h4 style="margin:0 0 12px"><i class="fas fa-clipboard-check" style="margin-right:6px"></i>Ready to issue</h4>'
          + '<table style="width:100%;font-size:13px">'
          + '<tr><td style="padding:4px 0;color:var(--text-dim);width:140px">Domains</td><td style="font-family:var(--mono)">' + state.domains.map(Utils.escapeHtml).join(', ') + '</td></tr>'
          + '<tr><td style="padding:4px 0;color:var(--text-dim)">Email</td><td>' + Utils.escapeHtml(state.email) + '</td></tr>'
          + '<tr><td style="padding:4px 0;color:var(--text-dim)">Challenge</td><td>' + state.challengeType + '</td></tr>'
          + '<tr><td style="padding:4px 0;color:var(--text-dim)">Credential</td><td>' + Utils.escapeHtml(credLine) + '</td></tr>'
          + '<tr><td style="padding:4px 0;color:var(--text-dim)">Environment</td><td>' + (state.staging ? '<span style="color:var(--yellow)">⚠ STAGING (not browser-trusted)</span>' : '<span style="color:var(--green)">PRODUCTION</span>') + '</td></tr>'
          + '</table>'
          + '<p class="text-sm text-muted" style="margin-top:12px;margin-bottom:0">Issuance can take 30s–5min depending on DNS propagation. The wizard will poll job status.</p>'
          + '</div></div>';
      }

      // Job in progress
      const statusColor = state.jobStatus === 'success' ? 'var(--green)' : state.jobStatus === 'failed' ? 'var(--red)' : 'var(--accent)';
      const statusIcon = state.jobStatus === 'success' ? 'check-circle' : state.jobStatus === 'failed' ? 'times-circle' : 'spinner fa-spin';
      return '<div style="text-align:center;padding:14px">'
        + '<i class="fas fa-' + statusIcon + '" style="font-size:42px;color:' + statusColor + ';margin-bottom:10px"></i>'
        + '<h3 style="margin:0 0 6px">Job #' + state.jobId + ' — ' + (state.jobStatus || 'pending') + '</h3>'
        + '<p class="text-sm text-muted">Polling every 3 seconds…</p></div>'
        + (state.jobOutput
          ? '<div style="background:#111;color:#eee;padding:10px;border-radius:4px;font-family:var(--mono);font-size:11px;max-height:240px;overflow:auto;white-space:pre-wrap">' + Utils.escapeHtml(state.jobOutput) + '</div>'
          : '');
    };

    const render = async () => {
      let body;
      if (state.step === 1) body = renderStep1();
      else if (state.step === 2) body = renderStep2();
      else body = renderStep3();

      const footer = '<div style="display:flex;justify-content:space-between;gap:8px;margin-top:18px">'
        + (state.step > 1 && state.jobId == null ? '<button class="btn btn-secondary" id="le-back"><i class="fas fa-arrow-left"></i> Back</button>' : '<div></div>')
        + '<div>'
        + (state.step < 3 ? '<button class="btn btn-primary" id="le-next">Next <i class="fas fa-arrow-right"></i></button>' : (state.jobId == null ? '<button class="btn btn-primary" id="le-issue"><i class="fas fa-magic"></i> Issue Certificate</button>' : '<button class="btn btn-primary" id="le-done">Close</button>'))
        + '</div></div>';

      Modal.open('<div class="modal-header"><h3><i class="fas fa-magic" style="margin-right:6px;color:var(--accent)"></i>Request Let\'s Encrypt Certificate</h3><button class="modal-close-btn" id="le-close"><i class="fas fa-times"></i></button></div>'
        + '<div class="modal-body" style="max-height:75vh;overflow-y:auto">'
        + stepBar()
        + body
        + footer
        + '</div>', { width: '760px', onClose: cleanup });

      const mc = Modal._content;
      mc.querySelector('#le-close')?.addEventListener('click', () => { cleanup(); Modal.close(); });
      mc.querySelector('#le-done')?.addEventListener('click', () => { cleanup(); Modal.close(); this._renderCertificates(parentEl); });
      mc.querySelector('#le-back')?.addEventListener('click', () => { state.step--; render(); });

      // Step 1 wiring
      if (state.step === 1) {
        mc.querySelectorAll('input[name="le-challenge"]').forEach(r => r.addEventListener('change', (e) => { state.challengeType = e.target.value; }));
      }

      // Step 2 wiring
      if (state.step === 2) {
        mc.querySelectorAll('input[name="le-cred-mode"]').forEach(r => r.addEventListener('change', (e) => { state.credentialMode = e.target.value; render(); }));
        mc.querySelector('#le-provider')?.addEventListener('change', (e) => {
          state.providerId = e.target.value || null;
          state.providerSpec = state.providers.find(p => p.id === state.providerId) || null;
          state.newCredentialFields = {};
          render();
        });
        mc.querySelector('#le-existing-cred')?.addEventListener('change', (e) => {
          state.existingCredentialId = parseInt(e.target.value) || null;
          const c = state.existingCredentials.find(c => c.id === state.existingCredentialId);
          if (c) { state.providerId = c.providerId; state.providerSpec = state.providers.find(p => p.id === c.providerId) || null; }
        });
        mc.querySelectorAll('input[data-field]').forEach(input => input.addEventListener('input', (e) => {
          state.newCredentialFields[e.target.dataset.field] = e.target.value;
        }));
        mc.querySelector('#le-save-cred')?.addEventListener('change', (e) => {
          state.saveCredentialAs = e.target.checked ? (mc.querySelector('#le-save-cred-name').value || 'unnamed') : '';
          mc.querySelector('#le-save-cred-name').style.display = e.target.checked ? 'block' : 'none';
        });
        mc.querySelector('#le-save-cred-name')?.addEventListener('input', (e) => { state.saveCredentialAs = e.target.value; });
        mc.querySelector('#le-validate')?.addEventListener('change', (e) => { state.validateBeforeIssue = e.target.checked; });
      }

      // Step 3 issue
      mc.querySelector('#le-issue')?.addEventListener('click', async () => {
        try {
          // If new credential AND not existing-mode, save it first (if requested) OR use it inline
          let credentialsId = state.existingCredentialId;
          if (state.challengeType === 'dns-01' && state.credentialMode === 'new') {
            if (!state.saveCredentialAs) {
              Toast.warning('For dns-01 you must save the credential (provide a name)');
              return;
            }
            const created = await Api.acmeCreateCredential({
              name: state.saveCredentialAs,
              providerId: state.providerId,
              credentials: state.newCredentialFields,
              validateImmediately: state.validateBeforeIssue,
            });
            if (state.validateBeforeIssue && created.validation && !created.validation.ok) {
              Toast.error('Credential validation failed: ' + created.validation.message);
              await Api.acmeDeleteCredential(created.id).catch(() => {});
              return;
            }
            credentialsId = created.id;
          }

          const issued = await Api.acmeIssue({
            domains: state.domains,
            email: state.email,
            challengeType: state.challengeType,
            providerId: state.challengeType === 'dns-01' ? state.providerId : undefined,
            credentialsId: state.challengeType === 'dns-01' ? credentialsId : undefined,
            staging: state.staging,
          });
          state.jobId = issued.jobId;
          state.jobStatus = 'pending';
          render();

          // Progress delivery — WS-first with polling as fallback.
          // Channel format: `acme:job:<jobId>` (broadcasters push on every state change).
          const channel = `acme:job:${state.jobId}`;
          const onUpdate = (job) => {
            state.jobStatus = job.status;
            state.jobOutput = job.output || state.jobOutput;
            render();
            if (job.status === 'success' || job.status === 'failed') {
              if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; }
              if (state.wsUnsub) { state.wsUnsub(); state.wsUnsub = null; }
              (job.status === 'success' ? Toast.success : Toast.error)('Issuance ' + job.status);
            }
          };
          if (typeof WS !== 'undefined' && WS.subscribe) {
            WS.subscribe(channel);
            state.wsUnsub = WS.on('acme:job:update', (data) => {
              if (data && Number(data.id) === Number(state.jobId)) onUpdate(data);
            });
          }
          // Fallback poll every 15s (down from 3s) — safety net if WS fails.
          state.pollTimer = setInterval(async () => {
            try {
              const job = await Api.acmeJob(state.jobId);
              onUpdate(job);
            } catch (err) {
              state.jobOutput += '\n[poll error] ' + err.message;
              render();
            }
          }, 15000);
        } catch (err) { Toast.error(err.message); }
      });

      // Next button
      mc.querySelector('#le-next')?.addEventListener('click', async () => {
        if (state.step === 1) {
          // Validate domains
          const raw = mc.querySelector('#le-domains').value.trim();
          state.domains = raw.split(',').map(s => s.trim()).filter(Boolean);
          if (state.domains.length === 0) { Toast.warning('Enter at least one domain'); return; }
          if (state.domains.length > 100) { Toast.warning('Max 100 domains per cert'); return; }
          state.email = mc.querySelector('#le-email').value.trim();
          if (!state.email || !/^\S+@\S+\.\S+$/.test(state.email)) { Toast.warning('Valid email required'); return; }
          state.staging = mc.querySelector('#le-staging').checked;
          // Wildcards force dns-01
          const hasWildcard = state.domains.some(d => d.startsWith('*.'));
          if (hasWildcard && state.challengeType !== 'dns-01') {
            Toast.warning('Wildcard domains require DNS-01. Switching to dns-01.');
            state.challengeType = 'dns-01';
          }
          // Load providers + existing credentials for step 2
          if (state.providers.length === 0) {
            try {
              const r = await Api.acmeListProviders();
              state.providers = r.providers || [];
            } catch (err) { Toast.error('Could not load providers: ' + err.message); return; }
          }
          try {
            const r = await Api.acmeListCredentials();
            state.existingCredentials = r.credentials || [];
          } catch { state.existingCredentials = []; }
          state.step = 2;
          render();
        } else if (state.step === 2) {
          if (state.challengeType === 'dns-01') {
            if (state.credentialMode === 'existing') {
              if (!state.existingCredentialId) { Toast.warning('Select a saved credential'); return; }
            } else {
              if (!state.providerId) { Toast.warning('Select a DNS provider'); return; }
              const required = (state.providerSpec.fields || []).filter(f => f.required);
              for (const f of required) {
                if (!state.newCredentialFields[f.key]) { Toast.warning(f.label + ' required'); return; }
              }
            }
          }
          state.step = 3;
          render();
        }
      });
    };

    render();
  },

  _cisContainerRemediation(msg) {
    const remediations = {
      'privileged mode': { fix: 'Remove <code>--privileged</code>. Grant only needed capabilities with <code>--cap-add</code>.', doc: 'https://docs.docker.com/engine/reference/run/#runtime-privilege-and-linux-capabilities' },
      'CapAdd=ALL': { fix: 'Remove <code>--cap-add ALL</code>. Use the minimum required capabilities instead.', doc: 'https://docs.docker.com/engine/reference/run/#runtime-privilege-and-linux-capabilities' },
      'Sensitive capabilities': { fix: 'Audit and remove unnecessary capabilities. <code>NET_ADMIN</code>, <code>SYS_ADMIN</code>, <code>SYS_PTRACE</code> are high risk.', doc: 'https://docs.docker.com/engine/reference/run/#runtime-privilege-and-linux-capabilities' },
      'no-new-privileges': { fix: 'Add <code>--security-opt no-new-privileges</code> or in Compose: <code>security_opt: [no-new-privileges:true]</code>', doc: 'https://docs.docker.com/engine/reference/run/#security-configuration' },
      'PID namespace': { fix: 'Remove <code>--pid=host</code>. This grants the container full visibility of all host processes.', doc: 'https://docs.docker.com/engine/reference/run/#pid-settings---pid' },
      'host network': { fix: 'Remove <code>--network=host</code>. Use a named Docker network and expose only needed ports.', doc: 'https://docs.docker.com/network/network-tutorial-host/' },
      'IPC namespace': { fix: 'Remove <code>--ipc=host</code>. Use <code>--ipc=private</code> (default) or <code>--ipc=shareable</code> between specific containers.', doc: 'https://docs.docker.com/engine/reference/run/#ipc-settings---ipc' },
      'read-only': { fix: 'Add <code>--read-only</code> flag. Use <code>--tmpfs /tmp</code> for writable temp dirs.', doc: 'https://docs.docker.com/engine/reference/run/#read-only' },
      'memory limit': { fix: 'Set <code>--memory 512m</code> (or appropriate limit). In Compose: <code>mem_limit: 512m</code>', doc: 'https://docs.docker.com/config/containers/resource_constraints/' },
      'CPU': { fix: 'Set <code>--cpus 1.0</code> or <code>--cpu-shares 512</code>. In Compose: <code>cpus: "1.0"</code>', doc: 'https://docs.docker.com/config/containers/resource_constraints/#cpu' },
      'bind-mounted read-write': { fix: 'Mount sensitive paths read-only: <code>-v /etc:/etc:ro</code>. Prefer named volumes over bind mounts.', doc: 'https://docs.docker.com/storage/bind-mounts/' },
      'Docker socket': { fix: 'Avoid mounting the Docker socket unless absolutely necessary. Use docker-socket-proxy to restrict API access.', doc: 'https://github.com/Tecnativa/docker-socket-proxy' },
      'Privileged ports': { fix: 'Use ports ≥ 1024 internally and map them: <code>-p 80:8080</code>. Avoid binding privileged ports directly.', doc: 'https://docs.docker.com/network/' },
      'root': { fix: 'Add <code>--user 1000:1000</code> or set <code>USER</code> in the Dockerfile. Run as a non-root user.', doc: 'https://docs.docker.com/develop/develop-images/dockerfile_best-practices/#user' },
    };
    const key = Object.keys(remediations).find(k => msg.toLowerCase().includes(k.toLowerCase()));
    if (!key) return '';
    const r = remediations[key];
    return `<div style="font-size:11px;margin-top:5px;padding:5px 8px;background:rgba(56,139,253,.07);border-left:3px solid var(--accent);border-radius:0 var(--radius-sm) var(--radius-sm) 0">
      <i class="fas fa-wrench" style="margin-right:4px;color:var(--accent)"></i><strong>Fix:</strong> ${r.fix}
      <a href="${r.doc}" target="_blank" rel="noopener" style="margin-left:8px;font-size:10px;color:var(--accent)"><i class="fas fa-external-link-alt"></i> docs</a>
    </div>`;
  },

  _cisBenchmarkGuide() {
    return `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">

        <!-- What is CIS? -->
        <div style="grid-column:1/-1;padding:14px 16px;background:var(--surface2);border-radius:var(--radius);border-left:4px solid var(--accent)">
          <div style="font-weight:600;margin-bottom:6px"><i class="fas fa-shield-alt" style="margin-right:8px;color:var(--accent)"></i>What is the CIS Docker Benchmark?</div>
          <div class="text-sm text-muted">
            The <strong>Center for Internet Security (CIS) Docker Benchmark</strong> is an industry-standard security configuration guide for Docker.
            It defines measurable technical controls across two areas: <strong>Docker daemon configuration</strong> and <strong>container runtime settings</strong>.
            Running it gives you an objective security score and a prioritized remediation list — no guesswork.
          </div>
        </div>

        <!-- Daemon checks explained -->
        <div class="card" style="margin:0">
          <div class="card-header" style="padding:10px 14px">
            <h4 style="margin:0;font-size:13px"><i class="fas fa-cog" style="margin-right:7px;color:var(--accent)"></i>Daemon Checks (D-1 … D-6)</h4>
          </div>
          <div class="card-body" style="padding:10px 14px;font-size:12px;display:flex;flex-direction:column;gap:10px">
            <div><strong>D-1 — Logging driver</strong><br><span class="text-muted">Docker should have a logging driver configured (<code>json-file</code>, <code>journald</code>, <code>syslog</code>…). <code>none</code> means lost logs after restart.</span></div>
            <div><strong>D-2 — Experimental features</strong><br><span class="text-muted">Experimental features are unstable and may have security vulnerabilities. Disable in production with <code>"experimental": false</code> in <code>/etc/docker/daemon.json</code>.</span></div>
            <div><strong>D-3 — Live restore</strong><br><span class="text-muted"><code>--live-restore</code> keeps containers running during daemon restarts/upgrades. Add <code>"live-restore": true</code> to <code>daemon.json</code>.</span></div>
            <div><strong>D-4 — Userland proxy</strong><br><span class="text-muted">Disabling <code>--userland-proxy</code> makes Docker use iptables DNAT instead of a Go proxy per port. More efficient, uses fewer resources.</span></div>
            <div><strong>D-5 — Seccomp profile</strong><br><span class="text-muted">Seccomp filters syscalls the container can make. The default Docker seccomp profile blocks ~40 dangerous syscalls. Verify it's active.</span></div>
            <div><strong>D-6 — AppArmor / SELinux</strong><br><span class="text-muted">Mandatory Access Control frameworks that restrict container actions at the OS level. Ubuntu/Debian use AppArmor; RHEL/Fedora use SELinux.</span></div>
          </div>
        </div>

        <!-- Container checks explained -->
        <div class="card" style="margin:0">
          <div class="card-header" style="padding:10px 14px">
            <h4 style="margin:0;font-size:13px"><i class="fas fa-box" style="margin-right:7px;color:var(--accent)"></i>Container Checks (C-1 … C-12)</h4>
          </div>
          <div class="card-body" style="padding:10px 14px;font-size:12px;display:flex;flex-direction:column;gap:10px">
            <div><strong>C-1 — Privileged mode</strong><br><span class="text-muted"><code>--privileged</code> gives the container nearly the same access as root on the host. Almost never needed.</span></div>
            <div><strong>C-2 — Capabilities</strong><br><span class="text-muted">Linux capabilities break root into discrete privileges. <code>CAP_SYS_ADMIN</code> is nearly equivalent to full root. Drop unused caps.</span></div>
            <div><strong>C-3 — no-new-privileges</strong><br><span class="text-muted">Prevents container processes from gaining more privileges via setuid/setgid binaries. A single flag, near-zero cost.</span></div>
            <div><strong>C-4/5/6 — Namespace sharing</strong><br><span class="text-muted"><code>--pid=host</code>, <code>--network=host</code>, <code>--ipc=host</code> all remove isolation boundaries. Use only when explicitly required.</span></div>
            <div><strong>C-7 — Read-only rootfs</strong><br><span class="text-muted"><code>--read-only</code> prevents malware from writing to the container filesystem. Use <code>--tmpfs /tmp</code> for writable temp space.</span></div>
            <div><strong>C-8/9 — Resource limits</strong><br><span class="text-muted">Without <code>--memory</code> and <code>--cpus</code>, a runaway container can consume all host resources (DoS). Set limits on every container.</span></div>
            <div><strong>C-10 — Sensitive bind mounts</strong><br><span class="text-muted">Mounting <code>/etc</code>, <code>/proc</code>, <code>/sys</code>, or the Docker socket read-write can lead to full host compromise.</span></div>
            <div><strong>C-11/12 — Ports &amp; user</strong><br><span class="text-muted">Binding privileged ports (&lt;1024) requires elevated privileges. Running as <code>root</code> inside the container amplifies any escape.</span></div>
          </div>
        </div>

        <!-- Scoring -->
        <div class="card" style="margin:0">
          <div class="card-header" style="padding:10px 14px">
            <h4 style="margin:0;font-size:13px"><i class="fas fa-chart-pie" style="margin-right:7px;color:var(--accent)"></i>How the score is calculated</h4>
          </div>
          <div class="card-body" style="padding:10px 14px;font-size:12px">
            <p class="text-muted" style="margin:0 0 8px">Score = <code>passed / (passed + warned + failed) × 100</code>. Informational findings don't affect the score.</p>
            <div style="display:flex;flex-direction:column;gap:6px">
              <div style="display:flex;align-items:center;gap:8px"><span style="width:40px;height:8px;border-radius:4px;background:var(--green);display:inline-block"></span><span class="text-muted">80–100% — Good posture. Review remaining warnings.</span></div>
              <div style="display:flex;align-items:center;gap:8px"><span style="width:40px;height:8px;border-radius:4px;background:var(--yellow);display:inline-block"></span><span class="text-muted">50–79% — Moderate risk. Prioritize FAIL items.</span></div>
              <div style="display:flex;align-items:center;gap:8px"><span style="width:40px;height:8px;border-radius:4px;background:var(--red);display:inline-block"></span><span class="text-muted">&lt;50% — High risk. Immediate action recommended.</span></div>
            </div>
            <p class="text-muted" style="margin:10px 0 0;font-size:11px">
              <i class="fas fa-info-circle" style="margin-right:4px"></i>
              Some warnings (e.g. <em>no memory limit</em> on a dev container) may be acceptable tradeoffs. Use your judgement.
            </p>
          </div>
        </div>

        <!-- Quick wins -->
        <div class="card" style="margin:0">
          <div class="card-header" style="padding:10px 14px">
            <h4 style="margin:0;font-size:13px"><i class="fas fa-bolt" style="margin-right:7px;color:var(--yellow)"></i>Quick wins (highest impact, lowest effort)</h4>
          </div>
          <div class="card-body" style="padding:10px 14px;font-size:12px;display:flex;flex-direction:column;gap:8px">
            <div style="display:flex;gap:8px">
              <span style="color:var(--red);font-size:16px;line-height:1.3">①</span>
              <div><strong>Add <code>no-new-privileges</code> to every container</strong><br><span class="text-muted">One line in compose, no app changes needed. Eliminates an entire class of privilege escalation.</span><br><code style="font-size:10px;color:var(--accent)">security_opt: [no-new-privileges:true]</code></div>
            </div>
            <div style="display:flex;gap:8px">
              <span style="color:var(--red);font-size:16px;line-height:1.3">②</span>
              <div><strong>Set memory limits</strong><br><span class="text-muted">Prevents OOM cascades. Start with <code>mem_limit: 512m</code> and tune from real usage data.</span></div>
            </div>
            <div style="display:flex;gap:8px">
              <span style="color:var(--yellow);font-size:16px;line-height:1.3">③</span>
              <div><strong>Enable live restore on the daemon</strong><br><span class="text-muted">Add <code>"live-restore": true</code> to <code>/etc/docker/daemon.json</code> and <code>systemctl reload docker</code>. Zero downtime.</span></div>
            </div>
            <div style="display:flex;gap:8px">
              <span style="color:var(--yellow);font-size:16px;line-height:1.3">④</span>
              <div><strong>Run containers as non-root</strong><br><span class="text-muted">Add <code>USER 1001</code> to Dockerfile or <code>user: "1001:1001"</code> in Compose.</span></div>
            </div>
            <div style="display:flex;gap:8px">
              <span style="color:var(--accent);font-size:16px;line-height:1.3">⑤</span>
              <div><strong>Remove <code>--privileged</code> and cap-add ALL</strong><br><span class="text-muted">Audit each container. Almost nothing legitimately needs full host access.</span></div>
            </div>
          </div>
        </div>

        <!-- Resources -->
        <div style="grid-column:1/-1">
          <div style="font-size:12px;color:var(--text-dim);display:flex;gap:16px;flex-wrap:wrap;align-items:center;padding-top:8px;border-top:1px solid var(--border)">
            <span><i class="fas fa-book" style="margin-right:5px"></i>Resources:</span>
            <a href="https://www.cisecurity.org/benchmark/docker" target="_blank" rel="noopener" style="color:var(--accent)">CIS Docker Benchmark PDF</a>
            <a href="https://docs.docker.com/engine/security/" target="_blank" rel="noopener" style="color:var(--accent)">Docker Security docs</a>
            <a href="https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html" target="_blank" rel="noopener" style="color:var(--accent)">OWASP Docker Cheat Sheet</a>
            <a href="https://github.com/docker/docker-bench-security" target="_blank" rel="noopener" style="color:var(--accent)">docker-bench-security (official tool)</a>
          </div>
        </div>

      </div>
    `;
  },

  async _renderEgressAudit(el) {
    el.innerHTML = `<div class="empty-msg"><i class="fas fa-spinner fa-spin"></i> Scanning egress posture…</div>`;
    let data, policies, presetsData;
    try {
      [data, policies, presetsData] = await Promise.all([
        Api.getEgressAudit(),
        Api.egressFilterListPolicies().catch(() => ({ policies: [], enforced: false })),
        Api.egressFilterPresets().catch(() => ({ presets: [] })),
      ]);
    } catch (e) {
      el.innerHTML = `<div class="empty-msg">Error: ${Utils.escapeHtml(e.message || 'Failed to load egress audit')}</div>`;
      return;
    }

    // Build a lookup: containerKey → policy
    const policyByContainer = new Map();
    for (const p of (policies.policies || [])) {
      if (p.scopeType === 'container') policyByContainer.set(p.scopeKey, p);
    }
    const policyByStack = new Map();
    for (const p of (policies.policies || [])) {
      if (p.scopeType === 'stack') policyByStack.set(p.scopeKey, p);
    }
    const presets = presetsData.presets || [];

    const badge = (sev) => {
      const colors = { critical: 'var(--red)', warning: 'var(--yellow)', info: '#64748b' };
      return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;color:#fff;background:${colors[sev] || '#64748b'}">${sev.toUpperCase()}</span>`;
    };

    const pill = (label, val, bg) => `<div style="padding:10px 14px;background:${bg};border-radius:8px;min-width:110px"><div style="font-size:11px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px">${label}</div><div style="font-size:22px;font-weight:700;margin-top:2px">${val}</div></div>`;

    const score = data.avgScore ?? 100;
    const scoreColor = score >= 80 ? 'rgba(34,197,94,0.15)' : score >= 60 ? 'rgba(234,179,8,0.15)' : 'rgba(239,68,68,0.15)';

    const rowHtml = (r) => {
      const topSev = r.findings.find(f => f.severity === 'critical') ? 'critical'
        : r.findings.find(f => f.severity === 'warning') ? 'warning'
        : r.findings.length > 0 ? 'info' : null;

      const verdict = r.canReachInternet
        ? (r.canReachIMDS ? '<span style="color:var(--red)">Internet + IMDS</span>' : '<span style="color:var(--yellow)">Internet</span>')
        : '<span style="color:#22c55e">Isolated</span>';

      const findingsHtml = r.findings.length === 0
        ? '<div style="padding:12px;color:var(--text-dim)">No findings — container has a clean egress posture.</div>'
        : r.findings.map(f => `
            <div style="padding:8px 12px;border-bottom:1px solid var(--border)">
              <div style="display:flex;gap:8px;align-items:start">
                ${badge(f.severity)}
                <div style="flex:1">
                  <div>${Utils.escapeHtml(f.message)}</div>
                  ${f.fix ? `<div style="color:var(--text-dim);font-size:12px;margin-top:4px"><i class="fas fa-wrench" style="margin-right:4px"></i>${Utils.escapeHtml(f.fix)}</div>` : ''}
                </div>
              </div>
            </div>`).join('');

      const netsHtml = r.networks.length === 0
        ? '<span style="color:var(--text-dim)">none</span>'
        : r.networks.map(n => {
            const tag = n.internal ? 'internal' : (n.gateway ? 'bridge' : n.driver);
            const bg = n.internal ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.10)';
            return `<span style="display:inline-block;padding:2px 6px;background:${bg};border-radius:3px;margin-right:4px;font-size:11px"><code>${Utils.escapeHtml(n.name)}</code> <span style="color:var(--text-dim)">[${tag}]</span></span>`;
          }).join('');

      // Long container id (full Id from audit if present, else short id)
      const fullId = r.fullId || r.id;
      const policy = policyByContainer.get(fullId) || policyByContainer.get(r.id) || (r.stack ? policyByStack.get(r.stack) : null);
      let filterCell;
      if (policy) {
        const scopeLbl = policy.scopeType === 'stack' ? `stack:${policy.scopeKey}` : 'container';
        const modeBg = policy.mode === 'enforce' ? 'rgba(59,130,246,0.15)' : 'rgba(234,179,8,0.15)';
        filterCell = `
          <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap">
            <span style="padding:2px 6px;background:${modeBg};border-radius:3px;font-size:10px;font-weight:600" title="${Utils.escapeHtml(scopeLbl)}">${policy.preset} · ${policy.mode}</span>
            <button class="btn btn-xs btn-secondary egress-manage-btn" data-policy-id="${policy.id}" data-cid="${fullId}" data-cname="${Utils.escapeHtml(r.name)}" title="Manage policy"><i class="fas fa-cog"></i></button>
          </div>`;
      } else {
        filterCell = `<button class="btn btn-xs btn-primary egress-enable-btn" data-cid="${fullId}" data-cname="${Utils.escapeHtml(r.name)}" data-stack="${Utils.escapeHtml(r.stack || '')}"><i class="fas fa-shield-alt" style="margin-right:4px"></i>Enable filter</button>`;
      }

      return `
        <tr class="egress-row" data-id="${r.id}" style="cursor:pointer">
          <td>${topSev ? badge(topSev) : '<span style="color:var(--text-dim)">—</span>'}</td>
          <td><strong>${Utils.escapeHtml(r.name)}</strong>${r.stack ? `<div style="font-size:11px;color:var(--text-dim)">${Utils.escapeHtml(r.stack)}${r.service ? ' / ' + Utils.escapeHtml(r.service) : ''}</div>` : ''}</td>
          <td><code style="font-size:12px">${Utils.escapeHtml(r.networkMode || 'default')}</code></td>
          <td>${netsHtml}</td>
          <td>${verdict}</td>
          <td style="text-align:right"><strong style="color:${r.score >= 80 ? '#22c55e' : r.score >= 60 ? 'var(--yellow)' : 'var(--red)'}">${r.score}</strong></td>
          <td>${filterCell}</td>
          <td style="text-align:center"><i class="fas fa-chevron-down egress-chev" style="color:var(--text-dim)"></i></td>
        </tr>
        <tr class="egress-detail" data-id="${r.id}" style="display:none;background:var(--bg-dim)"><td colspan="8" style="padding:0">
          ${findingsHtml}
          ${r.extraHosts && r.extraHosts.length > 0 ? `<div style="padding:8px 12px;border-top:1px solid var(--border);font-size:12px"><strong>extra_hosts:</strong> <code>${Utils.escapeHtml(r.extraHosts.join(', '))}</code></div>` : ''}
          ${r.dns && r.dns.length > 0 ? `<div style="padding:8px 12px;border-top:1px solid var(--border);font-size:12px"><strong>custom DNS:</strong> <code>${Utils.escapeHtml(r.dns.join(', '))}</code></div>` : ''}
          ${policy ? `<div class="egress-blocklog-slot" data-policy-id="${policy.id}" style="padding:12px;border-top:1px solid var(--border)"><i class="fas fa-spinner fa-spin" style="margin-right:6px"></i>Loading deny log...</div>` : ''}
        </td></tr>`;
    };

    const sorted = [...data.containers].sort((a, b) => a.score - b.score);

    el.innerHTML = `
      <div class="card" style="margin-bottom:16px">
        <div class="card-body">
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            ${pill('Avg Score', score, scoreColor)}
            ${pill('Critical', data.criticalCount, 'rgba(239,68,68,0.15)')}
            ${pill('Warnings', data.warningCount, 'rgba(234,179,8,0.15)')}
            ${pill('Internet reach', `${data.internetReachable}/${data.total}`, 'rgba(249,115,22,0.12)')}
            ${pill('IMDS reach', `${data.imdsReachable}/${data.total}`, 'rgba(239,68,68,0.12)')}
            ${pill('Scanned', `${data.scanned}/${data.hostTotal}`, 'rgba(148,163,184,0.15)')}
          </div>
          <div style="margin-top:12px;padding:10px 12px;background:rgba(59,130,246,0.08);border-left:3px solid #3b82f6;border-radius:4px;font-size:13px">
            <strong><i class="fas fa-info-circle" style="margin-right:4px"></i>Audit &amp; enforcement.</strong>
            Flags containers that can reach public internet and cloud-metadata endpoints (IMDS — <code>169.254.169.254</code>).
            ${policies.enforced ? 'Active enforcement available: click <strong>Enable filter</strong> per row to install an outbound allowlist (sidecar + iptables).' : 'Read-only audit — sidecar not configured. Set <code>DD_EGRESS_SIDECAR_ENDPOINT</code> to enable.'}
            <a href="#/howto" style="margin-left:6px">How to mitigate →</a>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-body" style="padding:0;overflow-x:auto">
          <table style="width:100%;border-collapse:collapse">
            <thead>
              <tr style="background:var(--bg-dim);border-bottom:1px solid var(--border)">
                <th style="padding:10px 12px;text-align:left;width:90px">Risk</th>
                <th style="padding:10px 12px;text-align:left">Container</th>
                <th style="padding:10px 12px;text-align:left;width:120px">Network Mode</th>
                <th style="padding:10px 12px;text-align:left">Networks</th>
                <th style="padding:10px 12px;text-align:left;width:150px">Reachability</th>
                <th style="padding:10px 12px;text-align:right;width:70px">Score</th>
                <th style="padding:10px 12px;text-align:left;width:210px">Filter</th>
                <th style="width:40px"></th>
              </tr>
            </thead>
            <tbody>
              ${sorted.length > 0 ? sorted.map(rowHtml).join('') : '<tr><td colspan="8" style="padding:30px;text-align:center;color:var(--text-dim)">No containers to scan.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;

    // Toggle detail row on click (ignore clicks on buttons inside it)
    el.querySelectorAll('.egress-row').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        const id = row.dataset.id;
        const detail = el.querySelector(`.egress-detail[data-id="${id}"]`);
        if (!detail) return;
        const open = detail.style.display !== 'none';
        detail.style.display = open ? 'none' : 'table-row';
        const chev = row.querySelector('.egress-chev');
        if (chev) chev.className = open ? 'fas fa-chevron-down egress-chev' : 'fas fa-chevron-up egress-chev';
        // Lazy-load block log on first expand
        if (!open) {
          const slot = detail.querySelector('.egress-blocklog-slot');
          if (slot && !slot.dataset.loaded) {
            slot.dataset.loaded = '1';
            this._loadEgressBlockLog(slot);
          }
        }
      });
    });

    // Enable filter button → opens 3-step modal
    el.querySelectorAll('.egress-enable-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._showEgressFilterModal({
          mode: 'enable',
          containerId: btn.dataset.cid,
          containerName: btn.dataset.cname,
          stack: btn.dataset.stack || null,
          presets,
          onSaved: () => this._renderEgressAudit(el),
        });
      });
    });

    // Manage existing policy → opens manage modal
    el.querySelectorAll('.egress-manage-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._showEgressFilterModal({
          mode: 'manage',
          policyId: parseInt(btn.dataset.policyId, 10),
          containerId: btn.dataset.cid,
          containerName: btn.dataset.cname,
          presets,
          onSaved: () => this._renderEgressAudit(el),
        });
      });
    });
  },

  // ─── Egress filter: lazy-load block log into the expanded detail row
  async _loadEgressBlockLog(slotEl) {
    const policyId = slotEl.dataset.policyId;
    // Toggle between 'recent' (raw events) and 'grouped' (by hostname) — persists per slot
    if (!slotEl.dataset.view) slotEl.dataset.view = 'grouped';
    await this._renderEgressBlockLog(slotEl, policyId, slotEl.dataset.view);
  },

  async _renderEgressBlockLog(slotEl, policyId, view) {
    slotEl.innerHTML = `<div style="color:var(--text-dim);font-size:12px"><i class="fas fa-spinner fa-spin" style="margin-right:6px"></i>Loading deny log…</div>`;
    try {
      if (view === 'grouped') {
        const { groups = [] } = await Api.egressFilterBlockLogGrouped(policyId, { sinceHours: 168, limit: 20 });
        slotEl.innerHTML = this._renderEgressBlockLogHeader(policyId, view, groups.length)
          + (groups.length === 0
            ? `<div style="color:var(--text-dim);font-size:12px;padding:8px"><i class="fas fa-shield-check" style="margin-right:6px"></i>No deny events in the last 7 days.</div>`
            : `<table style="width:100%;border-collapse:collapse;font-size:11px">
                <thead>
                  <tr style="background:var(--bg);border-bottom:1px solid var(--border)">
                    <th style="padding:5px 8px;text-align:left">Hostname</th>
                    <th style="padding:5px 8px;text-align:right;width:60px">Denies</th>
                    <th style="padding:5px 8px;text-align:left;width:150px">Last seen</th>
                    <th style="padding:5px 8px;text-align:left;width:90px">Ports</th>
                    <th style="padding:5px 8px;width:90px"></th>
                  </tr>
                </thead>
                <tbody>
                ${groups.map(g => `
                  <tr style="border-bottom:1px solid var(--surface2)">
                    <td style="padding:5px 8px;font-family:var(--mono)"><strong>${Utils.escapeHtml(g.hostname)}</strong></td>
                    <td style="padding:5px 8px;text-align:right;color:var(--red);font-weight:600">${g.count}</td>
                    <td style="padding:5px 8px;color:var(--text-dim)">${g.last_seen}</td>
                    <td style="padding:5px 8px;font-family:var(--mono)">${Utils.escapeHtml(g.ports || '')}</td>
                    <td style="padding:5px 8px;text-align:right">
                      <button class="btn btn-xs btn-primary egress-allow-btn" data-policy-id="${policyId}" data-hostname="${Utils.escapeHtml(g.hostname)}" title="Add this hostname to the policy allowlist"><i class="fas fa-check" style="margin-right:4px"></i>Allow</button>
                    </td>
                  </tr>`).join('')}
                </tbody>
              </table>`);
      } else {
        const { entries = [] } = await Api.egressFilterBlockLog(policyId, { limit: 50 });
        slotEl.innerHTML = this._renderEgressBlockLogHeader(policyId, view, entries.length)
          + (entries.length === 0
            ? `<div style="color:var(--text-dim);font-size:12px;padding:8px"><i class="fas fa-shield-check" style="margin-right:6px"></i>No deny events yet.</div>`
            : `<div style="max-height:200px;overflow-y:auto;font-family:var(--mono);font-size:11px;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:6px">
                ${entries.map(e => `<div><span style="color:var(--text-dim)">${e.blocked_at}</span> <strong>${Utils.escapeHtml(e.hostname)}</strong>:<span style="color:var(--accent)">${e.port}</span> <span style="color:var(--red)">[${Utils.escapeHtml(e.reason)}]</span></div>`).join('')}
              </div>`);
      }

      // Wire interactions
      slotEl.querySelectorAll('.egress-blocklog-view-btn').forEach(b => b.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        slotEl.dataset.view = b.dataset.view;
        await this._renderEgressBlockLog(slotEl, policyId, b.dataset.view);
      }));
      slotEl.querySelectorAll('.egress-blocklog-csv-btn').forEach(b => b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this._exportEgressBlockLogCsv(policyId);
      }));
      slotEl.querySelectorAll('.egress-allow-btn').forEach(b => b.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        const hostname = b.dataset.hostname;
        if (!confirm(`Add "${hostname}" to the allowlist for this policy? The current preset will switch to 'custom'.`)) return;
        try {
          const r = await Api.egressFilterAllowHostname(policyId, hostname);
          if (r.added) Toast.success(`${hostname} added to allowlist`);
          else Toast.warning(`${hostname}: ${r.reason || 'no change'}`);
          await this._renderEgressBlockLog(slotEl, policyId, slotEl.dataset.view);
        } catch (err) { Toast.error(err.message); }
      }));
    } catch (e) {
      slotEl.innerHTML = `<div style="color:var(--red);font-size:12px">Failed to load deny log: ${Utils.escapeHtml(e.message)}</div>`;
    }
  },

  _renderEgressBlockLogHeader(_policyId, view, count) {
    const btn = (v, label) => `<button class="btn btn-xs ${v === view ? 'btn-primary' : 'btn-secondary'} egress-blocklog-view-btn" data-view="${v}">${label}</button>`;
    return `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <i class="fas fa-ban" style="color:var(--red)"></i>
        <strong style="font-size:12px">Deny log</strong>
        <span style="color:var(--text-dim);font-size:11px">(${count} ${view === 'grouped' ? 'hosts' : 'events'})</span>
        <div style="flex:1"></div>
        ${btn('grouped', 'Grouped')}
        ${btn('recent', 'Recent')}
        <button class="btn btn-xs btn-secondary egress-blocklog-csv-btn" title="Export CSV"><i class="fas fa-file-csv"></i> CSV</button>
      </div>`;
  },

  async _exportEgressBlockLogCsv(policyId) {
    try {
      const { entries = [] } = await Api.egressFilterBlockLog(policyId, { limit: 1000 });
      if (entries.length === 0) { Toast.warning('No deny events to export'); return; }
      const csv = [
        ['id', 'blocked_at', 'hostname', 'port', 'proto', 'reason', 'container_id'].join(','),
        ...entries.map(e => [e.id, e.blocked_at, e.hostname, e.port, e.proto, e.reason, e.container_id || ''].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')),
      ].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `egress-blocklog-policy${policyId}-${Date.now()}.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      Toast.success(`Exported ${entries.length} events`);
    } catch (e) { Toast.error(e.message); }
  },

  // ─── Egress filter modal (Enable or Manage)
  _showEgressFilterModal({ mode, policyId, containerId, containerName, stack, presets, onSaved }) {
    const isManage = mode === 'manage';
    const presetOptions = (presets || []).map(p =>
      `<option value="${Utils.escapeHtml(p.id)}">${Utils.escapeHtml(p.name)} — ${Utils.escapeHtml(p.description.slice(0, 80))}</option>`
    ).join('');

    const title = isManage
      ? `Manage egress filter — ${Utils.escapeHtml(containerName)}`
      : `Enable egress filter — ${Utils.escapeHtml(containerName)}`;

    Modal.open(`
      <div class="modal-header">
        <h3><i class="fas fa-shield-alt" style="color:var(--accent);margin-right:8px"></i>${title}</h3>
        <button class="modal-close-btn" id="modal-x"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-body">
        <div style="margin-bottom:12px;padding:8px 12px;background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.25);border-radius:4px;font-size:12px">
          <i class="fas fa-info-circle" style="margin-right:6px;color:var(--accent)"></i>
          Policy is configured in the DB. Enforcement requires the <code>dd-egress-filter</code> sidecar + <code>DD_EGRESS_SIDECAR_ENDPOINT</code> env. IMDS endpoints (<code>169.254.169.254</code>) are always blocked regardless of policy.
        </div>
        <div style="display:grid;grid-template-columns:120px 1fr;gap:10px;margin-bottom:12px;align-items:center">
          <label style="font-size:13px">Preset:</label>
          <select id="ef-preset" style="width:100%">${presetOptions}</select>

          <label style="font-size:13px">Mode:</label>
          <select id="ef-mode" style="width:100%">
            <option value="enforce">Enforce (block denies)</option>
            <option value="audit-only">Audit-only (log, don't block)</option>
          </select>

          <label style="font-size:13px;align-self:start;padding-top:6px">Custom allowlist:</label>
          <textarea id="ef-allowlist" rows="6" style="width:100%;font-family:var(--mono);font-size:12px" placeholder="One hostname per line, e.g.&#10;docker.io&#10;*.github.com&#10;registry.npmjs.org"></textarea>
        </div>
        <div id="ef-status" style="font-size:12px;color:var(--text-dim);min-height:20px"></div>
      </div>
      <div class="modal-footer" style="display:flex;gap:8px;justify-content:space-between">
        <div>
          ${isManage ? '<button class="btn btn-danger" id="ef-emergency-disable"><i class="fas fa-times-circle" style="margin-right:4px"></i>Emergency disable</button>' : ''}
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-secondary" id="ef-cancel">Cancel</button>
          ${isManage
            ? '<button class="btn btn-secondary" id="ef-unapply">Unapply</button><button class="btn btn-primary" id="ef-save">Save &amp; apply</button>'
            : '<button class="btn btn-primary" id="ef-save">Save &amp; apply</button>'}
        </div>
      </div>
    `, { width: '640px' });

    const mc = Modal._content;
    mc.querySelector('#modal-x').addEventListener('click', () => Modal.close());
    mc.querySelector('#ef-cancel').addEventListener('click', () => Modal.close());

    const setStatus = (msg, color = 'var(--text-dim)') => {
      mc.querySelector('#ef-status').innerHTML = `<span style="color:${color}">${Utils.escapeHtml(msg)}</span>`;
    };

    // Prefill on Manage
    if (isManage) {
      (async () => {
        try {
          const { policy } = await Api.egressFilterGetPolicy(policyId);
          mc.querySelector('#ef-preset').value = policy.preset;
          mc.querySelector('#ef-mode').value = policy.mode;
          if (policy.preset === 'custom' || policy.preset === 'audit-only') {
            mc.querySelector('#ef-allowlist').value = (policy.allowlist || []).join('\n');
          }
        } catch (e) { setStatus('Could not load policy: ' + e.message, 'var(--red)'); }
      })();
    }

    const save = async () => {
      const preset = mc.querySelector('#ef-preset').value;
      const modeSel = mc.querySelector('#ef-mode').value;
      const customRaw = mc.querySelector('#ef-allowlist').value.trim();
      const customAllowlist = customRaw ? customRaw.split(/[\s,]+/).map(s => s.trim()).filter(Boolean) : undefined;

      setStatus('Saving policy...');
      try {
        let pid = policyId;
        if (!pid) {
          const created = await Api.egressFilterCreatePolicy({
            scopeType: 'container',
            scopeKey: containerId,
            preset,
            customAllowlist,
            mode: modeSel,
          });
          pid = created.policyId;
        } else {
          await Api.egressFilterUpdatePolicy(pid, { preset, customAllowlist, mode: modeSel });
        }
        setStatus('Applying filter...');
        const applyRes = await Api.egressFilterApply(pid);
        setStatus(`Applied: ${applyRes.scope === 'stack' ? `${applyRes.applied.length} container(s)` : 'ok'}`, '#22c55e');
        Toast.success('Egress filter applied');
        setTimeout(() => { Modal.close(); onSaved && onSaved(); }, 600);
      } catch (e) {
        setStatus('Failed: ' + e.message, 'var(--red)');
        Toast.error(e.message);
      }
    };

    mc.querySelector('#ef-save').addEventListener('click', save);

    if (isManage) {
      mc.querySelector('#ef-unapply').addEventListener('click', async () => {
        setStatus('Unapplying filter...');
        try {
          await Api.egressFilterUnapply(policyId);
          setStatus('Unapplied (policy config retained).', '#22c55e');
          Toast.success('Egress filter unapplied');
          setTimeout(() => { Modal.close(); onSaved && onSaved(); }, 600);
        } catch (e) {
          setStatus('Failed: ' + e.message, 'var(--red)');
          Toast.error(e.message);
        }
      });
      mc.querySelector('#ef-emergency-disable').addEventListener('click', async () => {
        if (!confirm('Emergency disable this policy? This unapplies the filter AND deletes the policy. The container regains full outbound.')) return;
        try {
          await Api.egressFilterUnapply(policyId).catch(() => {});  // best-effort
          await Api.egressFilterDeletePolicy(policyId, 'emergency-disable');
          Toast.warning('Egress policy removed');
          Modal.close();
          onSaved && onSaved();
        } catch (e) { Toast.error(e.message); }
      });
    }
  },

  // ─── v6.11.0: Translations tab (Google Translate + DeepL with quota tracking) ──
  async _renderTranslations(el) {
    el.innerHTML = `
      <div class="card" style="margin-bottom:12px">
        <div class="card-body" style="padding:12px">
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
            <button class="btn btn-sm ${this._tTab === 'providers' || !this._tTab ? 'btn-primary' : 'btn-secondary'}" data-ttab="providers"><i class="fas fa-key" style="margin-right:4px"></i>Providers</button>
            <button class="btn btn-sm ${this._tTab === 'usage' ? 'btn-primary' : 'btn-secondary'}" data-ttab="usage"><i class="fas fa-chart-line" style="margin-right:4px"></i>Usage</button>
            <button class="btn btn-sm ${this._tTab === 'translate' ? 'btn-primary' : 'btn-secondary'}" data-ttab="translate"><i class="fas fa-language" style="margin-right:4px"></i>Translate</button>
            <button class="btn btn-sm ${this._tTab === 'review' ? 'btn-primary' : 'btn-secondary'}" data-ttab="review"><i class="fas fa-check-double" style="margin-right:4px"></i>Review &amp; Export</button>
          </div>
          <div style="margin-top:10px;font-size:12px;color:var(--text-dim)">
            <i class="fas fa-info-circle" style="margin-right:6px"></i>
            Auto-translate i18n gaps using Google Translate + DeepL free tiers (500k chars / month each). Review each translation before exporting to a locale file.
          </div>
        </div>
      </div>
      <div id="translations-panel"></div>
    `;
    el.querySelectorAll('[data-ttab]').forEach(b => b.addEventListener('click', () => {
      this._tTab = b.dataset.ttab;
      this._renderTranslations(el);
    }));

    const panel = el.querySelector('#translations-panel');
    const tab = this._tTab || 'providers';
    if (tab === 'providers') await this._renderTranslationsProviders(panel);
    else if (tab === 'usage') await this._renderTranslationsUsage(panel);
    else if (tab === 'translate') await this._renderTranslationsTranslate(panel);
    else if (tab === 'review') await this._renderTranslationsReview(panel);
  },

  async _renderTranslationsProviders(el) {
    el.innerHTML = `<div class="text-muted text-sm"><i class="fas fa-spinner fa-spin" style="margin-right:5px"></i>Loading…</div>`;
    // Brand colours — kept hex because these are vendor brand identities,
    // not theme tokens. Don't move to :root (they would confuse a dark/light swap).
    const BRAND_COLOR = { google: '#4285f4', deepl: '#0f2b46' };
    try {
      const { providers } = await Api.translationsProviders();
      const byName = Object.fromEntries(providers.map(p => [p.provider, p]));
      const card = (providerName, displayName, signupUrl) => {
        const p = byName[providerName];
        return `
          <div class="card" style="margin:0">
            <div class="card-header"><h3 style="margin:0"><i class="fas ${providerName === 'google' ? 'fa-google' : 'fa-language'}" style="margin-right:8px;color:${BRAND_COLOR[providerName] || 'var(--text-dim)'}"></i>${displayName}</h3>
              ${p ? `<span class="badge ${p.is_active ? 'badge-running' : 'badge-stopped'}" style="font-size:10px">${p.is_active ? 'active' : 'disabled'}</span>` : '<span class="badge badge-warning" style="font-size:10px">not configured</span>'}
            </div>
            <div class="card-body">
              <div style="display:grid;grid-template-columns:120px 1fr;gap:8px;align-items:center;margin-bottom:10px">
                <label style="font-size:12px">API key:</label>
                <input type="password" class="tprov-key" data-provider="${providerName}" placeholder="${p ? '•••••••• (stored, paste new to rotate)' : 'Paste API key'}" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text)">
                <label style="font-size:12px">Monthly limit:</label>
                <input type="number" class="tprov-limit" data-provider="${providerName}" value="${p?.monthly_limit || 500000}" min="1000" step="10000" style="width:180px;padding:6px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text)">
                <label style="font-size:12px">Notes:</label>
                <input type="text" class="tprov-notes" data-provider="${providerName}" value="${Utils.escapeHtml(p?.notes || '')}" placeholder="optional" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text)">
              </div>
              <div style="display:flex;gap:6px;flex-wrap:wrap">
                <button class="btn btn-sm btn-primary tprov-save" data-provider="${providerName}"><i class="fas fa-save" style="margin-right:4px"></i>${p ? 'Update' : 'Save'}</button>
                ${p ? `<button class="btn btn-sm btn-secondary tprov-test" data-id="${p.id}"><i class="fas fa-vial" style="margin-right:4px"></i>Test</button>` : ''}
                ${p ? `<button class="btn btn-sm btn-secondary tprov-toggle" data-id="${p.id}" data-active="${p.is_active}"><i class="fas fa-power-off" style="margin-right:4px"></i>${p.is_active ? 'Disable' : 'Enable'}</button>` : ''}
                ${p ? `<button class="btn btn-sm btn-danger tprov-delete" data-id="${p.id}"><i class="fas fa-trash"></i></button>` : ''}
                <a href="${signupUrl}" target="_blank" style="align-self:center;font-size:11px;color:var(--accent);text-decoration:none;margin-left:auto">Get free API key ↗</a>
              </div>
              <div class="tprov-status" data-provider="${providerName}" style="margin-top:10px;font-size:12px"></div>
            </div>
          </div>`;
      };

      el.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
          ${card('google', 'Google Translate', 'https://cloud.google.com/translate/docs/setup')}
          ${card('deepl', 'DeepL', 'https://www.deepl.com/pro#developer')}
        </div>`;

      const setStatus = (provider, html, color = 'var(--text-dim)') => {
        const s = el.querySelector(`.tprov-status[data-provider="${provider}"]`);
        if (s) s.innerHTML = `<span style="color:${color}">${html}</span>`;
      };

      el.querySelectorAll('.tprov-save').forEach(b => b.addEventListener('click', async () => {
        const provider = b.dataset.provider;
        const apiKey = el.querySelector(`.tprov-key[data-provider="${provider}"]`).value.trim();
        const monthlyLimit = parseInt(el.querySelector(`.tprov-limit[data-provider="${provider}"]`).value, 10) || 500000;
        const notes = el.querySelector(`.tprov-notes[data-provider="${provider}"]`).value.trim();
        if (!apiKey) { setStatus(provider, 'API key required', 'var(--red)'); return; }
        try {
          await Api.translationsUpsertProvider({ provider, apiKey, monthlyLimit, notes });
          Toast.success(`${provider} provider saved`);
          this._renderTranslationsProviders(el);
        } catch (err) { setStatus(provider, 'Failed: ' + err.message, 'var(--red)'); }
      }));
      el.querySelectorAll('.tprov-test').forEach(b => b.addEventListener('click', async () => {
        const provider = b.closest('.card').querySelector('.tprov-status').dataset.provider;
        setStatus(provider, '<i class="fas fa-spinner fa-spin" style="margin-right:4px"></i>Testing…');
        try {
          const r = await Api.translationsTestProvider(parseInt(b.dataset.id, 10));
          setStatus(provider, '<i class="fas fa-check-circle" style="color:var(--green);margin-right:4px"></i>Key valid', 'var(--green)');
        } catch (err) { setStatus(provider, '<i class="fas fa-times-circle" style="color:var(--red);margin-right:4px"></i>' + Utils.escapeHtml(err.message), 'var(--red)'); }
      }));
      el.querySelectorAll('.tprov-toggle').forEach(b => b.addEventListener('click', async () => {
        try {
          await Api.translationsPatchProvider(parseInt(b.dataset.id, 10), { isActive: b.dataset.active !== 'true' });
          this._renderTranslationsProviders(el);
        } catch (err) { Toast.error(err.message); }
      }));
      el.querySelectorAll('.tprov-delete').forEach(b => b.addEventListener('click', async () => {
        if (!confirm('Delete this provider? The API key will be forgotten. Usage history is preserved.')) return;
        try {
          await Api.translationsDeleteProvider(parseInt(b.dataset.id, 10));
          this._renderTranslationsProviders(el);
        } catch (err) { Toast.error(err.message); }
      }));
    } catch (err) {
      el.innerHTML = `<div class="empty-msg is-error">Failed: ${Utils.escapeHtml(err.message)}</div>`;
    }
  },

  async _renderTranslationsUsage(el) {
    el.innerHTML = `<div class="text-muted text-sm"><i class="fas fa-spinner fa-spin" style="margin-right:5px"></i>Loading…</div>`;
    try {
      const { usage, yearMonth } = await Api.translationsUsage();
      if (usage.length === 0) {
        el.innerHTML = `<div class="empty-msg"><i class="fas fa-info-circle"></i><p>No providers configured yet. Go to Providers tab to add Google or DeepL.</p></div>`;
        return;
      }
      const bar = (u) => {
        const warn = u.percent >= 80;
        const danger = u.percent >= 100;
        const color = danger ? 'var(--red)' : warn ? 'var(--yellow)' : 'var(--accent)';
        return `
          <div class="card" style="margin:0">
            <div class="card-header"><h3 style="margin:0">${Utils.escapeHtml(u.provider)}</h3>
              <span class="badge ${u.isActive ? 'badge-running' : 'badge-stopped'}" style="font-size:10px">${u.isActive ? 'active' : 'disabled'}</span>
            </div>
            <div class="card-body">
              <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:6px">
                <span style="font-size:24px;font-weight:700;color:${color}">${u.used.toLocaleString()}</span>
                <span style="color:var(--text-dim)">/ ${u.limit.toLocaleString()} chars</span>
                <span style="margin-left:auto;font-size:12px;color:var(--text-dim)">${u.percent}%</span>
              </div>
              <div style="height:10px;background:var(--surface2);border-radius:5px;overflow:hidden">
                <div style="height:100%;width:${Math.min(100, u.percent)}%;background:${color};transition:width 0.3s"></div>
              </div>
              <div style="margin-top:8px;font-size:12px;color:var(--text-dim)">
                <i class="fas ${danger ? 'fa-exclamation-triangle' : warn ? 'fa-exclamation-circle' : 'fa-check-circle'}" style="color:${color};margin-right:4px"></i>
                ${danger ? 'Quota exceeded — translations will be refused until next month or limit bump' : warn ? `Only ${u.remaining.toLocaleString()} chars left this month` : `${u.remaining.toLocaleString()} chars remaining`}
              </div>
            </div>
          </div>`;
      };
      el.innerHTML = `
        <div style="margin-bottom:12px;font-size:13px"><i class="fas fa-calendar-alt" style="margin-right:6px"></i>Usage for <strong>${yearMonth}</strong> (resets on the 1st of next month)</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px">
          ${usage.map(bar).join('')}
        </div>`;
    } catch (err) {
      el.innerHTML = `<div class="empty-msg is-error">Failed: ${Utils.escapeHtml(err.message)}</div>`;
    }
  },

  async _renderTranslationsTranslate(el) {
    el.innerHTML = `<div class="text-muted text-sm"><i class="fas fa-spinner fa-spin" style="margin-right:5px"></i>Loading languages…</div>`;
    try {
      const [{ languages }, { providers }] = await Promise.all([
        Api.translationsLanguages(),
        Api.translationsProviders(),
      ]);
      const activeProviders = providers.filter(p => p.is_active);
      if (activeProviders.length === 0) {
        el.innerHTML = `<div class="empty-msg"><i class="fas fa-info-circle"></i><p>No active providers. Configure Google or DeepL in the Providers tab first.</p></div>`;
        return;
      }
      const nonEn = languages.filter(l => l.lang !== 'en');

      el.innerHTML = `
        <div class="card" style="margin-bottom:14px">
          <div class="card-body">
            <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
              <label style="font-size:13px">Language:</label>
              <select id="t-lang" style="padding:6px 10px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text)">
                ${nonEn.map(l => `<option value="${l.lang}">${l.lang.toUpperCase()} — ${l.missing} missing (${l.coverage}% covered)</option>`).join('')}
              </select>
              <label style="font-size:13px;margin-left:10px">Provider:</label>
              <select id="t-provider" style="padding:6px 10px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text)">
                ${activeProviders.map(p => `<option value="${p.provider}">${p.provider}</option>`).join('')}
              </select>
              <button class="btn btn-sm btn-primary" id="t-load-missing" style="margin-left:auto"><i class="fas fa-list" style="margin-right:4px"></i>Load missing keys</button>
            </div>
          </div>
        </div>
        <div id="t-missing-panel"></div>
      `;

      el.querySelector('#t-load-missing').addEventListener('click', async () => {
        const lang = el.querySelector('#t-lang').value;
        const panel = el.querySelector('#t-missing-panel');
        panel.innerHTML = `<div class="text-muted text-sm"><i class="fas fa-spinner fa-spin" style="margin-right:5px"></i>Loading missing keys…</div>`;
        try {
          const { missing } = await Api.translationsMissing(lang);
          if (missing.length === 0) {
            panel.innerHTML = `<div class="empty-msg"><i class="fas fa-check-circle" style="color:var(--green)"></i><p>No missing keys — <strong>${lang.toUpperCase()}</strong> is fully translated.</p></div>`;
            return;
          }
          const totalChars = missing.reduce((s, m) => s + (m.source_text || '').length, 0);
          panel.innerHTML = `
            <div style="margin-bottom:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
              <span class="text-sm"><strong>${missing.length}</strong> missing keys · ${totalChars.toLocaleString()} chars total</span>
              <label style="margin-left:auto;font-size:12px;cursor:pointer;display:flex;align-items:center;gap:4px" title="Skip the Review step — translations go live immediately. Turn off if you want to check each one before it ships.">
                <input type="checkbox" id="t-auto-accept" checked><span>Auto-accept (apply live)</span>
              </label>
              <button class="btn btn-sm btn-secondary" id="t-select-all">Select all</button>
              <button class="btn btn-sm btn-secondary" id="t-select-none">None</button>
              <button class="btn btn-sm btn-primary" id="t-translate"><i class="fas fa-language" style="margin-right:4px"></i>Translate selected</button>
            </div>
            <div id="t-progress" style="display:none;margin-bottom:10px;padding:10px;background:var(--bg-dim);border-radius:6px">
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;font-size:12px">
                <span id="t-progress-label"><i class="fas fa-spinner fa-spin" style="margin-right:6px"></i>Translating…</span>
                <span id="t-progress-stats" style="margin-left:auto;color:var(--text-dim)"></span>
                <button class="btn btn-xs btn-danger" id="t-cancel" title="Stop after current batch"><i class="fas fa-stop" style="margin-right:4px"></i>Cancel</button>
              </div>
              <div style="height:8px;background:var(--surface2);border-radius:4px;overflow:hidden">
                <div id="t-progress-bar" style="height:100%;width:0;background:var(--accent);transition:width 0.2s"></div>
              </div>
            </div>
            <table style="width:100%;border-collapse:collapse;font-size:12px">
              <thead><tr style="background:var(--bg-dim);border-bottom:1px solid var(--border)">
                <th style="padding:6px;width:30px"><input type="checkbox" id="t-check-all" checked></th>
                <th style="padding:6px;text-align:left">Key</th>
                <th style="padding:6px;text-align:left">English source</th>
                <th style="padding:6px;text-align:right;width:60px">Chars</th>
                <th style="padding:6px;text-align:left;width:120px">Cached</th>
              </tr></thead>
              <tbody>
              ${missing.map(m => `
                <tr style="border-bottom:1px solid var(--surface2)">
                  <td style="padding:6px"><input type="checkbox" class="t-key-cb" value="${Utils.escapeHtml(m.key)}" checked></td>
                  <td style="padding:6px;font-family:var(--mono);font-size:11px">${Utils.escapeHtml(m.key)}</td>
                  <td style="padding:6px">${Utils.escapeHtml(m.source_text)}</td>
                  <td style="padding:6px;text-align:right">${(m.source_text || '').length}</td>
                  <td style="padding:6px">${m.cached ? `<span class="badge" style="font-size:10px;background:rgba(74,222,128,0.15);color:var(--green)">${Utils.escapeHtml(m.cached.status)}</span>` : '<span class="text-muted">—</span>'}</td>
                </tr>`).join('')}
              </tbody>
            </table>`;

          // Master checkbox toggles all rows
          panel.querySelector('#t-check-all').addEventListener('change', (e) => {
            panel.querySelectorAll('.t-key-cb').forEach(cb => cb.checked = e.target.checked);
          });
          panel.querySelector('#t-select-all').addEventListener('click', () => {
            panel.querySelectorAll('.t-key-cb').forEach(cb => cb.checked = true);
            panel.querySelector('#t-check-all').checked = true;
          });
          panel.querySelector('#t-select-none').addEventListener('click', () => {
            panel.querySelectorAll('.t-key-cb').forEach(cb => cb.checked = false);
            panel.querySelector('#t-check-all').checked = false;
          });

          // v6.11.2: chunked batch translate with progress bar. No arbitrary UI cap —
          // internally sends 50 keys per API call (Google v2 + DeepL Free limit),
          // keeps going across batches until done, quota-exceeded, or user cancels.
          panel.querySelector('#t-translate').addEventListener('click', async () => {
            const selected = [...panel.querySelectorAll('.t-key-cb:checked')].map(cb => cb.value);
            if (selected.length === 0) { Toast.warning('Select at least one key'); return; }
            const provider = el.querySelector('#t-provider').value;
            const autoAccept = panel.querySelector('#t-auto-accept').checked;
            const btn = panel.querySelector('#t-translate');
            const progressEl = panel.querySelector('#t-progress');
            const progressBar = panel.querySelector('#t-progress-bar');
            const progressLabel = panel.querySelector('#t-progress-label');
            const progressStats = panel.querySelector('#t-progress-stats');
            const cancelBtn = panel.querySelector('#t-cancel');

            const BATCH_SIZE = 50;
            const batches = [];
            for (let i = 0; i < selected.length; i += BATCH_SIZE) batches.push(selected.slice(i, i + BATCH_SIZE));

            this._translationsCancelled = false;
            cancelBtn.onclick = () => { this._translationsCancelled = true; };

            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:4px"></i>Translating…';
            progressEl.style.display = '';

            let totalTranslated = 0;
            let totalChars = 0;
            let lastError = null;
            try {
              for (let i = 0; i < batches.length; i++) {
                if (this._translationsCancelled) break;
                const chunk = batches[i];
                progressLabel.innerHTML = `<i class="fas fa-spinner fa-spin" style="margin-right:6px"></i>Batch ${i + 1} of ${batches.length} (${chunk.length} keys)…`;
                progressStats.textContent = `${totalTranslated.toLocaleString()} / ${selected.length.toLocaleString()} translated · ${totalChars.toLocaleString()} chars used`;
                progressBar.style.width = `${Math.round((i / batches.length) * 100)}%`;
                try {
                  const r = await Api.translationsBatch({ provider, language: lang, keys: chunk, autoAccept });
                  totalTranslated += r.translated.length;
                  totalChars += r.chars;
                  // Apply live per batch if auto-accept so user sees UI updating
                  if (r.autoAccepted) await i18n.loadOverrides(lang);
                } catch (err) {
                  lastError = err;
                  break;  // stop on first failure (quota, network, etc.)
                }
              }
              progressBar.style.width = '100%';
              const label = this._translationsCancelled ? 'Cancelled' : lastError ? 'Stopped at error' : 'Done';
              progressLabel.innerHTML = `<i class="fas ${lastError ? 'fa-exclamation-triangle' : 'fa-check-circle'}" style="color:${lastError ? 'var(--red)' : 'var(--green)'};margin-right:6px"></i>${label}`;
              progressStats.textContent = `${totalTranslated.toLocaleString()} / ${selected.length.toLocaleString()} translated · ${totalChars.toLocaleString()} chars used`;
              cancelBtn.style.display = 'none';

              if (lastError) {
                Toast.error(lastError.message);
              } else if (totalTranslated > 0) {
                const live = autoAccept ? ' — live now' : '. Review in the Review tab.';
                Toast.success(`Translated ${totalTranslated} keys (${totalChars.toLocaleString()} chars via ${provider})${live}`);
              }

              // After 2s, if no error, jump to Review tab so user can see results
              if (!lastError && !this._translationsCancelled && totalTranslated > 0) {
                setTimeout(() => {
                  this._tTab = 'review';
                  this._renderTranslations(document.getElementById('sys-content'));
                }, 1500);
              }
            } finally {
              btn.disabled = false;
              btn.innerHTML = '<i class="fas fa-language" style="margin-right:4px"></i>Translate selected';
            }
          });
        } catch (err) { panel.innerHTML = `<div class="empty-msg is-error">Failed: ${Utils.escapeHtml(err.message)}</div>`; }
      });
    } catch (err) {
      el.innerHTML = `<div class="empty-msg is-error">Failed: ${Utils.escapeHtml(err.message)}</div>`;
    }
  },

  async _renderTranslationsReview(el) {
    el.innerHTML = `<div class="text-muted text-sm"><i class="fas fa-spinner fa-spin" style="margin-right:5px"></i>Loading…</div>`;
    try {
      const { languages } = await Api.translationsLanguages();
      const nonEn = languages.filter(l => l.lang !== 'en');
      if (!this._reviewLang) this._reviewLang = nonEn[0]?.lang || 'ro';
      if (!this._reviewStatus) this._reviewStatus = 'pending';

      const { items } = await Api.translationsList({ language: this._reviewLang, status: this._reviewStatus });

      el.innerHTML = `
        <div class="card" style="margin-bottom:14px">
          <div class="card-body">
            <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
              <label style="font-size:13px">Language:</label>
              <select id="r-lang" style="padding:6px 10px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text)">
                ${nonEn.map(l => `<option value="${l.lang}" ${l.lang === this._reviewLang ? 'selected' : ''}>${l.lang.toUpperCase()}</option>`).join('')}
              </select>
              <label style="font-size:13px;margin-left:10px">Status:</label>
              <select id="r-status" style="padding:6px 10px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text)">
                <option value="pending" ${this._reviewStatus === 'pending' ? 'selected' : ''}>Pending</option>
                <option value="accepted" ${this._reviewStatus === 'accepted' ? 'selected' : ''}>Accepted</option>
                <option value="rejected" ${this._reviewStatus === 'rejected' ? 'selected' : ''}>Rejected</option>
                <option value="applied" ${this._reviewStatus === 'applied' ? 'selected' : ''}>Applied</option>
              </select>
              <div style="margin-left:auto;display:flex;gap:6px;align-items:center">
                <span style="font-size:11px;color:var(--text-dim)">Accepted translations are live now — exports are optional for git contribution:</span>
                <a class="btn btn-sm btn-secondary" href="${Api.translationsExportUrl(this._reviewLang)}" download title="Download a merged ${this._reviewLang}.js file — useful if you want to commit to a forked source tree"><i class="fas fa-download" style="margin-right:4px"></i>Export ${this._reviewLang}.js</a>
              </div>
            </div>
          </div>
        </div>
        <div id="r-list">
          ${items.length === 0 ? '<div class="empty-msg"><i class="fas fa-info-circle"></i><p>No translations in this status.</p></div>' : `
            <table style="width:100%;border-collapse:collapse;font-size:12px">
              <thead><tr style="background:var(--bg-dim);border-bottom:1px solid var(--border)">
                <th style="padding:6px;text-align:left">Key</th>
                <th style="padding:6px;text-align:left">English</th>
                <th style="padding:6px;text-align:left">Translation</th>
                <th style="padding:6px;text-align:left;width:70px">Provider</th>
                <th style="width:160px"></th>
              </tr></thead>
              <tbody>
              ${items.map(it => `
                <tr style="border-bottom:1px solid var(--surface2)" data-id="${it.id}">
                  <td style="padding:6px;font-family:var(--mono);font-size:10px">${Utils.escapeHtml(it.key)}</td>
                  <td style="padding:6px">${Utils.escapeHtml(it.source_text)}</td>
                  <td style="padding:6px"><input type="text" class="r-edit" value="${Utils.escapeHtml(it.translated_text)}" style="width:100%;padding:4px;border:1px solid var(--border);border-radius:3px;background:var(--bg);color:var(--text);font-family:var(--mono);font-size:11px"></td>
                  <td style="padding:6px;font-size:10px;color:var(--text-dim)">${Utils.escapeHtml(it.provider)}</td>
                  <td style="padding:6px;text-align:right">
                    <button class="btn btn-xs btn-primary r-accept" title="Accept + save edits"><i class="fas fa-check"></i></button>
                    <button class="btn btn-xs btn-secondary r-reject" title="Reject"><i class="fas fa-times"></i></button>
                  </td>
                </tr>`).join('')}
              </tbody>
            </table>`}
        </div>
      `;

      const reload = () => this._renderTranslationsReview(el);
      el.querySelector('#r-lang').addEventListener('change', e => { this._reviewLang = e.target.value; reload(); });
      el.querySelector('#r-status').addEventListener('change', e => { this._reviewStatus = e.target.value; reload(); });
      // v6.11.1 removed the "Mark as applied" button; it was tied to the export
      // flow which is now optional. Leaving the orphan listener caused a null-ref
      // crash when the Review panel opened. Fixed in v6.11.2.
      el.querySelectorAll('.r-accept').forEach(b => b.addEventListener('click', async () => {
        const tr = b.closest('tr');
        const id = tr.dataset.id;
        const text = tr.querySelector('.r-edit').value;
        try {
          await Api.translationsPatch(id, { status: 'accepted', translated_text: text });
          // v6.11.1: Hot-reload i18n so the newly-accepted string is live immediately,
          // not on next page refresh. Keeps the "I clicked Accept; why isn't it changing?"
          // confusion away.
          await i18n.loadOverrides(this._reviewLang);
          reload();
        } catch (err) { Toast.error(err.message); }
      }));
      el.querySelectorAll('.r-reject').forEach(b => b.addEventListener('click', async () => {
        const id = b.closest('tr').dataset.id;
        try { await Api.translationsPatch(id, { status: 'rejected' }); reload(); }
        catch (err) { Toast.error(err.message); }
      }));
    } catch (err) {
      el.innerHTML = `<div class="empty-msg is-error">Failed: ${Utils.escapeHtml(err.message)}</div>`;
    }
  },

  destroy() {
    Object.values(this._charts).forEach(c => c.destroy());
    this._charts = {};
  },
};

window.SystemPage = SystemPage;
