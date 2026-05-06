/* ═══════════════════════════════════════════════════
   pages/settings-logforwarding.js — Settings Logforwarding tab
   Extracted from settings.js v8.2.x further-split.
   ═══════════════════════════════════════════════════ */
'use strict';

const SettingsPageLogforwarding = {
  async _renderLogForwarding(el) {
    try {
      const forwarders = await Api.get('/log-forwarders');
      el.innerHTML = `
        <div class="card">
          <div class="card-header">
            <h3><i class="fas fa-share-alt" style="margin-right:8px"></i>Log Forwarding</h3>
            <button class="btn btn-sm btn-primary" id="lf-create"><i class="fas fa-plus"></i> Add Forwarder</button>
          </div>
          <div class="card-body">
            <p class="text-muted mb-md">Forward container logs to external systems: Grafana Loki, Elasticsearch, HTTP webhooks, or Syslog.</p>
            ${forwarders.length === 0
              ? '<div class="empty-msg">No log forwarders configured.</div>'
              : `<table class="data-table">
                <thead><tr><th>Name</th><th>Type</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
                <tbody>${forwarders.map(f => `
                  <tr>
                    <td class="mono">${Utils.escapeHtml(f.name)}</td>
                    <td><span class="badge badge-info">${f.type}</span></td>
                    <td>${f.enabled ? '<span class="text-green">Enabled</span>' : '<span class="text-muted">Disabled</span>'}</td>
                    <td class="text-sm">${Utils.timeAgo(f.created_at)}</td>
                    <td>
                      <div class="action-btns">
                        <button class="action-btn" data-action="toggle-lf" data-id="${f.id}" data-enabled="${f.enabled}" title="${f.enabled ? 'Disable' : 'Enable'}"><i class="fas fa-${f.enabled ? 'pause' : 'play'}"></i></button>
                        <button class="action-btn" data-action="test-lf" data-id="${f.id}" title="Test"><i class="fas fa-vial"></i></button>
                        <button class="action-btn" data-action="edit-lf" data-id="${f.id}" title="Edit"><i class="fas fa-edit"></i></button>
                        <button class="action-btn danger" data-action="delete-lf" data-id="${f.id}" data-name="${Utils.escapeHtml(f.name)}" title="Delete"><i class="fas fa-trash"></i></button>
                      </div>
                    </td>
                  </tr>
                `).join('')}</tbody>
              </table>`}
          </div>
        </div>
      `;

      el.querySelector('#lf-create').addEventListener('click', async () => {
        const result = await Modal.form({
          title: 'Add Log Forwarder',
          fields: `
            <div class="form-group"><label>Name</label><input type="text" id="lf-name" class="form-control" required></div>
            <div class="form-group"><label>Type</label>
              <select id="lf-type" class="form-control">
                <option value="loki">Grafana Loki</option>
                <option value="elasticsearch">Elasticsearch</option>
                <option value="http">HTTP Webhook</option>
                <option value="syslog">Syslog</option>
              </select>
            </div>
            <div id="lf-config-fields">
              <div class="form-group"><label>URL</label><input type="url" id="lf-url" class="form-control" placeholder="http://loki:3100" required></div>
            </div>
            <div class="form-group"><label>Custom Headers (JSON, optional)</label><input type="text" id="lf-headers" class="form-control" placeholder='{"X-Token": "abc"}'></div>
          `,
          onSubmit: (c) => {
            const type = c.querySelector('#lf-type').value;
            const cfg = {};
            if (type === 'syslog') {
              cfg.host = c.querySelector('#lf-url').value.trim();
              cfg.port = parseInt(c.querySelector('#lf-headers').value) || 514;
              cfg.protocol = 'udp';
            } else {
              cfg.url = c.querySelector('#lf-url').value.trim();
              try { cfg.headers = JSON.parse(c.querySelector('#lf-headers').value || '{}'); } catch { cfg.headers = {}; }
              if (type === 'elasticsearch') cfg.index = 'docker-dash-logs';
            }
            return { name: c.querySelector('#lf-name').value.trim(), type, config: cfg };
          },
        });
        if (result && result.name) {
          try {
            await Api.post('/log-forwarders', result);
            Toast.success('Log forwarder created');
            this._renderTab();
          } catch (err) { Toast.error(err.message); }
        }
      });

      el.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const id = parseInt(btn.dataset.id);

        if (btn.dataset.action === 'toggle-lf') {
          try {
            await Api.put('/log-forwarders/' + id, { enabled: btn.dataset.enabled !== '1' });
            Toast.success('Forwarder updated');
            this._renderTab();
          } catch (err) { Toast.error(err.message); }
        } else if (btn.dataset.action === 'test-lf') {
          try {
            Toast.info('Sending test log...');
            const result = await Api.post('/log-forwarders/' + id + '/test');
            Toast.success(result.message || 'Test successful');
          } catch (err) { Toast.error('Test failed: ' + err.message); }
        } else if (btn.dataset.action === 'edit-lf') {
          try {
            const fw = await Api.get('/log-forwarders/' + id);
            const isSyslog = fw.type === 'syslog';
            const result = await Modal.form({
              title: 'Edit Log Forwarder',
              fields: `
                <div class="form-group"><label>Name</label><input type="text" id="lf-name" class="form-control" value="${Utils.escapeHtml(fw.name)}" required></div>
                <div class="form-group"><label>Type</label><input type="text" class="form-control" value="${fw.type}" disabled></div>
                <div class="form-group"><label>${isSyslog ? 'Host' : 'URL'}</label><input type="text" id="lf-url" class="form-control" value="${Utils.escapeHtml(isSyslog ? (fw.config.host || '') : (fw.config.url || ''))}" required></div>
                <div class="form-group"><label>${isSyslog ? 'Port' : 'Headers (JSON)'}</label><input type="text" id="lf-extra" class="form-control" value="${Utils.escapeHtml(isSyslog ? String(fw.config.port || 514) : JSON.stringify(fw.config.headers || {}))}"></div>
              `,
              onSubmit: (c) => {
                const cfg = {};
                if (isSyslog) {
                  cfg.host = c.querySelector('#lf-url').value.trim();
                  cfg.port = parseInt(c.querySelector('#lf-extra').value) || 514;
                  cfg.protocol = fw.config.protocol || 'udp';
                } else {
                  cfg.url = c.querySelector('#lf-url').value.trim();
                  try { cfg.headers = JSON.parse(c.querySelector('#lf-extra').value || '{}'); } catch { cfg.headers = {}; }
                  if (fw.type === 'elasticsearch') cfg.index = fw.config.index || 'docker-dash-logs';
                }
                return { name: c.querySelector('#lf-name').value.trim(), config: cfg };
              },
            });
            if (result && result.name) {
              await Api.put('/log-forwarders/' + id, result);
              Toast.success('Forwarder updated');
              this._renderTab();
            }
          } catch (err) { Toast.error(err.message); }
        } else if (btn.dataset.action === 'delete-lf') {
          const ok = await Modal.confirm('Delete forwarder "' + btn.dataset.name + '"?', { danger: true });
          if (!ok) return;
          try {
            await Api.delete('/log-forwarders/' + id);
            Toast.success('Forwarder deleted');
            this._renderTab();
          } catch (err) { Toast.error(err.message); }
        }
      });
    } catch (err) {
      el.innerHTML = '<div class="empty-msg">Error: ' + err.message + '</div>';
    }
  },

};

if (typeof window !== 'undefined') window.SettingsPageLogforwarding = SettingsPageLogforwarding;
