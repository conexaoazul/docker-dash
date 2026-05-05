---
title: Backup volume Docker
summary: Fă backup volumelor numite folosind containere temporare și arhive tar.
---

<h2>Backup volume Docker</h2>
<p>Volumele numite stochează date persistente în afara containerelor. Backup-ul corect asigură că te poți recupera după ștergeri accidentale, corupere sau defecțiuni ale hostului.</p>

<h3>Backup un volum</h3>
<p>Pornește un container temporar Alpine, montează volumul și un director de backup local, apoi creează o arhivă comprimată:</p>
<pre><code>docker run --rm \
  -v myvolume:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/myvolume-$(date +%Y%m%d).tar.gz -C /data .</code></pre>
<p>Aceasta produce un fișier <code>.tar.gz</code> în directorul curent.</p>

<h3>Restaurează un volum</h3>
<pre><code># Creează volumul dacă nu există
docker volume create myvolume

# Extrage backup-ul în volum
docker run --rm \
  -v myvolume:/data \
  -v $(pwd):/backup \
  alpine tar xzf /backup/myvolume-20240115.tar.gz -C /data</code></pre>

<h3>Backup toate volumele simultan</h3>
<pre><code>for vol in $(docker volume ls -q); do
  docker run --rm \
    -v $vol:/data \
    -v $(pwd)/backups:/backup \
    alpine tar czf /backup/$vol-$(date +%Y%m%d).tar.gz -C /data .
  echo "Backed up: $vol"
done</code></pre>

<h3>Bune practici</h3>
<ul>
  <li>Oprește containerul înainte de backup pentru bazele de date, pentru consistență</li>
  <li>Stochează backup-urile pe un host diferit sau în cloud</li>
  <li>Testează restaurarea periodic — un backup netestat nu este un backup</li>
  <li>Automatizează cu cron: <code>0 2 * * * /opt/backup-volumes.sh</code></li>
</ul>
