---
title: Expose Ports Safely
summary: How Docker port mapping works and common security pitfalls with -p flag.
category: networking
difficulty: beginner
icon: fas fa-plug
---

<h2>Expose Container Ports Safely</h2>
<p>Docker's <code>-p</code> flag maps a container port to a host port. The syntax is <code>HOST_PORT:CONTAINER_PORT</code>.</p>

<h2>Basic port mapping</h2>
<pre><code># Expose container port 80 on host port 8080 (all interfaces)
docker run -d -p 8080:80 nginx

# Bind to localhost only — NOT reachable from outside
docker run -d -p 127.0.0.1:8080:80 nginx

# Expose on a specific interface
docker run -d -p 192.168.1.10:8080:80 nginx</code></pre>

<h2>Docker Compose ports section</h2>
<pre><code>services:
  web:
    image: nginx
    ports:
      - "8080:80"          # public
      - "127.0.0.1:9000:9000"  # localhost only</code></pre>

<h2>Security warning: Docker bypasses UFW</h2>
<p><strong>Critical:</strong> Docker directly modifies iptables rules, bypassing UFW entirely. A port mapped with <code>-p 8080:80</code> is publicly accessible even if UFW says it's blocked.</p>
<ul>
  <li>Use <code>127.0.0.1:PORT:PORT</code> for services that should only be reached via a reverse proxy.</li>
  <li>Or configure <code>DOCKER-USER</code> iptables chain to restrict access.</li>
  <li>Or use a reverse proxy (Nginx/Caddy/Traefik) and only expose ports 80 and 443 publicly.</li>
</ul>

<h2>Check which ports are open</h2>
<pre><code># On the host
ss -tlnp | grep docker

# Inspect a container
docker port my-container</code></pre>
