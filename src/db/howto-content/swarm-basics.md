---
title: Docker Swarm Basics
summary: Initialize a swarm, add nodes, deploy services, and understand managers vs workers.
category: docker-dash
difficulty: beginner
icon: fas fa-sitemap
---

<h2>Docker Swarm Basics</h2>
<p>Docker Swarm turns a group of Docker hosts into a single, fault-tolerant cluster. Services are automatically distributed and restarted across nodes.</p>

<h3>Initialize a Swarm</h3>
<pre><code># On the manager node
docker swarm init --advertise-addr 192.168.1.100</code></pre>
<p>This outputs a join command for workers. Copy it.</p>

<h3>Add Worker Nodes</h3>
<pre><code># On each worker node
docker swarm join --token SWMTKN-1-xxx 192.168.1.100:2377</code></pre>

<h3>Get the Join Token Again</h3>
<pre><code>docker swarm join-token worker
docker swarm join-token manager  # for adding more managers</code></pre>

<h3>View the Cluster</h3>
<pre><code>docker node ls</code></pre>

<h3>Deploy a Service</h3>
<pre><code>docker service create \
  --name web \
  --replicas 3 \
  --publish 80:80 \
  nginx:alpine</code></pre>

<h3>Deploy a Stack (Compose File)</h3>
<pre><code>docker stack deploy -c docker-compose.yml mystack
docker stack ls
docker stack services mystack
docker stack ps mystack</code></pre>

<h3>Visualizer (Optional)</h3>
<pre><code>docker service create \
  --name visualizer \
  --publish 8080:8080 \
  --constraint node.role==manager \
  --mount type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock \
  dockersamples/visualizer</code></pre>
<p>Opens a graphical view of node/service distribution at port 8080.</p>
