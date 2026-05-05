---
title: Limite de resurse pentru containere
summary: Setează limite CPU și memorie pentru a preveni consumul excesiv de resurse.
---

<h2>Limite de resurse pentru containere</h2>
<p>Fără limite, un singur container scăpat de sub control poate priva toate celelalte containere de resurse și poate crăpa hostul. Setează întotdeauna limite CPU și memorie în producție.</p>

<h3>Setarea limitelor în docker-compose.yml</h3>
<pre><code>services:
  app:
    image: myapp:latest
    deploy:
      resources:
        limits:
          cpus: '0.50'      # max 50% dintr-un core CPU
          memory: 512M      # max 512 MB RAM
        reservations:
          cpus: '0.25'      # minim garantat
          memory: 256M</code></pre>

<h3>Setarea limitelor cu docker run</h3>
<pre><code>docker run -d \
  --memory="512m" \
  --memory-swap="1g" \
  --cpus="0.5" \
  myapp:latest</code></pre>

<h3>Monitorizarea utilizării resurselor</h3>
<pre><code># Statistici live pentru toate containerele
docker stats

# Snapshot instantaneu (fără streaming)
docker stats --no-stream

# Container specific
docker stats myapp --no-stream</code></pre>

<h3>Ce se întâmplă când limitele sunt atinse</h3>
<ul>
  <li><strong>Limita de memorie atinsă:</strong> OOM killer-ul termină procesul containerului (cod de ieșire 137)</li>
  <li><strong>Limita CPU atinsă:</strong> Containerul este throttle-uit — continuă să ruleze, dar mai lent</li>
</ul>

<h3>Editorul de resurse în Docker Dash</h3>
<p>În Docker Dash, deschide pagina de detalii a unui container și apasă <strong>Edit Resources</strong> pentru a ajusta limitele de memorie și CPU din mers, fără a edita manual fișierele compose.</p>
