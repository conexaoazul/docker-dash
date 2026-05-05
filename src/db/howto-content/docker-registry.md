---
title: Private Docker Registry
summary: Set up a private Docker registry to store and distribute your own images.
category: basics
difficulty: intermediate
icon: fas fa-warehouse
---

<h2>Private Docker Registry</h2>
<p>A private registry lets you store and distribute Docker images within your organization — no Docker Hub required.</p>

<h3>Run a Basic Registry</h3>
<pre><code>docker run -d \
  --name registry \
  -p 5000:5000 \
  -v registry_data:/var/lib/registry \
  --restart unless-stopped \
  registry:2</code></pre>

<h3>Push an Image to Your Registry</h3>
<pre><code># Tag the image for your registry
docker tag myapp:latest localhost:5000/myapp:latest

# Push
docker push localhost:5000/myapp:latest

# Pull from another machine (replace localhost with your server IP)
docker pull 192.168.1.100:5000/myapp:latest</code></pre>

<h3>Configure Authentication (htpasswd)</h3>
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

<h3>Configure Docker to Trust Your Registry</h3>
<p>For HTTP (non-TLS) registries, add to <code>/etc/docker/daemon.json</code>:</p>
<pre><code>{ "insecure-registries": ["192.168.1.100:5000"] }</code></pre>
<p>Restart Docker after the change. For production, always use TLS.</p>

<h3>Use in docker-compose.yml</h3>
<pre><code>services:
  app:
    image: 192.168.1.100:5000/myapp:latest</code></pre>
