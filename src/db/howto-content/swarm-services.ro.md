---
title: Servicii și scalare Swarm
summary: Creează, actualizează și scalează servicii. Actualizări graduale, rollback-uri și constrângeri de plasare.
---

<h2>Servicii și scalare Swarm</h2>
<p>Serviciile Swarm sunt unitatea de deployment într-un cluster. Gestionează automat replicile, actualizările graduale și plasarea.</p>

<h3>Scalează un serviciu</h3>
<pre><code>docker service scale web=5
# Sau echivalent:
docker service update --replicas 5 web</code></pre>

<h3>Actualizare graduală (fără downtime)</h3>
<pre><code>docker service update \
  --image nginx:1.25-alpine \
  --update-parallelism 2 \
  --update-delay 10s \
  web</code></pre>
<p>Swarm actualizează 2 replici odată, așteptând 10 secunde între loturi.</p>

<h3>Rollback la versiunea anterioară</h3>
<pre><code>docker service rollback web</code></pre>

<h3>Constrângeri de plasare</h3>
<pre><code># Rulează doar pe noduri manager
docker service create --constraint node.role==manager myapp

# Doar pe noduri etichetate cu "ssd"
docker service create --constraint node.labels.disk==ssd myapp

# Adaugă o etichetă unui nod
docker node update --label-add disk=ssd worker1</code></pre>

<h3>Modul Global (rulează pe fiecare nod)</h3>
<pre><code>docker service create --mode global \
  --name monitoring-agent \
  prom/node-exporter</code></pre>

<h3>Inspectează un serviciu</h3>
<pre><code>docker service inspect --pretty web
docker service ps web          # lista task-urilor cu info de plasare
docker service logs -f web     # loguri agregate din toate replicile</code></pre>
