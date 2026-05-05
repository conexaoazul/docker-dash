---
title: Citirea logurilor Docker
summary: Cum citești loguri de container, filtrezi pe timp, urmărești în timp real și exporti.
---

<h2>Citirea logurilor Docker</h2>
<p>Logurile containerelor sunt principalul tău instrument de depanare. Docker capturează tot ce este scris pe stdout și stderr.</p>

<h3>Comenzi de bază pentru loguri</h3>
<pre><code># Toate logurile
docker logs &lt;container&gt;

# Ultimele 100 de linii
docker logs --tail=100 &lt;container&gt;

# Urmărire în timp real (ca tail -f)
docker logs -f &lt;container&gt;

# Loguri de la un moment specific
docker logs --since="2024-01-15T10:00:00" &lt;container&gt;

# Ultimele 30 de minute
docker logs --since=30m &lt;container&gt;</code></pre>

<h3>Loguri Docker Compose</h3>
<pre><code># Toate serviciile
docker compose logs

# Serviciu specific, urmărire
docker compose logs -f app

# Mai multe servicii
docker compose logs -f app db</code></pre>

<h3>Căutare în loguri</h3>
<pre><code># Găsește erori
docker logs &lt;container&gt; 2>&amp;1 | grep -i error

# Găsește un request specific
docker logs &lt;container&gt; | grep "/api/users"</code></pre>

<h3>Drivere de logging</h3>
<p>Docker suportă mai multe drivere configurate în <code>/etc/docker/daemon.json</code>:</p>
<ul>
  <li><strong>json-file</strong> — Implicit. Stocate pe disc, vizualizabile cu <code>docker logs</code></li>
  <li><strong>syslog</strong> — Trimite la daemon-ul syslog al sistemului</li>
  <li><strong>journald</strong> — Se integrează cu jurnalul systemd</li>
  <li><strong>fluentd</strong> — Redirecționează la agregatorul Fluentd</li>
  <li><strong>none</strong> — Dezactivează logging-ul complet</li>
</ul>
<p><strong>Notă:</strong> Când folosești drivere non-implicite, <code>docker logs</code> poate să nu funcționeze — folosește instrumentele native ale driverului.</p>
