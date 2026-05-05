---
title: Securizarea hostului Docker
summary: 'Best practices securitate: non-root, rootfs read-only, capabilities, profile seccomp.'
---

<h2>Securizarea hostului Docker</h2>
<p>Implicit, containerele Docker rulează ca root și au capabilități extinse. Aceste practici reduc semnificativ suprafața de atac.</p>

<h2>1 — Rulează containerele ca utilizator non-root</h2>
<pre><code># În Dockerfile
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser</code></pre>
<pre><code># În docker-compose.yml
services:
  app:
    image: myapp
    user: "1000:1000"</code></pre>

<h2>2 — Sistem de fișiere root read-only</h2>
<pre><code>docker run --read-only -v /tmp myapp</code></pre>
<pre><code># docker-compose.yml
services:
  app:
    read_only: true
    tmpfs:
      - /tmp</code></pre>

<h2>3 — Elimină toate capabilitățile, adaugă doar ce e necesar</h2>
<pre><code>services:
  app:
    cap_drop:
      - ALL
    cap_add:
      - NET_BIND_SERVICE   # doar dacă portul < 1024</code></pre>

<h2>4 — Fără privilegii noi</h2>
<pre><code>services:
  app:
    security_opt:
      - no-new-privileges:true</code></pre>

<h2>5 — Limite de resurse</h2>
<pre><code>services:
  app:
    deploy:
      resources:
        limits:
          cpus: "0.5"
          memory: 256M</code></pre>

<h2>6 — Nu folosi niciodată --privileged</h2>
<p><code>--privileged</code> oferă containerului acces root complet la kernel-ul hostului. Evită complet — folosește capabilități specifice în loc.</p>

<h2>7 — Ține imaginile actualizate</h2>
<pre><code># Scanează CVE-uri înainte de deployment
docker scout cves myimage:latest
# sau
trivy image myimage:latest</code></pre>
