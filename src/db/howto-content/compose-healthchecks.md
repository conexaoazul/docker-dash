---
title: Health Checks in Compose
summary: Add health checks to your services so Docker knows when they are ready.
category: compose
difficulty: intermediate
icon: fas fa-heartbeat
---

<h2>Health Checks in Docker Compose</h2>
<p>Health checks tell Docker whether a container is actually ready to serve traffic — not just started. Other services can use <code>condition: service_healthy</code> to wait for dependencies.</p>

<h2>Health check parameters</h2>
<ul>
  <li><code>test</code> — Command to run. Exit code 0 = healthy, non-zero = unhealthy.</li>
  <li><code>interval</code> — How often to check (default: 30s).</li>
  <li><code>timeout</code> — How long to wait for the command (default: 30s).</li>
  <li><code>retries</code> — Failures before marking unhealthy (default: 3).</li>
  <li><code>start_period</code> — Grace period after start before counting failures (default: 0s).</li>
</ul>

<h2>Web service (HTTP check)</h2>
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

<h2>Make services wait for healthy dependencies</h2>
<pre><code>  app:
    image: myapp
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy</code></pre>

<h2>Check health status</h2>
<pre><code># Via Docker Compose
docker compose ps

# Via Docker inspect
docker inspect --format='{{json .State.Health}}' container_name | jq</code></pre>
