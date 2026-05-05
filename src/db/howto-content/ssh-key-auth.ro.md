---
title: Setează autentificare SSH cu cheie (orice host)
summary: Modul sigur de conectare Docker Dash la orice host. Generezi o cheie, urci partea publică pe host, lipești cea privată în Docker Dash. Acoperă Synology, Unraid, TrueNAS, QNAP, OMV și VPS generic — fiecare are ciudățenia lui pentru locul unde stă cheia publică.
---

<h2>De ce chei, nu parole</h2>
<ul>
  <li><strong>Parolele se scurg.</strong> Dicționare, breșe, inginerie socială — le învinge pe toate. Cheile SSH le învinge pe toate trei.</li>
  <li><strong>Docker Dash criptează credențialele at rest.</strong> Același crypto pentru parole și chei, dar o cheie RSA 4096-bit e mult mai grea de brute-force decât o parolă tipică de admin dacă criptarea e vreodată compromisă.</li>
  <li><strong>Rotația e ușoară</strong> — înlocuiești o cheie cu o acțiune în UI, fără email tip "toată lumea schimbă parola".</li>
</ul>

<h2>Pasul 1: Generează o cheie pe mașina cu Docker Dash</h2>
<p>Dacă Docker Dash e în container, "mașina" e host-ul containerului. Deschide un terminal acolo (Windows PowerShell, macOS Terminal, Linux shell):</p>
<pre><code>ssh-keygen -t ed25519 -C "docker-dash"
# sau, pentru servere SSH antice care nu suportă ed25519:
ssh-keygen -t rsa -b 4096 -C "docker-dash"</code></pre>
<p>Acceptă path-ul default (<code>~/.ssh/id_ed25519</code>). <strong>Folosește o passphrase</strong> pentru un plus de siguranță — Docker Dash suportă chei private criptate (introduci passphrase-ul în formularul de add-host).</p>

<h2>Pasul 2: Instalează cheia publică pe host</h2>

<h3>🟦 Synology DSM 7.x</h3>
<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;padding:10px;margin:10px 0;color:#78350f">
<strong>Obligatoriu înainte:</strong> activează User Home Service, altfel <code>.ssh/authorized_keys</code> n-are unde să stea.
</div>
<ol>
  <li>UI DSM → <strong>Control Panel → User &amp; Group → Advanced</strong> → scroll la <em>User Home</em> → bifează <strong>Enable user home service</strong> → Apply</li>
  <li>SSH pe NAS: <code>ssh admin-ul-tău@synology.local</code></li>
  <li>Creează <code>.ssh</code> cu perms stricte:
<pre><code>mkdir -p ~/.ssh
chmod 700 ~/.ssh
echo "ssh-ed25519 AAAA... docker-dash" &gt; ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
chmod 700 ~</code></pre>
  </li>
  <li>Testează din mașina Docker Dash: <code>ssh -i ~/.ssh/id_ed25519 admin-ul-tău@synology.local</code> — ar trebui să intre fără parolă.</li>
</ol>
<p><strong>DSM 7.2 gotcha:</strong> dacă tot nu merge, verifică <code>/etc/ssh/sshd_config</code> să aibă <code>PubkeyAuthentication yes</code> necomentat. Unele update-uri DSM 7.2 îl re-comentează. După edit: <code>sudo synoservice --restart sshd</code>.</p>

<h3>🟧 Unraid</h3>
<p>Unraid are UI — nu trebuie shell.</p>
<ol>
  <li>UI Unraid → <strong>Settings → User Utilities → User Profile</strong> → selectează user-ul (de obicei <code>root</code>)</li>
  <li>Scroll la <strong>SSH Authorized Keys</strong></li>
  <li>Lipește conținutul fișierului <code>id_ed25519.pub</code> (linia întreagă)</li>
  <li>Apply → Unraid scrie cheia cu permisiunile corecte</li>
</ol>

<h3>🟩 TrueNAS SCALE (Electric Eel+)</h3>
<ol>
  <li>UI SCALE → <strong>Credentials → Local Users</strong> → click admin → <strong>Edit</strong></li>
  <li>Scroll la <strong>SSH Public Key</strong> → lipește</li>
  <li>Save</li>
</ol>

<h3>🟥 QNAP QTS / QuTS hero</h3>
<p>QNAP nu are UI pentru chei SSH. Manual:</p>
<ol>
  <li>SSH ca admin: <code>ssh admin@qnap.local</code></li>
  <li>Creează <code>.ssh</code>:
<pre><code>mkdir -p ~/.ssh
chmod 700 ~/.ssh
echo "ssh-ed25519 AAAA... docker-dash" &gt;&gt; ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys</code></pre>
  </li>
</ol>
<p><strong>QTS gotcha:</strong> unele versiuni QTS resetează perms pe <code>~/.ssh</code> după update firmware. Dacă autentificarea se strică după upgrade QTS, re-rulează <code>chmod</code>-urile.</p>

<h3>🟫 OpenMediaVault</h3>
<ol>
  <li>UI OMV → <strong>Users → Users</strong> → selectează adminul → <strong>Edit</strong></li>
  <li>Tab <strong>Public keys</strong> (OMV 6.x și 7.x ambele)</li>
  <li>Lipește cheia publică → <strong>Save</strong></li>
</ol>

<h3>⬛ VPS generic (Ubuntu / Debian / Fedora / etc.)</h3>
<p>Dacă provider-ul cloud a acceptat cheia la provision, e deja acolo. Altfel:</p>
<pre><code>ssh-copy-id -i ~/.ssh/id_ed25519.pub user@ip
# Cere parola o dată, apoi instalează cheia.

# Sau manual:
cat ~/.ssh/id_ed25519.pub | ssh user@ip 'mkdir -p ~/.ssh &amp;&amp; cat &gt;&gt; ~/.ssh/authorized_keys &amp;&amp; chmod 600 ~/.ssh/authorized_keys'</code></pre>

<h2>Pasul 3: Lipește cheia privată în Docker Dash</h2>
<ol>
  <li>Deschide fișierul privat: <code>cat ~/.ssh/id_ed25519</code> (Linux/macOS) sau <code>Get-Content ~\.ssh\id_ed25519</code> (PowerShell)</li>
  <li>Copiază TOT output-ul — de la <code>-----BEGIN OPENSSH PRIVATE KEY-----</code> la <code>-----END OPENSSH PRIVATE KEY-----</code>, inclusiv markerii</li>
  <li>Docker Dash: <strong>Multi-Host → Add Host</strong> (sau edit existent)</li>
  <li>Auth: <strong>Private key</strong></li>
  <li>Lipește în câmpul <strong>Private key</strong></li>
  <li>Dacă ai passphrase, pune-l la <strong>Key passphrase</strong></li>
  <li><strong>Test connection</strong> → ✓ → Save</li>
</ol>
<p>Docker Dash stochează cheia privată criptată at rest (AES-GCM, același crypto ca ACME + SMTP).</p>

<h2>Pasul 4: Închide autentificarea cu parolă (opțional dar recomandat)</h2>
<p>După ce cheia merge:</p>
<pre><code>sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl restart sshd</code></pre>
<p>Pe Synology: edit manual <code>/etc/ssh/sshd_config</code> + <code>sudo synoservice --restart sshd</code>. <strong>Testează cheia ÎNTÂI</strong>, altfel te blochezi afară.</p>

<h2>Troubleshooting</h2>
<p>Cel mai bun tool de debug e modul verbose:</p>
<pre><code>ssh -vvv -i ~/.ssh/id_ed25519 user@host 2&gt;&amp;1 | grep -iE 'offering|accepted|denied|publickey'</code></pre>
<table style="width:100%;border-collapse:collapse;font-size:12px">
<tr><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Simptom</th><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Cauză</th></tr>
<tr><td style="padding:6px">Serverul cere tot parola</td><td style="padding:6px">Perms pe home sau <code>~/.ssh</code> sunt group-writable. OpenSSH refuză silent. Fix: <code>chmod 700 ~ &amp;&amp; chmod 700 ~/.ssh &amp;&amp; chmod 600 ~/.ssh/authorized_keys</code>.</td></tr>
<tr><td style="padding:6px">"Permission denied (publickey)"</td><td style="padding:6px">Cheia publică nu e în <code>authorized_keys</code> pentru acest user. Synology: ai activat User Home Service?</td></tr>
<tr><td style="padding:6px">Client "Offering public key" dar "password"</td><td style="padding:6px">Serverul a respins cheia. Verifică <code>/var/log/auth.log</code> — de obicei "bad permissions" sau "bad ownership".</td></tr>
<tr><td style="padding:6px">Merge pe shell dar nu din Docker Dash</td><td style="padding:6px">Ai lipit doar parte din cheie în UI. Include markerii BEGIN/END.</td></tr>
<tr><td style="padding:6px">"Load key ... invalid format"</td><td style="padding:6px">Ai pus fișierul <code>.pub</code> (public) în câmpul de cheie privată. Folosește fișierul FĂRĂ <code>.pub</code>.</td></tr>
<tr><td style="padding:6px">ed25519 respinsă</td><td style="padding:6px">sshd antic. Regenerează cu <code>ssh-keygen -t rsa -b 4096</code>.</td></tr>
</table>

<h2>Igienă a cheilor</h2>
<ul>
  <li><strong>O cheie per Docker Dash</strong>, nu una per host.</li>
  <li><strong>Rotație anuală</strong>. Docker Dash păstrează uptime-ul în timpul rotației.</li>
  <li><strong>Back-up la cheia privată</strong> (într-un password manager, nu pe un share). Dacă o pierzi, Docker Dash e blocat în afara tuturor host-urilor.</li>
  <li><strong>Passphrase</strong> dacă host-ul Docker Dash nu e securizat fizic.</li>
</ul>

