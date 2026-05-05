---
title: Verificări de sănătate în Compose
summary: Adaugă verificări de sănătate serviciilor ca Docker să știe când sunt pregătite.
---

<h2>Verificări de sănătate în Docker Compose</h2>
<p>Verificările de sănătate îi spun Docker dacă un container este cu adevărat pregătit să servească trafic — nu doar pornit. Alte servicii pot folosi <code>condition: service_healthy</code> pentru a aștepta dependențele.</p>

<h2>Parametrii verificărilor de sănătate</h2>
<ul>
  <li><code>test</code> — Comanda de rulat. Codul de ieșire 0 = sănătos, non-zero = nesănătos.</li>
  <li><code>interval</code> — Cât de des să verifice (implicit: 30s).</li>
  <li><code>timeout</code> — Cât să aștepte comanda (implicit: 30s).</li>
  <li><code>retries</code> — Eșecuri înainte de a marca ca nesănătos (implicit: 3).</li>
  <li><code>start_period</code> — Perioadă de grație după start înainte de a număra eșecurile (implicit: 0s).</li>
</ul>

<h2>Serviciu web (verificare HTTP)</h2>
<pre><code>services:
  web:
    image: nginx:alpine
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 15s</code></pre>

<h2>PostgreSQL</h2>
<pre><code>  db:
    image: postgres:16
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 20s</code></pre>

<h2>Redis</h2>
<pre><code>  redis:
    image: redis:7-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 3</code></pre>

<h2>Fă serviciile să aștepte dependențe sănătoase</h2>
<pre><code>  app:
    image: myapp
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy</code></pre>

<h2>Verifică starea de sănătate</h2>
<pre><code># Prin Docker Compose
docker compose ps

# Prin Docker inspect
docker inspect --format='{{json .State.Health}}' container_name | jq</code></pre>
