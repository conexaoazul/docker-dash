---
title: Debugging with docker exec
summary: 'Use docker exec to inspect running containers: shell access, process listing, file viewing.'
category: troubleshooting
difficulty: beginner
icon: fas fa-bug
---

<h2>Debugging with docker exec</h2>
<p><code>docker exec</code> lets you run commands inside a running container — your most powerful debugging tool.</p>

<h3>Get an Interactive Shell</h3>
<pre><code># bash (most images)
docker exec -it mycontainer bash

# sh (Alpine and minimal images)
docker exec -it mycontainer sh

# as root (override user)
docker exec -it -u root mycontainer bash</code></pre>

<h3>Inspect Processes</h3>
<pre><code>docker exec mycontainer ps aux</code></pre>

<h3>Check Network from Inside</h3>
<pre><code>docker exec mycontainer cat /etc/hosts
docker exec mycontainer cat /etc/resolv.conf

# Ping another container by name
docker exec mycontainer ping db

# Check if a port is reachable
docker exec mycontainer nc -zv db 5432</code></pre>

<h3>Install Debug Tools on the Fly</h3>
<pre><code># Debian/Ubuntu-based
docker exec -it -u root mycontainer bash -c "apt-get update &amp;&amp; apt-get install -y curl net-tools"

# Alpine-based
docker exec -it -u root mycontainer apk add curl</code></pre>

<h3>Copy Files In/Out</h3>
<pre><code># Copy file from container to host
docker cp mycontainer:/app/config.json ./config.json

# Copy file from host to container
docker cp ./new-config.json mycontainer:/app/config.json</code></pre>

<h3>When the Container Won't Start</h3>
<p>Override the entrypoint to get a shell even if the app crashes on startup:</p>
<pre><code>docker run -it --entrypoint sh myimage</code></pre>

<h3>nsenter for Host Namespace Access</h3>
<pre><code>PID=$(docker inspect --format '{{.State.Pid}}' mycontainer)
nsenter -t $PID -n ip addr  # container's network from host</code></pre>
