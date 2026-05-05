---
title: Init Systems in Containers
summary: Why PID 1 matters, zombie processes, and using tini or dumb-init.
category: basics
difficulty: intermediate
icon: fas fa-play
---

<h2>Init Systems in Containers</h2>
<p>PID 1 is special in Linux. Understanding its responsibilities helps you avoid zombie processes and unreliable container shutdowns.</p>

<h3>The PID 1 Problem</h3>
<p>The kernel sends <code>SIGTERM</code> to PID 1 first when stopping a container. If your app doesn't handle <code>SIGTERM</code>, Docker waits 10 seconds then sends <code>SIGKILL</code>. Also, orphaned child processes are only reaped (cleaned up) if PID 1 adopts them — most apps don't do this, causing zombie processes.</p>

<h3>Solution 1: Use Docker's --init Flag</h3>
<pre><code>docker run --init myapp</code></pre>
<p>Docker injects <strong>tini</strong> as PID 1. Tini handles signal forwarding and zombie reaping automatically.</p>

<h3>Solution 2: Embed tini in Your Dockerfile</h3>
<pre><code>FROM alpine:3.19
RUN apk add --no-cache tini
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]</code></pre>

<h3>Solution 3: dumb-init</h3>
<pre><code>FROM ubuntu:22.04
RUN apt-get update &amp;&amp; apt-get install -y dumb-init
ENTRYPOINT ["dumb-init", "--"]
CMD ["python", "app.py"]</code></pre>

<h3>Solution 4: s6-overlay (For Multi-Process Containers)</h3>
<p>When you genuinely need multiple processes (e.g., nginx + PHP-FPM), <a href="https://github.com/just-containers/s6-overlay">s6-overlay</a> provides a full supervision tree with proper service management.</p>

<h3>When NOT to Use an Init System</h3>
<p>If your single-process app correctly handles SIGTERM (most modern runtimes like Node.js, Python, and Go do), <code>--init</code> may not be necessary — but it never hurts to add it.</p>
