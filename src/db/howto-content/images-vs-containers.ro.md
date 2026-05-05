---
title: Imagini Docker vs Containere
summary: Înțelege diferența dintre imagini și containere — cel mai fundamental concept Docker.
---

<h2>Imagini vs Containere</h2>
<p>Gândește-te la o <strong>imagine Docker</strong> ca la o definiție de clasă — este un șablon read-only care descrie tot ce e necesar pentru a rula o aplicație: stratul de OS, runtime, dependențe și fișierele aplicației. Un <strong>container</strong> este o instanță activă a acelei imagini, la fel cum un obiect este o instanță a unei clase.</p>

<h2>Lucrul cu imagini</h2>
<pre><code># Descarcă o imagine de pe Docker Hub (NU o rulează)
docker pull nginx:alpine

# Listează imaginile disponibile local
docker images

# Șterge o imagine
docker rmi nginx:alpine</code></pre>

<h2>Lucrul cu containere</h2>
<pre><code># Creează ȘI pornește un container dintr-o imagine
docker run -d -p 8080:80 --name my-nginx nginx:alpine

# Listează containerele care rulează
docker ps

# Listează TOATE containerele (inclusiv cele oprite)
docker ps -a

# Oprește / pornește / șterge un container
docker stop my-nginx
docker start my-nginx
docker rm my-nginx</code></pre>

<h2>Cum funcționează straturile imaginii</h2>
<p>Imaginile sunt construite în <strong>straturi</strong>. Fiecare instrucțiune dintr-un Dockerfile adaugă un strat. Straturile sunt cache-uite și partajate între imagini — descărcarea <code>nginx:alpine</code> și <code>node:alpine</code> reutilizează stratul Alpine de bază, economisind spațiu și timp.</p>
<pre><code># Inspectează straturile unei imagini
docker history nginx:alpine</code></pre>

<h3>Concluzie cheie</h3>
<ul>
  <li>Imaginile sunt <strong>imutabile</strong> — nu modifici imaginea unui container care rulează.</li>
  <li>Containerele sunt <strong>efemere</strong> implicit — datele scrise în interior se pierd la ștergere. Folosește <strong>volume</strong> pentru persistență.</li>
  <li>O singură imagine poate genera mai multe containere simultan.</li>
</ul>
