---
title: Backup Docker Volumes
summary: Back up named volumes using temporary containers and tar archives.
category: backup
difficulty: intermediate
icon: fas fa-database
---

<h2>Backup Docker Volumes</h2>
<p>Named volumes store persistent data outside containers. Backing them up correctly ensures you can recover from accidental deletions, corruption, or host failures.</p>

<h3>Backup a Volume</h3>
<p>Spin up a temporary Alpine container, mount the volume and a local backup directory, then create a compressed archive:</p>
<pre><code>docker run --rm \
  -v myvolume:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/myvolume-$(date +%Y%m%d).tar.gz -C /data .</code></pre>
<p>This produces a <code>.tar.gz</code> file in your current directory.</p>

<h3>Restore a Volume</h3>
<pre><code># Create the volume if it doesn't exist
docker volume create myvolume

# Extract backup into the volume
docker run --rm \
  -v myvolume:/data \
  -v $(pwd):/backup \
  alpine tar xzf /backup/myvolume-20240115.tar.gz -C /data</code></pre>

<h3>Backup All Volumes at Once</h3>
<pre><code>for vol in $(docker volume ls -q); do
  docker run --rm \
    -v $vol:/data \
    -v $(pwd)/backups:/backup \
    alpine tar czf /backup/$vol-$(date +%Y%m%d).tar.gz -C /data .
  echo "Backed up: $vol"
done</code></pre>

<h3>Best Practices</h3>
<ul>
  <li>Stop the container before backing up databases to ensure consistency</li>
  <li>Store backups on a different host or cloud storage</li>
  <li>Test restores periodically — a backup you've never tested is not a backup</li>
  <li>Automate with a cron job: <code>0 2 * * * /opt/backup-volumes.sh</code></li>
</ul>
