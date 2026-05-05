---
title: Reading Docker Logs
summary: How to read container logs, filter by time, follow in real-time, and export.
category: troubleshooting
difficulty: beginner
icon: fas fa-file-alt
---

<h2>Reading Docker Logs</h2>
<p>Container logs are your primary debugging tool. Docker captures everything written to stdout and stderr.</p>

<h3>Basic Log Commands</h3>
<pre><code># All logs
docker logs &lt;container&gt;

# Last 100 lines
docker logs --tail=100 &lt;container&gt;

# Follow in real-time (like tail -f)
docker logs -f &lt;container&gt;

# Logs since a specific time
docker logs --since="2024-01-15T10:00:00" &lt;container&gt;

# Last 30 minutes
docker logs --since=30m &lt;container&gt;</code></pre>

<h3>Docker Compose Logs</h3>
<pre><code># All services
docker compose logs

# Specific service, follow
docker compose logs -f app

# Multiple services
docker compose logs -f app db</code></pre>

<h3>Searching Log Output</h3>
<pre><code># Find errors
docker logs &lt;container&gt; 2>&amp;1 | grep -i error

# Find a specific request
docker logs &lt;container&gt; | grep "/api/users"</code></pre>

<h3>Log Drivers</h3>
<p>Docker supports multiple log drivers configured in <code>/etc/docker/daemon.json</code>:</p>
<ul>
  <li><strong>json-file</strong> — Default. Stored on disk, viewable with <code>docker logs</code></li>
  <li><strong>syslog</strong> — Sends to system syslog daemon</li>
  <li><strong>journald</strong> — Integrates with systemd journal</li>
  <li><strong>fluentd</strong> — Forwards to Fluentd aggregator</li>
  <li><strong>none</strong> — Disables logging entirely</li>
</ul>
<p><strong>Note:</strong> When using non-default drivers, <code>docker logs</code> may not work — use the driver's native tooling instead.</p>
