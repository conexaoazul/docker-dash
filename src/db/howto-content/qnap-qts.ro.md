---
title: Conectează Docker Dash la QNAP (Container Station pe QTS / QuTS hero)
summary: QNAP Container Station e wrapper peste Docker. Activează SSH, găsește path-ul socket-ului (QNAP îl mută uneori), și conectează. QTS 5.x și QuTS hero merg ambele.
---

<h2>Ce îți trebuie</h2>
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

