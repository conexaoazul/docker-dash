---
title: Docker Volumes Explained
summary: Learn how Docker volumes persist data across container restarts and how to use them.
category: basics
difficulty: beginner
icon: fas fa-hdd
---

<h2>Docker Volumes Explained</h2>
<p>Containers are ephemeral — when a container is removed, its writable layer disappears. <strong>Volumes</strong> and <strong>bind mounts</strong> are the two ways to persist data outside the container lifecycle.</p>

<h2>Named volumes (recommended)</h2>
<p>Docker manages named volumes in <code>/var/lib/docker/volumes/</code>. They survive container removal and can be shared between containers.</p>
<pre><code># Create a named volume
docker volume create mydata

# Run a container using it
docker run -d -v mydata:/var/lib/postgresql/data postgres:16

# List volumes
docker volume ls

# Inspect a volume (shows mount path)
docker volume inspect mydata</code></pre>

<h2>Bind mounts</h2>
<p>Bind mounts map a <strong>host directory</strong> directly into the container. Useful for development (live code reloading) but less portable.</p>
<pre><code># Mount the current directory as /app inside the container
docker run -d -v $(pwd)/src:/app node:20-alpine</code></pre>

<h2>Volumes in Docker Compose</h2>
<pre><code>services:
  db:
    image: postgres:16
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:</code></pre>

<h2>Backup a volume</h2>
<pre><code># Tar the volume contents into the current directory
docker run --rm   -v mydata:/data   -v $(pwd):/backup   busybox tar czf /backup/mydata-backup.tar.gz -C /data .</code></pre>

<h2>Restore a backup</h2>
<pre><code>docker run --rm   -v mydata:/data   -v $(pwd):/backup   busybox tar xzf /backup/mydata-backup.tar.gz -C /data</code></pre>
