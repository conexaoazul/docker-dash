---
title: Database Backup & Restore
summary: Backup and restore PostgreSQL, MySQL, and MongoDB databases running in Docker.
category: backup
difficulty: intermediate
icon: fas fa-undo
---

<h2>Database Backup &amp; Restore</h2>
<p>Databases need consistent backups that capture data at a point in time. Use the native dump tools rather than volume snapshots for running databases.</p>

<h3>PostgreSQL</h3>
<pre><code># Backup
docker exec postgres_container pg_dump -U postgres mydb &gt; mydb-$(date +%Y%m%d).sql

# Compressed backup
docker exec postgres_container pg_dump -U postgres -Fc mydb &gt; mydb.dump

# Restore
docker exec -i postgres_container psql -U postgres mydb &lt; mydb-20240115.sql

# Restore from custom format
docker exec -i postgres_container pg_restore -U postgres -d mydb &lt; mydb.dump</code></pre>

<h3>MySQL / MariaDB</h3>
<pre><code># Backup
docker exec mysql_container mysqldump -u root -p'secret' mydb &gt; mydb-$(date +%Y%m%d).sql

# All databases
docker exec mysql_container mysqldump -u root -p'secret' --all-databases &gt; all-dbs.sql

# Restore
docker exec -i mysql_container mysql -u root -p'secret' mydb &lt; mydb-20240115.sql</code></pre>

<h3>MongoDB</h3>
<pre><code># Backup (creates a directory)
docker exec mongo_container mongodump --db mydb --out /dump
docker cp mongo_container:/dump ./mongo-backup-$(date +%Y%m%d)

# Restore
docker cp ./mongo-backup-20240115 mongo_container:/dump
docker exec mongo_container mongorestore --db mydb /dump/mydb</code></pre>

<h3>Automating Database Backups</h3>
<pre><code># /etc/cron.daily/docker-db-backup
#!/bin/bash
docker exec postgres_container pg_dump -U postgres mydb \
  | gzip &gt; /backups/postgres-$(date +%Y%m%d).sql.gz
find /backups -name "postgres-*.sql.gz" -mtime +30 -delete</code></pre>
