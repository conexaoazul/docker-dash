---
title: Audit Container Outbound Network Posture
summary: See which containers can reach the public internet and cloud-metadata endpoints (IMDS). Identify credential-theft risks from a compromised container. Read-only — enforcement arrives in v6.7.
category: security
difficulty: beginner
icon: fas fa-network-wired
---

<h2>What the audit shows</h2>
<p>Go to <strong>System → Egress</strong>. For each container on the host you see:</p>
<ul>
  <li><strong>Network mode</strong> — <code>bridge</code> (default), <code>host</code> (no isolation), <code>none</code> (fully isolated), <code>container:&lt;id&gt;</code> (shares another container's stack), or a user-defined network.</li>
  <li><strong>Attached networks</strong> with a badge for each: <code>[internal]</code> (safe — <code>--internal: true</code>, no outbound), <code>[bridge]</code> (routes outbound), or the driver name.</li>
  <li><strong>Reachability</strong> — "Isolated" / "Internet" / "Internet + IMDS".</li>
  <li><strong>Score</strong> (0-100) and a <strong>Risk</strong> badge (critical / warning / info).</li>
</ul>
<p>Click a row to expand the full finding list, extra_hosts entries, and custom DNS.</p>

<h2>Why IMDS matters</h2>
<p>Cloud providers run a metadata service at <code>169.254.169.254</code> (AWS, Azure, GCP) or <code>metadata.google.internal</code>. When a container can reach it and has been compromised (RCE, SSRF, supply-chain), the attacker can read <strong>IAM role credentials</strong> and pivot into the cloud account. Blocking this single IP at the container level eliminates the most common cloud-breakout path.</p>

<h2>What gets flagged</h2>
<table style="width:100%;border-collapse:collapse;font-size:12px">
<tr><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Severity</th><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Condition</th><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Impact</th></tr>
<tr><td style="padding:6px"><span style="color:#ef4444"><strong>critical</strong></span></td><td style="padding:6px"><code>network_mode: host</code></td><td style="padding:6px">No network isolation at all — the container shares the host's network namespace.</td></tr>
<tr><td style="padding:6px"><span style="color:#ef4444"><strong>critical</strong></span></td><td style="padding:6px"><code>extra_hosts</code> pins a name to an IMDS IP</td><td style="padding:6px">Explicit, intentional IMDS reach — almost never what you want.</td></tr>
<tr><td style="padding:6px"><span style="color:#f59e0b"><strong>warning</strong></span></td><td style="padding:6px">Any non-internal bridge network</td><td style="padding:6px">Container can reach the internet + IMDS. Fine for apps that need it, risk if they don't.</td></tr>
<tr><td style="padding:6px"><span style="color:#f59e0b"><strong>warning</strong></span></td><td style="padding:6px"><code>NET_ADMIN</code> or <code>NET_RAW</code> capability</td><td style="padding:6px">Container can manipulate the host's iptables / forge packets. Drop unless it's a VPN / proxy.</td></tr>
<tr><td style="padding:6px"><span style="color:#64748b"><strong>info</strong></span></td><td style="padding:6px">Custom DNS servers configured</td><td style="padding:6px">Worth a look — DNS is a common C2 channel.</td></tr>
</table>

<h2>How to mitigate (compose recipes)</h2>

<h3>1. Full network isolation (no outbound)</h3>
<p>For jobs that don't need outbound — batch workers, one-shot scripts, databases accessed only by other containers:</p>
<pre><code>services:
  my-db:
    image: postgres:16
    network_mode: none        # nuclear option, or:
    networks: [internal-net]  # per-network option (below)

networks:
  internal-net:
    driver: bridge
    internal: true            # &lt;&mdash; the key flag
</code></pre>

<h3>2. Tiered networks (app tier reaches internet, DB tier doesn't)</h3>
<pre><code>services:
  web:
    networks: [public, db]    # can reach internet + db
  api:
    networks: [public, db]
  db:
    networks: [db]            # no outbound — db tier only

networks:
  public:
    driver: bridge
  db:
    driver: bridge
    internal: true            # blocks outbound for anything on this net
</code></pre>

<h3>3. Block IMDS only (host-level iptables)</h3>
<p>If you can't restructure networks, block IMDS at the host level. On the Docker host:</p>
<pre><code>iptables -I DOCKER-USER -d 169.254.169.254 -j DROP
iptables -I DOCKER-USER -d 169.254.170.2 -j DROP  # ECS task role</code></pre>
<p>Persist with <code>iptables-persistent</code> / <code>nftables</code>. Test from a container: <code>docker run --rm alpine wget -T5 -q -O- 169.254.169.254</code> should fail.</p>

<h2>Score meaning</h2>
<ul>
  <li><strong>100</strong> — all networks internal or <code>network_mode: none</code>.</li>
  <li><strong>80–99</strong> — typical multi-net app with info-level findings only.</li>
  <li><strong>60–79</strong> — one warning (e.g., reachable internet + IMDS with no isolated alternative).</li>
  <li><strong>&lt;60</strong> — critical findings (<code>host</code> mode, IMDS pin via extra_hosts, multiple stacked issues).</li>
</ul>

<h2>What this audit does NOT do (yet)</h2>
<ul>
  <li><strong>No enforcement.</strong> This is a visibility tool. Blocking outbound traffic is planned for v6.7 (whitelist UI + optional squid sidecar + per-container iptables rules).</li>
  <li><strong>No live probe.</strong> The analysis is based on Docker config (network inspect + HostConfig). A host-level iptables rule that drops 169.254.169.254 is NOT detected — containers on a non-internal bridge will still flag as "IMDS reachable" even if you've blocked it at the host. Use <code>docker run --rm alpine wget -T2 -q -O- 169.254.169.254</code> to confirm effective blocking.</li>
  <li><strong>No recommendations per container.</strong> Fix suggestions are generic. Use the Container Remediation Wizard (v6.6.0) for applying individual container hardening.</li>
</ul>

<h2>How this fits with other audits</h2>
<ul>
  <li><strong>Secrets Audit</strong> — finds plain-text secrets inside the container. Egress Audit finds paths for them to leak out.</li>
  <li><strong>CIS Benchmark</strong> — scores against the Docker CIS 1.x benchmark. Egress Audit is a narrower, more actionable slice of "section 5: runtime".</li>
  <li><strong>Remediation Wizard</strong> — applies compose-level fixes. Not (yet) integrated with Egress findings — that's planned for v6.7 alongside the outbound filter.</li>
</ul>

