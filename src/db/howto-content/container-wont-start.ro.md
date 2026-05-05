---
title: Containerul nu pornește
summary: Depanează cele mai comune cauze pentru care un container nu pornește.
---

<h2>Containerul nu pornește — Ghid de depanare</h2>
<p>Când un container se oprește imediat sau refuză să pornească, codurile de ieșire și logurile spun totul.</p>

<h3>Pasul 1: Verifică codul de ieșire</h3>
<pre><code>docker inspect --format='{{.State.ExitCode}}' &lt;container&gt;</code></pre>

<h3>Coduri de ieșire comune</h3>
<ul>
  <li><strong>0</strong> — Ieșire curată (procesul s-a terminat normal)</li>
  <li><strong>1</strong> — Eroare aplicație (verifică logurile)</li>
  <li><strong>126</strong> — Permisiune refuzată (entrypoint-ul nu este executabil)</li>
  <li><strong>127</strong> — Comandă negăsită (entrypoint greșit sau PATH incorect)</li>
  <li><strong>137</strong> — Ucis de OOM killer (memorie insuficientă)</li>
  <li><strong>139</strong> — Segmentation fault (crash în cod nativ)</li>
  <li><strong>143</strong> — SIGTERM grațios (de obicei intenționat)</li>
</ul>

<h3>Pasul 2: Citește logurile</h3>
<pre><code>docker logs &lt;container&gt;
docker logs --tail=100 &lt;container&gt;</code></pre>

<h3>Pasul 3: Verifică monturile de volume</h3>
<pre><code>docker inspect &lt;container&gt; | grep -A 20 Mounts</code></pre>
<p>Căile lipsă pe host cauzează crash imediat. Verifică că directorul sursă există.</p>

<h3>Pasul 4: Verifică conflictele de porturi</h3>
<pre><code>docker inspect &lt;container&gt; | grep -A 10 PortBindings
ss -tlnp | grep :8080</code></pre>

<h3>Pasul 5: Încearcă un shell interactiv</h3>
<pre><code>docker run -it --entrypoint sh &lt;image&gt;</code></pre>
<p>Suprascrie entrypoint-ul pentru a obține un shell în interiorul imaginii și investighează direct.</p>
