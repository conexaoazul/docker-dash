/* ═══════════════════════════════════════════════════
   components/remediate-wizard.js — Container Remediation Wizard (v6.6)

   3-step modal: scope & findings → preview diff → apply / PR / download
   Entry points: System.js, security.js, stacks.js, cis.js call
     RemediateWizard.open({ scope: {type, id/name, hostId}, findings? })

   Spec: docs/planning/v6.6/remediation-wizard/01-feature-spec.md §3
   ═══════════════════════════════════════════════════ */
'use strict';

const RemediateWizard = {
  /**
   * Open the wizard.
   * @param {object} args
   * @param {{type: 'container'|'stack', id?: string, name?: string, hostId?: number, displayName?: string}} args.scope
   * @param {string[]} [args.findings] - pre-selected catalog codes (optional; if absent, detected from scope)
   */
  async open({ scope, findings = null }) {
    const state = {
      step: 1,
      scope,
      allCodes: [],          // catalog metadata (codes[])
      selectedCodes: new Set(findings || []),
      plan: null,            // result of /plan
      mode: 'apply-local',
      jobId: null,
      jobStatus: null,
      jobOutput: '',
      pollTimer: null,
    };

    const cleanup = () => {
      if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; }
    };

    // ─── Render step 1 — scope & findings ─────────
    const renderStep1 = async () => {
      // Load catalog once
      if (state.allCodes.length === 0) {
        try {
          const r = await Api.remediateListCodes();
          state.allCodes = r.codes || [];
        } catch (err) { Toast.error('Could not load catalog: ' + err.message); return ''; }
      }

      // Run plan() to see what applies to this scope (using ALL codes)
      if (!state.plan) {
        try {
          const allCodes = state.allCodes.map(c => c.code);
          state.plan = await Api.remediatePlan({ scope: state.scope, findings: allCodes });
          // Pre-select all critical + warn from what applies
          if (state.selectedCodes.size === 0) {
            for (const step of state.plan.steps) {
              for (const f of step.findings) {
                if (f.severity === 'critical' || f.severity === 'warn') state.selectedCodes.add(f.code);
              }
            }
          }
        } catch (err) {
          return '<div class="empty-msg" style="color:var(--red)"><i class="fas fa-exclamation-triangle"></i> ' + Utils.escapeHtml(err.message) + '</div>';
        }
      }

      if (!state.plan.steps || state.plan.steps.length === 0) {
        return '<div class="empty-msg"><i class="fas fa-check-circle" style="color:var(--green);font-size:32px"></i><p>No applicable findings detected for this scope.</p><p class="text-muted text-sm">The target is already compliant with the catalog\'s 20 checks.</p></div>';
      }

      // Flatten findings across all steps with container context
      const rows = [];
      for (const step of state.plan.steps) {
        for (const f of step.findings) {
          rows.push({ ...f, containerName: step.containerName, containerId: step.containerId, requiresRecreation: step.requiresRecreation, estimatedDowntimeMs: step.estimatedDowntimeMs });
        }
      }

      const sevColor = { critical: 'var(--red)', warn: 'var(--yellow)', info: 'var(--text-dim)' };
      let html = '<div style="margin-bottom:12px;font-size:13px">'
        + '<strong>' + state.plan.steps.length + '</strong> container(s) in scope · '
        + '<strong>' + rows.length + '</strong> finding(s) · '
        + 'Estimated total downtime: <strong>' + (state.plan.totalDowntimeMs > 0 ? Math.round(state.plan.totalDowntimeMs / 1000) + 's' : '0s') + '</strong>'
        + (state.plan.gitBacked ? ' · <span style="color:var(--green)"><i class="fas fa-code-branch"></i> git-backed stack (PR mode available)</span>' : '')
        + '</div>';

      if (state.plan.warnings && state.plan.warnings.length) {
        html += '<div style="padding:8px 12px;background:var(--yellow)22;border-left:3px solid var(--yellow);margin-bottom:10px;font-size:12px">'
          + state.plan.warnings.map(w => '<div>⚠ ' + Utils.escapeHtml(w) + '</div>').join('')
          + '</div>';
      }

      html += '<div style="display:flex;gap:8px;margin-bottom:10px;font-size:12px">'
        + '<button class="btn btn-xs btn-secondary" id="rem-select-all">Select all</button>'
        + '<button class="btn btn-xs btn-secondary" id="rem-deselect-all">Deselect all</button>'
        + '<label style="margin-left:auto;display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" id="rem-show-info"> Show info severity</label>'
        + '</div>';

      html += '<div class="card" style="max-height:400px;overflow-y:auto"><table class="data-table compact"><thead><tr><th style="width:30px"></th><th>Finding</th><th>Container</th><th>Severity</th><th>Impact</th></tr></thead><tbody id="rem-findings-rows">';
      for (const r of rows) {
        const checked = state.selectedCodes.has(r.code) ? 'checked' : '';
        const show = r.severity !== 'info' ? '' : 'display:none';
        const downtime = r.requiresRecreation ? '<span class="badge" style="background:var(--yellow)22;color:var(--yellow);font-size:10px">RECREATE ~' + Math.round((r.estimatedDowntimeMs||3000)/1000) + 's</span>' : '<span class="badge" style="background:var(--green)22;color:var(--green);font-size:10px">LIVE 0s</span>';
        html += '<tr data-sev="' + r.severity + '" style="' + show + '">'
          + '<td><input type="checkbox" class="rem-finding-cb" data-code="' + Utils.escapeHtml(r.code) + '" data-container="' + Utils.escapeHtml(r.containerId) + '" ' + checked + '></td>'
          + '<td><div style="font-weight:600;font-size:12px">' + Utils.escapeHtml(r.title) + '</div><div class="text-xs text-muted">' + Utils.escapeHtml(r.code) + (r.cisRef ? ' · CIS ' + r.cisRef : '') + '</div></td>'
          + '<td class="text-sm">' + Utils.escapeHtml(r.containerName) + '</td>'
          + '<td><span class="badge" style="background:' + sevColor[r.severity] + '22;color:' + sevColor[r.severity] + ';font-size:10px">' + r.severity.toUpperCase() + '</span></td>'
          + '<td>' + downtime + '</td>'
          + '</tr>';
      }
      html += '</tbody></table></div>';
      return html;
    };

    // ─── Render step 2 — preview diff ─────────────
    const renderStep2 = () => {
      if (!state.plan) return '<div class="empty-msg">Plan not available</div>';

      const activeSteps = state.plan.steps.filter(s =>
        s.findings.some(f => state.selectedCodes.has(f.code))
      );

      if (activeSteps.length === 0) {
        return '<div class="empty-msg"><i class="fas fa-info-circle"></i><p>No findings selected.</p><p class="text-muted text-sm">Go back and select at least one finding.</p></div>';
      }

      let html = '<div style="margin-bottom:10px;font-size:13px">'
        + '<strong>' + activeSteps.length + '</strong> container(s) affected · '
        + '<strong>' + activeSteps.reduce((s, st) => s + (st.requiresRecreation ? 1 : 0), 0) + '</strong> recreate(s) · '
        + 'Estimated total downtime: <strong>' + Math.round(activeSteps.reduce((s, st) => s + (st.estimatedDowntimeMs || 0), 0) / 1000) + 's</strong>'
        + '</div>';

      for (const step of activeSteps) {
        const selectedFindings = step.findings.filter(f => state.selectedCodes.has(f.code));
        html += '<details open style="margin-bottom:12px"><summary style="padding:8px 10px;background:var(--surface2);border-radius:4px;cursor:pointer;font-weight:600">'
          + '<i class="fas fa-cube" style="margin-right:6px"></i>' + Utils.escapeHtml(step.containerName)
          + ' <span class="text-muted text-sm">(' + selectedFindings.length + ' fix' + (selectedFindings.length > 1 ? 'es' : '') + ')</span>'
          + '</summary>';

        // Live update commands
        if (step.liveUpdate) {
          html += '<div style="margin-top:8px"><strong>🔄 Live update (zero downtime):</strong><pre style="background:#111;color:#eee;padding:8px;border-radius:4px;font-size:11px;overflow-x:auto;margin:4px 0">' + Utils.escapeHtml(step.liveUpdate) + '</pre></div>';
        }

        // Compose diff
        if (step.diff) {
          const diffHtml = _renderDiff(step.diff);
          html += '<div style="margin-top:8px"><strong>📝 Compose file diff (' + Utils.escapeHtml(step.composeFile) + '):</strong>'
            + '<div style="background:#0d1117;color:#c9d1d9;padding:8px;border-radius:4px;font-family:var(--mono);font-size:11px;max-height:300px;overflow:auto;margin:4px 0">' + diffHtml + '</div></div>';
        } else if (!step.composeFileExists) {
          html += '<div style="margin-top:8px;padding:8px;background:var(--yellow)22;border-radius:4px;font-size:12px"><i class="fas fa-exclamation-triangle"></i> Compose file not found on disk — only live updates applicable</div>';
        }

        // Notes per finding
        html += '<div style="margin-top:8px"><strong>Findings applied:</strong><ul style="margin:4px 0;padding-left:20px;font-size:12px">';
        for (const f of selectedFindings) {
          const riskBadge = f.riskLevel === 'high' ? ' <span style="color:var(--red);font-size:10px">⚠ HIGH RISK</span>' : '';
          html += '<li><strong>' + Utils.escapeHtml(f.title) + '</strong>' + riskBadge + (f.notes ? '<div class="text-muted text-xs">' + Utils.escapeHtml(f.notes) + '</div>' : '') + (f.riskNotes ? '<div class="text-xs" style="color:var(--yellow)">↪ ' + Utils.escapeHtml(f.riskNotes) + '</div>' : '') + '</li>';
        }
        html += '</ul></div>';

        html += '</details>';
      }

      return html;
    };

    // ─── Render step 3 — apply mode + execution ────
    const renderStep3 = () => {
      if (state.jobId) {
        // Job running or finished
        const statusColor = state.jobStatus === 'success' ? 'var(--green)'
          : state.jobStatus === 'failed' ? 'var(--red)'
          : state.jobStatus === 'rolled_back' ? 'var(--yellow)' : 'var(--accent)';
        const statusIcon = state.jobStatus === 'success' ? 'check-circle'
          : state.jobStatus === 'failed' ? 'times-circle'
          : state.jobStatus === 'rolled_back' ? 'undo' : 'spinner fa-spin';

        let html = '<div style="text-align:center;padding:12px">'
          + '<i class="fas fa-' + statusIcon + '" style="font-size:42px;color:' + statusColor + '"></i>'
          + '<h3 style="margin:8px 0 4px">Job #' + state.jobId + '</h3>'
          + '<div style="color:' + statusColor + ';font-weight:600;text-transform:uppercase">' + (state.jobStatus || 'pending') + '</div>'
          + '</div>';

        if (state.jobOutput) {
          html += '<div style="background:#0d1117;color:#c9d1d9;padding:10px;border-radius:4px;font-family:var(--mono);font-size:11px;max-height:320px;overflow:auto;white-space:pre-wrap">' + Utils.escapeHtml(state.jobOutput) + '</div>';
        }

        // Rollback button if in success + within window
        if (state.jobStatus === 'success') {
          html += '<div style="margin-top:10px;text-align:center"><button class="btn btn-warning" id="rem-rollback"><i class="fas fa-undo"></i> Rollback (available for 60s)</button></div>';
        }

        return html;
      }

      // Confirmation summary
      const activeSteps = state.plan.steps.filter(s =>
        s.findings.some(f => state.selectedCodes.has(f.code))
      );
      const recreateCount = activeSteps.filter(s => s.requiresRecreation).length;

      return '<div class="card" style="border-left:4px solid var(--accent);margin-bottom:14px"><div class="card-body">'
        + '<h4 style="margin:0 0 10px"><i class="fas fa-clipboard-check" style="margin-right:6px"></i>Summary</h4>'
        + '<div style="font-size:13px;line-height:1.8">'
        + '<div>Containers affected: <strong>' + activeSteps.length + '</strong></div>'
        + '<div>Live updates (0 downtime): <strong>' + activeSteps.filter(s => s.liveUpdate && !s.requiresRecreation).length + '</strong></div>'
        + '<div>Recreates required: <strong>' + recreateCount + '</strong>' + (recreateCount > 0 ? ' <span class="text-muted">(~' + Math.round(activeSteps.reduce((s, st) => s + (st.estimatedDowntimeMs || 0), 0) / 1000) + 's downtime)</span>' : '') + '</div>'
        + (state.plan.gitBacked ? '<div style="color:var(--green);margin-top:6px"><i class="fas fa-code-branch"></i> Stack is git-backed — PR mode available</div>' : '')
        + '</div></div></div>'
        + '<h4 style="margin:0 0 8px">Choose apply mode:</h4>'
        + '<div style="display:flex;flex-direction:column;gap:8px">'
        + '<label style="display:flex;align-items:flex-start;gap:10px;padding:10px;border:2px solid ' + (state.mode === 'apply-local' ? 'var(--accent)' : 'var(--border)') + ';border-radius:6px;cursor:pointer">'
        + '<input type="radio" name="rem-mode" value="apply-local"' + (state.mode === 'apply-local' ? ' checked' : '') + '>'
        + '<div><strong><i class="fas fa-bolt" style="color:var(--accent)"></i> Apply live + recreate</strong>'
        + '<div class="text-sm text-muted">Run live updates first (zero downtime), then recreate containers in dependency order. Auto-rollback on health-check fail.</div></div></label>'
        + (state.plan.gitBacked ? '<label style="display:flex;align-items:flex-start;gap:10px;padding:10px;border:2px solid ' + (state.mode === 'pr' ? 'var(--accent)' : 'var(--border)') + ';border-radius:6px;cursor:pointer">'
          + '<input type="radio" name="rem-mode" value="pr"' + (state.mode === 'pr' ? ' checked' : '') + '>'
          + '<div><strong><i class="fas fa-code-branch" style="color:var(--green)"></i> Generate Git PR</strong>'
          + '<div class="text-sm text-muted">Commit the diff to a new branch and (if configured) open a PR. Does NOT touch running containers — the webhook auto-pull will apply on merge.</div></div></label>' : '')
        + '<label style="display:flex;align-items:flex-start;gap:10px;padding:10px;border:2px solid ' + (state.mode === 'artifact' ? 'var(--accent)' : 'var(--border)') + ';border-radius:6px;cursor:pointer">'
        + '<input type="radio" name="rem-mode" value="artifact"' + (state.mode === 'artifact' ? ' checked' : '') + '>'
        + '<div><strong><i class="fas fa-download" style="color:var(--text-dim)"></i> Download patch</strong>'
        + '<div class="text-sm text-muted">Export unified diff + shell script. Apply manually later (escape hatch for offline use).</div></div></label>'
        + '</div>';
    };

    // ─── Main render loop ─────────────────────────
    const render = async () => {
      const steps = ['Scope & findings', 'Preview diff', 'Apply'];
      const stepBar = '<div style="display:flex;gap:4px;margin-bottom:16px">' + steps.map((label, i) => {
        const num = i + 1;
        const active = num === state.step;
        const done = num < state.step;
        const color = done ? 'var(--green)' : active ? 'var(--accent)' : 'var(--surface3)';
        const textColor = active ? 'var(--text-bright)' : done ? 'var(--text)' : 'var(--text-dim)';
        return '<div style="flex:1;display:flex;align-items:center;gap:6px">'
          + '<span style="width:26px;height:26px;border-radius:50%;background:' + color + ';color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:600">' + (done ? '✓' : num) + '</span>'
          + '<span style="font-size:12px;color:' + textColor + ';font-weight:' + (active ? '700' : '500') + '">' + label + '</span>'
          + (num < steps.length ? '<span style="flex:1;height:1px;background:var(--border);margin:0 4px"></span>' : '')
          + '</div>';
      }).join('') + '</div>';

      const scopeLabel = state.scope.displayName || (state.scope.type === 'stack' ? 'stack: ' + state.scope.name : 'container: ' + (state.scope.id || '').substring(0, 12));

      let body;
      if (state.step === 1) body = await renderStep1();
      else if (state.step === 2) body = renderStep2();
      else body = renderStep3();

      const footer = '<div style="display:flex;justify-content:space-between;gap:8px;margin-top:16px;padding-top:12px;border-top:1px solid var(--border)">'
        + (state.step > 1 && !state.jobId ? '<button class="btn btn-secondary" id="rem-back"><i class="fas fa-arrow-left"></i> Back</button>' : '<div></div>')
        + '<div>'
        + (state.step < 3 ? '<button class="btn btn-primary" id="rem-next">Next <i class="fas fa-arrow-right"></i></button>'
          : (state.jobId == null ? '<button class="btn btn-primary" id="rem-execute"><i class="fas fa-rocket"></i> Execute</button>'
            : '<button class="btn btn-primary" id="rem-close-done">Close</button>'))
        + '</div></div>';

      Modal.open('<div class="modal-header"><h3><i class="fas fa-tools" style="margin-right:6px;color:var(--accent)"></i>Remediation Wizard — <span class="text-muted text-sm">' + Utils.escapeHtml(scopeLabel) + '</span></h3><button class="modal-close-btn" id="rem-close"><i class="fas fa-times"></i></button></div>'
        + '<div class="modal-body" style="max-height:78vh;overflow-y:auto">'
        + stepBar
        + body
        + footer
        + '</div>', { width: '900px', onClose: cleanup });

      const mc = Modal._content;
      mc.querySelector('#rem-close')?.addEventListener('click', () => { cleanup(); Modal.close(); });
      mc.querySelector('#rem-close-done')?.addEventListener('click', () => { cleanup(); Modal.close(); });
      mc.querySelector('#rem-back')?.addEventListener('click', () => { state.step--; render(); });

      // Step 1 handlers
      if (state.step === 1) {
        mc.querySelectorAll('.rem-finding-cb').forEach(cb => cb.addEventListener('change', (e) => {
          if (e.target.checked) state.selectedCodes.add(e.target.dataset.code);
          else state.selectedCodes.delete(e.target.dataset.code);
        }));
        mc.querySelector('#rem-select-all')?.addEventListener('click', () => {
          mc.querySelectorAll('.rem-finding-cb').forEach(cb => {
            if (cb.closest('tr').style.display !== 'none') {
              cb.checked = true; state.selectedCodes.add(cb.dataset.code);
            }
          });
        });
        mc.querySelector('#rem-deselect-all')?.addEventListener('click', () => {
          mc.querySelectorAll('.rem-finding-cb').forEach(cb => { cb.checked = false; state.selectedCodes.delete(cb.dataset.code); });
        });
        mc.querySelector('#rem-show-info')?.addEventListener('change', (e) => {
          mc.querySelectorAll('tr[data-sev="info"]').forEach(row => { row.style.display = e.target.checked ? '' : 'none'; });
        });
      }

      // Step 3 handlers
      if (state.step === 3) {
        mc.querySelectorAll('input[name="rem-mode"]').forEach(r => r.addEventListener('change', (e) => {
          state.mode = e.target.value; render();
        }));
        mc.querySelector('#rem-rollback')?.addEventListener('click', async () => {
          if (!confirm('Rollback job #' + state.jobId + '? This will restore pre-apply container state and may cause a brief outage.')) return;
          try {
            await Api.remediateRollback(state.jobId);
            state.jobStatus = 'rolled_back (in progress)';
            render();
            _startPoll();
          } catch (err) { Toast.error(err.message); }
        });
      }

      // Navigation buttons
      mc.querySelector('#rem-next')?.addEventListener('click', async () => {
        if (state.step === 1) {
          if (state.selectedCodes.size === 0) { Toast.warning('Select at least one finding'); return; }
          // Re-plan with only selected findings
          try {
            state.plan = await Api.remediatePlan({ scope: state.scope, findings: Array.from(state.selectedCodes) });
          } catch (err) { Toast.error(err.message); return; }
          state.step = 2; render();
        } else if (state.step === 2) {
          state.step = 3; render();
        }
      });

      mc.querySelector('#rem-execute')?.addEventListener('click', async () => {
        try {
          if (state.mode === 'artifact') {
            _downloadArtifact(state.plan);
            Toast.success('Patch downloaded');
            return;
          }
          const res = await Api.remediateApply({ plan: state.plan, mode: state.mode, scope: state.scope });
          state.jobId = res.jobId;
          state.jobStatus = 'pending';
          render();
          _startPoll();
        } catch (err) { Toast.error(err.message); }
      });
    };

    const _startPoll = () => {
      if (state.pollTimer) clearInterval(state.pollTimer);

      const onUpdate = (job) => {
        state.jobStatus = job.status;
        state.jobOutput = job.output || state.jobOutput;
        render();
        if (['success', 'failed', 'rolled_back'].includes(job.status)) {
          if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; }
          if (state.wsUnsub) { state.wsUnsub(); state.wsUnsub = null; }
          const msg = job.status === 'success' ? 'Remediation succeeded'
            : job.status === 'failed' ? 'Remediation failed: ' + (job.errorClass || job.error_class || 'unknown')
            : 'Rollback complete';
          (job.status === 'success' ? Toast.success : job.status === 'failed' ? Toast.error : Toast.warning)(msg);
        }
      };

      // WS-first: subscribe to per-job channel so user sees live progress text.
      if (typeof WS !== 'undefined' && WS.subscribe) {
        WS.subscribe(`remediate:job:${state.jobId}`);
        state.wsUnsub = WS.on('remediate:job:update', (data) => {
          if (data && Number(data.id) === Number(state.jobId)) onUpdate(data);
        });
      }
      // Fallback poll every 10s — safety net if WS drops.
      state.pollTimer = setInterval(async () => {
        try {
          const job = await Api.remediateJob(state.jobId);
          onUpdate(job);
        } catch (err) {
          state.jobOutput += '\n[poll error] ' + err.message;
          render();
        }
      }, 10000);
    };

    render();
  },
};

// ─── Helpers ─────────────────────────────────────

function _renderDiff(unifiedDiff) {
  if (!unifiedDiff) return '<em>(no diff)</em>';
  return unifiedDiff.split('\n').map(line => {
    if (line.startsWith('+++') || line.startsWith('---')) return '<div style="color:#8b949e">' + Utils.escapeHtml(line) + '</div>';
    if (line.startsWith('@@')) return '<div style="color:#d2a8ff">' + Utils.escapeHtml(line) + '</div>';
    if (line.startsWith('+')) return '<div style="color:#7ee787;background:#1f3a26">' + Utils.escapeHtml(line) + '</div>';
    if (line.startsWith('-')) return '<div style="color:#ffa198;background:#3a1e22">' + Utils.escapeHtml(line) + '</div>';
    return '<div>' + Utils.escapeHtml(line) + '</div>';
  }).join('');
}

function _downloadArtifact(plan) {
  let patch = '';
  let script = '#!/bin/bash\n# Docker Dash Remediation Patch\n# Generated: ' + new Date().toISOString() + '\nset -e\n\n';
  for (const step of plan.steps) {
    if (step.diff) patch += step.diff + '\n';
    if (step.liveUpdate) script += step.liveUpdate + '\n';
    if (step.composeFile && step.requiresRecreation) {
      script += `(cd "${step.composeFile.replace(/\/[^/]+$/, '')}" && docker compose up -d --no-deps --force-recreate ${step.serviceName})\n`;
    }
  }
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const blob = new Blob([patch + '\n\n---SHELL SCRIPT---\n\n' + script], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'remediate-' + ts + '.patch';
  a.click();
}

window.RemediateWizard = RemediateWizard;
