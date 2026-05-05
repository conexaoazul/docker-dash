---
title: Configurare DNS și domeniu
summary: Direcționează un domeniu către server și configurează înregistrări DNS.
---

<h2>Configurare DNS și domeniu</h2>
<p>Pentru a accesa serviciile Docker printr-un domeniu, trebuie să creezi înregistrări DNS care să pointeze către IP-ul public al serverului tău.</p>

<h2>Pasul 1 — Găsește IP-ul public al serverului</h2>
<pre><code>curl -s https://ifconfig.me</code></pre>

<h2>Pasul 2 — Adaugă înregistrări DNS A</h2>
<p>La registratorul domeniului sau furnizorul DNS (Cloudflare, Route53 etc.), adaugă:</p>
<ul>
  <li><strong>Înregistrare A</strong>: <code>@</code> → IP-ul serverului (domeniu apex, ex. <code>example.com</code>)</li>
  <li><strong>Înregistrare A</strong>: <code>www</code> → IP-ul serverului</li>
  <li><strong>Înregistrare A</strong>: <code>app</code> → IP-ul serverului (pentru subdomenii)</li>
</ul>
<p>Propagarea DNS durează până la 48 de ore, dar de obicei câteva minute cu Cloudflare.</p>

<h2>Pasul 3 — Verifică propagarea DNS</h2>
<pre><code># Verifică înregistrarea A
dig example.com A +short

# Sau folosind nslookup
nslookup example.com

# Verifică din locații multiple
curl https://dns.google/resolve?name=example.com&type=A</code></pre>

<h2>Pasul 4 — Configurează serviciul</h2>
<p>Odată ce DNS rezolvă corect, pointează reverse proxy-ul către domeniu:</p>
<pre><code># Caddy — HTTPS automat
example.com {
  reverse_proxy localhost:3000
}</code></pre>

<h2>Pasul 5 — HTTPS gratuit cu Caddy</h2>
<pre><code>sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy
sudo systemctl enable --now caddy</code></pre>

<h3>Sfat Cloudflare</h3>
<p>Dacă folosești Cloudflare, menține proxy-ul (norul portocaliu) <strong>dezactivat</strong> inițial până confirmi că domeniul rezolvă corect. Activează-l după ce HTTPS funcționează pentru protecție DDoS și CDN.</p>
