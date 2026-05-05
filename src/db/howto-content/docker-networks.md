---
title: Docker Networks Guide
summary: Bridge, host, overlay networks — when to use each and how to create custom networks.
category: networking
difficulty: intermediate
icon: fas fa-network-wired
---

<h2>Docker Networks Guide</h2>
<p>Docker networking controls how containers communicate with each other and the outside world.</p>

<h2>Network types</h2>
<ul>
  <li><strong>bridge</strong> (default) — Isolated virtual network on the host. Containers can talk to each other by name on the same bridge.</li>
  <li><strong>host</strong> — Container shares the host's network stack. No isolation; useful for high-performance scenarios.</li>
  <li><strong>overlay</strong> — Spans multiple Docker hosts (requires Swarm). Used in production clusters.</li>
  <li><strong>macvlan</strong> — Assigns a real MAC/IP from your LAN to the container. Appears as a physical device on the network.</li>
  <li><strong>none</strong> — No networking. Completely isolated.</li>
</ul>

<h2>Custom bridge networks (recommended)</h2>
<p>Always create a named bridge network instead of using the default one. Containers on the same named network can resolve each other by service name.</p>
<pre><code># Create a network
docker network create mynet

# Run containers on it
docker run -d --network mynet --name db postgres:16
docker run -d --network mynet --name app myapp

# "app" can reach "db" simply using hostname "db"</code></pre>

<h2>Useful commands</h2>
<pre><code># List networks
docker network ls

# Inspect a network (see connected containers and IPs)
docker network inspect mynet

# Connect a running container to a network
docker network connect mynet existing-container

# Disconnect
docker network disconnect mynet existing-container</code></pre>

<h2>Docker Compose</h2>
<pre><code>services:
  db:
    image: postgres:16
    networks: [backend]
  app:
    image: myapp
    networks: [backend, frontend]
  nginx:
    image: nginx
    networks: [frontend]

networks:
  backend:
  frontend:</code></pre>
<p>This setup means only <code>nginx</code> and <code>app</code> share a network — the database is not reachable from nginx directly.</p>
