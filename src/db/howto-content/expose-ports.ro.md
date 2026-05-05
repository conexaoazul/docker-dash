---
title: Expunerea porturilor în siguranță
summary: Cum funcționează maparea porturilor Docker și capcanele de securitate cu -p.
---

<h2>Expunerea porturilor containerelor în siguranță</h2>
<p>Flag-ul <code>-p</code> al Docker mapează un port al containerului la un port al hostului. Sintaxa este <code>PORT_HOST:PORT_CONTAINER</code>.</p>

<h2>Mapare de bază a porturilor</h2>
<pre><code># Expune portul 80 al containerului pe portul 8080 al hostului (toate interfețele)
docker run -d -p 8080:80 nginx

# Leagă la localhost — NU accesibil din exterior
docker run -d -p 127.0.0.1:8080:80 nginx

# Expune pe o interfață specifică
docker run -d -p 192.168.1.10:8080:80 nginx</code></pre>

<h2>Secțiunea ports în Docker Compose</h2>
<pre><code>services:
  web:
    image: nginx
    ports:
      - "8080:80"               # public
      - "127.0.0.1:9000:9000"  # doar localhost</code></pre>

<h2>Avertisment de securitate: Docker ocolește UFW</h2>
<p><strong>Critic:</strong> Docker modifică direct regulile iptables, ocolind complet UFW. Un port mapat cu <code>-p 8080:80</code> este accesibil public chiar dacă UFW spune că e blocat.</p>
<ul>
  <li>Folosește <code>127.0.0.1:PORT:PORT</code> pentru servicii ce trebuie accesate doar printr-un reverse proxy.</li>
  <li>Sau configurează lanțul iptables <code>DOCKER-USER</code> pentru a restricționa accesul.</li>
  <li>Sau folosește un reverse proxy (Nginx/Caddy/Traefik) și expune public doar porturile 80 și 443.</li>
</ul>

<h2>Verifică porturile deschise</h2>
<pre><code># Pe host
ss -tlnp | grep docker

# Inspectează un container
docker port my-container</code></pre>
