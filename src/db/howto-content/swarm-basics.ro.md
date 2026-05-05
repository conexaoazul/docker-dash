---
title: Bazele Docker Swarm
summary: Inițializează un swarm, adaugă noduri, deployează servicii și înțelege manageri vs workeri.
---

<h2>Bazele Docker Swarm</h2>
<p>Docker Swarm transformă un grup de hosturi Docker într-un cluster unitar, tolerant la defecțiuni. Serviciile sunt distribuite și repornite automat pe noduri.</p>

<h3>Inițializează un Swarm</h3>
<pre><code># Pe nodul manager
docker swarm init --advertise-addr 192.168.1.100</code></pre>
<p>Aceasta afișează o comandă de join pentru workeri. Copiaz-o.</p>

<h3>Adaugă noduri worker</h3>
<pre><code># Pe fiecare nod worker
docker swarm join --token SWMTKN-1-xxx 192.168.1.100:2377</code></pre>

<h3>Obține din nou token-ul de join</h3>
<pre><code>docker swarm join-token worker
docker swarm join-token manager  # pentru adăugarea mai multor manageri</code></pre>

<h3>Vizualizează clusterul</h3>
<pre><code>docker node ls</code></pre>

<h3>Deployează un serviciu</h3>
<pre><code>docker service create \
  --name web \
  --replicas 3 \
  --publish 80:80 \
  nginx:alpine</code></pre>

<h3>Deployează un stack (fișier Compose)</h3>
<pre><code>docker stack deploy -c docker-compose.yml mystack
docker stack ls
docker stack services mystack
docker stack ps mystack</code></pre>

<h3>Vizualizator (opțional)</h3>
<pre><code>docker service create \
  --name visualizer \
  --publish 8080:8080 \
  --constraint node.role==manager \
  --mount type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock \
  dockersamples/visualizer</code></pre>
