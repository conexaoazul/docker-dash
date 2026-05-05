---
title: Pre-Deploy Checklist
summary: A 12-point checklist to run before every production deploy to catch config errors before they cause outages.
category: docker-dash
difficulty: intermediate
icon: fas fa-clipboard-check
---

<h2>The Cost of Skipping Checks</h2>
<p>The most common production outages come from <em>predictable</em> problems: unfilled placeholders, missing env vars, wrong permissions, no health checks. A 5-minute checklist prevents 90% of preventable outages.</p>

<h2>The 12-Point Checklist</h2>

<h3>1. No TODO Placeholders in .env</h3>
<pre><code>grep -n '&lt;TODO' .env && { echo "FAIL"; exit 1; } || echo "OK"</code></pre>

<h3>2. All Secret Files Exist + Readable</h3>
<pre><code>grep -E '_FILE=/run/secrets/' .env | \
  sed 's|.*/run/secrets/|/etc/myapp/secrets/|' | cut -d= -f2 | \
  while read p; do [ -r "$p" ] || echo "MISSING: $p"; done</code></pre>

<h3>4. Secret File Permissions Tight (600)</h3>
<pre><code>find /etc/myapp/secrets -type f ! -perm 600 -print
# Any output = misconfigured</code></pre>

<h3>5. Compose File Has Restart Policy</h3>
<pre><code>grep -E 'restart:\s*(always|unless-stopped|on-failure)' docker-compose.yml \
  || echo "WARN: no restart policy"</code></pre>

<h3>6. Health Checks Defined</h3>
<pre><code>grep -q 'healthcheck:' docker-compose.yml || echo "WARN: no healthchecks"</code></pre>

<h3>7. Resource Limits Set</h3>
<pre><code>grep -qE 'mem_limit|memory:|cpus:' docker-compose.yml \
  || echo "WARN: no resource limits"</code></pre>

<h3>8. No Privileged Containers</h3>
<pre><code>grep -q 'privileged:\s*true' docker-compose.yml \
  && echo "FAIL: privileged container found"</code></pre>

<h3>9. Logging Configured (Rotation)</h3>
<pre><code>grep -q 'max-size' docker-compose.yml \
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
DESC="No privileged containers" check ! grep -q 'privileged:\s*true' docker-compose.yml
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
<p>For production deploys, require a second engineer to review and approve. The reviewer runs the checklist independently before approval. This catches blind spots from the deployer.</p>
