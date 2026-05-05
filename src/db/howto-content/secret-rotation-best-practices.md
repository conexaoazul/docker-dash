---
title: Secret Rotation Best Practices
summary: Rotate database passwords, API keys, and TLS certificates safely without downtime.
category: security
difficulty: advanced
icon: fas fa-sync-alt
---

<h2>Why Rotate?</h2>
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
<p>Record every rotation: timestamp, operator, secret name, ticket reference. Use 1Password, Vault, or Bitwarden with a dedicated vault per environment.</p>
