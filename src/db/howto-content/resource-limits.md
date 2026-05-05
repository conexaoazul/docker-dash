---
title: Container Resource Limits
summary: Set CPU and memory limits to prevent containers from consuming all host resources.
category: performance
difficulty: intermediate
icon: fas fa-tachometer-alt
---

<h2>Container Resource Limits</h2>
<p>Without limits, a single runaway container can starve all other containers and crash the host. Always set CPU and memory limits in production.</p>

<h3>Setting Limits in docker-compose.yml</h3>
<pre><code>services:
  app:
    image: myapp:latest
    deploy:
      resources:
        limits:
          cpus: '0.50'      # max 50% of one CPU core
          memory: 512M      # max 512 MB RAM
        reservations:
          cpus: '0.25'      # guaranteed minimum
          memory: 256M</code></pre>
<p><strong>Note:</strong> The <code>deploy.resources</code> syntax works for both Compose v3 and Swarm.</p>

<h3>Setting Limits with docker run</h3>
<pre><code>docker run -d \
  --memory="512m" \
  --memory-swap="1g" \
  --cpus="0.5" \
  myapp:latest</code></pre>

<h3>Monitoring Resource Usage</h3>
<pre><code># Live stats for all containers
docker stats

# One-shot snapshot (no streaming)
docker stats --no-stream

# Specific container
docker stats myapp --no-stream</code></pre>

<h3>What Happens When Limits Are Hit</h3>
<ul>
  <li><strong>Memory limit reached:</strong> The OOM killer terminates the container process (exit code 137)</li>
  <li><strong>CPU limit reached:</strong> The container is throttled — it keeps running but slower</li>
</ul>

<h3>Resource Editor in Docker Dash</h3>
<p>In Docker Dash, open a container's detail page and click <strong>Edit Resources</strong> to adjust memory and CPU limits on the fly without editing compose files manually.</p>
