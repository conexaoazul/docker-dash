---
title: Docker Logging Strategies
summary: Configure logging drivers (json-file, syslog, fluentd), log rotation, and centralized logging.
category: troubleshooting
difficulty: intermediate
icon: fas fa-file-alt
---

<h2>Docker Logging Strategies</h2>
<p>Logs are essential for debugging and auditing. Docker's pluggable logging system lets you route logs wherever you need them.</p>

<h3>Default: json-file Driver</h3>
<p>By default, Docker writes container logs as JSON to files under <code>/var/lib/docker/containers/</code>. Access them with <code>docker logs</code>.</p>

<h3>Log Rotation (Critical!)</h3>
<p>Without rotation, log files grow indefinitely. Configure in <code>/etc/docker/daemon.json</code>:</p>
<pre><code>{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}</code></pre>
<p>This keeps at most 3 files of 10 MB each (30 MB max per container). Restart Docker after changing: <code>systemctl restart docker</code></p>

<h3>Per-Container Log Options in Compose</h3>
<pre><code>services:
  app:
    logging:
      driver: json-file
      options:
        max-size: "5m"
        max-file: "5"</code></pre>

<h3>Syslog Driver</h3>
<pre><code>docker run --log-driver syslog --log-opt syslog-address=udp://logserver:514 myapp</code></pre>

<h3>Fluentd for Centralized Logging</h3>
<pre><code>docker run --log-driver fluentd \
  --log-opt fluentd-address=localhost:24224 \
  --log-opt tag="docker.{{.Name}}" \
  myapp</code></pre>

<h3>Centralized Logging Stack</h3>
<p>For production, consider the <strong>ELK stack</strong> (Elasticsearch + Logstash + Kibana) or <strong>Loki + Grafana</strong> (lighter weight). Both integrate with Fluentd or the respective Docker log drivers.</p>
