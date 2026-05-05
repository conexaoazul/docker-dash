---
title: Docker Images vs Containers
summary: Understand the difference between images and containers — the most fundamental Docker concept.
category: basics
difficulty: beginner
icon: fas fa-th-large
---

<h2>Images vs Containers</h2>
<p>Think of a <strong>Docker image</strong> as a class definition in code — it's a read-only template that describes everything needed to run an application: the OS layer, runtime, dependencies, and your app files. A <strong>container</strong> is a running instance of that image, just like an object is an instance of a class.</p>

<h2>Working with images</h2>
<pre><code># Download an image from Docker Hub (does NOT run it)
docker pull nginx:alpine

# List locally available images
docker images

# Remove an image
docker rmi nginx:alpine</code></pre>

<h2>Working with containers</h2>
<pre><code># Create AND start a container from an image
docker run -d -p 8080:80 --name my-nginx nginx:alpine

# List running containers
docker ps

# List ALL containers (including stopped)
docker ps -a

# Stop / start / remove a container
docker stop my-nginx
docker start my-nginx
docker rm my-nginx</code></pre>

<h2>How image layers work</h2>
<p>Images are built in <strong>layers</strong>. Each instruction in a Dockerfile adds a layer. Layers are cached and shared between images, so pulling <code>nginx:alpine</code> and <code>node:alpine</code> reuses the shared Alpine base layer — saving both disk space and download time.</p>
<pre><code># Inspect layers of an image
docker history nginx:alpine</code></pre>

<h3>Key takeaway</h3>
<ul>
  <li>Images are <strong>immutable</strong> — you never change a running container's image.</li>
  <li>Containers are <strong>ephemeral</strong> by default — data written inside is lost when the container is removed. Use <strong>volumes</strong> to persist data.</li>
  <li>One image can spawn many containers simultaneously.</li>
</ul>
