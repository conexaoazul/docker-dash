---
title: DNS & Domain Setup
summary: Point a domain to your server and configure DNS records for Docker services.
category: networking
difficulty: intermediate
icon: fas fa-globe
---

<h2>DNS &amp; Domain Setup</h2>
<p>To access your Docker services via a domain name, you need to create DNS records pointing to your server's public IP.</p>

<h2>Step 1 — Find your server's public IP</h2>
<pre><code>curl -s https://ifconfig.me</code></pre>

<h2>Step 2 — Add DNS A records</h2>
<p>In your domain registrar or DNS provider (Cloudflare, Route53, etc.), add:</p>
<ul>
  <li><strong>A record</strong>: <code>@</code> → your server IP (apex domain, e.g. <code>example.com</code>)</li>
  <li><strong>A record</strong>: <code>www</code> → your server IP</li>
  <li><strong>A record</strong>: <code>app</code> → your server IP (for subdomains)</li>
</ul>
<p>DNS propagation takes up to 48 hours, but usually minutes with Cloudflare.</p>

<h2>Step 3 — Verify DNS propagation</h2>
<pre><code># Check A record
dig example.com A +short

# Or using nslookup
nslookup example.com

# Check from multiple locations
curl https://dns.google/resolve?name=example.com&type=A</code></pre>

<h2>Step 4 — Configure your service</h2>
<p>Once DNS resolves correctly, point your reverse proxy at your domain:</p>
<pre><code># Caddy — automatic HTTPS
example.com {
  reverse_proxy localhost:3000
}</code></pre>

<h2>Step 5 — Free HTTPS with Caddy</h2>
<pre><code>sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy
sudo systemctl enable --now caddy</code></pre>

<h3>Cloudflare tip</h3>
<p>If using Cloudflare, keep the proxy (orange cloud) <strong>disabled</strong> initially until you confirm the domain resolves. Enable it after HTTPS is working to get DDoS protection and CDN.</p>
