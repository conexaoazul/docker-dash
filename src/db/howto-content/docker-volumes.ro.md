---
title: Volume Docker explicate
summary: Învață cum volumele Docker persistă datele și cum să le utilizezi.
---

<h2>Volume Docker explicate</h2>
<p>Containerele sunt efemere — la ștergere, stratul lor de scriere dispare. <strong>Volumele</strong> și <strong>bind mount-urile</strong> sunt cele două metode de a persista date în afara ciclului de viață al containerului.</p>

<h2>Volume cu nume (recomandat)</h2>
<p>Docker gestionează volumele cu nume în <code>/var/lib/docker/volumes/</code>. Supraviețuiesc ștergerii containerelor și pot fi partajate între containere.</p>
<pre><code># Creează un volum cu nume
docker volume create mydata

# Rulează un container folosindu-l
docker run -d -v mydata:/var/lib/postgresql/data postgres:16

# Listează volumele
docker volume ls

# Inspectează un volum (arată calea de montare)
docker volume inspect mydata</code></pre>

<h2>Bind mounts</h2>
<p>Bind mount-urile mapează direct un <strong>director de pe host</strong> în container. Utile pentru dezvoltare (reîncărcare live a codului), dar mai puțin portabile.</p>
<pre><code># Montează directorul curent ca /app în container
docker run -d -v $(pwd)/src:/app node:20-alpine</code></pre>

<h2>Volume în Docker Compose</h2>
<pre><code>services:
  db:
    image: postgres:16
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:</code></pre>

<h2>Backup pentru un volum</h2>
<pre><code># Arhivează conținutul volumului în directorul curent
docker run --rm   -v mydata:/data   -v $(pwd):/backup   busybox tar czf /backup/mydata-backup.tar.gz -C /data .</code></pre>

<h2>Restaurare din backup</h2>
<pre><code>docker run --rm   -v mydata:/data   -v $(pwd):/backup   busybox tar xzf /backup/mydata-backup.tar.gz -C /data</code></pre>
