---
title: Rețele overlay Swarm
summary: Conectează servicii între noduri cu rețele overlay criptate și rutare ingress.
---

<h2>Rețele overlay Swarm</h2>
<p>Rețelele overlay permit serviciilor de pe noduri fizice diferite să comunice ca și cum ar fi în aceeași rețea locală — folosind încapsulare VXLAN peste rețeaua existentă.</p>

<h3>Creează o rețea overlay</h3>
<pre><code># Attachable permite și containerelor standalone să se alăture
docker network create \
  --driver overlay \
  --attachable \
  myoverlay</code></pre>

<h3>Deployează servicii pe același overlay</h3>
<pre><code>docker service create --network myoverlay --name app myapp:latest
docker service create --network myoverlay --name db postgres:15</code></pre>
<p>Serviciul <code>app</code> poate ajunge la <code>db</code> pur și simplu folosind <code>db</code> ca hostname — DNS-ul integrat Swarm rezolvă numele serviciilor la VIP-uri (IP-uri Virtuale).</p>

<h3>Overlay criptat (pentru trafic sensibil)</h3>
<pre><code>docker network create \
  --driver overlay \
  --opt encrypted \
  secure-net</code></pre>
<p>Criptează traficul planului de date între noduri folosind AES-GCM. Overhead mic de performanță (~10%).</p>

<h3>Rețeaua Ingress și Routing Mesh</h3>
<p>Rețeaua <strong>ingress</strong> integrată în Swarm implementează un routing mesh: orice port publicat pe orice nod este rutat către orice replică disponibilă — chiar dacă pe acel nod nu rulează nicio replică.</p>
<pre><code># Portul 80 este accesibil pe TOATE nodurile
docker service create --publish 80:80 --replicas 2 nginx</code></pre>

<h3>Porturile de firewall necesare pentru Swarm</h3>
<ul>
  <li><strong>2377/tcp</strong> — Management cluster (doar manager)</li>
  <li><strong>7946/tcp+udp</strong> — Comunicare noduri</li>
  <li><strong>4789/udp</strong> — Trafic rețea overlay (VXLAN)</li>
</ul>
