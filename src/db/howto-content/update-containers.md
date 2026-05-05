---
title: Updating Containers Safely
summary: Pull new images and recreate containers without downtime using Compose.
category: compose
difficulty: intermediate
icon: fas fa-sync-alt
---

<h2>Updating Containers Safely</h2>
<p>Keeping your containers up to date is essential for security patches and new features. Docker Compose makes this a two-step process.</p>

<h3>Pull New Images</h3>
<pre><code>docker compose pull</code></pre>
<p>This downloads the latest versions of all images declared in your <code>docker-compose.yml</code> without touching running containers.</p>

<h3>Recreate Containers</h3>
<pre><code>docker compose up -d</code></pre>
<p>Compose compares the running state against the desired state and recreates only the containers whose images changed.</p>

<h3>Verify the Update</h3>
<pre><code>docker compose ps
docker compose logs --tail=50</code></pre>

<h3>Update a Single Service</h3>
<pre><code>docker compose pull app
docker compose up -d app</code></pre>

<h3>Rolling Updates in Swarm</h3>
<p>In Swarm mode, use <code>docker service update</code> for zero-downtime rolling updates:</p>
<pre><code>docker service update --image myapp:2.0 my_service</code></pre>
<p>Swarm drains one task at a time, keeping the service available throughout.</p>

<h3>Automated Updates with Watchtower</h3>
<p>Watchtower polls Docker Hub and automatically recreates containers when a new image is pushed:</p>
<pre><code>docker run -d --name watchtower \
  -v /var/run/docker.sock:/var/run/docker.sock \
  containrrr/watchtower --interval 3600</code></pre>
<p><strong>Caution:</strong> Watchtower is convenient for home labs but should be used carefully in production — always pin image versions and test before auto-deploying.</p>
