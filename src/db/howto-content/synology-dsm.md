---
title: Connect Docker Dash to Synology DSM (Container Manager)
summary: 'Step-by-step: enable SSH on DSM, add your user to the docker group, and point Docker Dash at your Synology NAS. Container Manager is rebranded Docker — no custom API needed.'
category: multi-host
difficulty: beginner
icon: fas fa-hdd
---

<h2>What you need</h2>
<ul>
  <li>Synology DSM 7.0 or later (tested on DSM 7.2)</li>
  <li>Container Manager package installed (it's Docker under the hood)</li>
  <li>A DSM admin account</li>
  <li>Docker Dash running somewhere reachable from your NAS (or vice versa)</li>
</ul>

<h2>Step 1: Enable SSH on DSM</h2>
<ol>
  <li>Log into DSM as admin</li>
  <li>Go to <strong>Control Panel → Terminal &amp; SNMP → Terminal</strong></li>
  <li>Check <strong>Enable SSH service</strong></li>
  <li>Leave port at <code>22</code> (default) or change if you have another service using it</li>
  <li>Click <strong>Apply</strong></li>
</ol>

<h2>Step 2: Add your user to the docker group</h2>
<p>Container Manager creates a <code>docker</code> group automatically. Your DSM user must be in it to access the socket without <code>sudo</code>.</p>
<p>SSH into the NAS (from any terminal):</p>
<pre><code>ssh your-admin-user@synology.local</code></pre>
<p>Then add yourself to the group (run as root, which requires DSM's admin account):</p>
<pre><code>sudo synogroup --memberadd docker your-admin-user
# Log out and log back in for group membership to take effect
exit</code></pre>
<p>Verify:</p>
<pre><code>ssh your-admin-user@synology.local
groups  # should include "docker"
docker ps  # should list running containers without sudo</code></pre>

<h2>Step 3: Add the host in Docker Dash</h2>
<ol>
  <li>In Docker Dash: <strong>Multi-Host → Add Host</strong></li>
  <li>Connection type: <strong>SSH tunnel</strong></li>
  <li>Host: <code>synology.local</code> (or IP)</li>
  <li>Port: <code>22</code></li>
  <li>Username: your DSM admin</li>
  <li>Auth: password OR private key (recommended)</li>
  <li>Docker socket path: <code>/var/run/docker.sock</code> (default)</li>
  <li>Click <strong>Test connection</strong> — should show ✓</li>
  <li>Save</li>
</ol>

<h2>Step 4: Verify the badge</h2>
<p>Go to the Multi-Host page. Your Synology host should now show a <strong>Synology DSM</strong> badge with the version (e.g. <code>7.2-64570 Update 3</code>) above the OS line. If you see that, auto-detection works and you're done.</p>

<h2>Troubleshooting</h2>
<table style="width:100%;border-collapse:collapse;font-size:12px">
<tr><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Problem</th><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Fix</th></tr>
<tr><td style="padding:6px">"permission denied: /var/run/docker.sock"</td><td style="padding:6px">User not in <code>docker</code> group. Re-run step 2 and log out + in.</td></tr>
<tr><td style="padding:6px">SSH connects but Docker commands fail</td><td style="padding:6px">Container Manager might not be installed — install it from Package Center.</td></tr>
<tr><td style="padding:6px">"Connection refused"</td><td style="padding:6px">SSH service disabled. Re-enable in Control Panel → Terminal. Also check Synology firewall allows your Docker Dash IP.</td></tr>
<tr><td style="padding:6px">DSM 6.x</td><td style="padding:6px">DSM 6 is officially unsupported by Docker. Upgrade to DSM 7 or expect limitations.</td></tr>
</table>

<h2>What Docker Dash gives you on Synology</h2>
<ul>
  <li><strong>All features work</strong>: containers, stacks (compose), images, volumes, networks, stats, logs, terminal</li>
  <li><strong>v6.7 Outbound Filter</strong> works — great for locking down containers that shouldn't phone home</li>
  <li><strong>v6.6 Remediation Wizard</strong> works for local apply mode (needs <code>docker compose</code> CLI which Container Manager ships)</li>
  <li><strong>Security / CIS Benchmark</strong> scans the DSM Docker runtime directly</li>
</ul>

<h2>Why Container Manager ≠ custom integration</h2>
<p>Container Manager is a DSM-branded wrapper around Docker. The socket, the CLI, and the API are all standard. No proprietary API, no SDK, nothing. That's why Docker Dash works without platform-specific code — it's just Docker.</p>

