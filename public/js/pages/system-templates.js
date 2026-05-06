/* ═══════════════════════════════════════════════════
   pages/system-templates.js — App templates tab
   Extracted from system.js v8.2.x further-split.
   2 methods: _renderTemplates / _templateFormDialog (47 built-ins +
   verified_at + deprecated_in_favor_of trust signals from migration 065).
   ═══════════════════════════════════════════════════ */
'use strict';

const SystemPageTemplates = {
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
        // v8.3.0-prep — verified / deprecated trust signals
        let trustBadge = '';
        if (t.deprecated_in_favor_of) {
          trustBadge = `<span class="badge badge-warning" style="font-size:9px;margin-left:6px" title="Deprecated — use '${Utils.escapeHtml(t.deprecated_in_favor_of)}' instead"><i class="fas fa-exclamation-triangle" style="margin-right:3px"></i>deprecated</span>`;
        } else if (t.verified_at) {
          const ageMs = Date.now() - new Date(t.verified_at).getTime();
          const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
          if (ageDays > 180) {
            trustBadge = `<span class="badge badge-warning" style="font-size:9px;margin-left:6px" title="Last verified ${ageDays} days ago — may be stale"><i class="fas fa-clock" style="margin-right:3px"></i>stale</span>`;
          } else {
            trustBadge = `<span class="badge badge-running" style="font-size:9px;margin-left:6px" title="Verified by maintainer on ${Utils.escapeHtml(t.verified_at)}"><i class="fas fa-check-circle" style="margin-right:3px"></i>verified</span>`;
          }
        }
        // Logo: show image with graceful fallback to FontAwesome icon
        const logoHtml = t.logoUrl
          ? `<img src="${Utils.escapeHtml(t.logoUrl)}" alt="${Utils.escapeHtml(t.name)}" style="width:28px;height:28px;object-fit:contain;flex-shrink:0" data-img-fallback>`
          + `<i class="${t.icon || 'fas fa-cube'}" style="display:none;font-size:18px;color:var(--accent)"></i>`
          : `<i class="${t.icon || 'fas fa-cube'}" style="font-size:18px;color:var(--accent)"></i>`;
        return `
          <div class="card tpl-card" data-id="${t.id}" data-cat="${Utils.escapeHtml((t.category || '').toLowerCase())}" data-name="${Utils.escapeHtml((t.name || '').toLowerCase())} ${Utils.escapeHtml((t.description || '').toLowerCase())}">
            <div class="card-header" style="gap:10px">
              <div style="display:flex;align-items:center;gap:8px;min-width:0">
                ${logoHtml}
                <h3 style="margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${Utils.escapeHtml(t.name)}${modifiedBadge}${customBadge}${trustBadge}</h3>
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
};

if (typeof window !== 'undefined') window.SystemPageTemplates = SystemPageTemplates;
