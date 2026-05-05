---
title: TLS/SSL Certificates
summary: 'Get free TLS certificates with Let''s Encrypt and configure HTTPS for your services.'
category: security
difficulty: intermediate
icon: fas fa-lock
---

<h2>TLS/SSL Certificates</h2>
<p>HTTPS requires a TLS certificate. Let's Encrypt provides free, automatically renewable certificates trusted by all browsers.</p>

<h2>Option 1 — Caddy (automatic, zero config)</h2>
<p>Caddy is the easiest path to HTTPS. It requests and renews certificates automatically:</p>
<pre><code># /etc/caddy/Caddyfile
example.com {
  reverse_proxy localhost:3000
}

# That's it. Caddy handles everything.</code></pre>

<h2>Option 2 — Certbot (manual, works with any web server)</h2>
<pre><code># Install certbot
sudo apt install -y certbot python3-certbot-nginx

# Get a certificate (Nginx plugin auto-configures Nginx)
sudo certbot --nginx -d example.com -d www.example.com

# Or standalone (no web server running on 80)
sudo certbot certonly --standalone -d example.com

# Auto-renewal is set up automatically. Test it:
sudo certbot renew --dry-run</code></pre>

<h2>Option 3 — Traefik (Docker-native)</h2>
<pre><code>command:
  - "--certificatesresolvers.le.acme.tlschallenge=true"
  - "--certificatesresolvers.le.acme.email=you@example.com"
  - "--certificatesresolvers.le.acme.storage=/letsencrypt/acme.json"</code></pre>

<h2>Where certificates are stored (certbot)</h2>
<pre><code>/etc/letsencrypt/live/example.com/fullchain.pem   # Certificate + chain
/etc/letsencrypt/live/example.com/privkey.pem     # Private key</code></pre>

<h2>Certificate expiry</h2>
<p>Let's Encrypt certificates expire after <strong>90 days</strong>. Certbot installs a systemd timer that renews automatically when less than 30 days remain. Check the timer:</p>
<pre><code>sudo systemctl status certbot.timer</code></pre>

<h3>Self-signed certificates (local dev only)</h3>
<pre><code>openssl req -x509 -nodes -days 365 -newkey rsa:2048   -keyout selfsigned.key -out selfsigned.crt   -subj "/CN=localhost"</code></pre>
