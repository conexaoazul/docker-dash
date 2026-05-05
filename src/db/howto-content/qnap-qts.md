---
title: Connect Docker Dash to QNAP (Container Station on QTS / QuTS hero)
summary: QNAP Container Station wraps Docker. Enable SSH, find the socket path (QNAP sometimes relocates it), and connect. QTS 5.x and QuTS hero both work.
category: multi-host
difficulty: intermediate
icon: fas fa-hdd
---

<h2>What you need</h2>
<ul>
  <li>QNAP NAS running QTS 5.0+ or QuTS hero h5.0+</li>
  <li>Container Station installed (free from QNAP App Center)</li>
  <li>A QTS admin account (the <code>admin</code> user or one with admin group membership)</li>
  <li>Docker Dash running somewhere reachable</li>
</ul>

<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;padding:10px;margin:10px 0;color:#78350f">
<strong>QTS quirks you'll hit:</strong> the Docker socket path varies by QTS version. Container Station sometimes uses <code>/var/run/docker.sock</code> (standard), sometimes <code>/share/ZFS530_DATA/.qpkg/container-station/usr/bin/docker.sock</code>, sometimes a symlink. Find yours before you configure Docker Dash.
</div>

<h2>Step 1: Enable SSH on QTS</h2>
<ol>
  <li>Log into the QTS web UI as admin</li>
  <li>Open <strong>Control Panel → Network &amp; File Services → Telnet/SSH</strong></li>
  <li>Check <strong>Allow SSH connection</strong></li>
  <li>Port: <code>22</code> (default) — change if you already expose another SSH service on your LAN</li>
  <li><strong>Apply</strong></li>
</ol>

<h2>Step 2: Find the actual Docker socket path</h2>
<p>SSH in first:</p>
<pre><code>ssh admin@qnap.local
# Find the live socket
ls -la /var/run/docker.sock 2>/dev/null
ls -la /share/ZFS*_DATA/.qpkg/container-station/*/docker.sock 2>/dev/null
# Or let Container Station tell you:
docker info 2>/dev/null | grep -i "docker root dir"</code></pre>
<p>Typical results:</p>
<ul>
  <li><strong>QTS 5.0+:</strong> usually <code>/var/run/docker.sock</code> (standard)</li>
  <li><strong>Older QTS:</strong> <code>/share/ZFS*_DATA/.qpkg/container-station/...</code>  </li>
  <li><strong>QuTS hero:</strong> same as QTS equivalent version</li>
</ul>
<p>Note down whatever path actually exists — you'll use it in Docker Dash.</p>

<h2>Step 3: Add your user to the docker group (if exists)</h2>
<p>QNAP may or may not have a <code>docker</code> group depending on Container Station version. Check:</p>
<pre><code>getent group docker
# If it exists:
sudo usermod -aG docker admin
exit
ssh admin@qnap.local
docker ps  # should list Container Station's containers</code></pre>
<p>If there's no docker group, you'll need to either:</p>
<ul>
  <li>Use <code>sudo docker</code> (but Docker Dash's SSH tunnel doesn't prompt for sudo)</li>
  <li>Login as <code>admin</code> directly (often works because admin has socket ACL)</li>
</ul>

<h2>Step 4: Add the host in Docker Dash</h2>
<ol>
  <li><strong>Multi-Host → Add Host</strong></li>
  <li>Connection type: <strong>SSH tunnel</strong></li>
  <li>Host: <code>qnap.local</code> or your NAS's IP</li>
  <li>Port: <code>22</code> (or the port you set in step 1)</li>
  <li>Username: <code>admin</code> (or your QTS admin)</li>
  <li>Auth: password OR private key (QNAP supports both)</li>
  <li>Docker socket path: <strong>whatever step 2 showed you</strong> (not necessarily <code>/var/run/docker.sock</code>)</li>
  <li>Click <strong>Test connection</strong> → ✓</li>
  <li>Save</li>
</ol>

<h2>Step 5: Verify the badge</h2>
<p>Multi-Host page. Should show a <strong>QNAP</strong> badge (detection matches "QTS", "QuTS", or "QNAP" in docker info). If detection failed and the badge shows "Linux" instead, your QTS version reports unusual OS strings — detection is still best-effort for QNAP since their userspace is proprietary.</p>

<h2>QNAP-specific tips</h2>
<h3>Shared folders = mount points</h3>
<p>QNAP shares are under <code>/share/&lt;pool&gt;/</code>. When deploying compose stacks, mount real paths:</p>
<pre><code>volumes:
  - /share/CACHEDEV1_DATA/Container/myapp:/config
  - /share/CACHEDEV1_DATA/Multimedia:/media:ro</code></pre>

<h3>Container Station coexistence</h3>
<p>Containers you deploy via Docker Dash show up in Container Station's "Applications" tab, and vice versa. Both read the same Docker daemon. Just avoid editing the same stack from both UIs simultaneously.</p>

<h3>QVR / QuLog containers</h3>
<p>Some QNAP system services ship as containers. Leave them alone — QTS may auto-recreate them if you stop them, similar to TrueNAS-managed apps.</p>

<h2>Troubleshooting</h2>
<table style="width:100%;border-collapse:collapse;font-size:12px">
<tr><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Problem</th><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Fix</th></tr>
<tr><td style="padding:6px">"docker: command not found"</td><td style="padding:6px">Container Station not installed. Install it from App Center.</td></tr>
<tr><td style="padding:6px">"Cannot connect to the Docker daemon"</td><td style="padding:6px">Socket path wrong. Re-run step 2 to find the actual path. QNAP isn't consistent across QTS versions.</td></tr>
<tr><td style="padding:6px">SSH works but <code>docker ps</code> gives permission denied</td><td style="padding:6px">No docker group. Try logging in as <code>admin</code> which usually has the socket ACL.</td></tr>
<tr><td style="padding:6px">QTS Container Station UI says containers from Docker Dash are "External"</td><td style="padding:6px">Normal — Container Station tags containers it didn't create as external. They still run fine.</td></tr>
</table>

