---
title: Conectează Docker Dash la OpenMediaVault (OMV)
summary: OMV e Debian + un UI NAS. Instalează plugin-ul Docker oficial (omv-extras), activează SSH, și Docker Dash se conectează ca la orice Debian.
---

<h2>Ce îți trebuie</h2>
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

