---
title: Dockerfile Best Practices
summary: 'Write efficient Dockerfiles: multi-stage builds, layer caching, .dockerignore, minimal base images.'
category: compose
difficulty: intermediate
icon: fas fa-file-code
---

<h2>Dockerfile Best Practices</h2>
<p>A well-crafted Dockerfile produces smaller, faster, and more secure images. These patterns make a real difference.</p>

<h3>1. Order Layers by Change Frequency</h3>
<p>Put instructions that change rarely (dependencies) before instructions that change often (source code). Docker caches layers and rebuilds from the first changed layer.</p>
<pre><code>COPY package*.json ./      # changes rarely
RUN npm ci                 # cached until package.json changes
COPY . .                   # changes every build</code></pre>

<h3>2. Use a .dockerignore File</h3>
<pre><code>node_modules
.git
.env
*.log
dist</code></pre>
<p>Keeps the build context small and prevents secrets from leaking into the image.</p>

<h3>3. Use Multi-Stage Builds</h3>
<pre><code>FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
CMD ["node", "dist/index.js"]</code></pre>

<h3>4. Pin Base Image Versions</h3>
<pre><code># Bad
FROM node:latest

# Good
FROM node:20.11-alpine3.19</code></pre>

<h3>5. Combine RUN Commands</h3>
<pre><code># Bad — creates 3 layers
RUN apt-get update
RUN apt-get install -y curl
RUN rm -rf /var/lib/apt/lists/*

# Good — one layer
RUN apt-get update &amp;&amp; apt-get install -y curl \
    &amp;&amp; rm -rf /var/lib/apt/lists/*</code></pre>

<h3>6. Run as Non-Root</h3>
<pre><code>RUN addgroup -S appgroup &amp;&amp; adduser -S appuser -G appgroup
USER appuser</code></pre>
