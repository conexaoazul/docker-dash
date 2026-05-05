---
title: Checklist pre-deploy
summary: Un checklist de 12 puncte de rulat înainte de fiecare deploy în producție pentru a prinde erorile de configurare.
---

<h2>Costul ignorării verificărilor</h2>
<p>Cele mai comune outage-uri în producție vin din probleme <em>previzibile</em>: placeholder-uri necompletate, env vars lipsă, permisiuni greșite, lipsă health checks. Un checklist de 5 minute previne 90% din outage-urile prevenibile.</p>

<h2>Checklist-ul în 12 puncte</h2>

<h3>1. Fără TODO placeholders în .env</h3>
<pre><code>grep -n '&lt;TODO' .env && { echo "FAIL"; exit 1; } || echo "OK"</code></pre>

<h3>2. Toate fișierele secret există și sunt citibile</h3>
<pre><code>grep -E '_FILE=/run/secrets/' .env | \
  sed 's|.*/run/secrets/|/etc/myapp/secrets/|' | cut -d= -f2 | \
  while read p; do [ -r "$p" ] || echo "LIPSĂ: $p"; done</code></pre>

<h3>3. Permisiuni stricte pe fișiere secret (600)</h3>
<pre><code>find /etc/myapp/secrets -type f ! -perm 600 -print
# Orice output = configurat greșit</code></pre>

<h3>4. Compose are restart policy</h3>
<pre><code>grep -E 'restart:\s*(always|unless-stopped|on-failure)' docker-compose.yml \
  || echo "WARN: fără restart policy"</code></pre>

<h3>5. Health checks definite</h3>
<pre><code>grep -q 'healthcheck:' docker-compose.yml || echo "WARN: fără healthchecks"</code></pre>

<h3>6. Limite de resurse setate</h3>
<pre><code>grep -qE 'mem_limit|memory:|cpus:' docker-compose.yml \
  || echo "WARN: fără limite resurse"</code></pre>

<h3>7. Fără containere privileged</h3>
<pre><code>grep -q 'privileged:\s*true' docker-compose.yml \
  && echo "FAIL: container privileged găsit"</code></pre>

<h3>8. Logging configurat (rotație)</h3>
<pre><code>grep -q 'max-size' docker-compose.yml \
  || echo "WARN: rotația logurilor neconfigurată"</code></pre>

<h3>9. Director backup există</h3>
<pre><code>[ -d /var/backups/myapp ] || echo "FAIL: director backup lipsă"</code></pre>

<h3>10. Spațiu disk disponibil (>20%)</h3>
<pre><code>FREE=$(df / | tail -1 | awk '{print $5}' | tr -d %)
[ $FREE -lt 80 ] && echo "OK: $FREE% folosit" || echo "FAIL: disk plin"</code></pre>

<h3>11. Pull imagine întâi (test conectivitate)</h3>
<pre><code>docker compose pull --quiet || echo "FAIL: nu se poate face pull"</code></pre>

<h3>12. Test smoke după deploy</h3>
<pre><code>sleep 10 && curl -f https://app.example.com/health \
  || { echo "FAIL: app nu e healthy"; docker compose logs --tail 50; }</code></pre>

<h2>Folosește validatorul Docker Dash</h2>
<p>Docker Dash include un validator de deploy la <strong>System → Secrets → Pre-Deploy Validation</strong>. Lipește <code>.env</code> și <code>docker-compose.yml</code> pentru raport instant.</p>

<h2>Regula celor doi</h2>
<p>Pentru deploy-uri în producție, cere unui al doilea inginer să revizuiască și aprobe. Reviewer-ul rulează checklist-ul independent înainte de aprobare.</p>
