---
title: Connect Docker Dash to OpenMediaVault (OMV)
summary: OMV is Debian + a NAS web UI. Install the official Docker plugin (omv-extras), enable SSH, and Docker Dash connects like any other Debian box.
category: multi-host
difficulty: beginner
icon: fas fa-server
---

<h2>What you need</h2>
<ul>
  <li>OpenMediaVault 6.x (Shaitan) or 7.x (Sandworm)</li>
  <li><a href="https://wiki.omv-extras.org/doku.php?id=omv7:omv_extras" target="_blank">omv-extras</a> installed (the community repo that adds the Docker plugin)</li>
  <li>The <strong>docker</strong> plugin installed via omv-extras</li>
  <li>An OMV admin account</li>
</ul>

<h2>Step 1: Install Docker via omv-extras</h2>
<p>OMV doesn't ship Docker in the core package. The community-maintained omv-extras repo provides it.</p>
<ol>
  <li>Install omv-extras following <a href="https://wiki.omv-extras.org/" target="_blank">its official guide</a> (one-line installer on the OMV shell)</li>
  <li>In the OMV web UI: <strong>System → omv-extras</strong></li>
  <li>Click <strong>Docker repo</strong> → <em>Enabled</em></li>
  <li>Go to <strong>Services → Compose</strong> (or <strong>Docker</strong> in older OMV)</li>
  <li>Install the plugin if not already</li>
  <li>Set a storage location for Docker (a dedicated shared folder on a data disk, not the boot drive)</li>
</ol>
<p>Verify on the shell:</p>
<pre><code>ssh root@omv.local
docker ps
# Should work; if not:
systemctl status docker</code></pre>

<h2>Step 2: Enable SSH (if not already on)</h2>
<p>OMV enables SSH by default, but if it's off:</p>
<ol>
  <li>OMV UI → <strong>Services → SSH</strong></li>
  <li>Check <strong>Enabled</strong></li>
  <li>Port: <code>22</code> (default)</li>
  <li>You probably want <strong>Permit root login</strong> checked for initial setup (then switch to key auth and disable root-password-login for hardening)</li>
</ol>

<h2>Step 3: Add your admin user to the docker group</h2>
<p>If you're using a non-root admin (recommended):</p>
<pre><code>ssh root@omv.local
usermod -aG docker youruser
exit</code></pre>

<h2>Step 4: Add the host in Docker Dash</h2>
<ol>
  <li><strong>Multi-Host → Add Host</strong></li>
  <li>Connection type: <strong>SSH tunnel</strong></li>
  <li>Host: <code>omv.local</code> or your NAS's IP</li>
  <li>Port: <code>22</code></li>
  <li>Username: <code>root</code> or your admin user</li>
  <li>Auth: private key recommended</li>
  <li>Docker socket path: <code>/var/run/docker.sock</code> (standard — OMV uses Debian's default)</li>
  <li>Click <strong>Test connection</strong> → ✓</li>
  <li>Save</li>
</ol>

<h2>Step 5: Verify the badge</h2>
<p>Multi-Host page. Detection for OMV is hint-based (hostname contains "openmediavault") because OMV itself reports as "Debian GNU/Linux" in <code>docker info</code>. If you didn't name your box "openmediavault", the badge will show <strong>Debian</strong> — which is technically correct since OMV is Debian under the hood. Not a bug; just OMV doesn't advertise itself from the kernel.</p>
<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;padding:10px;margin:10px 0;color:#78350f">
<strong>Want the OMV badge?</strong> Set the hostname to something containing "openmediavault" (e.g. <code>openmediavault-nas</code>) in <strong>System → Network → Hostname</strong>. Reboot. Detection picks it up.
</div>

<h2>OMV-specific tips</h2>
<h3>Shared folders</h3>
<p>OMV's shared folders live under <code>/srv/dev-disk-by-uuid-*/...</code>. Easiest is to use OMV's "Compose" plugin UI to create your stacks (it knows about your shared folders) and manage / monitor / audit them via Docker Dash.</p>

<h3>The Compose plugin vs Docker Dash</h3>
<p>OMV's Compose plugin and Docker Dash both read the same daemon. Similar to TrueNAS/QNAP:</p>
<ul>
  <li>✅ OK to deploy from either — both see the same containers</li>
  <li>✅ Docker Dash's Security / CIS / Outbound Filter work regardless of who deployed the container</li>
  <li>⚠ Avoid editing the same <code>docker-compose.yml</code> from both UIs — last write wins</li>
</ul>

<h3>Updates via OMV UI</h3>
<p>OMV's Compose plugin has an "Update" button per stack. That works fine. Docker Dash's Remediation Wizard also works — they're complementary.</p>

<h2>Troubleshooting</h2>
<table style="width:100%;border-collapse:collapse;font-size:12px">
<tr><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Problem</th><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Fix</th></tr>
<tr><td style="padding:6px">"docker: command not found"</td><td style="padding:6px">Install omv-extras + the docker plugin. See step 1.</td></tr>
<tr><td style="padding:6px">Badge says "Debian" not "OpenMediaVault"</td><td style="padding:6px">Set hostname to contain "openmediavault". Debian badge is also correct — OMV is Debian.</td></tr>
<tr><td style="padding:6px">Docker runs but eats up root filesystem</td><td style="padding:6px">Docker storage location set to boot drive. Reconfigure via omv-extras to use a data disk.</td></tr>
<tr><td style="padding:6px">"Permission denied" on socket</td><td style="padding:6px">Your user not in docker group. <code>usermod -aG docker youruser</code>, re-login.</td></tr>
</table>

<h2>What you get on OMV</h2>
<ul>
  <li>✅ Everything Docker Dash supports, full featured — it's just Debian</li>
  <li>✅ Compose plugin + Docker Dash coexist happily</li>
  <li>✅ Outbound Filter, Security scans, CIS Benchmark, Remediation Wizard — all work</li>
</ul>

