---
title: Harden Your Docker Host
summary: 'Security best practices: non-root, read-only rootfs, capabilities, seccomp profiles.'
category: security
difficulty: advanced
icon: fas fa-shield-alt
---

<h2>Harden Your Docker Host</h2>
<p>By default, Docker containers run as root and have broad capabilities. These practices significantly reduce attack surface.</p>

<h2>1 — Run containers as non-root</h2>
<pre><code># In Dockerfile
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser</code></pre>
<pre><code># In docker-compose.yml
services:
  app:
    image: myapp
    user: "1000:1000"</code></pre>

<h2>2 — Read-only root filesystem</h2>
<pre><code>docker run --read-only -v /tmp myapp</code></pre>
<pre><code># docker-compose.yml
services:
  app:
    read_only: true
    tmpfs:
      - /tmp</code></pre>

<h2>3 — Drop all capabilities, add only what's needed</h2>
<pre><code>services:
  app:
    cap_drop:
      - ALL
    cap_add:
      - NET_BIND_SERVICE   # only if binding to port < 1024</code></pre>

<h2>4 — No new privileges</h2>
<pre><code>services:
  app:
    security_opt:
      - no-new-privileges:true</code></pre>

<h2>5 — Resource limits</h2>
<pre><code>services:
  app:
    deploy:
      resources:
        limits:
          cpus: "0.5"
          memory: 256M</code></pre>

<h2>6 — Never use --privileged</h2>
<p><code>--privileged</code> gives a container full root access to the host kernel. Avoid it completely — use specific capabilities instead.</p>

<h2>7 — Keep images updated</h2>
<pre><code># Scan for CVEs before deploying
docker scout cves myimage:latest
# or
trivy image myimage:latest</code></pre>
