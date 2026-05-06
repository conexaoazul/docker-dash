/* ═══════════════════════════════════════════════════
   pages/settings-workflows.js — Settings Workflows tab
   Extracted from settings.js v8.2.x further-split.
   ═══════════════════════════════════════════════════ */
'use strict';

const SettingsPageWorkflows = {
  async _renderWorkflows(el) {
    try {
      const [rules, templates] = await Promise.all([
        Api.getWorkflows(),
        Api.getWorkflowTemplates(),
      ]);

      const triggerIcons = {
        cpu_high: 'fa-microchip', mem_high: 'fa-memory', container_exit: 'fa-skull',
        container_unhealthy: 'fa-heartbeat', container_restart_loop: 'fa-redo',
        image_vulnerable: 'fa-shield-alt',
      };

      el.innerHTML = `
        <div class="card">
          <div class="card-header">
            <h3><i class="fas fa-cogs" style="margin-right:8px"></i>${i18n.t('pages.settings.workflowsTitle')}</h3>
            <div style="display:flex;gap:8px">
              <button class="btn btn-sm btn-secondary" id="wf-templates"><i class="fas fa-magic"></i> ${i18n.t('pages.settings.fromTemplate')}</button>
              <button class="btn btn-sm btn-primary" id="wf-create"><i class="fas fa-plus"></i> ${i18n.t('pages.settings.newRule')}</button>
            </div>
          </div>
          <div class="card-body" style="padding:0">
            ${rules.length === 0 ? '<div class="empty-msg">' + i18n.t('pages.settings.noWorkflows') + '</div>' : `
            <table class="data-table">
              <thead><tr><th style="text-align:left">Name</th><th>Trigger</th><th>Action</th><th>Target</th><th>Fired</th><th>Status</th><th></th></tr></thead>
              <tbody>${rules.map(r => `
                <tr>
                  <td style="text-align:left"><strong>${Utils.escapeHtml(r.name)}</strong>${r.description ? `<div class="text-sm text-muted">${Utils.escapeHtml(r.description)}</div>` : ''}</td>
                  <td><i class="fas ${triggerIcons[r.trigger_type] || 'fa-bolt'}" style="margin-right:4px;color:var(--accent)"></i><span class="badge badge-info" style="font-size:10px">${r.trigger_type}</span></td>
                  <td><span class="badge" style="font-size:10px">${r.action_type}</span></td>
                  <td class="mono text-sm">${r.target === '*' ? 'All' : Utils.escapeHtml(r.target)}</td>
                  <td>${r.trigger_count}x</td>
                  <td>${r.is_active ? '<span class="text-green">Active</span>' : '<span class="text-muted">Disabled</span>'}</td>
                  <td>
                    <div class="action-btns">
                      <button class="action-btn" data-action="toggle-wf" data-id="${r.id}" data-active="${r.is_active}" title="${r.is_active ? 'Disable' : 'Enable'}"><i class="fas fa-${r.is_active ? 'pause' : 'play'}"></i></button>
                      <button class="action-btn danger" data-action="delete-wf" data-id="${r.id}" title="Delete"><i class="fas fa-trash"></i></button>
                    </div>
                  </td>
                </tr>
              `).join('')}</tbody>
            </table>`}
          </div>
        </div>
      `;

      // Templates button
      el.querySelector('#wf-templates')?.addEventListener('click', async () => {
        const html = templates.map(t => `
          <div class="card" style="margin-bottom:8px;cursor:pointer" data-tpl='${JSON.stringify(t).replace(/'/g, "&#39;")}'>
            <div class="card-body" style="padding:12px;display:flex;justify-content:space-between;align-items:center">
              <div>
                <strong>${Utils.escapeHtml(t.name)}</strong>
                <div class="text-sm text-muted">${Utils.escapeHtml(t.description)}</div>
              </div>
              <button class="btn btn-sm btn-primary">Use</button>
            </div>
          </div>
        `).join('');

        Modal.open(`
          <div class="modal-header"><h3>${i18n.t('pages.settings.workflowTemplatesTitle')}</h3><button class="modal-close-btn" id="wf-tpl-close-x"><i class="fas fa-times"></i></button></div>
          <div class="modal-body">${html}</div>
        `, { width: '500px' });

        Modal._content.querySelector('#wf-tpl-close-x').addEventListener('click', () => Modal.close());

        Modal._content.querySelectorAll('[data-tpl]').forEach(card => {
          card.querySelector('.btn')?.addEventListener('click', async () => {
            const tpl = JSON.parse(card.dataset.tpl);
            try {
              await Api.createWorkflow({ ...tpl, target: '*' });
              Toast.success(i18n.t('pages.settings.workflowCreated'));
              Modal.close();
              this._renderTab();
            } catch (err) { Toast.error(err.message); }
          });
        });
      });

      // Create custom rule
      el.querySelector('#wf-create')?.addEventListener('click', async () => {
        const result = await Modal.form(`
          <div class="form-group"><label>Name *</label><input type="text" id="wf-name" class="form-control" required></div>
          <div class="form-group"><label>Description</label><input type="text" id="wf-desc" class="form-control"></div>
          <div class="form-group"><label>Trigger</label>
            <select id="wf-trigger" class="form-control">
              <option value="cpu_high">CPU High (&gt; threshold %)</option>
              <option value="mem_high">Memory High (&gt; threshold %)</option>
              <option value="container_exit">Container Crash (non-zero exit)</option>
              <option value="container_unhealthy">Health Check Failed</option>
              <option value="container_restart_loop">Restart Loop (&gt; N restarts)</option>
            </select>
          </div>
          <div class="form-group"><label>Action</label>
            <select id="wf-action" class="form-control">
              <option value="notify">Notify (all channels)</option>
              <option value="restart">Restart Container</option>
              <option value="stop">Stop Container</option>
            </select>
          </div>
          <div class="form-group"><label>Target Container</label><input type="text" id="wf-target" class="form-control" value="*" placeholder="* = all, or container name"></div>
          <div class="form-group"><label>Cooldown (seconds)</label><input type="number" id="wf-cooldown" class="form-control" value="300" min="60"></div>
        `, {
          title: i18n.t('pages.settings.newWorkflowTitle'), width: '480px',
          onSubmit: (c) => ({
            name: c.querySelector('#wf-name').value.trim(),
            description: c.querySelector('#wf-desc').value.trim(),
            trigger_type: c.querySelector('#wf-trigger').value,
            action_type: c.querySelector('#wf-action').value,
            target: c.querySelector('#wf-target').value.trim() || '*',
            cooldown_seconds: parseInt(c.querySelector('#wf-cooldown').value) || 300,
            trigger_config: {},
            action_config: {},
          }),
        });
        if (result && result.name) {
          try {
            await Api.createWorkflow(result);
            Toast.success(i18n.t('pages.settings.workflowCreated'));
            this._renderTab();
          } catch (err) { Toast.error(err.message); }
        }
      });

      // Toggle + delete
      el.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const id = parseInt(btn.dataset.id);
        if (btn.dataset.action === 'toggle-wf') {
          await Api.updateWorkflow(id, { is_active: btn.dataset.active !== '1' });
          Toast.success(i18n.t('pages.settings.workflowUpdated'));
          this._renderTab();
        } else if (btn.dataset.action === 'delete-wf') {
          const ok = await Modal.confirm(i18n.t('pages.settings.deleteWorkflowConfirm'), { danger: true });
          if (!ok) return;
          await Api.deleteWorkflow(id);
          Toast.success(i18n.t('pages.settings.workflowDeleted'));
          this._renderTab();
        }
      });
    } catch (err) {
      el.innerHTML = `<div class="empty-msg">Error: ${err.message}</div>`;
    }
  },

  // ─── Secrets Vault Tab ───────────────────────────────────
};

if (typeof window !== 'undefined') window.SettingsPageWorkflows = SettingsPageWorkflows;
