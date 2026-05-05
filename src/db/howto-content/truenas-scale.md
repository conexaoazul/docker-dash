---
title: Connect Docker Dash to TrueNAS SCALE (Electric Eel+)
summary: 'TrueNAS SCALE 24.10 "Electric Eel" returned to native Docker from K3s. Enable SSH, avoid TrueNAS-managed apps, and point Docker Dash at your NAS.'
category: multi-host
difficulty: intermediate
icon: fas fa-server
---

<h2>What you need</h2>
<ul>
  <li>TrueNAS SCALE 24.10 "Electric Eel" or later (Docker-based; older SCALE used K3s and is NOT covered here)</li>
  <li>A SCALE admin account with sudo privileges</li>
  <li>Docker Dash running somewhere reachable from your NAS</li>
</ul>

<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;padding:10px;margin:10px 0;color:#78350f">
<strong>Why 24.10 matters:</strong> earlier SCALE versions (22.x "Bluefin", 23.x "Cobia") ran Kubernetes (K3s) under the hood. Those are NOT compatible with Docker Dash — you'd need kubectl instead. Electric Eel and newer use native Docker, which is why auto-detection works and this guide applies.
</div>

<h2>Step 1: Enable SSH on TrueNAS SCALE</h2>
<ol>
  <li>Log into the SCALE web UI as admin</li>
  <li>Go to <strong>System Settings → Services</strong></li>
  <li>Find <strong>SSH</strong> in the list → toggle <em>Running</em> on</li>
  <li>Click the pencil (edit) icon → check <strong>Log in as Root with Password</strong> ONLY if you're on a trusted LAN (otherwise prefer key auth)</li>
  <li>Click <strong>Save</strong></li>
</ol>

<h2>Step 2: Verify Docker is reachable</h2>
<p>SSH in (from any terminal):</p>
<pre><code>ssh truenas_admin@truenas.local
sudo docker ps</code></pre>
<p>You should see TrueNAS's own app containers listed. If <code>docker ps</code> fails:</p>
<pre><code># Check Docker is running
sudo systemctl status docker
# Check the socket exists
ls -la /var/run/docker.sock</code></pre>
<p>If <code>docker</code> isn't installed, you're on an older SCALE version. Upgrade to 24.10+.</p>

<h2>Step 3: Add your user to the docker group (optional but recommended)</h2>
<p>SCALE doesn't pre-add the admin to the docker group. Either use <code>sudo docker</code> everywhere, or add yourself:</p>
<pre><code>sudo usermod -aG docker truenas_admin
# Log out and back in for it to take effect
exit
ssh truenas_admin@truenas.local
docker ps  # now works without sudo</code></pre>

<h2>Step 4: Add the host in Docker Dash</h2>
<ol>
  <li>In Docker Dash: <strong>Multi-Host → Add Host</strong></li>
  <li>Connection type: <strong>SSH tunnel</strong></li>
  <li>Host: <code>truenas.local</code> or your NAS's IP</li>
  <li>Port: <code>22</code></li>
  <li>Username: <code>truenas_admin</code> (or your SCALE admin)</li>
  <li>Auth: private key recommended over password</li>
  <li>Docker socket path: <code>/var/run/docker.sock</code></li>
  <li>Click <strong>Test connection</strong> → should show ✓</li>
  <li>Save</li>
</ol>

<h2>Step 5: Verify the badge</h2>
<p>Multi-Host page. Your NAS should show a <strong>TrueNAS SCALE</strong> badge. The version comes from the kernel marker (e.g. <code>6.6.44-truenas-production</code>), not the DSM-style OS string — don't worry if it looks like just a kernel number, that's normal.</p>

<h2>⚠ Critical: don't touch TrueNAS-managed apps</h2>
<p>SCALE ships its own "Apps" tab that deploys predefined containers (Plex, Jellyfin, Nextcloud, etc.). These containers are:</p>
<ul>
  <li>Named with a <code>ix-*</code> prefix or namespace</li>
  <li>Managed by SCALE's app system (restart / rollback / upgrade via the UI)</li>
  <li>Backed by ZFS datasets with TrueNAS-specific ownership</li>
</ul>
<p>If you <strong>stop / delete / recreate</strong> these containers via Docker Dash, the SCALE app system will either auto-recreate them (wasting your changes) or get into an inconsistent state. Rule of thumb:</p>
<div style="background:#dcfce7;border:1px solid #16a34a;border-radius:6px;padding:10px;margin:10px 0;color:#14532d">
<strong>Deploy NEW containers / stacks via Docker Dash. Leave TrueNAS-managed containers alone — manage them from the SCALE UI.</strong>
</div>

<h2>Persistent storage: use ZFS datasets</h2>
<p>When deploying a compose stack via Docker Dash on TrueNAS, mount ZFS datasets directly:</p>
<pre><code>volumes:
  - /mnt/tank/docker-data/myapp:/config
  - /mnt/tank/media:/media:ro</code></pre>
<p>Don't use named volumes (<code>docker volume create</code>) for important data — they land in <code>/var/lib/docker/volumes</code>, which isn't on a ZFS dataset and won't be part of your snapshot/replication strategy.</p>

<h2>Troubleshooting</h2>
<table style="width:100%;border-collapse:collapse;font-size:12px">
<tr><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Problem</th><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Fix</th></tr>
<tr><td style="padding:6px">"docker: command not found"</td><td style="padding:6px">You're on SCALE < 24.10 (K3s-based). Upgrade to Electric Eel or newer.</td></tr>
<tr><td style="padding:6px">Badge says "Debian" not "TrueNAS SCALE"</td><td style="padding:6px">Detection relies on the <code>-truenas-production</code> kernel marker. Reboot the NAS after upgrading to ensure the kernel reports correctly.</td></tr>
<tr><td style="padding:6px">SCALE auto-restarts my container after I stop it in Docker Dash</td><td style="padding:6px">The container is TrueNAS-managed. See the "Critical" section above. Delete the app from the SCALE Apps tab if you want to manage it yourself.</td></tr>
<tr><td style="padding:6px">Docker Dash's Remediation Wizard can't apply a compose diff</td><td style="padding:6px">Make sure <code>docker compose</code> (v2, plugin-style) is available: <code>docker compose version</code>. SCALE ships it by default.</td></tr>
</table>

<h2>What works, what to avoid</h2>
<ul>
  <li>✅ Deploying your own compose stacks</li>
  <li>✅ Security / CIS Benchmark scans on the Docker daemon</li>
  <li>✅ Outbound Filter (v6.7) — TrueNAS uses standard bridge networking</li>
  <li>✅ Remediation Wizard for containers you deployed yourself</li>
  <li>⚠ Managing <code>ix-*</code> / SCALE-managed apps — leave to the SCALE UI</li>
</ul>

