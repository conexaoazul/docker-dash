---
title: Conectează Docker Dash la Synology DSM (Container Manager)
summary: 'Pas cu pas: activează SSH pe DSM, adaugă user-ul la grupul docker, și conectează Docker Dash la NAS-ul Synology. Container Manager e Docker rebrand-uit — nicio API specială.'
---

<h2>Ce îți trebuie</h2>
<ul>
  <li>Synology DSM 7.0 sau mai nou (testat pe DSM 7.2)</li>
  <li>Pachetul Container Manager instalat (e Docker rebrand-uit)</li>
  <li>Un cont de admin DSM</li>
  <li>Docker Dash rulând pe ceva ce poate contacta NAS-ul (sau invers)</li>
</ul>

<h2>Pasul 1: Activează SSH pe DSM</h2>
<ol>
  <li>Autentifică-te în DSM ca admin</li>
  <li>Control Panel → Terminal &amp; SNMP → Terminal</li>
  <li>Bifează <strong>Enable SSH service</strong></li>
  <li>Lasă portul pe <code>22</code> sau schimbă-l dacă ai conflict</li>
  <li>Apply</li>
</ol>

<h2>Pasul 2: Adaugă user-ul în grupul docker</h2>
<p>Container Manager creează automat un grup <code>docker</code>. User-ul DSM trebuie să fie în el ca să acceseze socket-ul fără <code>sudo</code>.</p>
<pre><code>ssh user-ul-admin@synology.local
sudo synogroup --memberadd docker user-ul-admin
exit
# Re-autentifică-te ca să se aplice noile grupuri
ssh user-ul-admin@synology.local
groups  # trebuie să conțină "docker"
docker ps  # trebuie să listeze containerele fără sudo</code></pre>

<h2>Pasul 3: Adaugă host-ul în Docker Dash</h2>
<ol>
  <li>Multi-Host → Add Host</li>
  <li>Connection type: <strong>SSH tunnel</strong></li>
  <li>Host: <code>synology.local</code> sau IP</li>
  <li>Port: <code>22</code></li>
  <li>Username: admin-ul DSM</li>
  <li>Auth: parolă SAU private key (recomandat)</li>
  <li>Docker socket path: <code>/var/run/docker.sock</code> (default)</li>
  <li>Test connection → ✓</li>
  <li>Save</li>
</ol>

<h2>Pasul 4: Verifică badge-ul</h2>
<p>Pe pagina Multi-Host, host-ul Synology ar trebui să arate un badge <strong>Synology DSM</strong> cu versiunea. Dacă îl vezi, auto-detect merge și ai terminat.</p>

<h2>Ce funcționează pe Synology</h2>
<ul>
  <li>Toate feature-urile: containere, stack-uri (compose), imagini, volume, rețele, stats, logs, terminal</li>
  <li>Outbound Filter v6.7 — pentru lock-down containere care nu trebuie să iasă pe internet</li>
  <li>Remediation Wizard v6.6 — apply local mode merge (Container Manager include <code>docker compose</code>)</li>
  <li>Security / CIS Benchmark scanează runtime-ul Docker direct</li>
</ul>

