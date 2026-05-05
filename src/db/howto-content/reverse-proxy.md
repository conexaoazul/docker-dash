---
title: Set Up a Reverse Proxy
summary: Configure Nginx, Caddy, or Traefik as reverse proxy for your Docker services.
category: networking
difficulty: intermediate
icon: fas fa-shield-alt
---

<h2>Set Up a Reverse Proxy</h2>
<p>A reverse proxy sits in front of your services and handles incoming requests. Benefits: single port 443 for HTTPS, SSL termination in one place, route multiple domains to different containers, hide internal ports.</p>

<h2>Option 1 — Caddy (simplest, auto-HTTPS)</h2>
<pre><code># Caddyfile
example.com {
  reverse_proxy localhost:3000
}

api.example.com {
  reverse_proxy localhost:4000
}</code></pre>
<p>Caddy automatically obtains and renews Let's Encrypt certificates. No configuration needed.</p>

<h2>Option 2 — Nginx</h2>
<pre><code># /etc/nginx/sites-available/myapp
server {
    listen 80;
    server_name example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name example.com;

    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}</code></pre>

<h2>Option 3 — Traefik (Docker-native, label-based)</h2>
<pre><code>services:
  traefik:
    image: traefik:v3
    command:
      - "--providers.docker=true"
      - "--entrypoints.websecure.address=:443"
      - "--certificatesresolvers.le.acme.email=you@example.com"
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock

  myapp:
    image: myapp:latest
    labels:
      - "traefik.http.routers.myapp.rule=Host(`example.com`)"
      - "traefik.http.routers.myapp.tls.certresolver=le"</code></pre>
<p>Traefik auto-discovers containers via Docker labels — no config reload needed when adding services.</p>
