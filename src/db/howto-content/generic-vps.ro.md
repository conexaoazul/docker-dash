---
title: Conectează Docker Dash la orice VPS (Hetzner, DigitalOcean, AWS EC2, GCE, Azure, Linode, Vultr)
summary: Un ghid pentru orice provider VPS. Dacă are Ubuntu/Debian + Docker + SSH, merge. AWS EC2, GCE, Azure VM, DigitalOcean Droplets, Hetzner, Linode, Vultr — toate au același flow.
---

<h2>De ce un ghid acoperă toți providerii</h2>
<p>AWS EC2, GCE, Azure VM, DigitalOcean, Hetzner, Linode, Vultr, OVH — la final, toate sunt: <strong>Linux VM + Docker + SSH</strong>. Dacă ai astea trei, Docker Dash se conectează. Singura diferență per provider e cum provisionezi VM-ul.</p>

<h2>Pasul 1: Provisionează un VM cu Docker</h2>

<h3>DigitalOcean (cel mai simplu)</h3>
<p>Folosește one-click <a href="https://marketplace.digitalocean.com/apps/docker" target="_blank">Docker marketplace image</a>. Docker + docker-compose pre-instalate. Cheia ta SSH e adăugată la provision.</p>

<h3>Hetzner / Linode / Vultr</h3>
<p>Alege Ubuntu 22.04/24.04 LTS, pune în <strong>user-data</strong>:</p>
<pre><code>#cloud-config
package_update: true
packages: [ca-certificates, curl, gnupg]
runcmd:
  - curl -fsSL https://get.docker.com | sh
  - usermod -aG docker ubuntu
</code></pre>

<h3>AWS EC2 / GCE / Azure VM</h3>
<p>Ubuntu 22.04 AMI/image. Acelasi cloud-init. Deschide TCP 22 în security group / NSG / firewall pentru IP-ul Docker Dash.</p>

<h2>Pasul 2: Verifică Docker pe SSH</h2>
<pre><code>ssh user@ip
docker ps  # nu trebuie să zică "permission denied"
# Dacă zice:
sudo usermod -aG docker $USER
exit
ssh user@ip
docker ps  # acum merge</code></pre>

<h2>Pasul 3: Adaugă host-ul în Docker Dash</h2>
<ol>
  <li>Multi-Host → Add Host</li>
  <li>Connection type: SSH tunnel</li>
  <li>Host + port + username</li>
  <li>Auth: <strong>cheie privată</strong> recomandat</li>
  <li>Socket: <code>/var/run/docker.sock</code></li>
  <li>Test → ✓ → Save</li>
</ol>

<h2>Hardening security</h2>
<ul>
  <li>Cheie SSH în loc de parolă</li>
  <li>Firewall restrictiv pe port 22 (doar IP-ul Docker Dash)</li>
  <li>User non-root + sudo</li>
  <li>Outbound Filter în Docker Dash (System → Egress)</li>
  <li><code>apt install fail2ban</code></li>
</ul>

