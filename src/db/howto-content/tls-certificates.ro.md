---
title: Certificate TLS/SSL
summary: 'Obține certificate TLS gratuite cu Let''s Encrypt și configurează HTTPS.'
---

<h2>Certificate TLS/SSL</h2>
<p>HTTPS necesită un certificat TLS. Let's Encrypt oferă certificate gratuite, reînnoite automat, de încredere pentru toate browserele.</p>

<h2>Opțiunea 1 — Caddy (automat, fără configurare)</h2>
<p>Caddy este cea mai simplă cale spre HTTPS. Solicită și reînnoiește certificatele automat:</p>
<pre><code># /etc/caddy/Caddyfile
example.com {
  reverse_proxy localhost:3000
}

# Atât. Caddy se ocupă de tot.</code></pre>

<h2>Opțiunea 2 — Certbot (manual, funcționează cu orice server web)</h2>
<pre><code># Instalează certbot
sudo apt install -y certbot python3-certbot-nginx

# Obține certificat (plugin-ul Nginx configurează automat Nginx)
sudo certbot --nginx -d example.com -d www.example.com

# Sau standalone (niciun server web nu rulează pe portul 80)
sudo certbot certonly --standalone -d example.com

# Reînnoirea automată e configurată automat. Testează:
sudo certbot renew --dry-run</code></pre>

<h2>Opțiunea 3 — Traefik (nativ Docker)</h2>
<pre><code>command:
  - "--certificatesresolvers.le.acme.tlschallenge=true"
  - "--certificatesresolvers.le.acme.email=tu@exemplu.com"
  - "--certificatesresolvers.le.acme.storage=/letsencrypt/acme.json"</code></pre>

<h2>Unde sunt stocate certificatele (certbot)</h2>
<pre><code>/etc/letsencrypt/live/example.com/fullchain.pem   # Certificat + lanț
/etc/letsencrypt/live/example.com/privkey.pem     # Cheie privată</code></pre>

<h2>Expirarea certificatelor</h2>
<p>Certificatele Let's Encrypt expiră după <strong>90 de zile</strong>. Certbot instalează un timer systemd care reînnoiește automat când rămân mai puțin de 30 de zile. Verifică timer-ul:</p>
<pre><code>sudo systemctl status certbot.timer</code></pre>

<h3>Certificate auto-semnate (doar pentru dezvoltare locală)</h3>
<pre><code>openssl req -x509 -nodes -days 365 -newkey rsa:2048   -keyout selfsigned.key -out selfsigned.crt   -subj "/CN=localhost"</code></pre>
