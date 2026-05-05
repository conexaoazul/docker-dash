---
title: Swarm Overlay Networks
summary: Connect services across nodes with encrypted overlay networks and ingress routing.
category: networking
difficulty: intermediate
icon: fas fa-cloud
---

<h2>Swarm Overlay Networks</h2>
<p>Overlay networks allow services on different physical nodes to communicate as if they were on the same local network — using VXLAN encapsulation over the existing network.</p>

<h3>Create an Overlay Network</h3>
<pre><code># Attachable allows standalone containers to also join
docker network create \
  --driver overlay \
  --attachable \
  myoverlay</code></pre>

<h3>Deploy Services on the Same Overlay</h3>
<pre><code>docker service create --network myoverlay --name app myapp:latest
docker service create --network myoverlay --name db postgres:15</code></pre>
<p>The <code>app</code> service can reach <code>db</code> simply by using <code>db</code> as the hostname — Swarm's built-in DNS resolves service names to VIPs (Virtual IPs).</p>

<h3>Encrypted Overlay (for Sensitive Traffic)</h3>
<pre><code>docker network create \
  --driver overlay \
  --opt encrypted \
  secure-net</code></pre>
<p>Encrypts data plane traffic between nodes using AES-GCM. Small performance overhead (~10%).</p>

<h3>Ingress Network and Routing Mesh</h3>
<p>Swarm's built-in <strong>ingress</strong> network implements a routing mesh: any published port on any node routes to any available replica — even if no replica is running on that node.</p>
<pre><code># Port 80 is reachable on ALL nodes, regardless of replica placement
docker service create --publish 80:80 --replicas 2 nginx</code></pre>

<h3>Service Discovery</h3>
<pre><code># From inside a container on the overlay
nslookup app          # resolves to VIP
nslookup tasks.app    # resolves to individual task IPs</code></pre>

<h3>Firewall Ports Required for Swarm</h3>
<ul>
  <li><strong>2377/tcp</strong> — Cluster management (manager only)</li>
  <li><strong>7946/tcp+udp</strong> — Node communication</li>
  <li><strong>4789/udp</strong> — Overlay network traffic (VXLAN)</li>
</ul>
