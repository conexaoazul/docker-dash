---
title: Clean Up Docker Resources
summary: Reclaim disk space by pruning unused containers, images, volumes, and networks.
category: performance
difficulty: beginner
icon: fas fa-broom
---

<h2>Clean Up Docker Resources</h2>
<p>Docker accumulates unused images, stopped containers, dangling volumes, and stale networks over time. Regular pruning keeps disk usage in check.</p>

<h3>The Nuclear Option — Prune Everything</h3>
<pre><code># Remove all stopped containers, unused networks, dangling images, and build cache
docker system prune

# Also remove unused volumes (add -v) and ALL unused images (not just dangling)
docker system prune -a --volumes</code></pre>
<p><strong>Warning:</strong> The <code>--volumes</code> flag will delete volumes not attached to any container. Make sure you have backups first.</p>

<h3>Targeted Pruning</h3>
<pre><code># Dangling images only (untagged layers)
docker image prune

# All unused images (not referenced by any container)
docker image prune -a

# Stopped containers
docker container prune

# Unused volumes
docker volume prune

# Unused networks
docker network prune

# Build cache only
docker builder prune
docker builder prune -a  # including non-dangling cache</code></pre>

<h3>Check What Will Be Removed First</h3>
<pre><code>docker system df          # shows disk usage summary
docker system df -v       # verbose: lists each image and volume</code></pre>

<h3>Scheduled Cleanup</h3>
<p>Add a weekly cleanup cron job on your server:</p>
<pre><code># /etc/cron.weekly/docker-cleanup
#!/bin/bash
docker system prune -f
docker image prune -a -f --filter "until=720h"  # older than 30 days</code></pre>
