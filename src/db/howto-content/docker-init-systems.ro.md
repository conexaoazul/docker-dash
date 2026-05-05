---
title: Sisteme de init în containere
summary: De ce contează PID 1, procese zombie și utilizarea tini sau dumb-init.
---

<h2>Sisteme de init în containere</h2>
<p>PID 1 este special în Linux. Înțelegerea responsabilităților sale te ajută să eviți procesele zombie și oprirea nesigură a containerelor.</p>

<h3>Problema PID 1</h3>
<p>Kernel-ul trimite <code>SIGTERM</code> la PID 1 primul când oprește un container. Dacă aplicația ta nu gestionează <code>SIGTERM</code>, Docker așteaptă 10 secunde apoi trimite <code>SIGKILL</code>. De asemenea, procesele copil orfane sunt curățate doar dacă PID 1 le adoptă — majoritatea aplicațiilor nu fac asta, cauzând procese zombie.</p>

<h3>Soluția 1: Folosește flag-ul --init al Docker</h3>
<pre><code>docker run --init myapp</code></pre>
<p>Docker injectează <strong>tini</strong> ca PID 1. Tini gestionează automat redirecționarea semnalelor și curățarea proceselor zombie.</p>

<h3>Soluția 2: Include tini în Dockerfile</h3>
<pre><code>FROM alpine:3.19
RUN apk add --no-cache tini
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]</code></pre>

<h3>Soluția 3: dumb-init</h3>
<pre><code>FROM ubuntu:22.04
RUN apt-get update &amp;&amp; apt-get install -y dumb-init
ENTRYPOINT ["dumb-init", "--"]
CMD ["python", "app.py"]</code></pre>

<h3>Soluția 4: s6-overlay (pentru containere multi-proces)</h3>
<p>Când ai cu adevărat nevoie de mai multe procese (ex. nginx + PHP-FPM), s6-overlay oferă un arbore complet de supervizare cu gestionare corectă a serviciilor.</p>

<h3>Când să NU folosești un sistem init</h3>
<p>Dacă aplicația ta cu un singur proces gestionează corect SIGTERM (cele mai moderne runtime-uri precum Node.js, Python și Go fac asta), <code>--init</code> poate să nu fie necesar — dar nu strică să îl adaugi.</p>
