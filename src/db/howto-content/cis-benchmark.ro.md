---
title: Ghid CIS Benchmark Docker
summary: Înțelege și implementează recomandările CIS Docker Benchmark pentru securizarea hostului și containerelor.
---

<h2>Ghid CIS Benchmark Docker</h2>
<p>CIS Docker Benchmark (v1.6) este checklist-ul standard din industrie pentru securizarea mediilor Docker. Acoperă configurarea hostului, setările daemon-ului, igiena imaginilor și setările de runtime ale containerelor.</p>

<h3>Arii cheie ale benchmark-ului</h3>

<h4>Secțiunea 1 — Configurarea hostului</h4>
<ul>
  <li>Menține OS-ul host și kernel-ul actualizate</li>
  <li>Instalează Docker pe hosturi dedicate când este posibil</li>
  <li>Auditează fișierele daemon-ului Docker: <code>auditctl -w /usr/bin/dockerd -k docker</code></li>
</ul>

<h4>Secțiunea 2 — Configurarea Docker Daemon</h4>
<pre><code>// /etc/docker/daemon.json (setări recomandate de CIS)
{
  "icc": false,              // dezactivează comunicarea inter-container implicit
  "log-level": "info",
  "live-restore": true,      // containerele continuă să ruleze la repornirea daemon-ului
  "userland-proxy": false,
  "no-new-privileges": true
}</code></pre>

<h4>Secțiunea 4 — Imagini de containere</h4>
<ul>
  <li>Folosește imagini de bază oficiale sau de încredere</li>
  <li>Nu folosi tag-ul <code>:latest</code> în producție</li>
  <li>Scanează imaginile pentru CVE-uri înainte de deployment</li>
  <li>Folosește utilizatori non-root în interiorul containerelor</li>
</ul>

<h4>Secțiunea 5 — Runtime containere</h4>
<ul>
  <li>Nu rula containere cu <code>--privileged</code></li>
  <li>Nu monta căi sensitive ale hostului (<code>/etc</code>, <code>/proc</code>)</li>
  <li>Setează limite de memorie și CPU pe toate containerele</li>
  <li>Folosește sisteme de fișiere root read-only: <code>--read-only</code></li>
</ul>

<h3>Instrumentul CIS din Docker Dash</h3>
<p>În Docker Dash, mergi la <strong>Security → CIS Benchmark</strong> pentru a rula o verificare automată față de aceste reguli. Fiecare element afișează starea pass/fail cu instrucțiuni de remediere.</p>
