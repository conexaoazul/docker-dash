---
title: Strategii de logging Docker
summary: Configurează drivere de logging (json-file, syslog, fluentd), rotație loguri și logging centralizat.
---

<h2>Strategii de logging Docker</h2>
<p>Logurile sunt esențiale pentru depanare și audit. Sistemul de logging cu plugin-uri al Docker îți permite să direcționezi logurile oriunde ai nevoie.</p>

<h3>Implicit: driverul json-file</h3>
<p>Implicit, Docker scrie logurile containerelor ca JSON în fișiere sub <code>/var/lib/docker/containers/</code>. Accesează-le cu <code>docker logs</code>.</p>

<h3>Rotația logurilor (critică!)</h3>
<p>Fără rotație, fișierele de log cresc la infinit. Configurează în <code>/etc/docker/daemon.json</code>:</p>
<pre><code>{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}</code></pre>
<p>Păstrează maximum 3 fișiere de 10 MB fiecare (30 MB max per container). Repornește Docker după modificare: <code>systemctl restart docker</code></p>

<h3>Opțiuni de log per-container în Compose</h3>
<pre><code>services:
  app:
    logging:
      driver: json-file
      options:
        max-size: "5m"
        max-file: "5"</code></pre>

<h3>Driverul Syslog</h3>
<pre><code>docker run --log-driver syslog --log-opt syslog-address=udp://logserver:514 myapp</code></pre>

<h3>Fluentd pentru logging centralizat</h3>
<pre><code>docker run --log-driver fluentd \
  --log-opt fluentd-address=localhost:24224 \
  --log-opt tag="docker.{{.Name}}" \
  myapp</code></pre>

<h3>Stack de logging centralizat</h3>
<p>Pentru producție, consideră <strong>stiva ELK</strong> (Elasticsearch + Logstash + Kibana) sau <strong>Loki + Grafana</strong> (mai ușor). Ambele se integrează cu Fluentd sau cu driverele de log Docker respective.</p>
