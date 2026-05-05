---
title: Docker Networking Deep Dive
summary: Understand bridge, host, overlay, macvlan networks and when to use each.
category: networking
difficulty: intermediate
icon: fas fa-project-diagram
---

<h2>Docker Networking Deep Dive</h2>
<p>Docker offers five network drivers. Understanding how each works helps you choose the right one and debug connectivity issues.</p>

<h3>Bridge (Default)</h3>
<p>Every container gets a virtual Ethernet interface (veth pair). One end lives in the container, the other in the host's network namespace. Docker creates <code>iptables</code> rules for NAT and port forwarding.</p>
<pre><code>docker network create mynet
docker run --network mynet myapp</code></pre>
<p>Containers on the same custom bridge network can reach each other by container name (built-in DNS).</p>

<h3>Host Network</h3>
<p>The container shares the host's network namespace — no isolation, no NAT, maximum performance.</p>
<pre><code>docker run --network host nginx</code></pre>
<p>Use when: low latency is critical (high-throughput proxies, monitoring agents).</p>

<h3>Overlay (Swarm Multi-Host)</h3>
<p>Overlay networks span multiple Docker hosts using VXLAN encapsulation. Swarm services on the same overlay network can communicate by service name regardless of which node they run on.</p>
<pre><code>docker network create -d overlay --attachable myoverlay</code></pre>

<h3>Macvlan</h3>
<p>Assigns a real MAC address to the container, making it appear as a physical device on your LAN. Containers get their own IP addresses from your router's DHCP pool.</p>
<pre><code>docker network create -d macvlan \
  --subnet=192.168.1.0/24 \
  --gateway=192.168.1.1 \
  -o parent=eth0 mymacvlan</code></pre>

<h3>None</h3>
<p>Completely disables networking. Use for batch processing containers that must have no network access.</p>
