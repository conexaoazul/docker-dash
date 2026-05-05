---
title: Build-uri Docker multi-etapă
summary: Reduce dimensiunea imaginii cu 90% folosind build-uri multi-etapă cu etape separate de build și runtime.
---

<h2>Build-uri Docker multi-etapă</h2>
<p>Build-urile multi-etapă îți permit să folosești o imagine pentru construirea aplicației și o imagine separată, minimală, pentru rularea ei. Rezultat: imagini cu 80–95% mai mici.</p>

<h3>Problema fără multi-etapă</h3>
<p>O aplicație Go construită cu imaginea completă Go toolchain: ~850 MB. Aceeași aplicație într-un container scratch: ~8 MB. Build-urile multi-etapă acoperă acest decalaj.</p>

<h3>Exemplu aplicație Go</h3>
<pre><code># Etapa 1: Build
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o server .

# Etapa 2: Runtime (scratch = zero overhead OS)
FROM scratch
COPY --from=builder /app/server /server
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
EXPOSE 8080
ENTRYPOINT ["/server"]</code></pre>
<p>Rezultat: de la ~900 MB → ~12 MB.</p>

<h3>Exemplu aplicație Node.js</h3>
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
USER node
CMD ["node", "dist/index.js"]</code></pre>

<h3>Targetarea unei etape specifice</h3>
<pre><code># Construiește doar etapa builder (util pentru runner-e de teste CI)
docker build --target builder -t myapp:test .</code></pre>
