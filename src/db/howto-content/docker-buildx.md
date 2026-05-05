---
title: Building Multi-Arch Images
summary: Use Docker Buildx to build images for ARM64, AMD64, and other architectures.
category: compose
difficulty: advanced
icon: fas fa-microchip
---

<h2>Building Multi-Architecture Images with Buildx</h2>
<p>Docker Buildx extends the standard <code>docker build</code> with support for building images for multiple CPU architectures simultaneously — essential for supporting both x86 servers and ARM devices (Raspberry Pi, Apple Silicon).</p>

<h3>Set Up a Buildx Builder</h3>
<pre><code># Create and use a new builder instance
docker buildx create --name mybuilder --use

# Verify QEMU emulators are available
docker run --privileged --rm tonistiigi/binfmt --install all

# Inspect the builder
docker buildx inspect --bootstrap</code></pre>

<h3>Build for Multiple Platforms</h3>
<pre><code>docker buildx build \
  --platform linux/amd64,linux/arm64,linux/arm/v7 \
  -t myrepo/myapp:latest \
  --push \
  .</code></pre>
<p>The <code>--push</code> flag is required for multi-platform builds — the result is a manifest list that Docker automatically resolves to the correct architecture.</p>

<h3>Build for a Single Platform Locally</h3>
<pre><code>docker buildx build --platform linux/arm64 -t myapp:arm64 --load .</code></pre>

<h3>Check Image Architecture</h3>
<pre><code>docker manifest inspect myrepo/myapp:latest | grep architecture</code></pre>

<h3>QEMU Emulation vs. Native Builders</h3>
<p>QEMU emulation is convenient but slow. For CI pipelines, consider native ARM builder nodes for faster builds. GitHub Actions provides hosted ARM runners.</p>

<h3>GitHub Actions Example</h3>
<pre><code>- uses: docker/setup-buildx-action@v3
- uses: docker/build-push-action@v5
  with:
    platforms: linux/amd64,linux/arm64
    push: true
    tags: myrepo/myapp:latest</code></pre>
