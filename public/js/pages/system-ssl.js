/* ═══════════════════════════════════════════════════
   pages/system-ssl.js — SSL/TLS + Certificates tab + LE Wizard
   Extracted from system.js v8.2.x further-split.
   Methods: _renderSsl / _renderCertificates / _showAddCertificateModal /
   _showCsrModal / _showAcmeRotateModal / _showLetsEncryptWizard.
   ═══════════════════════════════════════════════════ */
'use strict';

const SystemPageSsl = {
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

  // CIS Benchmark methods (_renderCisBenchmark + 2 helpers) live in
  // public/js/pages/system-cis.js — merged via Object.assign at file bottom.

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

  // CIS helpers (_cisContainerRemediation, _cisBenchmarkGuide) live in
  // public/js/pages/system-cis.js together with the main _renderCisBenchmark.

  // Egress methods (_renderEgressAudit, _loadEgressBlockLog, _renderEgressBlockLog,
  // _renderEgressBlockLogHeader, _exportEgressBlockLogCsv, _egressFilterEdit) live
  // in public/js/pages/system-egress.js — merged into SystemPage at module load via
  // Object.assign at the bottom of this file. v8.2.x post-audit split.
  // ─── v6.11.0: Translations tab (Google Translate + DeepL with quota tracking) ──
  // Translations methods (_renderTranslations + 4 sub-renders) live in
  // public/js/pages/system-translations.js — merged via Object.assign
  // at the bottom of this file. v8.2.x post-audit further-split.
};

if (typeof window !== 'undefined') window.SystemPageSsl = SystemPageSsl;
