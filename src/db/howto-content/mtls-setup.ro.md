---
title: mTLS pentru autentificare între servicii
summary: Configurează mutual TLS (mTLS) astfel încât serviciile să se autentifice reciproc cu certificate, nu doar parole.
---

<h2>Ce e mTLS?</h2>
<p>TLS-ul standard autentifică <strong>serverul</strong> către client (browserul tău verifică cert-ul site-ului). <strong>Mutual TLS</strong> autentifică și <strong>clientul</strong> către server. Ambele părți prezintă certificate semnate de un CA de încredere.</p>

<h2>Când să folosești</h2>
<ul>
  <li><strong>Service-to-service în microservicii:</strong> API-uri interne care nu ar trebui să accepte trafic anonim.</li>
  <li><strong>HQ către VPS remote:</strong> asigură că doar serverele tale HQ pot publica pe VPS.</li>
  <li><strong>Rețele zero-trust:</strong> fără încredere implicită pe baza IP/rețea.</li>
</ul>

<h2>Setup cu cfssl (PKI tool de la Cloudflare)</h2>
<pre><code># Instalează cfssl
go install github.com/cloudflare/cfssl/cmd/cfssl@latest
go install github.com/cloudflare/cfssl/cmd/cfssljson@latest

# Generează CA
cfssl gencert -initca ca-csr.json | cfssljson -bare ca

# Generează cert server (semnat de CA)
cfssl gencert -ca=ca.pem -ca-key=ca-key.pem \
  -config=ca-config.json -profile=server \
  server-csr.json | cfssljson -bare server

# Generează cert client
cfssl gencert -ca=ca.pem -ca-key=ca-key.pem \
  -config=ca-config.json -profile=client \
  client-csr.json | cfssljson -bare client</code></pre>

<h2>Config Nginx Server</h2>
<pre><code>server {
  listen 443 ssl;
  ssl_certificate /etc/nginx/certs/server.pem;
  ssl_certificate_key /etc/nginx/certs/server-key.pem;
  ssl_client_certificate /etc/nginx/certs/ca.pem;
  ssl_verify_client on;  # &lt;-- cere cert client

  location / {
    proxy_pass http://backend;
  }
}</code></pre>

<h2>Test Client (curl)</h2>
<pre><code>curl --cacert ca.pem \
     --cert client.pem \
     --key client-key.pem \
     https://api.internal.example.com/endpoint</code></pre>

<h2>Reînnoire certificate</h2>
<p>Păstrează validitatea ≤ 1 an. Automatizează cu <strong>step-ca</strong> sau <strong>cert-manager</strong> (pentru Kubernetes).</p>

<h2>Capcane comune</h2>
<ul>
  <li><strong>Clock skew:</strong> validarea cert-ului eșuează dacă ceasurile diferă cu mai mult de câteva minute. Folosește NTP.</li>
  <li><strong>CA expirat:</strong> cert-urile CA durează tipic 10 ani. Dacă expiră, toate cert-urile semnate devin invalide simultan.</li>
  <li><strong>Nu reutiliza CA-uri între environment-uri:</strong> CA separate pentru dev/staging/prod previn folosirea cert-urilor de dev în prod.</li>
</ul>
