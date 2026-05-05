---
title: Enforce Outbound Allowlists with the Egress Filter
summary: Restrict which external hosts a container can reach. SNI-based allowlist, IMDS-always-blocked, audit-only mode for migration, emergency disable per policy. Sidecar + iptables architecture.
category: security
difficulty: intermediate
icon: fas fa-shield-alt
---

<h2>The threat model</h2>
<p>A compromised container's biggest weapon is unrestricted outbound. It can:</p>
<ul>
  <li><strong>Read cloud-role credentials</strong> from the IMDS endpoint (<code>169.254.169.254</code>) and pivot into AWS/GCP/Azure</li>
  <li><strong>Exfiltrate data</strong> to attacker-controlled hosts</li>
  <li><strong>Call home</strong> to a C2 server for persistence</li>
</ul>
<p>The Outbound Filter gives you a hostname allowlist per container or stack. Everything else is blocked. IMDS is blocked regardless of what the allowlist says — non-negotiable defense.</p>

<h2>Architecture</h2>
<p>Three moving parts:</p>
<ol>
  <li><strong>Sidecar</strong> (<code>docker-dash-egress-filter</code>, Go, ~2MB image): listens on port 29193, peeks TLS SNI or HTTP Host on each connection, checks the allowlist, forwards or resets. No TLS decryption.</li>
  <li><strong>Runner</strong> (inside Docker Dash): runs a short-lived <code>alpine/nftables</code> helper container with <code>NET_ADMIN</code> that installs nftables rules into the target container's netns, redirecting all non-DNS/non-RFC1918 TCP to the sidecar.</li>
  <li><strong>DB + UI</strong>: policy config, block log ingestion, per-policy apply/unapply via REST (<code>/api/egress-filter/...</code>).</li>
</ol>

<h2>Setup — two steps</h2>

<h3>1. Run the sidecar</h3>
<p>Build + run <code>docker-dash-egress-filter</code> from <code>docker/egress-filter/</code>:</p>
<pre><code>cd docker/egress-filter
docker build -t dd-egress-filter:v6.7 .
# policy.json is written by Docker Dash; create an empty placeholder first run
mkdir -p /data/egress-policy && echo '{"version":1,"mode":"enforce","allowlist":[],"updated_at":"2026-01-01T00:00:00Z"}' > /data/egress-policy/policy.json
docker run -d --name dd-egress-filter \
  -v /data/egress-policy/policy.json:/etc/dd-egress/policy.json \
  dd-egress-filter:v6.7</code></pre>

<h3>2. Configure Docker Dash</h3>
<p>Add two env vars to <code>docker-compose.yml</code>:</p>
<pre><code>services:
  app:
    environment:
      DD_EGRESS_SIDECAR_ENDPOINT: "172.17.0.5:29193"  # sidecar bridge IP:port
      DD_EGRESS_SIDECAR_NAME: "dd-egress-filter"       # defaults shown
      DD_EGRESS_BLOCKLOG_INGESTER: "1"                 # enables background deny log tailing</code></pre>
<p>Restart Docker Dash. The sidecar gets SIGHUP on every policy change automatically.</p>

<h2>Using the UI</h2>

<p>Go to <strong>System → Egress</strong>. You see:</p>
<ul>
  <li><strong>Audit overview</strong> (from v6.6.2) — which containers can reach internet + IMDS</li>
  <li><strong>Filter column</strong> — per row, either "Enable filter" button or an active-policy badge</li>
</ul>

<h3>Enable filter (first time)</h3>
<ol>
  <li>Click <strong>Enable filter</strong> on any row</li>
  <li>Pick a preset:
    <ul>
      <li><strong>Registry-only</strong> — Docker / npm / pypi / rubygems. For build containers + runtime images that only pull deps.</li>
      <li><strong>Registries + GitHub</strong> — above plus GitHub/GHCR. For CI-style workloads.</li>
      <li><strong>Lockdown</strong> — nothing. For batch jobs, databases, containers that shouldn't talk to the internet.</li>
      <li><strong>Audit-only</strong> — logs but doesn't block. <em>Use this first</em> during migration — run a day, check the deny log, THEN flip to <code>enforce</code>.</li>
      <li><strong>Custom</strong> — paste your own hostname list.</li>
    </ul>
  </li>
  <li>Review the allowlist preview</li>
  <li>Click <strong>Save &amp; apply</strong>. The filter is active within ~2 seconds.</li>
</ol>

<h3>Block log</h3>
<p>Click a row's chevron to expand. The deny log shows the last 25 attempts with hostname, port, and reason. Entries live in the <code>egress_block_log</code> DB table, retained 30 days / max 10k rows.</p>

<h3>Emergency disable</h3>
<p>Click the cog icon on any filtered row → <strong>Emergency disable</strong>. This unapplies the filter AND deletes the policy. Container regains full outbound in &lt;5 seconds. The action is audit-logged.</p>

<h2>What gets blocked (the invariants)</h2>
<table style="width:100%;border-collapse:collapse;font-size:12px">
<tr><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Destination</th><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Behavior</th></tr>
<tr><td style="padding:6px"><code>169.254.169.254</code>, <code>metadata.google.internal</code>, <code>169.254.170.2</code></td><td style="padding:6px"><strong>Always blocked</strong> — even if the user adds them to a custom allowlist. Defense in depth.</td></tr>
<tr><td style="padding:6px"><code>127.0.0.0/8</code> (loopback)</td><td style="padding:6px">Always allowed — never broken by the filter.</td></tr>
<tr><td style="padding:6px">Port 53 TCP/UDP (DNS)</td><td style="padding:6px">Always allowed — containers need name resolution.</td></tr>
<tr><td style="padding:6px">RFC1918 (<code>10/8</code>, <code>172.16/12</code>, <code>192.168/16</code>)</td><td style="padding:6px">Allowed — preserves service-to-service on Docker bridges. Tighten per-stack in a future release.</td></tr>
<tr><td style="padding:6px">Everything else</td><td style="padding:6px">Hostname extracted (SNI or HTTP Host), checked against allowlist. Wildcard support (<code>*.github.com</code>).</td></tr>
</table>

<h2>Audit-log events</h2>
<p>Every action is hash-chained in the audit log (System → Audit):</p>
<ul>
  <li><code>egress_policy_created</code> / <code>_updated</code> / <code>_applied</code> / <code>_unapplied</code></li>
  <li><code>egress_emergency_disable</code> — with reason</li>
</ul>

<h2>Common gotchas</h2>
<table style="width:100%;border-collapse:collapse;font-size:12px">
<tr><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Symptom</th><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Cause &amp; fix</th></tr>
<tr><td style="padding:6px">"Cannot apply filter to a container with NET_ADMIN"</td><td style="padding:6px">Container can modify its own iptables → bypass. Drop <code>NET_ADMIN</code> + <code>SYS_ADMIN</code> + <code>privileged</code> first via Remediation Wizard, then re-apply.</td></tr>
<tr><td style="padding:6px">"DD_EGRESS_SIDECAR_ENDPOINT not set"</td><td style="padding:6px">Set the env var on Docker Dash, restart. See Setup step 2.</td></tr>
<tr><td style="padding:6px">Container can't reach registries after apply</td><td style="padding:6px">Preset missing the registry hostname. Try <code>Audit-only</code> first, see what it would block, then refine.</td></tr>
<tr><td style="padding:6px">Block log is empty</td><td style="padding:6px">Either nothing's been attempted yet, OR the ingester isn't running (<code>DD_EGRESS_BLOCKLOG_INGESTER=1</code>).</td></tr>
<tr><td style="padding:6px">Stack apply aborted at "db" — failed precheck</td><td style="padding:6px">One container in the stack has NET_ADMIN/privileged. Whole-stack abort is deliberate — we refuse to create half-filtered stacks.</td></tr>
</table>

<h2>Per-container vs. per-stack</h2>
<p>Both scopes work. For a compose stack, the policy applies to every container with the matching <code>com.docker.compose.project</code> label. Apply is transactional: if one container fails precheck, the whole stack is refused. Mid-stream failures roll back already-applied containers.</p>

<h2>What's deliberately NOT in this release</h2>
<ul>
  <li><strong>TLS decryption</strong> — we never break the container's trust chain</li>
  <li><strong>Per-process filtering</strong> inside a container — one policy per container</li>
  <li><strong>Source-IP-routed per-container allowlists</strong> in the sidecar — today the sidecar runs a single aggregate policy (union of all active). If you need isolated per-container policies, run multiple named sidecars (dd-egress-filter-api, dd-egress-filter-db, etc.)</li>
  <li><strong>IPv6</strong> — IPv4 only this release</li>
</ul>

