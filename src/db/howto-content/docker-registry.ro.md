---
title: Registru Docker privat
summary: Configurează un registru Docker privat pentru a stoca și distribui propriile imagini.
---

<h2>Registru Docker privat</h2>
<p>Un registru privat îți permite să stochezi și să distribui imagini Docker în cadrul organizației — fără Docker Hub.</p>

<h3>Rulează un registru de bază</h3>
<pre><code>docker run -d \
  --name registry \
  -p 5000:5000 \
  -v registry_data:/var/lib/registry \
  --restart unless-stopped \
  registry:2</code></pre>

<h3>Push o imagine în registrul tău</h3>
<pre><code># Tag-uiește imaginea pentru registrul tău
docker tag myapp:latest localhost:5000/myapp:latest

# Push
docker push localhost:5000/myapp:latest

# Pull de pe altă mașină (înlocuiește localhost cu IP-ul serverului)
docker pull 192.168.1.100:5000/myapp:latest</code></pre>

<h3>Configurează autentificarea (htpasswd)</h3>
<pre><code>mkdir auth
docker run --rm --entrypoint htpasswd httpd:2 \
  -Bbn myuser mypassword &gt; auth/htpasswd

docker run -d \
  --name registry \
  -p 5000:5000 \
  -v registry_data:/var/lib/registry \
  -v $(pwd)/auth:/auth \
  -e REGISTRY_AUTH=htpasswd \
  -e REGISTRY_AUTH_HTPASSWD_REALM="Registry Realm" \
  -e REGISTRY_AUTH_HTPASSWD_PATH=/auth/htpasswd \
  registry:2</code></pre>

<h3>Configurează Docker să aibă încredere în registrul tău</h3>
<p>Pentru registre HTTP (fără TLS), adaugă în <code>/etc/docker/daemon.json</code>:</p>
<pre><code>{ "insecure-registries": ["192.168.1.100:5000"] }</code></pre>
<p>Repornește Docker după modificare. În producție, folosește întotdeauna TLS.</p>
