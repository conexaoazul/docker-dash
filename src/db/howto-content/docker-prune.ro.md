---
title: Curățare resurse Docker
summary: Eliberează spațiu pe disc eliminând containere, imagini, volume și rețele neutilizate.
---

<h2>Curățare resurse Docker</h2>
<p>Docker acumulează în timp imagini neutilizate, containere oprite, volume suspendate și rețele învechite. Curățarea regulată menține utilizarea discului sub control.</p>

<h3>Opțiunea nucleară — Curăță totul</h3>
<pre><code># Elimină toate containerele oprite, rețelele neutilizate, imaginile suspendate și cache-ul de build
docker system prune

# Include și volumele neutilizate (-v) și TOATE imaginile neutilizate
docker system prune -a --volumes</code></pre>
<p><strong>Atenție:</strong> Flag-ul <code>--volumes</code> va șterge volumele neataşate niciunui container. Asigură-te că ai backup-uri mai întâi.</p>

<h3>Curățare direcționată</h3>
<pre><code># Doar imagini suspendate (layere fără tag)
docker image prune

# Toate imaginile neutilizate
docker image prune -a

# Containere oprite
docker container prune

# Volume neutilizate
docker volume prune

# Rețele neutilizate
docker network prune

# Doar cache-ul de build
docker builder prune
docker builder prune -a</code></pre>

<h3>Verifică ce va fi eliminat</h3>
<pre><code>docker system df          # rezumat utilizare disc
docker system df -v       # detaliat: listează fiecare imagine și volum</code></pre>

<h3>Curățare programată</h3>
<p>Adaugă un cron job săptămânal pe serverul tău:</p>
<pre><code># /etc/cron.weekly/docker-cleanup
#!/bin/bash
docker system prune -f
docker image prune -a -f --filter "until=720h"  # mai vechi de 30 de zile</code></pre>
