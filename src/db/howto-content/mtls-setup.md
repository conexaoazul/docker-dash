---
title: mTLS for Service-to-Service Auth
summary: Set up mutual TLS (mTLS) so services authenticate each other with certificates, not just passwords.
category: security
difficulty: advanced
icon: fas fa-certificate
---

<h2>What is mTLS?</h2>
<p>Standard TLS authenticates the <strong>server</strong> to the client (your browser checks the website's cert). <strong>Mutual TLS</strong> also authenticates the <strong>client</strong> to the server. Both sides present certificates signed by a trusted CA.</p>

<h2>When to Use</h2>
<ul>
  <li><strong>Service-to-service in microservices:</strong> internal APIs that should never accept anonymous traffic.</li>
  <li><strong>HQ to remote VPS:</strong> ensure only your HQ servers can publish to the VPS.</li>
  <li><strong>Zero-trust networks:</strong> no implicit trust based on IP/network.</li>
</ul>

<h2>Setup with cfssl (Cloudflare's PKI tool)</h2>
<pre><code># Install cfssl
go install github.com/cloudflare/cfssl/cmd/cfssl@latest
go install github.com/cloudflare/cfssl/cmd/cfssljson@latest

# Generate CA
cfssl gencert -initca ca-csr.json | cfssljson -bare ca

# Generate server cert (signed by CA)
cfssl gencert -ca=ca.pem -ca-key=ca-key.pem \
  -config=ca-config.json -profile=server \
  server-csr.json | cfssljson -bare server

# Generate client cert
cfssl gencert -ca=ca.pem -ca-key=ca-key.pem \
  -config=ca-config.json -profile=client \
  client-csr.json | cfssljson -bare client</code></pre>

<h2>Nginx Server Config</h2>
<pre><code>server {
  listen 443 ssl;
  ssl_certificate /etc/nginx/certs/server.pem;
  ssl_certificate_key /etc/nginx/certs/server-key.pem;
  ssl_client_certificate /etc/nginx/certs/ca.pem;
  ssl_verify_client on;  # &lt;-- requires client cert

  location / {
    proxy_pass http://backend;
  }
}</code></pre>

<h2>Client (curl) Test</h2>
<pre><code>curl --cacert ca.pem \
     --cert client.pem \
     --key client-key.pem \
     https://api.internal.example.com/endpoint</code></pre>

<h2>Certificate Renewal</h2>
<p>Keep validity ≤ 1 year. Automate with <strong>step-ca</strong> or <strong>cert-manager</strong> (for Kubernetes). Manual renewal:</p>
<pre><code># Generate new cert with same CSR, replace files atomically
cfssl gencert -ca=ca.pem -ca-key=ca-key.pem \
  -config=ca-config.json -profile=client \
  client-csr.json | cfssljson -bare client.new
mv client.new.pem /etc/myapp/secrets/client.pem
docker compose restart api</code></pre>

<h2>Common Pitfalls</h2>
<ul>
  <li><strong>Clock skew:</strong> certificate validation fails if servers' clocks differ by more than a few minutes. Use NTP.</li>
  <li><strong>CA expired:</strong> CA certs typically last 10 years. If yours expires, every signed cert becomes invalid simultaneously.</li>
  <li><strong>Don't reuse CAs across environments:</strong> separate dev/staging/prod CAs prevent dev certs from working in prod.</li>
</ul>
