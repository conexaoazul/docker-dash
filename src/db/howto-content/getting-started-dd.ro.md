---
title: Primii pași cu Docker Dash
summary: 'Un tur al funcționalităților Docker Dash: dashboard, containere, scanare securitate.'
---

<h2>Primii pași cu Docker Dash</h2>
<p>Docker Dash este un dashboard self-hosted care îți oferă vizibilitate completă și control asupra mediului Docker. Iată un tur rapid pentru a fi productiv în câteva minute.</p>

<h3>1. Deschide dashboard-ul</h3>
<p>Navighează la <code>http://&lt;serverul-tău&gt;:3000</code>. Dashboard-ul principal afișează o prezentare în timp real: CPU, memorie, containere active și evenimente recente.</p>

<h3>2. Explorează containerele</h3>
<p>Apasă pe <strong>Containers</strong> în bara laterală. De aici poți porni, opri, reporni și șterge containere. Apasă pe numele unui container pentru a vedea loguri, statistici, variabile de mediu și montaje.</p>

<h3>3. Deployează un template</h3>
<p>Mergi la <strong>Templates</strong> pentru a deploya aplicații self-hosted populare (Nginx, PostgreSQL, Nextcloud etc.) cu un singur click. Completează variabilele de mediu și mapările de porturi, apoi apasă <strong>Deploy</strong>.</p>

<h3>4. Scanează vulnerabilitățile</h3>
<p>Deschide <strong>Security → Scan</strong> și selectează o imagine. Docker Dash rulează Trivy și afișează CVE-urile grupate după severitate. Rezolvă mai întâi problemele Critice și High.</p>

<h3>5. Configurează alerte</h3>
<p>Navighează la <strong>Alerts</strong> și creează o regulă — de exemplu CPU &gt; 80% timp de 5 minute. Conectează un canal de notificare (Discord, Slack, Telegram sau email) pentru alerte instant.</p>

<h3>6. Conectează mai multe hosturi</h3>
<p>La <strong>Hosts</strong> poți adăuga motoare Docker la distanță via TCP, tunel SSH sau socket Unix. Comută între hosturi instant din bara de navigare de sus.</p>
