---
title: Conectează Docker Dash la TrueNAS SCALE (Electric Eel+)
summary: 'TrueNAS SCALE 24.10 "Electric Eel" a revenit la Docker nativ de la K3s. Activează SSH, evită aplicațiile TrueNAS-manageuite, și conectează Docker Dash.'
---

<h2>Ce îți trebuie</h2>
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

