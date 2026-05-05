---
title: Ghid configurare Multi-Host
summary: Conectează mai multe hosturi Docker la Docker Dash via TCP, SSH sau Docker Desktop.
---

<h2>Ghid configurare Multi-Host</h2>
<p>Docker Dash poate gestiona mai multe motoare Docker dintr-o singură interfață. Conectează serverul de acasă, VPS-ul și instanțele cloud într-un singur loc.</p>

<h3>Metode de conexiune</h3>
<ul>
  <li><strong>Unix Socket</strong> — Docker local pe aceeași mașină. Fără configurare (<code>/var/run/docker.sock</code>)</li>
  <li><strong>TCP</strong> — Conexiune TCP directă la daemon-ul Docker (necesită configurarea daemon-ului cu <code>-H tcp://0.0.0.0:2375</code>)</li>
  <li><strong>Tunel SSH</strong> — Conexiune securizată via SSH. Recomandat pentru hosturi la distanță</li>
</ul>

<h3>Adaugă un host via SSH</h3>
<ol>
  <li>Mergi la <strong>Hosts → Add Host</strong></li>
  <li>Alege tipul de conexiune <strong>SSH</strong></li>
  <li>Introdu IP-ul serverului, portul SSH (implicit 22), utilizatorul și cheia privată</li>
  <li>Apasă <strong>Test Connection</strong> pentru verificare</li>
  <li>Salvează hostul</li>
</ol>

<h3>Adaugă un host via TCP</h3>
<p>Mai întâi, activează socket-ul TCP pe daemon-ul Docker de la distanță:</p>
<pre><code># /etc/docker/daemon.json
{
  "hosts": ["unix:///var/run/docker.sock", "tcp://0.0.0.0:2376"]
}</code></pre>
<p><strong>Folosește întotdeauna TLS</strong> când expui Docker prin TCP pe internet.</p>

<h3>Comutarea între hosturi</h3>
<p>Folosește selectorul de host din bara de navigare de sus pentru a comuta contextul instant. Toate paginile (Containers, Images, Volumes) se actualizează pentru a afișa datele hostului selectat.</p>

<h3>Prezentare generală Multi-Host</h3>
<p>Pagina <strong>Multi-Host Overview</strong> afișează toate hosturile conectate dintr-o privire — starea lor, numărul de containere și utilizarea resurselor.</p>
