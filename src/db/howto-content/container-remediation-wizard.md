---
title: Remediate Container Security Issues via the Wizard
summary: Fix common Docker security issues (privileged mode, missing limits, plain-text secrets, etc.) in 3 clicks with a dry-run preview, auto-rollback on failure, and an option to open a Git PR instead of applying live.
category: security
difficulty: intermediate
icon: fas fa-tools
---

<h2>What the wizard does</h2>
<p>The Remediation Wizard turns the existing Secrets Audit and CIS Benchmark findings into <strong>actionable fixes</strong>. You pick findings → see a YAML diff of the compose file + the exact CLI commands → apply live (with auto-rollback on failure) OR open a Git PR for review.</p>

<h2>When to use</h2>
<ul>
  <li>You ran the Secrets Audit (System → Secrets → Audit & Wizard) and see containers with issues → click the <strong>Fix</strong> button on that row</li>
  <li>A whole stack has multiple containers with recurring issues → click the <strong>cubes</strong> icon to fix the stack in one flow</li>
  <li>You want to review changes in Git before applying — use the <strong>Generate Git PR</strong> mode</li>
</ul>

<h2>The 20-entry remediation catalog</h2>
<p>Every fix maps to a known-good remediation. 4 of them apply <strong>live (zero downtime)</strong> via <code>docker update</code>:</p>
<ul>
  <li>Memory limit (CIS 5.10)</li>
  <li>CPU limit (CIS 5.11)</li>
  <li>PIDs limit</li>
  <li>Restart policy</li>
</ul>
<p>The other 16 require container recreation. The wizard shows the estimated downtime per finding and the total.</p>

<h2>3-step flow</h2>
<h3>Step 1 — Scope & findings</h3>
<p>Shows every applicable finding with severity badge (critical / warn / info) and "RECREATE" or "LIVE" badge. Critical + warn findings pre-selected by default. Info findings hidden by default — toggle "Show info severity" to review them.</p>

<h3>Step 2 — Preview diff</h3>
<p>Per container, an expandable section shows:</p>
<ul>
  <li><strong>Live update commands</strong> (if any) — zero downtime <code>docker update ...</code> calls</li>
  <li><strong>Compose YAML diff</strong> — GitHub-style red/green with line numbers, showing exactly what will change in the compose file on disk</li>
  <li><strong>Findings applied</strong> — with per-finding risk notes (e.g., "HIGH RISK: read_only: true can break apps that write outside tmpfs")</li>
</ul>

<h3>Step 3 — Apply</h3>
<p>Three modes:</p>
<ol>
  <li><strong>Apply live + recreate</strong> (default) — run live updates first, then recreate containers in <code>depends_on</code> order. Health check per container. <strong>Auto-rollback</strong> if any container fails health check (restores pre-apply compose file + re-recreates).</li>
  <li><strong>Generate Git PR</strong> (only for git-backed stacks) — clone repo, create branch <code>docker-dash/remediate-&lt;planId&gt;</code>, apply compose diff, commit, push. Does NOT touch running containers. The webhook auto-pull takes over when the PR is merged. Safest option.</li>
  <li><strong>Download patch</strong> (always available) — export a <code>.patch</code> file + shell script. Apply manually later. Escape hatch for offline / air-gapped setups.</li>
</ol>

<h2>Auto-rollback window</h2>
<p>After a successful apply, a <strong>60-second rollback window</strong> opens. The UI shows a "Rollback" button that restores the pre-apply compose file + re-recreates the containers. After 60 seconds, the window closes and rollback is no longer available via UI (you'd need to restore from a backup).</p>

<h2>What gets audit-logged</h2>
<p>Every action is hash-chained in the audit log (System → Audit):</p>
<ul>
  <li><code>remediate_plan</code> — plan generated, with scope + finding codes</li>
  <li><code>remediate_apply_start</code> — job started with plan SHA</li>
  <li><code>remediate_apply_success</code> / <code>_failed</code> / <code>_rolled_back</code></li>
  <li><code>remediate_pr_created</code> — branch + PR URL</li>
</ul>

<h2>Common errors and fixes</h2>
<table style="width:100%;border-collapse:collapse;font-size:12px">
<tr><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Error</th><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Cause</th><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Fix</th></tr>
<tr><td style="padding:6px">"Service failed health check: crash_loop"</td><td style="padding:6px">Fix broke the container — e.g., <code>read_only: true</code> on a container that writes outside tmpfs</td><td style="padding:6px">Auto-rollback ran. Review the YAML diff to identify which change. Re-run with fewer findings selected, or use Git-PR mode to test in a branch.</td></tr>
<tr><td style="padding:6px">"A remediation is already in progress"</td><td style="padding:6px">Concurrent job on same container / stack</td><td style="padding:6px">Wait for the other job to finish (view /api/remediate/jobs). One job per scope at a time.</td></tr>
<tr><td style="padding:6px">"Service 'X' not found in compose file"</td><td style="padding:6px">Compose labels point to a file that was edited manually</td><td style="padding:6px">Ensure the service name in compose matches the container label. Use artifact mode if compose has drifted.</td></tr>
<tr><td style="padding:6px">"Git-PR mode requires exactly one stack"</td><td style="padding:6px">Tried to PR a mix of stacks</td><td style="padding:6px">PR one stack at a time.</td></tr>
</table>

<h2>Catalog coverage</h2>
<p>v6.6 ships 20 catalog entries covering CIS Docker Benchmark 5.3–5.31 + Secrets Audit's plain-text-env-secret finding. Community PRs welcome for more — the pattern is a 30-line module in <code>src/services/remediation-catalog.js</code>.</p>

<h2>What the wizard does NOT do (v6.6)</h2>
<ul>
  <li>Auto-apply without confirmation (no "Level 5" — too risky)</li>
  <li>Test the fix on a sandbox clone first (deferred to v6.7)</li>
  <li>AI-suggested image-specific fixes (v7+)</li>
  <li>Remote-host compose edits via SSH (v6.7; today local host only for Apply mode; Git-PR works for any host)</li>
</ul>

