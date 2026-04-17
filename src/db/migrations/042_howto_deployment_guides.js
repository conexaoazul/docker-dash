'use strict';

// 5 enterprise deployment guides — secrets, rotation, mTLS, printf trap, pre-deploy checklist
exports.up = function(db) {
  const guides = [
    {
      slug: 'docker-secrets-management',
      title: 'Docker Secrets Management',
      title_ro: 'Gestionarea Docker Secrets',
      category: 'security',
      difficulty: 'intermediate',
      icon: 'fas fa-user-secret',
      summary: 'Use Docker secrets with the _FILE pattern to keep credentials out of env vars and image layers.',
      summary_ro: 'Folosește Docker secrets cu pattern-ul _FILE pentru a ține credențialele în afara env vars și layerelor de imagine.',
      content: `<h2>Why Not Environment Variables?</h2>
<p>Putting secrets in <code>environment:</code> exposes them in: <strong>docker inspect</strong>, process listing (<code>ps aux</code>), container logs, and crash dumps. Anyone with access to the Docker socket can read them.</p>

<h2>The _FILE Pattern</h2>
<p>Most modern images (postgres, mysql, mariadb, redis, nginx) support reading secrets from a file via the <code>_FILE</code> suffix. Instead of:</p>
<pre><code>environment:
  POSTGRES_PASSWORD: my-secret-pass</code></pre>
<p>Use:</p>
<pre><code>environment:
  POSTGRES_PASSWORD_FILE: /run/secrets/db_password
secrets:
  - db_password</code></pre>

<h2>Setup with docker-compose</h2>
<pre><code>services:
  db:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    secrets:
      - db_password

secrets:
  db_password:
    file: /etc/myapp/secrets/db_password.txt</code></pre>

<h2>Create the Secret File (Correct Way)</h2>
<pre><code># CRITICAL: use printf, NEVER echo (echo adds \\n which breaks credentials)
sudo mkdir -p /etc/myapp/secrets
sudo sh -c 'printf "%s" "$(openssl rand -base64 24)" > /etc/myapp/secrets/db_password.txt'
sudo chmod 600 /etc/myapp/secrets/db_password.txt
sudo chown root:docker /etc/myapp/secrets/db_password.txt</code></pre>

<h2>Common Pitfalls</h2>
<ul>
  <li><strong>echo adds newline:</strong> <code>echo "secret" > file</code> stores <code>secret\\n</code> — many drivers include the newline literally, causing silent auth failures.</li>
  <li><strong>Permissions matter:</strong> file must be 600 (root + docker group only).</li>
  <li><strong>Don't commit:</strong> add <code>secrets/</code> to .gitignore.</li>
  <li><strong>App must support _FILE:</strong> custom apps need to read the file themselves.</li>
</ul>

<h2>Verify in the Container</h2>
<pre><code># Files appear at /run/secrets/&lt;name&gt;
docker exec mycontainer ls -la /run/secrets/
docker exec mycontainer cat /run/secrets/db_password</code></pre>`,
      content_ro: `<h2>De ce nu Environment Variables?</h2>
<p>Punerea secretelor în <code>environment:</code> le expune în: <strong>docker inspect</strong>, listarea proceselor (<code>ps aux</code>), logurile containerului și crash dumps. Oricine are acces la Docker socket le poate citi.</p>

<h2>Pattern-ul _FILE</h2>
<p>Majoritatea imaginilor moderne (postgres, mysql, mariadb, redis, nginx) suportă citirea secretelor dintr-un fișier prin sufixul <code>_FILE</code>. În loc de:</p>
<pre><code>environment:
  POSTGRES_PASSWORD: my-secret-pass</code></pre>
<p>Folosește:</p>
<pre><code>environment:
  POSTGRES_PASSWORD_FILE: /run/secrets/db_password
secrets:
  - db_password</code></pre>

<h2>Configurare cu docker-compose</h2>
<pre><code>services:
  db:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    secrets:
      - db_password

secrets:
  db_password:
    file: /etc/myapp/secrets/db_password.txt</code></pre>

<h2>Creare fișier secret (modul corect)</h2>
<pre><code># CRITIC: folosește printf, NICIODATĂ echo (echo adaugă \\n care strică credențialele)
sudo mkdir -p /etc/myapp/secrets
sudo sh -c 'printf "%s" "$(openssl rand -base64 24)" > /etc/myapp/secrets/db_password.txt'
sudo chmod 600 /etc/myapp/secrets/db_password.txt
sudo chown root:docker /etc/myapp/secrets/db_password.txt</code></pre>

<h2>Capcane comune</h2>
<ul>
  <li><strong>echo adaugă newline:</strong> <code>echo "secret" > file</code> stochează <code>secret\\n</code> — multe drivere includ newline-ul literal, cauzând eșecuri silențioase de autentificare.</li>
  <li><strong>Permisiunile contează:</strong> fișierul trebuie să fie 600 (doar root + grupul docker).</li>
  <li><strong>Nu face commit:</strong> adaugă <code>secrets/</code> în .gitignore.</li>
  <li><strong>App-ul trebuie să suporte _FILE:</strong> aplicațiile custom trebuie să citească fișierul singure.</li>
</ul>

<h2>Verificare în container</h2>
<pre><code># Fișierele apar la /run/secrets/&lt;name&gt;
docker exec mycontainer ls -la /run/secrets/
docker exec mycontainer cat /run/secrets/db_password</code></pre>`,
    },
    {
      slug: 'secret-rotation-best-practices',
      title: 'Secret Rotation Best Practices',
      title_ro: 'Best Practices Rotația Secretelor',
      category: 'security',
      difficulty: 'advanced',
      icon: 'fas fa-sync-alt',
      summary: 'Rotate database passwords, API keys, and TLS certificates safely without downtime.',
      summary_ro: 'Rotește parolele de baze de date, API keys și certificate TLS în siguranță fără downtime.',
      content: `<h2>Why Rotate?</h2>
<ul>
  <li><strong>Compliance:</strong> SOC 2, ISO 27001, PCI-DSS require periodic rotation (90-180 days).</li>
  <li><strong>Limit blast radius:</strong> if a secret leaks, the window of exposure is bounded.</li>
  <li><strong>Detect dormant credentials:</strong> rotation forces audit of who/what uses each secret.</li>
</ul>

<h2>Rotation Schedule</h2>
<table style="width:100%;border-collapse:collapse">
<tr><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Secret Type</th><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Frequency</th></tr>
<tr><td style="padding:6px">Database passwords</td><td style="padding:6px">90 days</td></tr>
<tr><td style="padding:6px">API keys (third-party)</td><td style="padding:6px">180 days</td></tr>
<tr><td style="padding:6px">JWT signing keys</td><td style="padding:6px">180 days</td></tr>
<tr><td style="padding:6px">TLS certificates</td><td style="padding:6px">12 months (auto-renew)</td></tr>
<tr><td style="padding:6px">Root/admin credentials</td><td style="padding:6px">After every team member departure</td></tr>
</table>

<h2>Atomic Rotation Procedure</h2>
<pre><code># 1. Generate new secret
NEW=$(openssl rand -base64 24)

# 2. Update the backing service (DB user password)
psql -c "ALTER USER myapp WITH PASSWORD '$NEW';"

# 3. Atomic file replace (write-then-rename, never edit in place)
sudo sh -c 'printf "%s" "'"$NEW"'" > /etc/myapp/secrets/db_password.new'
sudo mv /etc/myapp/secrets/db_password.new /etc/myapp/secrets/db_password

# 4. Force-recreate containers (Docker re-mounts the secret)
docker compose up -d --force-recreate api worker

# 5. Smoke test
curl -f https://app.example.com/health || echo "ROLLBACK NEEDED"</code></pre>

<h2>Rollback Plan</h2>
<p>Always keep the previous secret for 24 hours:</p>
<pre><code># Before rotating, save current
sudo cp /etc/myapp/secrets/db_password /etc/myapp/secrets/db_password.previous

# If new fails, restore
sudo mv /etc/myapp/secrets/db_password.previous /etc/myapp/secrets/db_password
docker compose up -d --force-recreate</code></pre>

<h2>Two-Person Rule</h2>
<p>For critical secrets (root DB, master encryption key), require two engineers — one generates, one verifies and applies. Audit log both actions.</p>

<h2>Track in Password Manager</h2>
<p>Record every rotation: timestamp, operator, secret name, ticket reference. Use 1Password, Vault, or Bitwarden with a dedicated vault per environment.</p>`,
      content_ro: `<h2>De ce rotație?</h2>
<ul>
  <li><strong>Conformitate:</strong> SOC 2, ISO 27001, PCI-DSS cer rotație periodică (90-180 zile).</li>
  <li><strong>Limitare impact:</strong> dacă un secret scapă, fereastra de expunere e limitată.</li>
  <li><strong>Detectare credențiale uitate:</strong> rotația forțează auditul.</li>
</ul>

<h2>Calendar de rotație</h2>
<table style="width:100%;border-collapse:collapse">
<tr><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Tip secret</th><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Frecvență</th></tr>
<tr><td style="padding:6px">Parole baze de date</td><td style="padding:6px">90 zile</td></tr>
<tr><td style="padding:6px">API keys (third-party)</td><td style="padding:6px">180 zile</td></tr>
<tr><td style="padding:6px">JWT signing keys</td><td style="padding:6px">180 zile</td></tr>
<tr><td style="padding:6px">Certificate TLS</td><td style="padding:6px">12 luni (auto-renew)</td></tr>
<tr><td style="padding:6px">Credențiale root/admin</td><td style="padding:6px">După plecarea fiecărui membru</td></tr>
</table>

<h2>Procedură atomică de rotație</h2>
<pre><code># 1. Generează secret nou
NEW=$(openssl rand -base64 24)

# 2. Actualizează serviciul (parola user-ului DB)
psql -c "ALTER USER myapp WITH PASSWORD '$NEW';"

# 3. Înlocuire atomică fișier (scriere apoi rename, niciodată edit in-place)
sudo sh -c 'printf "%s" "'"$NEW"'" > /etc/myapp/secrets/db_password.new'
sudo mv /etc/myapp/secrets/db_password.new /etc/myapp/secrets/db_password

# 4. Force-recreate containere (Docker re-mountează secretul)
docker compose up -d --force-recreate api worker

# 5. Smoke test
curl -f https://app.example.com/health || echo "ROLLBACK NECESAR"</code></pre>

<h2>Plan de rollback</h2>
<p>Păstrează mereu secretul anterior 24 de ore:</p>
<pre><code># Înainte de rotație, salvează curentul
sudo cp /etc/myapp/secrets/db_password /etc/myapp/secrets/db_password.previous

# Dacă cel nou eșuează, restaurează
sudo mv /etc/myapp/secrets/db_password.previous /etc/myapp/secrets/db_password
docker compose up -d --force-recreate</code></pre>

<h2>Regula celor doi</h2>
<p>Pentru secrete critice (root DB, master encryption key), cere doi ingineri — unul generează, unul verifică și aplică. Auditează ambele acțiuni.</p>

<h2>Track în password manager</h2>
<p>Înregistrează fiecare rotație: timestamp, operator, nume secret, referință ticket. Folosește 1Password, Vault, sau Bitwarden cu vault dedicat per environment.</p>`,
    },
    {
      slug: 'mtls-setup',
      title: 'mTLS for Service-to-Service Auth',
      title_ro: 'mTLS pentru autentificare între servicii',
      category: 'security',
      difficulty: 'advanced',
      icon: 'fas fa-certificate',
      summary: 'Set up mutual TLS (mTLS) so services authenticate each other with certificates, not just passwords.',
      summary_ro: 'Configurează mutual TLS (mTLS) astfel încât serviciile să se autentifice reciproc cu certificate, nu doar parole.',
      content: `<h2>What is mTLS?</h2>
<p>Standard TLS authenticates the <strong>server</strong> to the client (your browser checks the website's cert). <strong>Mutual TLS</strong> also authenticates the <strong>client</strong> to the server. Both sides present certificates signed by a trusted CA.</p>

<h2>When to Use</h2>
<ul>
  <li><strong>Service-to-service in microservices:</strong> internal APIs that should never accept anonymous traffic.</li>
  <li><strong>HQ to remote VPS:</strong> ensure only your HQ servers can publish to the VPS.</li>
  <li><strong>Zero-trust networks:</strong> no implicit trust based on IP/network.</li>
</ul>

<h2>Setup with cfssl (Cloudflare's PKI tool)</h2>
<pre><code># Install cfssl
go install github.com/cloudflare/cfssl/cmd/cfssl@latest
go install github.com/cloudflare/cfssl/cmd/cfssljson@latest

# Generate CA
cfssl gencert -initca ca-csr.json | cfssljson -bare ca

# Generate server cert (signed by CA)
cfssl gencert -ca=ca.pem -ca-key=ca-key.pem \\
  -config=ca-config.json -profile=server \\
  server-csr.json | cfssljson -bare server

# Generate client cert
cfssl gencert -ca=ca.pem -ca-key=ca-key.pem \\
  -config=ca-config.json -profile=client \\
  client-csr.json | cfssljson -bare client</code></pre>

<h2>Nginx Server Config</h2>
<pre><code>server {
  listen 443 ssl;
  ssl_certificate /etc/nginx/certs/server.pem;
  ssl_certificate_key /etc/nginx/certs/server-key.pem;
  ssl_client_certificate /etc/nginx/certs/ca.pem;
  ssl_verify_client on;  # &lt;-- requires client cert

  location / {
    proxy_pass http://backend;
  }
}</code></pre>

<h2>Client (curl) Test</h2>
<pre><code>curl --cacert ca.pem \\
     --cert client.pem \\
     --key client-key.pem \\
     https://api.internal.example.com/endpoint</code></pre>

<h2>Certificate Renewal</h2>
<p>Keep validity ≤ 1 year. Automate with <strong>step-ca</strong> or <strong>cert-manager</strong> (for Kubernetes). Manual renewal:</p>
<pre><code># Generate new cert with same CSR, replace files atomically
cfssl gencert -ca=ca.pem -ca-key=ca-key.pem \\
  -config=ca-config.json -profile=client \\
  client-csr.json | cfssljson -bare client.new
mv client.new.pem /etc/myapp/secrets/client.pem
docker compose restart api</code></pre>

<h2>Common Pitfalls</h2>
<ul>
  <li><strong>Clock skew:</strong> certificate validation fails if servers' clocks differ by more than a few minutes. Use NTP.</li>
  <li><strong>CA expired:</strong> CA certs typically last 10 years. If yours expires, every signed cert becomes invalid simultaneously.</li>
  <li><strong>Don't reuse CAs across environments:</strong> separate dev/staging/prod CAs prevent dev certs from working in prod.</li>
</ul>`,
      content_ro: `<h2>Ce e mTLS?</h2>
<p>TLS-ul standard autentifică <strong>serverul</strong> către client (browserul tău verifică cert-ul site-ului). <strong>Mutual TLS</strong> autentifică și <strong>clientul</strong> către server. Ambele părți prezintă certificate semnate de un CA de încredere.</p>

<h2>Când să folosești</h2>
<ul>
  <li><strong>Service-to-service în microservicii:</strong> API-uri interne care nu ar trebui să accepte trafic anonim.</li>
  <li><strong>HQ către VPS remote:</strong> asigură că doar serverele tale HQ pot publica pe VPS.</li>
  <li><strong>Rețele zero-trust:</strong> fără încredere implicită pe baza IP/rețea.</li>
</ul>

<h2>Setup cu cfssl (PKI tool de la Cloudflare)</h2>
<pre><code># Instalează cfssl
go install github.com/cloudflare/cfssl/cmd/cfssl@latest
go install github.com/cloudflare/cfssl/cmd/cfssljson@latest

# Generează CA
cfssl gencert -initca ca-csr.json | cfssljson -bare ca

# Generează cert server (semnat de CA)
cfssl gencert -ca=ca.pem -ca-key=ca-key.pem \\
  -config=ca-config.json -profile=server \\
  server-csr.json | cfssljson -bare server

# Generează cert client
cfssl gencert -ca=ca.pem -ca-key=ca-key.pem \\
  -config=ca-config.json -profile=client \\
  client-csr.json | cfssljson -bare client</code></pre>

<h2>Config Nginx Server</h2>
<pre><code>server {
  listen 443 ssl;
  ssl_certificate /etc/nginx/certs/server.pem;
  ssl_certificate_key /etc/nginx/certs/server-key.pem;
  ssl_client_certificate /etc/nginx/certs/ca.pem;
  ssl_verify_client on;  # &lt;-- cere cert client

  location / {
    proxy_pass http://backend;
  }
}</code></pre>

<h2>Test Client (curl)</h2>
<pre><code>curl --cacert ca.pem \\
     --cert client.pem \\
     --key client-key.pem \\
     https://api.internal.example.com/endpoint</code></pre>

<h2>Reînnoire certificate</h2>
<p>Păstrează validitatea ≤ 1 an. Automatizează cu <strong>step-ca</strong> sau <strong>cert-manager</strong> (pentru Kubernetes).</p>

<h2>Capcane comune</h2>
<ul>
  <li><strong>Clock skew:</strong> validarea cert-ului eșuează dacă ceasurile diferă cu mai mult de câteva minute. Folosește NTP.</li>
  <li><strong>CA expirat:</strong> cert-urile CA durează tipic 10 ani. Dacă expiră, toate cert-urile semnate devin invalide simultan.</li>
  <li><strong>Nu reutiliza CA-uri între environment-uri:</strong> CA separate pentru dev/staging/prod previn folosirea cert-urilor de dev în prod.</li>
</ul>`,
    },
    {
      slug: 'printf-vs-echo-newline-trap',
      title: 'printf vs echo — The Newline Trap',
      title_ro: 'printf vs echo — Capcana newline',
      category: 'troubleshooting',
      difficulty: 'beginner',
      icon: 'fas fa-exclamation-triangle',
      summary: 'Why echo silently corrupts secrets and credentials, and the one-line fix that prevents hours of debugging.',
      summary_ro: 'De ce echo strică silențios secretele și credențialele, și fix-ul de o linie care previne ore de debugging.',
      content: `<h2>The Problem in 30 Seconds</h2>
<pre><code>echo "my-password" > /etc/myapp/secrets/db_password
# File contents: my-password\\n   ← newline appended!
# Database driver tries to authenticate with "my-password\\n"
# Result: silent auth failure</code></pre>

<h2>Why echo Adds a Newline</h2>
<p>POSIX <code>echo</code> appends <code>\\n</code> by default. This makes sense for terminal output (each line ends with newline), but breaks when you're writing exact byte-perfect data like passwords, API keys, or TLS certs.</p>

<h2>The Fix: printf %s</h2>
<pre><code># RIGHT: printf does NOT add newline
printf '%s' "my-password" > /etc/myapp/secrets/db_password

# Verify (no trailing $ on second line means no newline):
cat /etc/myapp/secrets/db_password | xxd | tail -2</code></pre>

<h2>Real-World Failures This Prevents</h2>
<ul>
  <li><strong>tedious (MSSQL Node driver):</strong> includes the newline in the password string, returns "Login failed for user".</li>
  <li><strong>libssh:</strong> private key parsing fails because of trailing newline → "no matching authentication method".</li>
  <li><strong>JWT keys:</strong> signature verification fails because the key bytes don't match.</li>
  <li><strong>API tokens in headers:</strong> server sees <code>Authorization: Bearer abc123\\n</code> and rejects it.</li>
</ul>

<h2>Common Variants to Avoid</h2>
<pre><code># BAD — all add newline:
echo "secret" > file
echo -n "secret" > file       # -n is not portable; busybox echo ignores it
"$VAR" > file                  # bash: appends newline
cat &lt;&lt;&lt; "secret" > file        # here-string also adds newline

# GOOD:
printf '%s' "secret" > file
print -n "secret" > file       # zsh/ksh only
echo -E -n "secret" > file     # bash with explicit flags (still risky)</code></pre>

<h2>The Quote Pattern (for command substitution)</h2>
<pre><code># Inside subshells, always wrap in printf:
sudo sh -c 'printf "%s" "$(openssl rand -base64 24)" > /etc/secrets/key'

# NOT this:
sudo sh -c 'echo "$(openssl rand -base64 24)" > /etc/secrets/key'  # adds newline</code></pre>

<h2>Detecting Existing Damage</h2>
<pre><code># Find secret files that have a trailing newline (last byte is 0x0a):
for f in /etc/myapp/secrets/*; do
  if [ "$(tail -c 1 "$f" | xxd -p)" = "0a" ]; then
    echo "TRAILING NEWLINE: $f"
  fi
done

# Fix in place (strip trailing newline):
truncate -s -1 /etc/myapp/secrets/db_password</code></pre>

<h2>The One-Line Audit Tool</h2>
<pre><code># In your CI/pre-deploy script:
find /etc/myapp/secrets -type f -exec sh -c \\
  'tail -c 1 "$1" | grep -q $"\\n" && echo "BAD: $1"' _ {} \\;</code></pre>`,
      content_ro: `<h2>Problema în 30 de secunde</h2>
<pre><code>echo "my-password" > /etc/myapp/secrets/db_password
# Conținut fișier: my-password\\n   ← newline adăugat!
# Driver-ul DB încearcă autentificare cu "my-password\\n"
# Rezultat: eșec silențios de autentificare</code></pre>

<h2>De ce echo adaugă newline</h2>
<p>POSIX <code>echo</code> adaugă <code>\\n</code> by default. Asta are sens pentru output în terminal (fiecare linie se termină cu newline), dar strică totul când scrii date byte-perfect ca parole, API keys, sau cert-uri TLS.</p>

<h2>Fix-ul: printf %s</h2>
<pre><code># CORECT: printf NU adaugă newline
printf '%s' "my-password" > /etc/myapp/secrets/db_password

# Verifică (lipsa $ la sfârșitul liniei a 2-a = fără newline):
cat /etc/myapp/secrets/db_password | xxd | tail -2</code></pre>

<h2>Eșecuri reale prevenite de fix</h2>
<ul>
  <li><strong>tedious (driver Node MSSQL):</strong> include newline-ul în string-ul parolei, returnează "Login failed for user".</li>
  <li><strong>libssh:</strong> parsarea cheii private eșuează din cauza newline-ului → "no matching authentication method".</li>
  <li><strong>JWT keys:</strong> verificarea semnăturii eșuează pentru că byte-urile cheii nu se potrivesc.</li>
  <li><strong>API tokens în header-e:</strong> serverul vede <code>Authorization: Bearer abc123\\n</code> și îl respinge.</li>
</ul>

<h2>Variante comune de evitat</h2>
<pre><code># RĂU — toate adaugă newline:
echo "secret" > file
echo -n "secret" > file       # -n nu e portabil; busybox echo îl ignoră
"$VAR" > file                  # bash: adaugă newline
cat &lt;&lt;&lt; "secret" > file        # here-string adaugă și el newline

# BUN:
printf '%s' "secret" > file
print -n "secret" > file       # doar zsh/ksh
echo -E -n "secret" > file     # bash cu flag-uri explicite (tot riscant)</code></pre>

<h2>Pattern-ul cu ghilimele (pentru command substitution)</h2>
<pre><code># În subshell-uri, înfășoară mereu în printf:
sudo sh -c 'printf "%s" "$(openssl rand -base64 24)" > /etc/secrets/key'

# NU așa:
sudo sh -c 'echo "$(openssl rand -base64 24)" > /etc/secrets/key'  # adaugă newline</code></pre>

<h2>Detectarea daunelor existente</h2>
<pre><code># Găsește fișierele secrete cu newline la final (ultimul byte e 0x0a):
for f in /etc/myapp/secrets/*; do
  if [ "$(tail -c 1 "$f" | xxd -p)" = "0a" ]; then
    echo "TRAILING NEWLINE: $f"
  fi
done

# Fix in place (elimină newline final):
truncate -s -1 /etc/myapp/secrets/db_password</code></pre>`,
    },
    {
      slug: 'pre-deploy-checklist',
      title: 'Pre-Deploy Checklist',
      title_ro: 'Checklist pre-deploy',
      category: 'docker-dash',
      difficulty: 'intermediate',
      icon: 'fas fa-clipboard-check',
      summary: 'A 12-point checklist to run before every production deploy to catch config errors before they cause outages.',
      summary_ro: 'Un checklist de 12 puncte de rulat înainte de fiecare deploy în producție pentru a prinde erorile de configurare.',
      content: `<h2>The Cost of Skipping Checks</h2>
<p>The most common production outages come from <em>predictable</em> problems: unfilled placeholders, missing env vars, wrong permissions, no health checks. A 5-minute checklist prevents 90% of preventable outages.</p>

<h2>The 12-Point Checklist</h2>

<h3>1. No TODO Placeholders in .env</h3>
<pre><code>grep -n '&lt;TODO' .env && { echo "FAIL"; exit 1; } || echo "OK"</code></pre>

<h3>2. All Secret Files Exist + Readable</h3>
<pre><code>grep -E '_FILE=/run/secrets/' .env | \\
  sed 's|.*/run/secrets/|/etc/myapp/secrets/|' | cut -d= -f2 | \\
  while read p; do [ -r "$p" ] || echo "MISSING: $p"; done</code></pre>

<h3>4. Secret File Permissions Tight (600)</h3>
<pre><code>find /etc/myapp/secrets -type f ! -perm 600 -print
# Any output = misconfigured</code></pre>

<h3>5. Compose File Has Restart Policy</h3>
<pre><code>grep -E 'restart:\\s*(always|unless-stopped|on-failure)' docker-compose.yml \\
  || echo "WARN: no restart policy"</code></pre>

<h3>6. Health Checks Defined</h3>
<pre><code>grep -q 'healthcheck:' docker-compose.yml || echo "WARN: no healthchecks"</code></pre>

<h3>7. Resource Limits Set</h3>
<pre><code>grep -qE 'mem_limit|memory:|cpus:' docker-compose.yml \\
  || echo "WARN: no resource limits"</code></pre>

<h3>8. No Privileged Containers</h3>
<pre><code>grep -q 'privileged:\\s*true' docker-compose.yml \\
  && echo "FAIL: privileged container found"</code></pre>

<h3>9. Logging Configured (Rotation)</h3>
<pre><code>grep -q 'max-size' docker-compose.yml \\
  || echo "WARN: log rotation not configured"</code></pre>

<h3>10. Backup Directory Exists</h3>
<pre><code>[ -d /var/backups/myapp ] || echo "FAIL: backup dir missing"</code></pre>

<h3>11. Disk Space Available (>20%)</h3>
<pre><code>FREE=$(df / | tail -1 | awk '{print $5}' | tr -d %)
[ $FREE -lt 80 ] && echo "OK: $FREE% used" || echo "FAIL: disk full"</code></pre>

<h3>12. Pull Image First (Test Connectivity)</h3>
<pre><code>docker compose pull --quiet || echo "FAIL: cannot pull"</code></pre>

<h2>Automate It</h2>
<p>Save the checklist as <code>scripts/preflight.sh</code>:</p>
<pre><code>#!/bin/bash
set -e
echo "=== Pre-Deploy Checklist ==="
fail=0

check() {
  if "$@" &>/dev/null; then
    echo "✓ $DESC"
  else
    echo "✗ $DESC"
    fail=$((fail+1))
  fi
}

DESC="No TODO placeholders" check ! grep -q '&lt;TODO' .env
DESC="No privileged containers" check ! grep -q 'privileged:\\s*true' docker-compose.yml
DESC="Health checks defined" check grep -q 'healthcheck:' docker-compose.yml
# ... etc

if [ $fail -gt 0 ]; then
  echo "=== $fail checks failed — abort deploy ==="
  exit 1
fi
echo "=== All checks passed — deploy clear ==="</code></pre>

<h2>Use Docker Dash's Built-in Validator</h2>
<p>Docker Dash includes a deploy validator at <strong>System → Secrets → Pre-Deploy Validation</strong>. Paste your <code>.env</code> and <code>docker-compose.yml</code> to get an instant report.</p>

<h2>The Two-Person Rule</h2>
<p>For production deploys, require a second engineer to review and approve. The reviewer runs the checklist independently before approval. This catches blind spots from the deployer.</p>`,
      content_ro: `<h2>Costul ignorării verificărilor</h2>
<p>Cele mai comune outage-uri în producție vin din probleme <em>previzibile</em>: placeholder-uri necompletate, env vars lipsă, permisiuni greșite, lipsă health checks. Un checklist de 5 minute previne 90% din outage-urile prevenibile.</p>

<h2>Checklist-ul în 12 puncte</h2>

<h3>1. Fără TODO placeholders în .env</h3>
<pre><code>grep -n '&lt;TODO' .env && { echo "FAIL"; exit 1; } || echo "OK"</code></pre>

<h3>2. Toate fișierele secret există și sunt citibile</h3>
<pre><code>grep -E '_FILE=/run/secrets/' .env | \\
  sed 's|.*/run/secrets/|/etc/myapp/secrets/|' | cut -d= -f2 | \\
  while read p; do [ -r "$p" ] || echo "LIPSĂ: $p"; done</code></pre>

<h3>3. Permisiuni stricte pe fișiere secret (600)</h3>
<pre><code>find /etc/myapp/secrets -type f ! -perm 600 -print
# Orice output = configurat greșit</code></pre>

<h3>4. Compose are restart policy</h3>
<pre><code>grep -E 'restart:\\s*(always|unless-stopped|on-failure)' docker-compose.yml \\
  || echo "WARN: fără restart policy"</code></pre>

<h3>5. Health checks definite</h3>
<pre><code>grep -q 'healthcheck:' docker-compose.yml || echo "WARN: fără healthchecks"</code></pre>

<h3>6. Limite de resurse setate</h3>
<pre><code>grep -qE 'mem_limit|memory:|cpus:' docker-compose.yml \\
  || echo "WARN: fără limite resurse"</code></pre>

<h3>7. Fără containere privileged</h3>
<pre><code>grep -q 'privileged:\\s*true' docker-compose.yml \\
  && echo "FAIL: container privileged găsit"</code></pre>

<h3>8. Logging configurat (rotație)</h3>
<pre><code>grep -q 'max-size' docker-compose.yml \\
  || echo "WARN: rotația logurilor neconfigurată"</code></pre>

<h3>9. Director backup există</h3>
<pre><code>[ -d /var/backups/myapp ] || echo "FAIL: director backup lipsă"</code></pre>

<h3>10. Spațiu disk disponibil (>20%)</h3>
<pre><code>FREE=$(df / | tail -1 | awk '{print $5}' | tr -d %)
[ $FREE -lt 80 ] && echo "OK: $FREE% folosit" || echo "FAIL: disk plin"</code></pre>

<h3>11. Pull imagine întâi (test conectivitate)</h3>
<pre><code>docker compose pull --quiet || echo "FAIL: nu se poate face pull"</code></pre>

<h3>12. Test smoke după deploy</h3>
<pre><code>sleep 10 && curl -f https://app.example.com/health \\
  || { echo "FAIL: app nu e healthy"; docker compose logs --tail 50; }</code></pre>

<h2>Folosește validatorul Docker Dash</h2>
<p>Docker Dash include un validator de deploy la <strong>System → Secrets → Pre-Deploy Validation</strong>. Lipește <code>.env</code> și <code>docker-compose.yml</code> pentru raport instant.</p>

<h2>Regula celor doi</h2>
<p>Pentru deploy-uri în producție, cere unui al doilea inginer să revizuiască și aprobe. Reviewer-ul rulează checklist-ul independent înainte de aprobare.</p>`,
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
