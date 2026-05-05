---
title: Bune practici Dockerfile
summary: 'Scrie Dockerfile-uri eficiente: build-uri multi-etapă, caching straturi, .dockerignore, imagini de bază minimale.'
---

<h2>Bune practici Dockerfile</h2>
<p>Un Dockerfile bine conceput produce imagini mai mici, mai rapide și mai sigure. Aceste tipare fac o diferență reală.</p>

<h3>1. Ordonează layerele după frecvența de schimbare</h3>
<p>Pune instrucțiunile care se schimbă rar (dependențe) înaintea celor care se schimbă des (cod sursă). Docker cacheauă layerele și reconstruiește de la primul layer modificat.</p>
<pre><code>COPY package*.json ./      # se schimbă rar
RUN npm ci                 # în cache până când package.json se schimbă
COPY . .                   # se schimbă la fiecare build</code></pre>

<h3>2. Folosește un fișier .dockerignore</h3>
<pre><code>node_modules
.git
.env
*.log
dist</code></pre>

<h3>3. Folosește build-uri multi-etapă</h3>
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

<h3>4. Fixează versiunile imaginilor de bază</h3>
<pre><code># Rău
FROM node:latest

# Bun
FROM node:20.11-alpine3.19</code></pre>

<h3>5. Combină comenzile RUN</h3>
<pre><code># Rău — creează 3 layere
RUN apt-get update
RUN apt-get install -y curl
RUN rm -rf /var/lib/apt/lists/*

# Bun — un singur layer
RUN apt-get update &amp;&amp; apt-get install -y curl \
    &amp;&amp; rm -rf /var/lib/apt/lists/*</code></pre>

<h3>6. Rulează ca non-root</h3>
<pre><code>RUN addgroup -S appgroup &amp;&amp; adduser -S appuser -G appgroup
USER appuser</code></pre>
