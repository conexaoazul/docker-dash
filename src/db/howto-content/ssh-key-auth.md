---
title: Set up SSH key authentication (any host)
summary: The secure way to connect Docker Dash to any host. Generate a key, upload the public half to your host, paste the private half into Docker Dash. Covers Synology, Unraid, TrueNAS, QNAP, OMV, and generic VPS — each has its own quirk for where the public key lives.
category: multi-host
difficulty: beginner
icon: fas fa-key
---

<h2>Why keys, not passwords</h2>
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
  <li>Open the private key file: <code>cat ~/.ssh/id_ed25519</code> (Linux/macOS) or <code>Get-Content ~.sshid_ed25519</code> (Windows PowerShell)</li>
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
<pre><code>sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
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

