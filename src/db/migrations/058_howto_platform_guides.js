'use strict';

// v6.12.0 — Three platform-specific How-To guides: Synology DSM, Unraid,
// Generic VPS (covers Hetzner / DigitalOcean / EC2 / GCE / Azure / Linode /
// Vultr in one artifact — anything that's "Ubuntu/Debian + Docker + SSH").

exports.up = function (db) {
  const guides = [
    {
      slug: 'synology-dsm',
      title: 'Connect Docker Dash to Synology DSM (Container Manager)',
      title_ro: 'Conectează Docker Dash la Synology DSM (Container Manager)',
      category: 'multi-host',
      difficulty: 'beginner',
      icon: 'fas fa-hdd',
      summary: 'Step-by-step: enable SSH on DSM, add your user to the docker group, and point Docker Dash at your Synology NAS. Container Manager is rebranded Docker — no custom API needed.',
      summary_ro: 'Pas cu pas: activează SSH pe DSM, adaugă user-ul la grupul docker, și conectează Docker Dash la NAS-ul Synology. Container Manager e Docker rebrand-uit — nicio API specială.',
      content: `<h2>What you need</h2>
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
`,
      content_ro: `<h2>Ce îți trebuie</h2>
<ul>
  <li>Synology DSM 7.0 sau mai nou (testat pe DSM 7.2)</li>
  <li>Pachetul Container Manager instalat (e Docker rebrand-uit)</li>
  <li>Un cont de admin DSM</li>
  <li>Docker Dash rulând pe ceva ce poate contacta NAS-ul (sau invers)</li>
</ul>

<h2>Pasul 1: Activează SSH pe DSM</h2>
<ol>
  <li>Autentifică-te în DSM ca admin</li>
  <li>Control Panel → Terminal &amp; SNMP → Terminal</li>
  <li>Bifează <strong>Enable SSH service</strong></li>
  <li>Lasă portul pe <code>22</code> sau schimbă-l dacă ai conflict</li>
  <li>Apply</li>
</ol>

<h2>Pasul 2: Adaugă user-ul în grupul docker</h2>
<p>Container Manager creează automat un grup <code>docker</code>. User-ul DSM trebuie să fie în el ca să acceseze socket-ul fără <code>sudo</code>.</p>
<pre><code>ssh user-ul-admin@synology.local
sudo synogroup --memberadd docker user-ul-admin
exit
# Re-autentifică-te ca să se aplice noile grupuri
ssh user-ul-admin@synology.local
groups  # trebuie să conțină "docker"
docker ps  # trebuie să listeze containerele fără sudo</code></pre>

<h2>Pasul 3: Adaugă host-ul în Docker Dash</h2>
<ol>
  <li>Multi-Host → Add Host</li>
  <li>Connection type: <strong>SSH tunnel</strong></li>
  <li>Host: <code>synology.local</code> sau IP</li>
  <li>Port: <code>22</code></li>
  <li>Username: admin-ul DSM</li>
  <li>Auth: parolă SAU private key (recomandat)</li>
  <li>Docker socket path: <code>/var/run/docker.sock</code> (default)</li>
  <li>Test connection → ✓</li>
  <li>Save</li>
</ol>

<h2>Pasul 4: Verifică badge-ul</h2>
<p>Pe pagina Multi-Host, host-ul Synology ar trebui să arate un badge <strong>Synology DSM</strong> cu versiunea. Dacă îl vezi, auto-detect merge și ai terminat.</p>

<h2>Ce funcționează pe Synology</h2>
<ul>
  <li>Toate feature-urile: containere, stack-uri (compose), imagini, volume, rețele, stats, logs, terminal</li>
  <li>Outbound Filter v6.7 — pentru lock-down containere care nu trebuie să iasă pe internet</li>
  <li>Remediation Wizard v6.6 — apply local mode merge (Container Manager include <code>docker compose</code>)</li>
  <li>Security / CIS Benchmark scanează runtime-ul Docker direct</li>
</ul>
`,
    },

    {
      slug: 'unraid',
      title: 'Connect Docker Dash to Unraid',
      title_ro: 'Conectează Docker Dash la Unraid',
      category: 'multi-host',
      difficulty: 'beginner',
      icon: 'fab fa-docker',
      summary: 'Unraid runs standard Docker + SSH out of the box — this is the easiest NAS platform to connect. Point Docker Dash at your Tower and go.',
      summary_ro: 'Unraid rulează Docker + SSH standard — cel mai ușor NAS de conectat. Pune Docker Dash pe Tower și gata.',
      content: `<h2>What you need</h2>
<ul>
  <li>Unraid 6.9 or later</li>
  <li>SSH enabled in Unraid Settings (usually on by default)</li>
  <li>Docker Dash running somewhere reachable</li>
</ul>

<h2>Step 1: Verify SSH is on</h2>
<p>In the Unraid UI:</p>
<ol>
  <li><strong>Settings → Management Access → SSH</strong></li>
  <li>Make sure <strong>Use SSH</strong> is set to <em>Yes</em></li>
  <li>Port defaults to <code>22</code></li>
</ol>
<p>If you've never logged into Unraid via SSH before, you might want to set up a key-based login (Settings → User Utilities → User Profile → SSH Authorized Keys). Not required, but more robust than the root password.</p>

<h2>Step 2: Add the host in Docker Dash</h2>
<ol>
  <li><strong>Multi-Host → Add Host</strong></li>
  <li>Connection type: <strong>SSH tunnel</strong></li>
  <li>Host: your Unraid's IP or <code>tower.local</code></li>
  <li>Port: <code>22</code></li>
  <li>Username: <code>root</code> (Unraid runs everything as root)</li>
  <li>Auth: your Unraid root password OR your SSH private key</li>
  <li>Docker socket path: <code>/var/run/docker.sock</code> (default — Unraid doesn't relocate it)</li>
  <li>Test connection → ✓</li>
  <li>Save</li>
</ol>

<h2>Step 3: Verify the badge</h2>
<p>Multi-Host page. Look for an <strong>Unraid</strong> badge on the host card. Docker Dash's platform detection reads Unraid's OS string from <code>docker info</code>.</p>

<h2>Unraid-specific tips</h2>

<h3>appdata convention</h3>
<p>Unraid community stacks almost always expect <code>/mnt/user/appdata/&lt;service&gt;</code> as the config volume. When deploying compose stacks through Docker Dash, keep this convention — it plays well with existing Community Apps (CA) installs and lets you migrate between CA and Docker Dash without rewiring storage.</p>

<h3>Community Applications &amp; Docker Dash</h3>
<p>They coexist. Unraid's Docker tab and Docker Dash both read the same underlying Docker daemon. You can install from CA as usual, then manage / remediate / audit from Docker Dash.</p>

<h3>Outbound filter on Unraid</h3>
<p>Works perfectly — Unraid uses a standard bridge network. See <a href="#/howto/outbound-network-filter">the Outbound Filter guide</a>.</p>

<h2>Troubleshooting</h2>
<table style="width:100%;border-collapse:collapse;font-size:12px">
<tr><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Problem</th><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Fix</th></tr>
<tr><td style="padding:6px">SSH connects, Docker commands hang</td><td style="padding:6px">Docker service may be off. In Unraid UI: <strong>Settings → Docker</strong> → <em>Enable Docker</em> = Yes.</td></tr>
<tr><td style="padding:6px">Root login not working</td><td style="padding:6px">Unraid 7+ made root SSH key-only by default. Add a key in Settings → User Utilities → User Profile → SSH Authorized Keys.</td></tr>
<tr><td style="padding:6px">Tower hostname doesn't resolve</td><td style="padding:6px">Use the IP instead. Set a static IP for your Unraid in Settings → Network Settings.</td></tr>
</table>
`,
      content_ro: `<h2>Ce îți trebuie</h2>
<ul>
  <li>Unraid 6.9 sau mai nou</li>
  <li>SSH activat (de obicei e on by default)</li>
  <li>Docker Dash rulând pe ceva reachable</li>
</ul>

<h2>Pasul 1: Verifică SSH</h2>
<p>Settings → Management Access → SSH → <strong>Use SSH</strong> = Yes. Port <code>22</code>.</p>
<p>Dacă n-ai intrat niciodată pe SSH, setează key-based login în Settings → User Utilities → User Profile → SSH Authorized Keys. Nu e obligatoriu dar e mai robust decât parola de root.</p>

<h2>Pasul 2: Adaugă host-ul în Docker Dash</h2>
<ol>
  <li>Multi-Host → Add Host</li>
  <li>Connection type: SSH tunnel</li>
  <li>Host: IP-ul Unraid sau <code>tower.local</code></li>
  <li>Port: 22</li>
  <li>Username: <code>root</code> (Unraid rulează tot ca root)</li>
  <li>Auth: parola sau private key</li>
  <li>Docker socket: <code>/var/run/docker.sock</code></li>
  <li>Test → ✓ → Save</li>
</ol>

<h2>Pasul 3: Verifică badge-ul</h2>
<p>Pe Multi-Host ar trebui să apară badge-ul <strong>Unraid</strong>.</p>

<h2>Tips Unraid-specifice</h2>
<ul>
  <li><strong>Convenția appdata</strong>: <code>/mnt/user/appdata/&lt;service&gt;</code>. Păstreaz-o când deploy-ezi compose stacks prin Docker Dash — compatibilitate cu Community Apps.</li>
  <li><strong>Community Apps și Docker Dash coexistă</strong> — ambele citesc același daemon Docker.</li>
  <li><strong>Outbound filter</strong> merge perfect — Unraid folosește bridge network standard.</li>
</ul>
`,
    },

    {
      slug: 'generic-vps',
      title: 'Connect Docker Dash to any VPS (Hetzner, DigitalOcean, AWS EC2, GCE, Azure, Linode, Vultr)',
      title_ro: 'Conectează Docker Dash la orice VPS (Hetzner, DigitalOcean, AWS EC2, GCE, Azure, Linode, Vultr)',
      category: 'multi-host',
      difficulty: 'beginner',
      icon: 'fas fa-cloud',
      summary: 'One guide for every major VPS provider. If it has Ubuntu/Debian + Docker + SSH, it works. AWS EC2, GCE, Azure VM, DigitalOcean Droplets, Hetzner Cloud, Linode, Vultr — all the same flow.',
      summary_ro: 'Un ghid pentru orice provider VPS. Dacă are Ubuntu/Debian + Docker + SSH, merge. AWS EC2, GCE, Azure VM, DigitalOcean Droplets, Hetzner, Linode, Vultr — toate au același flow.',
      content: `<h2>Why one guide covers them all</h2>
<p>AWS EC2, Google Compute Engine, Azure VM, DigitalOcean Droplets, Hetzner Cloud, Linode, Vultr, OVH, Contabo, whatever — at the end of the day they're all:</p>
<ol>
  <li>A Linux VM</li>
  <li>With Docker installed</li>
  <li>Reachable via SSH</li>
</ol>
<p>If those three things are true, Docker Dash's SSH multi-host support (v6.8.0+) connects out of the box. The only per-provider difference is how you <strong>provision</strong> the VM and how you <strong>find the IP</strong>.</p>

<h2>Step 1: Provision a VM with Docker</h2>

<h3>DigitalOcean (simplest)</h3>
<p>Use the one-click <a href="https://marketplace.digitalocean.com/apps/docker" target="_blank">Docker marketplace image</a>. Docker + docker-compose pre-installed. Your SSH key is added at provision time.</p>

<h3>Hetzner Cloud / Linode / Vultr</h3>
<p>Pick Ubuntu 22.04 or 24.04 LTS, paste this into the <strong>user-data</strong> / <strong>cloud-init</strong> field:</p>
<pre><code>#cloud-config
package_update: true
packages: [ca-certificates, curl, gnupg]
runcmd:
  - curl -fsSL https://get.docker.com | sh
  - usermod -aG docker ubuntu  # or root — adjust per provider's default user
</code></pre>

<h3>AWS EC2</h3>
<p>Launch an Ubuntu 22.04 AMI. For user-data, use the same cloud-init above, but replace <code>ubuntu</code> with <code>ec2-user</code> on Amazon Linux (or leave as-is for Ubuntu AMIs). Security group: allow inbound TCP 22 from your Docker Dash host's IP.</p>

<h3>Google Compute Engine</h3>
<p>Use "Container-Optimized OS" (has Docker pre-installed) OR a normal Debian/Ubuntu + cloud-init. Firewall: allow <code>tcp:22</code> from your Docker Dash IP.</p>

<h3>Azure VM</h3>
<p>Ubuntu 22.04 LTS. NSG inbound rule for TCP 22 from your Docker Dash IP. After creation, SSH in and run <code>curl -fsSL https://get.docker.com | sh</code>.</p>

<h2>Step 2: Verify Docker works via SSH</h2>
<pre><code>ssh your-user@your-vps-ip
docker ps  # should not say "permission denied"
# If it does:
sudo usermod -aG docker $USER
exit
ssh your-user@your-vps-ip
docker ps  # now works
</code></pre>

<h2>Step 3: Add the host in Docker Dash</h2>
<ol>
  <li><strong>Multi-Host → Add Host</strong></li>
  <li>Connection type: <strong>SSH tunnel</strong></li>
  <li>Host: your VPS's public IP (or hostname)</li>
  <li>Port: <code>22</code> (or whatever you set)</li>
  <li>Username: <code>ubuntu</code> / <code>ec2-user</code> / <code>root</code> / whatever matches your distro</li>
  <li>Auth: <strong>private key</strong> is strongly recommended over passwords for cloud VMs</li>
  <li>Docker socket path: <code>/var/run/docker.sock</code></li>
  <li>Test → ✓ → Save</li>
</ol>

<h2>Step 4: Verify the badge</h2>
<p>Multi-Host page. You'll see a badge for the base distro (<strong>Ubuntu</strong>, <strong>Debian</strong>, <strong>Fedora</strong>, etc). Cloud-vendor detection (AWS / GCP / Azure / Hetzner / DO) is planned for a future release; for now, the distro badge is what you get.</p>

<h2>Security hardening checklist</h2>
<table style="width:100%;border-collapse:collapse;font-size:12px">
<tr><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Harden</th><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Why</th></tr>
<tr><td style="padding:6px">Use SSH keys, disable password auth</td><td style="padding:6px">Default passwords on public IPs get brute-forced within minutes</td></tr>
<tr><td style="padding:6px">Restrict firewall port 22 to Docker Dash's IP</td><td style="padding:6px">Even with keys, smaller attack surface is better</td></tr>
<tr><td style="padding:6px">Use a non-root user + sudo, not root directly</td><td style="padding:6px">Minimizes blast radius if SSH key is compromised</td></tr>
<tr><td style="padding:6px">Apply the Outbound Filter (System → Egress)</td><td style="padding:6px">Prevents credential exfiltration if a container is compromised</td></tr>
<tr><td style="padding:6px">Enable fail2ban</td><td style="padding:6px"><code>apt install fail2ban</code> — banned bot traffic saves CPU + log noise</td></tr>
</table>

<h2>Troubleshooting</h2>
<table style="width:100%;border-collapse:collapse;font-size:12px">
<tr><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Problem</th><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Fix</th></tr>
<tr><td style="padding:6px">Connection times out</td><td style="padding:6px">Firewall / security group blocking port 22 from your Docker Dash IP.</td></tr>
<tr><td style="padding:6px">"Permission denied (publickey)"</td><td style="padding:6px">Wrong private key or wrong username. AWS Ubuntu AMIs use <code>ubuntu</code>, Amazon Linux uses <code>ec2-user</code>, DigitalOcean uses <code>root</code> by default.</td></tr>
<tr><td style="padding:6px">SSH works, Docker commands "permission denied"</td><td style="padding:6px">User not in docker group. <code>sudo usermod -aG docker $USER</code>, log out + in.</td></tr>
<tr><td style="padding:6px">Docker Dash shows host as unhealthy after reboot</td><td style="padding:6px">Docker service didn't auto-start. <code>sudo systemctl enable docker</code>.</td></tr>
</table>
`,
      content_ro: `<h2>De ce un ghid acoperă toți providerii</h2>
<p>AWS EC2, GCE, Azure VM, DigitalOcean, Hetzner, Linode, Vultr, OVH — la final, toate sunt: <strong>Linux VM + Docker + SSH</strong>. Dacă ai astea trei, Docker Dash se conectează. Singura diferență per provider e cum provisionezi VM-ul.</p>

<h2>Pasul 1: Provisionează un VM cu Docker</h2>

<h3>DigitalOcean (cel mai simplu)</h3>
<p>Folosește one-click <a href="https://marketplace.digitalocean.com/apps/docker" target="_blank">Docker marketplace image</a>. Docker + docker-compose pre-instalate. Cheia ta SSH e adăugată la provision.</p>

<h3>Hetzner / Linode / Vultr</h3>
<p>Alege Ubuntu 22.04/24.04 LTS, pune în <strong>user-data</strong>:</p>
<pre><code>#cloud-config
package_update: true
packages: [ca-certificates, curl, gnupg]
runcmd:
  - curl -fsSL https://get.docker.com | sh
  - usermod -aG docker ubuntu
</code></pre>

<h3>AWS EC2 / GCE / Azure VM</h3>
<p>Ubuntu 22.04 AMI/image. Acelasi cloud-init. Deschide TCP 22 în security group / NSG / firewall pentru IP-ul Docker Dash.</p>

<h2>Pasul 2: Verifică Docker pe SSH</h2>
<pre><code>ssh user@ip
docker ps  # nu trebuie să zică "permission denied"
# Dacă zice:
sudo usermod -aG docker $USER
exit
ssh user@ip
docker ps  # acum merge</code></pre>

<h2>Pasul 3: Adaugă host-ul în Docker Dash</h2>
<ol>
  <li>Multi-Host → Add Host</li>
  <li>Connection type: SSH tunnel</li>
  <li>Host + port + username</li>
  <li>Auth: <strong>cheie privată</strong> recomandat</li>
  <li>Socket: <code>/var/run/docker.sock</code></li>
  <li>Test → ✓ → Save</li>
</ol>

<h2>Hardening security</h2>
<ul>
  <li>Cheie SSH în loc de parolă</li>
  <li>Firewall restrictiv pe port 22 (doar IP-ul Docker Dash)</li>
  <li>User non-root + sudo</li>
  <li>Outbound Filter în Docker Dash (System → Egress)</li>
  <li><code>apt install fail2ban</code></li>
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
  db.prepare(`DELETE FROM howto_guides WHERE slug IN ('synology-dsm', 'unraid', 'generic-vps') AND is_builtin = 1`).run();
};
