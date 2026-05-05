---
title: Multi-Stage Docker Builds
summary: Reduce image size by 90% using multi-stage builds with separate build and runtime stages.
category: compose
difficulty: intermediate
icon: fas fa-layer-group
---

<h2>Multi-Stage Docker Builds</h2>
<p>Multi-stage builds let you use one image for building your app and a separate, minimal image for running it. The result: images that are 80–95% smaller.</p>

<h3>The Problem Without Multi-Stage</h3>
<p>A Go app built with the full Go toolchain image: ~850 MB. The same app in a scratch container: ~8 MB. Multi-stage builds bridge this gap.</p>

<h3>Go Application Example</h3>
<pre><code># Stage 1: Build
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o server .

# Stage 2: Runtime (scratch = zero OS overhead)
FROM scratch
COPY --from=builder /app/server /server
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
EXPOSE 8080
ENTRYPOINT ["/server"]</code></pre>
<p>Result: from ~900 MB → ~12 MB.</p>

<h3>Node.js Application Example</h3>
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

<h3>Targeting a Specific Stage</h3>
<pre><code># Build only the builder stage (useful for CI test runners)
docker build --target builder -t myapp:test .</code></pre>

<h3>Named Build Arguments Across Stages</h3>
<pre><code>ARG NODE_VERSION=20
FROM node:${NODE_VERSION}-alpine AS builder</code></pre>
