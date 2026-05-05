---
title: Conectează Docker Dash la Unraid
summary: Unraid rulează Docker + SSH standard — cel mai ușor NAS de conectat. Pune Docker Dash pe Tower și gata.
---

<h2>Ce îți trebuie</h2>
<ul>
  <li>Unraid 6.9 sau mai nou</li>
  <li>SSH activat (de obicei e on by default)</li>
  <li>Docker Dash rulând pe ceva reachable</li>
</ul>

<h2>Pasul 1: Verifică SSH</h2>
<p>Settings → Management Access → SSH → <strong>Use SSH</strong> = Yes. Port <code>22</code>.</p>
<p>Dacă n-ai intrat niciodată pe SSH, setează key-based login în Settings → User Utilities → User Profile → SSH Authorized Keys. Nu e obligatoriu dar e mai robust decât parola de root.</p>

<h2>Pasul 2: Adaugă host-ul în Docker Dash</h2>
<ol>
  <li>Multi-Host → Add Host</li>
  <li>Connection type: SSH tunnel</li>
  <li>Host: IP-ul Unraid sau <code>tower.local</code></li>
  <li>Port: 22</li>
  <li>Username: <code>root</code> (Unraid rulează tot ca root)</li>
  <li>Auth: parola sau private key</li>
  <li>Docker socket: <code>/var/run/docker.sock</code></li>
  <li>Test → ✓ → Save</li>
</ol>

<h2>Pasul 3: Verifică badge-ul</h2>
<p>Pe Multi-Host ar trebui să apară badge-ul <strong>Unraid</strong>.</p>

<h2>Tips Unraid-specifice</h2>
<ul>
  <li><strong>Convenția appdata</strong>: <code>/mnt/user/appdata/&lt;service&gt;</code>. Păstreaz-o când deploy-ezi compose stacks prin Docker Dash — compatibilitate cu Community Apps.</li>
  <li><strong>Community Apps și Docker Dash coexistă</strong> — ambele citesc același daemon Docker.</li>
  <li><strong>Outbound filter</strong> merge perfect — Unraid folosește bridge network standard.</li>
</ul>

