---
title: Best Practices Rotația Secretelor
summary: Rotește parolele de baze de date, API keys și certificate TLS în siguranță fără downtime.
---

<h2>De ce rotație?</h2>
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
<p>Înregistrează fiecare rotație: timestamp, operator, nume secret, referință ticket. Folosește 1Password, Vault, sau Bitwarden cu vault dedicat per environment.</p>
