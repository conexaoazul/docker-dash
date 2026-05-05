---
title: Ghid rețele Docker
summary: Rețele bridge, host, overlay — când le folosești și cum creezi rețele custom.
---

<h2>Ghid rețele Docker</h2>
<p>Rețelistica Docker controlează modul în care containerele comunică între ele și cu lumea exterioară.</p>

<h2>Tipuri de rețele</h2>
<ul>
  <li><strong>bridge</strong> (implicit) — Rețea virtuală izolată pe host. Containerele de pe același bridge pot comunica între ele prin nume.</li>
  <li><strong>host</strong> — Containerul partajează stack-ul de rețea al hostului. Fără izolare; util pentru scenarii de performanță ridicată.</li>
  <li><strong>overlay</strong> — Se extinde pe mai multe hosturi Docker (necesită Swarm). Folosit în clustere de producție.</li>
  <li><strong>macvlan</strong> — Atribuie un MAC/IP real din rețeaua locală containerului. Apare ca un dispozitiv fizic în rețea.</li>
  <li><strong>none</strong> — Fără rețea. Complet izolat.</li>
</ul>

<h2>Rețele bridge custom (recomandat)</h2>
<p>Creează întotdeauna o rețea bridge cu nume în loc să folosești pe cea implicită. Containerele din aceeași rețea cu nume se pot rezolva între ele prin numele serviciului.</p>
<pre><code># Creează o rețea
docker network create mynet

# Rulează containere pe ea
docker run -d --network mynet --name db postgres:16
docker run -d --network mynet --name app myapp

# "app" poate ajunge la "db" folosind simplu hostname-ul "db"</code></pre>

<h2>Comenzi utile</h2>
<pre><code># Listează rețelele
docker network ls

# Inspectează o rețea (vezi containerele conectate și IP-urile)
docker network inspect mynet

# Conectează un container activ la o rețea
docker network connect mynet container-existent

# Deconectează
docker network disconnect mynet container-existent</code></pre>

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
<p>Această configurare înseamnă că doar <code>nginx</code> și <code>app</code> partajează o rețea — baza de date nu este accesibilă direct din nginx.</p>
