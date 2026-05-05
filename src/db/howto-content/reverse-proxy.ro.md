---
title: Configurare Reverse Proxy
summary: Configurează Nginx, Caddy sau Traefik ca reverse proxy pentru serviciile Docker.
---

<h2>Configurare Reverse Proxy</h2>
<p>Un reverse proxy stă în fața serviciilor tale și gestionează cererile primite. Avantaje: un singur port 443 pentru HTTPS, terminare SSL într-un singur loc, rutarea mai multor domenii la containere diferite, ascunderea porturilor interne.</p>

<h2>Opțiunea 1 — Caddy (cel mai simplu, auto-HTTPS)</h2>
<pre><code># Caddyfile
example.com {
  reverse_proxy localhost:3000
}

api.example.com {
  reverse_proxy localhost:4000
}</code></pre>
<p>Caddy obține și reînnoiește automat certificatele Let's Encrypt. Nu necesită configurare suplimentară.</p>

<h2>Opțiunea 2 — Nginx</h2>
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

<h2>Opțiunea 3 — Traefik (nativ Docker, bazat pe etichete)</h2>
<pre><code>services:
  traefik:
    image: traefik:v3
    command:
      - "--providers.docker=true"
      - "--entrypoints.websecure.address=:443"
      - "--certificatesresolvers.le.acme.email=tu@exemplu.com"
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
<p>Traefik descoperă automat containerele prin etichetele Docker — nu e nevoie de reîncărcare a configurației la adăugarea de servicii.</p>
