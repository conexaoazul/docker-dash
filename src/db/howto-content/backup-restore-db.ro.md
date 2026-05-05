---
title: Backup și restaurare baze de date
summary: Backup și restaurare baze de date PostgreSQL, MySQL și MongoDB din Docker.
---

<h2>Backup și restaurare baze de date</h2>
<p>Bazele de date necesită backup-uri consistente care capturează datele la un moment în timp. Folosește instrumentele native de dump în loc de snapshot-uri de volume pentru bazele de date active.</p>

<h3>PostgreSQL</h3>
<pre><code># Backup
docker exec postgres_container pg_dump -U postgres mydb &gt; mydb-$(date +%Y%m%d).sql

# Backup comprimat
docker exec postgres_container pg_dump -U postgres -Fc mydb &gt; mydb.dump

# Restaurare
docker exec -i postgres_container psql -U postgres mydb &lt; mydb-20240115.sql

# Restaurare din format custom
docker exec -i postgres_container pg_restore -U postgres -d mydb &lt; mydb.dump</code></pre>

<h3>MySQL / MariaDB</h3>
<pre><code># Backup
docker exec mysql_container mysqldump -u root -p'secret' mydb &gt; mydb-$(date +%Y%m%d).sql

# Toate bazele de date
docker exec mysql_container mysqldump -u root -p'secret' --all-databases &gt; all-dbs.sql

# Restaurare
docker exec -i mysql_container mysql -u root -p'secret' mydb &lt; mydb-20240115.sql</code></pre>

<h3>MongoDB</h3>
<pre><code># Backup (creează un director)
docker exec mongo_container mongodump --db mydb --out /dump
docker cp mongo_container:/dump ./mongo-backup-$(date +%Y%m%d)

# Restaurare
docker cp ./mongo-backup-20240115 mongo_container:/dump
docker exec mongo_container mongorestore --db mydb /dump/mydb</code></pre>

<h3>Automatizarea backup-urilor</h3>
<pre><code># /etc/cron.daily/docker-db-backup
#!/bin/bash
docker exec postgres_container pg_dump -U postgres mydb \
  | gzip &gt; /backups/postgres-$(date +%Y%m%d).sql.gz
find /backups -name "postgres-*.sql.gz" -mtime +30 -delete</code></pre>
