---
title: Multi-Host Setup Guide
summary: Connect multiple Docker hosts to Docker Dash via TCP, SSH, or Docker Desktop.
category: docker-dash
difficulty: intermediate
icon: fas fa-server
---

<h2>Multi-Host Setup Guide</h2>
<p>Docker Dash can manage multiple Docker engines from a single interface. Connect your home server, VPS, and cloud instances all in one place.</p>

<h3>Connection Methods</h3>
<ul>
  <li><strong>Unix Socket</strong> — Local Docker on the same machine. No config needed (<code>/var/run/docker.sock</code>)</li>
  <li><strong>TCP</strong> — Direct TCP connection to Docker daemon (requires daemon configured with <code>-H tcp://0.0.0.0:2375</code>)</li>
  <li><strong>SSH Tunnel</strong> — Secure connection via SSH. Recommended for remote hosts</li>
</ul>

<h3>Add a Host via SSH</h3>
<ol>
  <li>Go to <strong>Hosts → Add Host</strong></li>
  <li>Choose connection type <strong>SSH</strong></li>
  <li>Enter the server IP, SSH port (default 22), username, and your private key</li>
  <li>Click <strong>Test Connection</strong> to verify</li>
  <li>Save the host</li>
</ol>

<h3>Add a Host via TCP</h3>
<p>First, enable the TCP socket on the remote Docker daemon:</p>
<pre><code># /etc/docker/daemon.json
{
  "hosts": ["unix:///var/run/docker.sock", "tcp://0.0.0.0:2376"]
}</code></pre>
<p><strong>Always use TLS</strong> when exposing Docker over TCP to the internet.</p>

<h3>Switching Between Hosts</h3>
<p>Use the host selector in the top navigation bar to switch context instantly. All pages (Containers, Images, Volumes) update to show the selected host's data.</p>

<h3>Multi-Host Overview</h3>
<p>The <strong>Multi-Host Overview</strong> page shows all connected hosts at a glance — their status, container counts, and resource usage — so you can spot issues across your entire fleet.</p>
