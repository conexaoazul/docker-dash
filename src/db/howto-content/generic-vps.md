---
title: Connect Docker Dash to any VPS (Hetzner, DigitalOcean, AWS EC2, GCE, Azure, Linode, Vultr)
summary: One guide for every major VPS provider. If it has Ubuntu/Debian + Docker + SSH, it works. AWS EC2, GCE, Azure VM, DigitalOcean Droplets, Hetzner Cloud, Linode, Vultr — all the same flow.
category: multi-host
difficulty: beginner
icon: fas fa-cloud
---

<h2>Why one guide covers them all</h2>
<p>AWS EC2, Google Compute Engine, Azure VM, DigitalOcean Droplets, Hetzner Cloud, Linode, Vultr, OVH, Contabo, whatever — at the end of the day they're all:</p>
<ol>
  <li>A Linux VM</li>
  <li>With Docker installed</li>
  <li>Reachable via SSH</li>
</ol>
<p>If those three things are true, Docker Dash's SSH multi-host support (v6.8.0+) connects out of the box. The only per-provider difference is how you <strong>provision</strong> the VM and how you <strong>find the IP</strong>.</p>

<h2>Step 1: Provision a VM with Docker</h2>

<h3>DigitalOcean (simplest)</h3>
<p>Use the one-click <a href="https://marketplace.digitalocean.com/apps/docker" target="_blank">Docker marketplace image</a>. Docker + docker-compose pre-installed. Your SSH key is added at provision time.</p>

<h3>Hetzner Cloud / Linode / Vultr</h3>
<p>Pick Ubuntu 22.04 or 24.04 LTS, paste this into the <strong>user-data</strong> / <strong>cloud-init</strong> field:</p>
<pre><code>#cloud-config
package_update: true
packages: [ca-certificates, curl, gnupg]
runcmd:
  - curl -fsSL https://get.docker.com | sh
  - usermod -aG docker ubuntu  # or root — adjust per provider's default user
</code></pre>

<h3>AWS EC2</h3>
<p>Launch an Ubuntu 22.04 AMI. For user-data, use the same cloud-init above, but replace <code>ubuntu</code> with <code>ec2-user</code> on Amazon Linux (or leave as-is for Ubuntu AMIs). Security group: allow inbound TCP 22 from your Docker Dash host's IP.</p>

<h3>Google Compute Engine</h3>
<p>Use "Container-Optimized OS" (has Docker pre-installed) OR a normal Debian/Ubuntu + cloud-init. Firewall: allow <code>tcp:22</code> from your Docker Dash IP.</p>

<h3>Azure VM</h3>
<p>Ubuntu 22.04 LTS. NSG inbound rule for TCP 22 from your Docker Dash IP. After creation, SSH in and run <code>curl -fsSL https://get.docker.com | sh</code>.</p>

<h2>Step 2: Verify Docker works via SSH</h2>
<pre><code>ssh your-user@your-vps-ip
docker ps  # should not say "permission denied"
# If it does:
sudo usermod -aG docker $USER
exit
ssh your-user@your-vps-ip
docker ps  # now works
</code></pre>

<h2>Step 3: Add the host in Docker Dash</h2>
<ol>
  <li><strong>Multi-Host → Add Host</strong></li>
  <li>Connection type: <strong>SSH tunnel</strong></li>
  <li>Host: your VPS's public IP (or hostname)</li>
  <li>Port: <code>22</code> (or whatever you set)</li>
  <li>Username: <code>ubuntu</code> / <code>ec2-user</code> / <code>root</code> / whatever matches your distro</li>
  <li>Auth: <strong>private key</strong> is strongly recommended over passwords for cloud VMs</li>
  <li>Docker socket path: <code>/var/run/docker.sock</code></li>
  <li>Test → ✓ → Save</li>
</ol>

<h2>Step 4: Verify the badge</h2>
<p>Multi-Host page. You'll see a badge for the base distro (<strong>Ubuntu</strong>, <strong>Debian</strong>, <strong>Fedora</strong>, etc). Cloud-vendor detection (AWS / GCP / Azure / Hetzner / DO) is planned for a future release; for now, the distro badge is what you get.</p>

<h2>Security hardening checklist</h2>
<table style="width:100%;border-collapse:collapse;font-size:12px">
<tr><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Harden</th><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Why</th></tr>
<tr><td style="padding:6px">Use SSH keys, disable password auth</td><td style="padding:6px">Default passwords on public IPs get brute-forced within minutes</td></tr>
<tr><td style="padding:6px">Restrict firewall port 22 to Docker Dash's IP</td><td style="padding:6px">Even with keys, smaller attack surface is better</td></tr>
<tr><td style="padding:6px">Use a non-root user + sudo, not root directly</td><td style="padding:6px">Minimizes blast radius if SSH key is compromised</td></tr>
<tr><td style="padding:6px">Apply the Outbound Filter (System → Egress)</td><td style="padding:6px">Prevents credential exfiltration if a container is compromised</td></tr>
<tr><td style="padding:6px">Enable fail2ban</td><td style="padding:6px"><code>apt install fail2ban</code> — banned bot traffic saves CPU + log noise</td></tr>
</table>

<h2>Troubleshooting</h2>
<table style="width:100%;border-collapse:collapse;font-size:12px">
<tr><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Problem</th><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Fix</th></tr>
<tr><td style="padding:6px">Connection times out</td><td style="padding:6px">Firewall / security group blocking port 22 from your Docker Dash IP.</td></tr>
<tr><td style="padding:6px">"Permission denied (publickey)"</td><td style="padding:6px">Wrong private key or wrong username. AWS Ubuntu AMIs use <code>ubuntu</code>, Amazon Linux uses <code>ec2-user</code>, DigitalOcean uses <code>root</code> by default.</td></tr>
<tr><td style="padding:6px">SSH works, Docker commands "permission denied"</td><td style="padding:6px">User not in docker group. <code>sudo usermod -aG docker $USER</code>, log out + in.</td></tr>
<tr><td style="padding:6px">Docker Dash shows host as unhealthy after reboot</td><td style="padding:6px">Docker service didn't auto-start. <code>sudo systemctl enable docker</code>.</td></tr>
</table>

