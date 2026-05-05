---
title: Swarm Services & Scaling
summary: Create, update, and scale services. Rolling updates, rollbacks, and placement constraints.
category: docker-dash
difficulty: intermediate
icon: fas fa-expand-arrows-alt
---

<h2>Swarm Services &amp; Scaling</h2>
<p>Swarm services are the unit of deployment in a cluster. They manage replicas, rolling updates, and placement automatically.</p>

<h3>Scale a Service</h3>
<pre><code>docker service scale web=5
# Or equivalently:
docker service update --replicas 5 web</code></pre>

<h3>Rolling Update (Zero Downtime)</h3>
<pre><code>docker service update \
  --image nginx:1.25-alpine \
  --update-parallelism 2 \
  --update-delay 10s \
  web</code></pre>
<p>Swarm updates 2 replicas at a time, waiting 10 seconds between batches.</p>

<h3>Rollback to Previous Version</h3>
<pre><code>docker service rollback web</code></pre>

<h3>Placement Constraints</h3>
<pre><code># Only run on manager nodes
docker service create --constraint node.role==manager myapp

# Only on nodes labeled "ssd"
docker service create --constraint node.labels.disk==ssd myapp

# Add a label to a node
docker node update --label-add disk=ssd worker1</code></pre>

<h3>Global Mode (Run on Every Node)</h3>
<pre><code>docker service create --mode global \
  --name monitoring-agent \
  prom/node-exporter</code></pre>

<h3>Inspect a Service</h3>
<pre><code>docker service inspect --pretty web
docker service ps web          # task list with placement info
docker service logs -f web     # aggregated logs from all replicas</code></pre>

<h3>Remove a Service</h3>
<pre><code>docker service rm web</code></pre>
