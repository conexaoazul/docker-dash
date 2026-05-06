/* ═══════════════════════════════════════════════════
   pages/settings-registries.js — Settings Registries tab
   Extracted from settings.js v8.2.x further-split.
   ═══════════════════════════════════════════════════ */
'use strict';

const SettingsPageRegistries = {
  async _renderRegistries(el) {
    try {
      const registries = await Api.getRegistries();
      el.innerHTML = `
        <div class="card">
          <div class="card-header">
            <h3><i class="fas fa-warehouse" style="margin-right:8px"></i>${i18n.t('pages.settings.registriesTitle')}</h3>
            <button class="btn btn-sm btn-primary" id="add-registry"><i class="fas fa-plus"></i> ${i18n.t('pages.settings.addRegistry')}</button>
          </div>
          <div class="card-body" style="padding:0">
            ${registries.length === 0 ? '<div class="empty-msg">' + i18n.t('pages.settings.noRegistries') + '</div>' : `
            <table class="data-table">
              <thead><tr><th style="text-align:left">Name</th><th>URL</th><th>Username</th><th>Last Used</th><th></th></tr></thead>
              <tbody>${registries.map(r => `
                <tr>
                  <td style="text-align:left"><strong>${Utils.escapeHtml(r.name)}</strong></td>
                  <td class="mono text-sm">${Utils.escapeHtml(r.url)}</td>
                  <td class="text-sm">${Utils.escapeHtml(r.username || '\u2014')}</td>
                  <td class="text-sm">${r.last_used_at ? Utils.timeAgo(r.last_used_at) : '\u2014'}</td>
                  <td>
                    <div class="action-btns">
                      <button class="action-btn" data-action="test-registry" data-reg-id="${r.id}" title="Test"><i class="fas fa-plug"></i></button>
                      <button class="action-btn" data-action="edit-registry" data-reg-id="${r.id}" title="Edit"><i class="fas fa-edit"></i></button>
                      <button class="action-btn danger" data-action="delete-registry" data-reg-id="${r.id}" title="Delete"><i class="fas fa-trash"></i></button>
                    </div>
                  </td>
                </tr>
              `).join('')}</tbody>
            </table>`}
          </div>
        </div>
      `;

      el.querySelector('#add-registry')?.addEventListener('click', () => this._addRegistryDialog());

      // Event delegation for registry action buttons
      el.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const regId = parseInt(btn.dataset.regId);
        if (btn.dataset.action === 'test-registry') this._testRegistry(regId);
        else if (btn.dataset.action === 'edit-registry') this._editRegistry(regId);
        else if (btn.dataset.action === 'delete-registry') this._deleteRegistry(regId);
      });
    } catch (err) {
      el.innerHTML = `<div class="empty-msg">Error: ${err.message}</div>`;
    }
  },

  async _addRegistryDialog() {
    const result = await Modal.form(`
      <div class="form-group"><label>Name</label><input type="text" id="reg-name" class="form-control" placeholder="My Registry"></div>
      <div class="form-group"><label>URL</label><input type="text" id="reg-url" class="form-control" placeholder="https://registry.example.com"></div>
      <div class="form-group"><label>Username (optional)</label><input type="text" id="reg-user" class="form-control"></div>
      <div class="form-group"><label>Password (optional)</label><input type="password" id="reg-pass" class="form-control"></div>
    `, {
      title: i18n.t('pages.settings.addRegistryTitle'),
      width: '450px',
      onSubmit: (content) => ({
        name: content.querySelector('#reg-name').value.trim(),
        url: content.querySelector('#reg-url').value.trim(),
        username: content.querySelector('#reg-user').value.trim(),
        password: content.querySelector('#reg-pass').value,
      }),
    });

    if (result && result.name && result.url) {
      try {
        await Api.createRegistry(result);
        Toast.success(i18n.t('pages.settings.registryAdded'));
        this._renderTab();
      } catch (err) { Toast.error(err.message); }
    }
  },

  async _testRegistry(id) {
    // Find the row in the table to show inline feedback
    const el = document.getElementById('settings-content');
    const row = el?.querySelector(`[data-action="test-registry"][data-reg-id="${id}"]`)?.closest('tr');
    const btn = el?.querySelector(`[data-action="test-registry"][data-reg-id="${id}"]`);
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }

    // Remove any previous result cell
    row?.querySelector('.test-result-cell')?.remove();

    try {
      // Test basic connectivity
      const result = await Api.testRegistry(id);

      // Attempt to fetch catalog to count repositories
      let repoInfo = '';
      let overallOk = result.ok;
      if (result.ok) {
        try {
          const repos = await Api.getRegistryCatalog(id);
          if (repos.length === 0) {
            overallOk = false;
            repoInfo = ' &mdash; 0 repositories (wrong URL, wrong credentials, or empty registry)';
          } else {
            repoInfo = ` &mdash; <strong>${repos.length}</strong> repositor${repos.length === 1 ? 'y' : 'ies'}`;
          }
        } catch {
          repoInfo = ' &mdash; catalog unavailable (private/restricted)';
        }
      }

      if (row) {
        const td = document.createElement('td');
        td.className = 'test-result-cell text-sm';
        td.colSpan = 1;
        if (overallOk) {
          td.innerHTML = `<span style="color:var(--green)"><i class="fas fa-check-circle"></i> Connected${repoInfo}</span>`;
        } else {
          const errMsg = result.ok ? repoInfo.replace(/^ &mdash; /, '') : Utils.escapeHtml(result.error || 'Failed');
          td.innerHTML = `<span style="color:var(--red)"><i class="fas fa-times-circle"></i> ${errMsg}</span>`;
        }
        // Insert before the actions column
        const actionsCell = row.querySelector('.action-btns')?.closest('td');
        row.insertBefore(td, actionsCell);
        setTimeout(() => td.remove(), 8000);
      } else {
        if (result.ok) Toast.success('Connected' + repoInfo.replace(/&mdash;/g, '—').replace(/<[^>]+>/g, ''));
        else Toast.error(result.error || 'Connection failed');
      }
    } catch (err) {
      if (row) {
        const td = document.createElement('td');
        td.className = 'test-result-cell text-sm';
        td.innerHTML = `<span style="color:var(--red)"><i class="fas fa-times-circle"></i> ${Utils.escapeHtml(err.message)}</span>`;
        const actionsCell = row.querySelector('.action-btns')?.closest('td');
        row.insertBefore(td, actionsCell);
        setTimeout(() => td.remove(), 8000);
      } else {
        Toast.error(err.message);
      }
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-plug"></i>'; }
    }
  },

  async _editRegistry(id) {
    // Load current registries to get data for this id
    let reg;
    try {
      const list = await Api.getRegistries();
      reg = list.find(r => r.id === id);
    } catch { reg = null; }
    if (!reg) { Toast.error('Registry not found'); return; }

    const result = await Modal.form(`
      <div class="form-group">
        <label>Name <span class="text-red">*</span></label>
        <input type="text" id="reg-name" class="form-control" value="${Utils.escapeHtml(reg.name)}">
      </div>
      <div class="form-group">
        <label>URL <span class="text-red">*</span></label>
        <input type="text" id="reg-url" class="form-control" value="${Utils.escapeHtml(reg.url)}">
      </div>
      <div class="form-group">
        <label>Username</label>
        <input type="text" id="reg-user" class="form-control" value="${Utils.escapeHtml(reg.username || '')}">
      </div>
      <div class="form-group">
        <label>Password</label>
        <input type="password" id="reg-pass" class="form-control" placeholder="Leave blank to keep current password" autocomplete="new-password">
        <small class="text-muted">Leave blank to keep the existing password unchanged.</small>
      </div>
    `, {
      title: `Edit Registry — ${Utils.escapeHtml(reg.name)}`,
      width: '450px',
      onSubmit: (content) => ({
        name: content.querySelector('#reg-name').value.trim(),
        url: content.querySelector('#reg-url').value.trim(),
        username: content.querySelector('#reg-user').value.trim(),
        password: content.querySelector('#reg-pass').value || undefined,
      }),
    });

    if (result && result.name && result.url) {
      try {
        await Api.updateRegistry(id, result);
        Toast.success(`Registry "${result.name}" updated`);
        this._renderTab();
      } catch (err) { Toast.error(err.message); }
    }
  },

  async _deleteRegistry(id) {
    const ok = await Modal.confirm(i18n.t('pages.settings.deleteRegistryConfirm'), { danger: true });
    if (!ok) return;
    try {
      await Api.deleteRegistry(id);
      Toast.success(i18n.t('pages.settings.registryDeleted'));
      this._renderTab();
    } catch (err) { Toast.error(err.message); }
  },

};

if (typeof window !== 'undefined') window.SettingsPageRegistries = SettingsPageRegistries;
