'use strict';

// v6.12.2 — The three NAS platforms that got auto-detection in v6.12.0 but no
// dedicated How-To guide: TrueNAS SCALE (Electric Eel+), QNAP QTS/QuTS hero,
// and OpenMediaVault. Same bilingual (EN + RO) pattern as migration 058.

exports.up = function (db) {
  const guides = [
    {
      slug: 'truenas-scale',
      title: 'Connect Docker Dash to TrueNAS SCALE (Electric Eel+)',
      title_ro: 'Conectează Docker Dash la TrueNAS SCALE (Electric Eel+)',
      category: 'multi-host',
      difficulty: 'intermediate',
      icon: 'fas fa-server',
      summary: 'TrueNAS SCALE 24.10 "Electric Eel" returned to native Docker from K3s. Enable SSH, avoid TrueNAS-managed apps, and point Docker Dash at your NAS.',
      summary_ro: 'TrueNAS SCALE 24.10 "Electric Eel" a revenit la Docker nativ de la K3s. Activează SSH, evită aplicațiile TrueNAS-manageuite, și conectează Docker Dash.',
      content: `<h2>What you need</h2>
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
`,
      content_ro: `<h2>Ce îți trebuie</h2>
<ul>
  <li>TrueNAS SCALE 24.10 "Electric Eel" sau mai nou (cu Docker nativ — versiunile mai vechi pe K3s NU sunt acoperite aici)</li>
  <li>Un admin SCALE cu drepturi sudo</li>
  <li>Docker Dash rulând pe ceva reachable</li>
</ul>

<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;padding:10px;margin:10px 0;color:#78350f">
<strong>De ce e important 24.10:</strong> versiunile vechi SCALE (22.x "Bluefin", 23.x "Cobia") rulau Kubernetes (K3s) — incompatibil cu Docker Dash. Electric Eel și mai nou folosesc Docker nativ.
</div>

<h2>Pasul 1: Activează SSH</h2>
<ol>
  <li>UI SCALE → <strong>System Settings → Services</strong></li>
  <li>SSH → toggle <em>Running</em> on</li>
  <li>Edit → bifează <strong>Log in as Root with Password</strong> DOAR pe LAN de încredere (altfel folosește chei)</li>
  <li>Save</li>
</ol>

<h2>Pasul 2: Verifică Docker</h2>
<pre><code>ssh truenas_admin@truenas.local
sudo docker ps</code></pre>
<p>Trebuie să vezi containerele aplicațiilor TrueNAS. Dacă nu merge, <code>sudo systemctl status docker</code>.</p>

<h2>Pasul 3: Adaugă user-ul în grupul docker (opțional)</h2>
<pre><code>sudo usermod -aG docker truenas_admin
exit
ssh truenas_admin@truenas.local
docker ps  # acum merge fără sudo</code></pre>

<h2>Pasul 4: Adaugă host-ul în Docker Dash</h2>
<ol>
  <li>Multi-Host → Add Host</li>
  <li>Connection type: SSH tunnel</li>
  <li>Host: <code>truenas.local</code> sau IP</li>
  <li>Port: 22, Username: <code>truenas_admin</code></li>
  <li>Auth: cheie privată recomandat</li>
  <li>Socket: <code>/var/run/docker.sock</code></li>
  <li>Test → ✓ → Save</li>
</ol>

<h2>Pasul 5: Verifică badge-ul</h2>
<p>Pe Multi-Host ar trebui să apară <strong>TrueNAS SCALE</strong>. Versiunea vine din marker-ul kernel-ului (<code>6.6.44-truenas-production</code>), nu din OS string — e normal să arate ca un număr de kernel.</p>

<h2>⚠ Critic: nu atinge aplicațiile TrueNAS-managed</h2>
<p>SCALE are propriul tab "Apps" care deploy-ează containere predefinite (Plex, Jellyfin, etc.). Acestea sunt:</p>
<ul>
  <li>Prefixate <code>ix-*</code></li>
  <li>Gestionate de sistemul SCALE (restart / rollback / upgrade din UI)</li>
  <li>Bazate pe dataset-uri ZFS cu ownership specific</li>
</ul>
<p>Dacă le stopezi / ștergi / recreezi prin Docker Dash, sistemul SCALE fie le recreează (îți pierzi schimbările), fie intră în stare inconsistentă.</p>
<div style="background:#dcfce7;border:1px solid #16a34a;border-radius:6px;padding:10px;margin:10px 0;color:#14532d">
<strong>Deploy NEW containers / stacks prin Docker Dash. Aplicațiile SCALE-managed le lași în pace — le gestionezi din UI-ul SCALE.</strong>
</div>

<h2>Storage: folosește dataset-uri ZFS</h2>
<pre><code>volumes:
  - /mnt/tank/docker-data/myapp:/config
  - /mnt/tank/media:/media:ro</code></pre>
<p>Nu folosi named volumes pentru date importante — ajung în <code>/var/lib/docker/volumes</code>, în afara strategiei tale de snapshot ZFS.</p>

<h2>Troubleshooting</h2>
<table style="width:100%;border-collapse:collapse;font-size:12px">
<tr><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Problema</th><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Fix</th></tr>
<tr><td style="padding:6px">"docker: command not found"</td><td style="padding:6px">Ești pe SCALE < 24.10 (K3s). Upgrade.</td></tr>
<tr><td style="padding:6px">Badge zice "Debian" nu "TrueNAS SCALE"</td><td style="padding:6px">Reboot NAS după upgrade pentru marker-ul corect de kernel.</td></tr>
<tr><td style="padding:6px">SCALE îmi restartează container-ul după ce îl stop-ez</td><td style="padding:6px">E managed de TrueNAS. Șterge-l din tab-ul SCALE Apps dacă vrei control total.</td></tr>
</table>

<h2>Ce merge, ce eviți</h2>
<ul>
  <li>✅ Deploy de compose stacks proprii</li>
  <li>✅ Security / CIS Benchmark</li>
  <li>✅ Outbound Filter (v6.7)</li>
  <li>✅ Remediation Wizard pentru containerele tale</li>
  <li>⚠ Containerele <code>ix-*</code> / SCALE-managed — le lași în pace</li>
</ul>
`,
    },

    {
      slug: 'qnap-qts',
      title: 'Connect Docker Dash to QNAP (Container Station on QTS / QuTS hero)',
      title_ro: 'Conectează Docker Dash la QNAP (Container Station pe QTS / QuTS hero)',
      category: 'multi-host',
      difficulty: 'intermediate',
      icon: 'fas fa-hdd',
      summary: 'QNAP Container Station wraps Docker. Enable SSH, find the socket path (QNAP sometimes relocates it), and connect. QTS 5.x and QuTS hero both work.',
      summary_ro: 'QNAP Container Station e wrapper peste Docker. Activează SSH, găsește path-ul socket-ului (QNAP îl mută uneori), și conectează. QTS 5.x și QuTS hero merg ambele.',
      content: `<h2>What you need</h2>
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
`,
      content_ro: `<h2>Ce îți trebuie</h2>
<ul>
  <li>QNAP NAS cu QTS 5.0+ sau QuTS hero h5.0+</li>
  <li>Container Station instalat (gratis din App Center)</li>
  <li>Admin QTS (<code>admin</code> sau membru al grupului admin)</li>
  <li>Docker Dash reachable de pe NAS</li>
</ul>

<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;padding:10px;margin:10px 0;color:#78350f">
<strong>Ciudățenii QTS:</strong> path-ul socket-ului Docker variază per versiune QTS. Câteodată <code>/var/run/docker.sock</code>, câteodată <code>/share/ZFS530_DATA/.qpkg/container-station/...</code>. Găsește-l înainte să configurezi Docker Dash.
</div>

<h2>Pasul 1: Activează SSH</h2>
<ol>
  <li>UI QTS → <strong>Control Panel → Network &amp; File Services → Telnet/SSH</strong></li>
  <li>Bifează <strong>Allow SSH connection</strong></li>
  <li>Port: 22 (sau schimbă dacă ai conflict)</li>
  <li>Apply</li>
</ol>

<h2>Pasul 2: Găsește path-ul real al socket-ului</h2>
<pre><code>ssh admin@qnap.local
ls -la /var/run/docker.sock 2>/dev/null
ls -la /share/ZFS*_DATA/.qpkg/container-station/*/docker.sock 2>/dev/null
docker info 2>/dev/null | grep -i "docker root dir"</code></pre>
<p>Notează path-ul care chiar există — îl folosești în Docker Dash.</p>

<h2>Pasul 3: Docker group (dacă există)</h2>
<pre><code>getent group docker
sudo usermod -aG docker admin
exit
ssh admin@qnap.local
docker ps</code></pre>
<p>Dacă nu există docker group, fă login ca <code>admin</code> direct — de obicei are ACL pe socket.</p>

<h2>Pasul 4: Adaugă host-ul în Docker Dash</h2>
<ol>
  <li>Multi-Host → Add Host</li>
  <li>Connection type: SSH tunnel</li>
  <li>Host: <code>qnap.local</code> sau IP</li>
  <li>Port: 22, Username: <code>admin</code></li>
  <li>Auth: parolă sau cheie privată</li>
  <li>Socket path: <strong>ce ai găsit în pasul 2</strong> (nu neapărat <code>/var/run/docker.sock</code>)</li>
  <li>Test → ✓ → Save</li>
</ol>

<h2>Pasul 5: Verifică badge-ul</h2>
<p>Pe Multi-Host ar trebui să apară <strong>QNAP</strong>. Dacă apare "Linux" în loc, versiunea ta QTS raportează string-uri OS neobișnuite — detecția e best-effort pentru QNAP pentru că userspace-ul lor e proprietary.</p>

<h2>Tips QNAP-specifice</h2>
<ul>
  <li><strong>Shared folders</strong> la <code>/share/&lt;pool&gt;/</code>. Folosește path-ul real în volume compose.</li>
  <li><strong>Container Station coexistă</strong> cu Docker Dash. Evită doar editarea concurentă a aceluiași stack din ambele UI-uri.</li>
  <li><strong>QVR/QuLog containere de sistem</strong> — le lași în pace, QTS le recreează oricum.</li>
</ul>

<h2>Troubleshooting</h2>
<table style="width:100%;border-collapse:collapse;font-size:12px">
<tr><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Problema</th><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Fix</th></tr>
<tr><td style="padding:6px">"docker: command not found"</td><td style="padding:6px">Container Station lipsește. Install din App Center.</td></tr>
<tr><td style="padding:6px">"Cannot connect to the Docker daemon"</td><td style="padding:6px">Socket path greșit. Re-fă pasul 2.</td></tr>
<tr><td style="padding:6px">SSH merge dar <code>docker ps</code> zice permission denied</td><td style="padding:6px">Nu ești în docker group. Login ca <code>admin</code> direct.</td></tr>
</table>
`,
    },

    {
      slug: 'openmediavault',
      title: 'Connect Docker Dash to OpenMediaVault (OMV)',
      title_ro: 'Conectează Docker Dash la OpenMediaVault (OMV)',
      category: 'multi-host',
      difficulty: 'beginner',
      icon: 'fas fa-server',
      summary: 'OMV is Debian + a NAS web UI. Install the official Docker plugin (omv-extras), enable SSH, and Docker Dash connects like any other Debian box.',
      summary_ro: 'OMV e Debian + un UI NAS. Instalează plugin-ul Docker oficial (omv-extras), activează SSH, și Docker Dash se conectează ca la orice Debian.',
      content: `<h2>What you need</h2>
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
`,
      content_ro: `<h2>Ce îți trebuie</h2>
<ul>
  <li>OpenMediaVault 6.x (Shaitan) sau 7.x (Sandworm)</li>
  <li><a href="https://wiki.omv-extras.org/" target="_blank">omv-extras</a> instalat (repo-ul community cu plugin-ul Docker)</li>
  <li>Plugin-ul <strong>docker</strong> instalat prin omv-extras</li>
  <li>Un admin OMV</li>
</ul>

<h2>Pasul 1: Instalează Docker prin omv-extras</h2>
<p>OMV nu include Docker în core. Repo-ul community omv-extras îl aduce.</p>
<ol>
  <li>Instalează omv-extras după ghidul lor oficial</li>
  <li>UI OMV → <strong>System → omv-extras</strong> → activează Docker repo</li>
  <li><strong>Services → Compose</strong> (sau Docker în OMV vechi) → instalează plugin-ul</li>
  <li>Setează o locație de storage Docker (shared folder pe disk de date, nu pe boot)</li>
</ol>
<pre><code>ssh root@omv.local
docker ps</code></pre>

<h2>Pasul 2: Verifică SSH</h2>
<p>OMV are SSH activat by default. Dacă nu: <strong>Services → SSH</strong> → Enabled, port 22.</p>

<h2>Pasul 3: Docker group</h2>
<pre><code>ssh root@omv.local
usermod -aG docker youruser</code></pre>

<h2>Pasul 4: Adaugă host-ul în Docker Dash</h2>
<ol>
  <li>Multi-Host → Add Host</li>
  <li>Connection type: SSH tunnel</li>
  <li>Host: <code>omv.local</code> sau IP</li>
  <li>Port: 22, Username: <code>root</code> sau adminul tău</li>
  <li>Auth: cheie privată</li>
  <li>Socket: <code>/var/run/docker.sock</code> (standard Debian)</li>
  <li>Test → ✓ → Save</li>
</ol>

<h2>Pasul 5: Verifică badge-ul</h2>
<p>Detecția OMV e pe bază de hostname — dacă hostname-ul NU conține "openmediavault", badge-ul va fi <strong>Debian</strong> (corect din punct de vedere tehnic, OMV e Debian sub capotă).</p>
<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;padding:10px;margin:10px 0;color:#78350f">
<strong>Vrei badge-ul OMV?</strong> Setează hostname-ul să conțină "openmediavault" în <strong>System → Network → Hostname</strong>. Reboot. Se detectează.
</div>

<h2>Tips OMV-specifice</h2>
<ul>
  <li><strong>Shared folders</strong> sub <code>/srv/dev-disk-by-uuid-*/</code>. Cel mai simplu: deploy stacks din plugin-ul Compose OMV, monitorizează/auditează din Docker Dash.</li>
  <li><strong>Compose plugin + Docker Dash coexistă</strong>. Evită edit concurent pe același compose.yml.</li>
  <li><strong>Updates</strong> merg din ambele UI-uri — complementar.</li>
</ul>

<h2>Troubleshooting</h2>
<table style="width:100%;border-collapse:collapse;font-size:12px">
<tr><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Problema</th><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Fix</th></tr>
<tr><td style="padding:6px">"docker: command not found"</td><td style="padding:6px">Instalează omv-extras + plugin docker.</td></tr>
<tr><td style="padding:6px">Badge zice "Debian" nu "OpenMediaVault"</td><td style="padding:6px">Setează hostname-ul să conțină "openmediavault".</td></tr>
<tr><td style="padding:6px">Docker umple disk-ul de boot</td><td style="padding:6px">Storage location setat pe boot. Mută pe disk de date prin omv-extras.</td></tr>
</table>

<h2>Ce primești pe OMV</h2>
<ul>
  <li>✅ Tot ce suportă Docker Dash — e doar Debian</li>
  <li>✅ Compose plugin + Docker Dash coexistă</li>
  <li>✅ Outbound Filter, Security, CIS, Remediation Wizard — toate merg</li>
</ul>
`,
    },
  ];

  const insertOrUpdate = db.prepare(`
    INSERT INTO howto_guides (slug, title, title_ro, category, difficulty, icon, summary, summary_ro, content, content_ro, is_builtin)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT(slug) DO UPDATE SET
      title = excluded.title, title_ro = excluded.title_ro,
      category = excluded.category, difficulty = excluded.difficulty,
      icon = excluded.icon, summary = excluded.summary, summary_ro = excluded.summary_ro,
      content = excluded.content, content_ro = excluded.content_ro,
      is_builtin = 1
  `);
  for (const g of guides) {
    insertOrUpdate.run(g.slug, g.title, g.title_ro, g.category, g.difficulty, g.icon, g.summary, g.summary_ro, g.content, g.content_ro);
  }
};

exports.down = function (db) {
  db.prepare(`DELETE FROM howto_guides WHERE slug IN ('truenas-scale', 'qnap-qts', 'openmediavault') AND is_builtin = 1`).run();
};
