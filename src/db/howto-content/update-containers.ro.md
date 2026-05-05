---
title: Actualizare containere în siguranță
summary: Descarcă imagini noi și recreează containere fără downtime folosind Compose.
---

<h2>Actualizare containere în siguranță</h2>
<p>Menținerea containerelor la zi este esențială pentru patch-uri de securitate și funcționalități noi. Docker Compose face acest proces simplu în doi pași.</p>

<h3>Descarcă imaginile noi</h3>
<pre><code>docker compose pull</code></pre>
<p>Aceasta descarcă cele mai recente versiuni ale tuturor imaginilor declarate în <code>docker-compose.yml</code> fără a atinge containerele care rulează.</p>

<h3>Recreează containerele</h3>
<pre><code>docker compose up -d</code></pre>
<p>Compose compară starea curentă cu starea dorită și recreează doar containerele ale căror imagini s-au schimbat.</p>

<h3>Verifică actualizarea</h3>
<pre><code>docker compose ps
docker compose logs --tail=50</code></pre>

<h3>Actualizează un singur serviciu</h3>
<pre><code>docker compose pull app
docker compose up -d app</code></pre>

<h3>Rolling updates în Swarm</h3>
<p>În modul Swarm, folosește <code>docker service update</code> pentru actualizări fără downtime:</p>
<pre><code>docker service update --image myapp:2.0 my_service</code></pre>

<h3>Actualizări automate cu Watchtower</h3>
<p>Watchtower monitorizează Docker Hub și recreează automat containerele când apare o imagine nouă:</p>
<pre><code>docker run -d --name watchtower \
  -v /var/run/docker.sock:/var/run/docker.sock \
  containrrr/watchtower --interval 3600</code></pre>
<p><strong>Atenție:</strong> Watchtower este convenabil pentru home lab, dar în producție întotdeauna fixează versiunile imaginilor și testează înainte de a activa auto-deploy.</p>
