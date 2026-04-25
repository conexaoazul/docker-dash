/* ═══════════════════════════════════════════════════
   pages/registry-browse.js — Registry Browser (v7.5.0)

   Read-only catalog explorer for any configured Registry credential.
   Lists repositories, tags per repository, and on-demand manifest
   inspection (digest, size, layer count, content type).

   Delete is intentionally NOT here in v7.5.0 — it requires digest
   resolution + a confirmation gate (deleting a tag in production is a
   footgun) and ships in v7.6 if the workflow is needed.
   ═══════════════════════════════════════════════════ */
'use strict';

const RegistryBrowsePage = {
  _registries: [],
  _selectedId: null,
  _repos: [],
  _filter: '',
  _selectedRepo: null,
  _tags: [],

  async render(container) {
    container.innerHTML = `
      <div class="page-header">
        <h2><i class="fas fa-warehouse" style="color:var(--accent)"></i> Registry Browser</h2>
        <div class="page-actions">
          <select id="rb-registry" class="form-control form-control-sm" style="min-width:240px">
            <option value="">— Select a registry —</option>
          </select>
          <button class="btn btn-sm btn-secondary" id="rb-refresh" title="Refresh catalog"><i class="fas fa-sync-alt"></i></button>
          <a href="#/settings" class="btn btn-sm btn-secondary" title="Manage registry credentials" style="text-decoration:none"><i class="fas fa-cog"></i> Manage</a>
        </div>
      </div>

      <div id="rb-empty" style="display:none;text-align:center;padding:40px;color:var(--text-dim)">
        <i class="fas fa-warehouse" style="font-size:48px;margin-bottom:14px;opacity:0.3"></i>
        <p>No registries configured. Add one in <a href="#/settings" style="color:var(--accent)">Settings → Registries</a> first.</p>
        <p class="text-sm" style="margin-top:14px">Need a quick private registry? Deploy the <a href="#/templates" style="color:var(--accent)">Private Registry (Distribution) template</a>.</p>
      </div>

      <div id="rb-content" style="display:none;display:grid;grid-template-columns:minmax(280px, 380px) 1fr;gap:16px;align-items:start">
        <div class="card">
          <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;gap:8px">
            <h3 style="margin:0"><i class="fas fa-folder-tree"></i> Repositories <span class="text-muted text-sm" id="rb-repo-count"></span></h3>
            <input type="text" id="rb-filter" class="form-control form-control-sm" placeholder="Filter…" style="max-width:140px">
          </div>
          <div class="card-body" style="padding:0">
            <div id="rb-repos-list" style="max-height:60vh;overflow-y:auto"></div>
          </div>
        </div>

        <div id="rb-detail">
          <div class="card">
            <div class="card-body" style="text-align:center;padding:60px 20px;color:var(--text-dim)">
              <i class="fas fa-mouse-pointer" style="font-size:32px;margin-bottom:14px;opacity:0.3"></i>
              <p>Select a repository on the left to list its tags.</p>
            </div>
          </div>
        </div>
      </div>
    `;

    container.querySelector('#rb-registry').addEventListener('change', (e) => {
      this._selectedId = e.target.value || null;
      if (this._selectedId) {
        try { sessionStorage.setItem('rb_last_registry', this._selectedId); } catch {}
      }
      this._loadCatalog();
    });
    container.querySelector('#rb-refresh').addEventListener('click', () => this._loadCatalog());
    container.querySelector('#rb-filter').addEventListener('input', Utils.debounce((e) => {
      this._filter = e.target.value.trim().toLowerCase();
      this._renderRepos();
    }, 150));

    await this._loadRegistries();
  },

  async _loadRegistries() {
    try {
      this._registries = await Api.get('/registries');
    } catch (err) {
      Toast.error('Could not list registries: ' + err.message);
      return;
    }
    const sel = document.getElementById('rb-registry');
    const empty = document.getElementById('rb-empty');
    const content = document.getElementById('rb-content');
    if (!Array.isArray(this._registries) || this._registries.length === 0) {
      empty.style.display = 'block';
      content.style.display = 'none';
      return;
    }
    empty.style.display = 'none';
    content.style.display = 'grid';
    sel.innerHTML = '<option value="">— Select a registry —</option>' +
      this._registries.map(r => `<option value="${r.id}">${Utils.escapeHtml(r.name)} — ${Utils.escapeHtml(r.url)}</option>`).join('');

    // Restore last-selected from sessionStorage if present, else pick first
    let preferred = null;
    try { preferred = sessionStorage.getItem('rb_last_registry'); } catch {}
    if (preferred && this._registries.find(r => String(r.id) === preferred)) {
      sel.value = preferred;
      this._selectedId = preferred;
    } else if (this._registries.length === 1) {
      sel.value = String(this._registries[0].id);
      this._selectedId = String(this._registries[0].id);
    }
    if (this._selectedId) await this._loadCatalog();
  },

  async _loadCatalog() {
    if (!this._selectedId) return;
    const list = document.getElementById('rb-repos-list');
    list.innerHTML = `<div class="text-muted text-sm" style="padding:14px;text-align:center"><i class="fas fa-spinner fa-spin"></i> Loading…</div>`;
    try {
      this._repos = await Api.get(`/registries/${this._selectedId}/catalog`);
      this._renderRepos();
    } catch (err) {
      list.innerHTML = `<div class="text-muted text-sm" style="padding:14px;text-align:center;color:var(--red)"><i class="fas fa-exclamation-triangle"></i> ${Utils.escapeHtml(err.message)}</div>`;
    }
  },

  _renderRepos() {
    const list = document.getElementById('rb-repos-list');
    const count = document.getElementById('rb-repo-count');
    const filtered = this._filter
      ? this._repos.filter(r => r.toLowerCase().includes(this._filter))
      : this._repos;
    count.textContent = filtered.length === this._repos.length
      ? `(${this._repos.length})`
      : `(${filtered.length} / ${this._repos.length})`;
    if (filtered.length === 0) {
      list.innerHTML = `<div class="text-muted text-sm" style="padding:14px;text-align:center">No repositories${this._filter ? ' match the filter' : ''}.</div>`;
      return;
    }
    list.innerHTML = filtered.map(repo => `
      <div class="rb-repo-row" data-repo="${Utils.escapeHtml(repo)}" style="padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--border);font-family:'JetBrains Mono',monospace;font-size:12px;${this._selectedRepo === repo ? 'background:rgba(56,139,253,0.12);color:var(--accent)' : ''}">
        <i class="fas fa-folder" style="margin-right:6px;font-size:10px"></i>${Utils.escapeHtml(repo)}
      </div>
    `).join('');
    list.querySelectorAll('.rb-repo-row').forEach(el => {
      el.addEventListener('click', () => this._selectRepo(el.dataset.repo));
      el.addEventListener('mouseenter', () => { if (this._selectedRepo !== el.dataset.repo) el.style.background = 'var(--surface2)'; });
      el.addEventListener('mouseleave', () => { if (this._selectedRepo !== el.dataset.repo) el.style.background = ''; });
    });
  },

  async _selectRepo(repo) {
    this._selectedRepo = repo;
    this._renderRepos();
    const detail = document.getElementById('rb-detail');
    detail.innerHTML = `
      <div class="card">
        <div class="card-header"><h3><i class="fas fa-tags"></i> ${Utils.escapeHtml(repo)} — tags</h3></div>
        <div class="card-body" id="rb-tags-body">
          <div class="text-muted text-sm" style="text-align:center;padding:14px"><i class="fas fa-spinner fa-spin"></i> Loading tags…</div>
        </div>
      </div>
      <div class="card" style="margin-top:14px;display:none" id="rb-manifest-card">
        <div class="card-header"><h3><i class="fas fa-file-code"></i> Manifest <span id="rb-manifest-tag" style="color:var(--text-dim);font-weight:normal;font-size:13px;margin-left:6px"></span></h3></div>
        <div class="card-body" id="rb-manifest-body"></div>
      </div>
    `;
    try {
      this._tags = await Api.get(`/registries/${this._selectedId}/tags/${repo}`);
      this._renderTags(repo);
    } catch (err) {
      document.getElementById('rb-tags-body').innerHTML = `<div class="text-muted text-sm" style="text-align:center;padding:14px;color:var(--red)"><i class="fas fa-exclamation-triangle"></i> ${Utils.escapeHtml(err.message)}</div>`;
    }
  },

  _renderTags(repo) {
    const body = document.getElementById('rb-tags-body');
    if (!this._tags || this._tags.length === 0) {
      body.innerHTML = `<div class="text-muted text-sm" style="text-align:center;padding:14px">No tags found.</div>`;
      return;
    }
    body.innerHTML = `
      <div style="display:flex;flex-wrap:wrap;gap:6px;max-height:300px;overflow-y:auto">
        ${this._tags.map(tag => `
          <button class="rb-tag-btn badge" data-tag="${Utils.escapeHtml(tag)}" style="background:var(--surface2);color:var(--text);padding:5px 10px;border:none;border-radius:14px;cursor:pointer;font-family:'JetBrains Mono',monospace;font-size:11px">
            ${Utils.escapeHtml(tag)}
          </button>
        `).join('')}
      </div>
    `;
    body.querySelectorAll('.rb-tag-btn').forEach(btn => {
      btn.addEventListener('click', () => this._inspectManifest(repo, btn.dataset.tag));
    });
  },

  async _inspectManifest(repo, tag) {
    const card = document.getElementById('rb-manifest-card');
    const body = document.getElementById('rb-manifest-body');
    const titleTag = document.getElementById('rb-manifest-tag');
    card.style.display = 'block';
    titleTag.textContent = `${repo}:${tag}`;
    body.innerHTML = `<div class="text-muted text-sm" style="text-align:center;padding:14px"><i class="fas fa-spinner fa-spin"></i> Inspecting…</div>`;
    try {
      const data = await Api.get(`/registries/${this._selectedId}/manifest/${repo}:${tag}`);
      this._renderManifest(data, repo, tag);
    } catch (err) {
      body.innerHTML = `<div class="text-muted text-sm" style="text-align:center;padding:14px;color:var(--red)"><i class="fas fa-exclamation-triangle"></i> ${Utils.escapeHtml(err.message)}</div>`;
    }
  },

  _renderManifest(data, repo, tag) {
    const body = document.getElementById('rb-manifest-body');
    const m = data.manifest || {};
    // Detect format. Multi-arch indexes have "manifests" array; single-arch has "layers".
    const isIndex = Array.isArray(m.manifests);
    const layers = m.layers || [];
    const totalSize = layers.reduce((sum, l) => sum + (l.size || 0), 0);

    body.innerHTML = `
      <table class="info-table" style="width:100%">
        <tr><td>Digest</td><td><code style="font-family:'JetBrains Mono',monospace;font-size:11px">${Utils.escapeHtml(data.digest || 'unknown')}</code></td></tr>
        <tr><td>Content type</td><td><code style="font-family:'JetBrains Mono',monospace;font-size:11px">${Utils.escapeHtml(data.contentType || 'unknown')}</code></td></tr>
        <tr><td>Schema version</td><td>${m.schemaVersion || '?'}</td></tr>
        ${isIndex
          ? `<tr><td>Architectures</td><td>${m.manifests.map(mm => `<span class="badge badge-info" style="margin-right:4px">${Utils.escapeHtml((mm.platform?.os || '?') + '/' + (mm.platform?.architecture || '?'))}</span>`).join('')}</td></tr>`
          : `<tr><td>Layers</td><td>${layers.length} (${Utils.formatBytes(totalSize)} total)</td></tr>`}
      </table>
      ${!isIndex && layers.length > 0 ? `
        <details style="margin-top:14px">
          <summary style="cursor:pointer;font-size:13px;color:var(--accent);user-select:none"><i class="fas fa-layer-group"></i> Layer breakdown</summary>
          <div style="margin-top:8px;background:var(--bg-dim);padding:10px;border-radius:var(--radius-sm);max-height:240px;overflow-y:auto;font-family:'JetBrains Mono',monospace;font-size:11px">
            ${layers.map((l, i) => `
              <div style="display:flex;justify-content:space-between;padding:2px 0">
                <span><span class="text-muted">#${i + 1}</span> ${Utils.escapeHtml((l.digest || '').substring(0, 24))}</span>
                <span class="text-muted">${Utils.formatBytes(l.size || 0)}</span>
              </div>
            `).join('')}
          </div>
        </details>
      ` : ''}
      ${isIndex ? `
        <p class="text-sm text-muted" style="margin-top:10px">
          <i class="fas fa-info-circle" style="margin-right:4px"></i>
          This is a multi-architecture image index. Per-arch manifests can be inspected by clicking a digest below.
        </p>
        <div style="margin-top:10px">
          ${m.manifests.map(mm => `
            <div style="padding:6px 10px;background:var(--bg-dim);margin-bottom:4px;border-radius:var(--radius-sm);font-family:'JetBrains Mono',monospace;font-size:11px;display:flex;justify-content:space-between">
              <span>${Utils.escapeHtml((mm.platform?.os || '?') + '/' + (mm.platform?.architecture || '?'))}${mm.platform?.variant ? '/' + Utils.escapeHtml(mm.platform.variant) : ''}</span>
              <span class="text-muted">${Utils.escapeHtml((mm.digest || '').substring(0, 24))} · ${Utils.formatBytes(mm.size || 0)}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
      <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-sm" id="rb-copy-pull">
          <i class="fas fa-clipboard"></i> Copy pull command
        </button>
        ${window.App?.user?.role === 'admin' ? `
          <button class="btn btn-sm btn-danger" id="rb-delete-tag">
            <i class="fas fa-trash"></i> Delete this tag
          </button>
        ` : ''}
      </div>
    `;
    document.getElementById('rb-copy-pull')?.addEventListener('click', () => {
      const reg = this._registries.find(r => String(r.id) === String(this._selectedId));
      const host = reg ? new URL(reg.url).host : '';
      const cmd = `docker pull ${host}/${repo}:${tag}`;
      navigator.clipboard.writeText(cmd).then(
        () => Toast.success('Pull command copied'),
        () => Toast.error('Copy failed')
      );
    });
    document.getElementById('rb-delete-tag')?.addEventListener('click', () => {
      this._confirmDeleteTag(repo, tag, data.digest);
    });
  },

  // v7.6.0 — Delete-tag confirmation. Two-step: type the full repo:tag
  // string to confirm. Tag deletion is by-digest under the hood; the
  // server resolves it. Garbage collection of orphaned blobs is operator
  // responsibility (documented in modal footnote).
  _confirmDeleteTag(repo, tag, digest) {
    const fullRef = `${repo}:${tag}`;
    Modal.open(`
      <div class="modal-header">
        <h3 style="color:var(--red)"><i class="fas fa-exclamation-triangle" style="margin-right:10px"></i> Delete tag</h3>
        <button class="modal-close-btn" id="modal-x"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-body">
        <p>You are about to permanently delete the tag:</p>
        <div style="background:var(--bg-dim);padding:10px 12px;border-radius:var(--radius-sm);margin:10px 0;font-family:'JetBrains Mono',monospace;font-size:13px">
          <div>${Utils.escapeHtml(fullRef)}</div>
          <div class="text-muted text-sm" style="margin-top:4px;font-size:11px">${Utils.escapeHtml(digest || 'unknown digest')}</div>
        </div>
        <p class="text-sm text-muted">
          Anyone (or any CI job) currently pulling <code>${Utils.escapeHtml(fullRef)}</code> will fail until the tag is re-pushed.
          This action is audited.
        </p>
        <p class="text-sm" style="margin-top:14px">Type <code style="background:var(--bg-dim);padding:2px 6px;border-radius:3px;font-family:'JetBrains Mono',monospace">${Utils.escapeHtml(fullRef)}</code> to confirm:</p>
        <input type="text" id="rb-delete-confirm" class="form-control" autocomplete="off" placeholder="${Utils.escapeHtml(fullRef)}">
        <p class="text-sm text-muted" style="margin-top:14px;font-size:11px">
          <i class="fas fa-info-circle" style="margin-right:4px"></i>
          Manifest is removed immediately. Layer blobs are reclaimed when the operator runs <code>registry garbage-collect</code> on the host (Distribution doesn't auto-GC).
        </p>
      </div>
      <div class="modal-footer" style="display:flex;justify-content:flex-end;gap:8px">
        <button class="btn btn-sm" id="rb-delete-cancel">Cancel</button>
        <button class="btn btn-sm btn-danger" id="rb-delete-go" disabled><i class="fas fa-trash"></i> Delete tag</button>
      </div>
    `, { size: 'md' });

    const input = document.getElementById('rb-delete-confirm');
    const goBtn = document.getElementById('rb-delete-go');
    input.addEventListener('input', () => {
      goBtn.disabled = input.value.trim() !== fullRef;
    });
    document.getElementById('rb-delete-cancel').addEventListener('click', () => Modal.close());
    document.getElementById('modal-x').addEventListener('click', () => Modal.close());
    goBtn.addEventListener('click', async () => {
      goBtn.disabled = true;
      goBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting…';
      try {
        await Api.delete(`/registries/${this._selectedId}/tag/${fullRef}`);
        Modal.close();
        Toast.success(`Deleted ${fullRef}`);
        // Refresh the tag list — the deleted tag is gone, the manifest panel hides
        await this._selectRepo(repo);
      } catch (err) {
        Toast.error(err.message);
        goBtn.disabled = false;
        goBtn.innerHTML = '<i class="fas fa-trash"></i> Delete tag';
      }
    });
    setTimeout(() => input.focus(), 50);
  },

  destroy() {
    /* nothing to clean up */
  },
};

window.RegistryBrowsePage = RegistryBrowsePage;
