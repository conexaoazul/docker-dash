---
title: Linux Firewall (UFW/iptables)
summary: Configure UFW or iptables firewall rules. Understand the Docker/UFW bypass issue.
category: linux
difficulty: intermediate
icon: fas fa-fire
---

<h2>Linux Firewall (UFW/iptables)</h2>
<p>UFW (Uncomplicated Firewall) is the recommended front-end for iptables on Ubuntu/Debian. However, Docker has a known bypass issue you must understand before relying on UFW alone.</p>

<h3>Basic UFW Setup</h3>
<pre><code># Enable UFW
sudo ufw enable

# Default: deny all incoming, allow all outgoing
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Allow SSH (do this BEFORE enabling UFW!)
sudo ufw allow ssh
sudo ufw allow 22/tcp

# Allow specific ports
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 3000/tcp

# Check status
sudo ufw status verbose

# Delete a rule
sudo ufw delete allow 3000/tcp</code></pre>

<h3>The Docker/UFW Bypass Problem</h3>
<p><strong>Critical:</strong> Docker modifies iptables directly and bypasses UFW rules for published ports. A container with <code>-p 8080:8080</code> is exposed to the internet even if UFW blocks port 8080!</p>

<h3>Fix: Use the DOCKER-USER Chain</h3>
<p>Add rules to the <code>DOCKER-USER</code> iptables chain — Docker reads these but UFW doesn't overwrite them:</p>
<pre><code># Block all access to Docker ports except from a trusted IP
sudo iptables -I DOCKER-USER -i eth0 ! -s 192.168.1.0/24 -j DROP

# Save iptables rules
sudo apt install -y iptables-persistent
sudo netfilter-persistent save</code></pre>

<h3>Alternative Fix: Bind to Localhost Only</h3>
<pre><code># In docker-compose.yml — only accessible from the host itself
ports:
  - "127.0.0.1:8080:8080"</code></pre>
<p>Then use a reverse proxy (Nginx/Traefik) to handle external traffic.</p>
