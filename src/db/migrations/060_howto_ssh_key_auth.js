'use strict';

// v6.13.1 — Canonical SSH key auth guide. The per-platform How-Tos (058 +
// 059) mention "private key recommended over password" in one line but
// never walk through the setup. This closes that gap with one guide
// that covers every platform we detect: where the public key goes on
// each (Synology Home Service gotcha, Unraid UI, TrueNAS UI, QNAP
// manual, OMV plugin UI, generic VPS ssh-copy-id), plus the private
// key upload flow in Docker Dash.

exports.up = function (db) {
  const slug = 'ssh-key-auth';
  const title = 'Set up SSH key authentication (any host)';
  const title_ro = 'Setează autentificare SSH cu cheie (orice host)';
  const category = 'multi-host';
  const difficulty = 'beginner';
  const icon = 'fas fa-key';
  const summary = 'The secure way to connect Docker Dash to any host. Generate a key, upload the public half to your host, paste the private half into Docker Dash. Covers Synology, Unraid, TrueNAS, QNAP, OMV, and generic VPS — each has its own quirk for where the public key lives.';
  const summary_ro = 'Modul sigur de conectare Docker Dash la orice host. Generezi o cheie, urci partea publică pe host, lipești cea privată în Docker Dash. Acoperă Synology, Unraid, TrueNAS, QNAP, OMV și VPS generic — fiecare are ciudățenia lui pentru locul unde stă cheia publică.';

  const content = `<h2>Why keys, not passwords</h2>
<ul>
  <li><strong>Passwords leak.</strong> Dictionary attacks, breaches, social engineering — all defeat passwords. SSH keys defeat all three.</li>
  <li><strong>Docker Dash stores credentials encrypted at rest.</strong> Same crypto for passwords and keys, but a 4096-bit RSA key is still harder to brute-force than a typical admin password if the encryption is ever bypassed.</li>
  <li><strong>Rotation is easier</strong> — replace a key with one UI action, no "everyone change their password now" email.</li>
</ul>

<h2>Step 1: Generate a key on the machine running Docker Dash</h2>
<p>If Docker Dash is in a container, "the machine" is the container host. Open a terminal there (Windows PowerShell, macOS Terminal, Linux shell — all have <code>ssh-keygen</code>):</p>
<pre><code>ssh-keygen -t ed25519 -C "docker-dash"
# or, for ancient SSH servers that don't support ed25519:
ssh-keygen -t rsa -b 4096 -C "docker-dash"</code></pre>
<p>Accept the default path (<code>~/.ssh/id_ed25519</code>). <strong>Use a passphrase</strong> if you want extra safety — Docker Dash supports encrypted private keys (you'll enter the passphrase in the host-add form).</p>
<p>This gives you two files:</p>
<ul>
  <li><code>~/.ssh/id_ed25519</code> — the <strong>private</strong> key. Never send this anywhere. You'll paste it into Docker Dash.</li>
  <li><code>~/.ssh/id_ed25519.pub</code> — the <strong>public</strong> key. You copy this to every host you want to manage.</li>
</ul>

<h2>Step 2: Install the public key on your host</h2>
<p>This is the platform-specific step. Pick your platform:</p>

<h3>🟦 Synology DSM 7.x</h3>
<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;padding:10px;margin:10px 0;color:#78350f">
<strong>Must-do prerequisite:</strong> enable the User Home Service first, or <code>.ssh/authorized_keys</code> has nowhere to live.
</div>
<ol>
  <li>DSM UI → <strong>Control Panel → User &amp; Group → Advanced</strong> → scroll to <em>User Home</em> → check <strong>Enable user home service</strong> → Apply</li>
  <li>SSH into the NAS: <code>ssh your-admin@synology.local</code></li>
  <li>Create the <code>.ssh</code> directory with strict permissions:
<pre><code>mkdir -p ~/.ssh
chmod 700 ~/.ssh
# Paste your public key (from step 1's .pub file) into authorized_keys:
echo "ssh-ed25519 AAAA... docker-dash" &gt; ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
# Home directory itself must not be group/world-writable:
chmod 700 ~</code></pre>
  </li>
  <li>Test from the Docker Dash machine: <code>ssh -i ~/.ssh/id_ed25519 your-admin@synology.local</code> — should log in without asking for a password.</li>
</ol>
<p><strong>DSM 7.2 gotcha:</strong> if key auth still doesn't work after the steps above, check <code>/etc/ssh/sshd_config</code> contains <code>PubkeyAuthentication yes</code> (uncommented). Some DSM 7.2 updates re-comment it. After editing: <code>sudo synoservice --restart sshd</code>.</p>

<h3>🟧 Unraid</h3>
<p>Unraid has a UI for this — no shell needed.</p>
<ol>
  <li>Unraid UI → <strong>Settings → User Utilities → User Profile</strong> → pick your user (usually <code>root</code>)</li>
  <li>Scroll to <strong>SSH Authorized Keys</strong> field</li>
  <li>Paste the contents of your <code>id_ed25519.pub</code> file (the full line, starting with <code>ssh-ed25519</code> or <code>ssh-rsa</code>)</li>
  <li><strong>Apply</strong> → Unraid writes the key to <code>/root/.ssh/authorized_keys</code> with correct permissions automatically</li>
</ol>

<h3>🟩 TrueNAS SCALE (Electric Eel+)</h3>
<ol>
  <li>SCALE UI → <strong>Credentials → Local Users</strong> → click your admin user → <strong>Edit</strong></li>
  <li>Scroll to <strong>SSH Public Key</strong> → paste the public key</li>
  <li><strong>Save</strong> → SCALE writes it with correct permissions</li>
</ol>

<h3>🟥 QNAP QTS / QuTS hero</h3>
<p>QNAP doesn't have a UI for SSH keys. Do it manually on the shell:</p>
<ol>
  <li>SSH in as admin: <code>ssh admin@qnap.local</code></li>
  <li>Create <code>.ssh</code> and set perms:
<pre><code>mkdir -p ~/.ssh
chmod 700 ~/.ssh
echo "ssh-ed25519 AAAA... docker-dash" &gt;&gt; ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys</code></pre>
  </li>
</ol>
<p><strong>QTS gotcha:</strong> some QTS versions reset <code>~/.ssh</code> permissions after firmware updates. If key auth breaks after a QTS upgrade, re-run the <code>chmod</code> commands above.</p>

<h3>🟫 OpenMediaVault</h3>
<ol>
  <li>OMV UI → <strong>Users → Users</strong> tab → select your admin → <strong>Edit</strong></li>
  <li>Go to the <strong>Public keys</strong> tab (OMV 6.x and 7.x both have this)</li>
  <li>Paste the public key → <strong>Save</strong></li>
</ol>
<p>OMV writes it to <code>/home/&lt;user&gt;/.ssh/authorized_keys</code> with the right perms automatically.</p>

<h3>⬛ Generic VPS (Ubuntu / Debian / Fedora / Rocky / Alma / etc.)</h3>
<p>If your cloud provider already accepted the key at VM provision time, skip this — it's already in place. Otherwise:</p>
<pre><code># From the Docker Dash machine:
ssh-copy-id -i ~/.ssh/id_ed25519.pub your-user@your-vps-ip
# Will prompt once for the password, then installs the key.

# Or manually, if ssh-copy-id isn't available:
cat ~/.ssh/id_ed25519.pub | ssh your-user@your-vps-ip 'mkdir -p ~/.ssh &amp;&amp; cat &gt;&gt; ~/.ssh/authorized_keys &amp;&amp; chmod 600 ~/.ssh/authorized_keys'</code></pre>

<h2>Step 3: Paste the private key into Docker Dash</h2>
<ol>
  <li>Open the private key file: <code>cat ~/.ssh/id_ed25519</code> (Linux/macOS) or <code>Get-Content ~\.ssh\id_ed25519</code> (Windows PowerShell)</li>
  <li>Copy the ENTIRE output — from <code>-----BEGIN OPENSSH PRIVATE KEY-----</code> to <code>-----END OPENSSH PRIVATE KEY-----</code>, inclusive of those markers</li>
  <li>In Docker Dash: <strong>Multi-Host → Add Host</strong> (or edit existing host)</li>
  <li>Auth method: <strong>Private key</strong></li>
  <li>Paste into the <strong>Private key</strong> field</li>
  <li>If you set a passphrase on the key, enter it in <strong>Key passphrase</strong></li>
  <li><strong>Test connection</strong> → ✓</li>
  <li>Save</li>
</ol>
<p>Docker Dash stores the private key encrypted at rest (AES-GCM, same crypto as ACME credentials + SMTP passwords).</p>

<h2>Step 4: Lock down password auth (optional but recommended)</h2>
<p>Once key auth works, you can turn off password login on the host so nothing but the key opens the door. On any non-Synology host with a normal sshd:</p>
<pre><code>sudo sed -i 's/^#\\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl restart sshd</code></pre>
<p>On Synology: DSM doesn't have a UI toggle for this — you'd edit <code>/etc/ssh/sshd_config</code> the same way, then <code>sudo synoservice --restart sshd</code>. <strong>Test key auth works FIRST</strong>, then disable passwords — otherwise you lock yourself out.</p>

<h2>Troubleshooting: "key auth doesn't work and I don't know why"</h2>
<p>The single best debug tool is SSH's verbose mode. From the Docker Dash machine:</p>
<pre><code>ssh -vvv -i ~/.ssh/id_ed25519 your-user@your-host 2&gt;&amp;1 | grep -iE 'offering|accepted|denied|publickey'</code></pre>
<p>This tells you whether the client offered the key and what the server did with it.</p>
<table style="width:100%;border-collapse:collapse;font-size:12px">
<tr><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Symptom</th><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Root cause</th></tr>
<tr><td style="padding:6px">Server keeps asking for a password even though key is configured</td><td style="padding:6px">Home dir or <code>~/.ssh</code> has group-write perms. OpenSSH silently refuses to use the key. Fix: <code>chmod 700 ~ &amp;&amp; chmod 700 ~/.ssh &amp;&amp; chmod 600 ~/.ssh/authorized_keys</code>.</td></tr>
<tr><td style="padding:6px">"Permission denied (publickey)"</td><td style="padding:6px">Key's public half not actually in <code>authorized_keys</code> for this user on this host. Double-check you edited the right file for the right user. Synology: did you enable User Home Service first?</td></tr>
<tr><td style="padding:6px">Client debug says "Offering public key" but "Authentications that can continue: password"</td><td style="padding:6px">Server rejected the key. Check <code>/var/log/auth.log</code> on the host for specifics — usually "bad permissions" or "Authentication refused: bad ownership".</td></tr>
<tr><td style="padding:6px">Key works on shell but not from Docker Dash</td><td style="padding:6px">You pasted only part of the private key into the UI. Include the BEGIN/END markers.</td></tr>
<tr><td style="padding:6px">"Load key ... invalid format"</td><td style="padding:6px">Wrong file — you copied the <code>.pub</code> file (public key) into the private-key field. Use the file WITHOUT <code>.pub</code>.</td></tr>
<tr><td style="padding:6px">ed25519 key rejected by server</td><td style="padding:6px">Ancient sshd (&lt;OpenSSH 6.5, ~2014). Re-generate with <code>ssh-keygen -t rsa -b 4096</code>. Should never happen on a modern NAS/cloud VM, but old Synology/QNAP models shipped old builds.</td></tr>
</table>

<h2>Key hygiene</h2>
<ul>
  <li><strong>One key per Docker Dash install</strong>, not one per host. Simpler to rotate.</li>
  <li><strong>Rotate annually</strong> — generate a new key, add the new public half to each host, remove the old one, update Docker Dash with the new private half. Docker Dash's host-edit preserves uptime during rotation (the new tunnel uses the new key; the old one is dropped).</li>
  <li><strong>Back up the private key</strong> (to a password manager or secret store, not a file share). Losing it locks Docker Dash out of every host until you re-install keys manually.</li>
  <li><strong>Passphrase protect it</strong> if the Docker Dash host isn't physically secured (e.g. a laptop). Docker Dash will prompt for the passphrase when adding the host and store it encrypted like the key itself.</li>
</ul>
`;

  const content_ro = `<h2>De ce chei, nu parole</h2>
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
  <li>Deschide fișierul privat: <code>cat ~/.ssh/id_ed25519</code> (Linux/macOS) sau <code>Get-Content ~\\.ssh\\id_ed25519</code> (PowerShell)</li>
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
<pre><code>sudo sed -i 's/^#\\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
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
`;

  const stmt = db.prepare(`
    INSERT INTO howto_guides (slug, title, title_ro, category, difficulty, icon, summary, summary_ro, content, content_ro, is_builtin)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT(slug) DO UPDATE SET
      title = excluded.title, title_ro = excluded.title_ro,
      category = excluded.category, difficulty = excluded.difficulty,
      icon = excluded.icon, summary = excluded.summary, summary_ro = excluded.summary_ro,
      content = excluded.content, content_ro = excluded.content_ro,
      is_builtin = 1
  `);
  stmt.run(slug, title, title_ro, category, difficulty, icon, summary, summary_ro, content, content_ro);
};

exports.down = function (db) {
  db.prepare(`DELETE FROM howto_guides WHERE slug = 'ssh-key-auth' AND is_builtin = 1`).run();
};
