---
title: Depanare cu docker exec
summary: 'Folosește docker exec pentru a inspecta containere rulând: acces shell, listare procese, vizualizare fișiere.'
---

<h2>Depanare cu docker exec</h2>
<p><code>docker exec</code> îți permite să rulezi comenzi în interiorul unui container care rulează — cel mai puternic instrument de depanare.</p>

<h3>Obține un shell interactiv</h3>
<pre><code># bash (majoritatea imaginilor)
docker exec -it mycontainer bash

# sh (Alpine și imagini minimale)
docker exec -it mycontainer sh

# ca root (suprascrie utilizatorul)
docker exec -it -u root mycontainer bash</code></pre>

<h3>Inspectează procesele</h3>
<pre><code>docker exec mycontainer ps aux</code></pre>

<h3>Verifică rețeaua din interior</h3>
<pre><code>docker exec mycontainer cat /etc/hosts
docker exec mycontainer cat /etc/resolv.conf

# Ping alt container după nume
docker exec mycontainer ping db

# Verifică dacă un port este accesibil
docker exec mycontainer nc -zv db 5432</code></pre>

<h3>Instalează instrumente de depanare din mers</h3>
<pre><code># Bazat pe Debian/Ubuntu
docker exec -it -u root mycontainer bash -c "apt-get update &amp;&amp; apt-get install -y curl net-tools"

# Bazat pe Alpine
docker exec -it -u root mycontainer apk add curl</code></pre>

<h3>Copiază fișiere în/din container</h3>
<pre><code># Copiază fișier din container pe host
docker cp mycontainer:/app/config.json ./config.json

# Copiază fișier de pe host în container
docker cp ./new-config.json mycontainer:/app/config.json</code></pre>

<h3>Când containerul nu pornește</h3>
<p>Suprascrie entrypoint-ul pentru a obține un shell chiar dacă aplicația se oprește la pornire:</p>
<pre><code>docker run -it --entrypoint sh myimage</code></pre>
