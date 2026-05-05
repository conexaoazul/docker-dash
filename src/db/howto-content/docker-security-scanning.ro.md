---
title: Scanare securitate containere
summary: Scanează imagini pentru CVE-uri cu Trivy, Grype și Docker Scout. Înțelege nivelurile de severitate.
---

<h2>Scanare securitate containere</h2>
<p>Scanarea vulnerabilităților verifică imaginile tale față de bazele de date CVE cunoscute, identificând pachete OS și biblioteci cu probleme de securitate divulgate public.</p>

<h3>Trivy (cel mai popular, open source)</h3>
<pre><code># Instalare
curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh

# Scanează o imagine
trivy image nginx:latest

# Output JSON pentru CI
trivy image --format json --output results.json nginx:latest

# Eșuează CI dacă există vulnerabilități CRITICAL
trivy image --exit-code 1 --severity CRITICAL nginx:latest</code></pre>

<h3>Grype (Anchore, rapid)</h3>
<pre><code># Instalare
curl -sSfL https://raw.githubusercontent.com/anchore/grype/main/install.sh | sh

# Scanează
grype nginx:latest

# Doar critical/high
grype nginx:latest --fail-on high</code></pre>

<h3>Docker Scout (integrat în Docker CLI)</h3>
<pre><code>docker scout cves nginx:latest
docker scout recommendations nginx:latest  # sugerează actualizări</code></pre>

<h3>Înțelegerea nivelurilor de severitate</h3>
<ul>
  <li><strong>Critical</strong> — Exploatabil de la distanță, fără autentificare. Remediați imediat</li>
  <li><strong>High</strong> — Impact semnificativ, poate fi exploatabil. Remediați în zile</li>
  <li><strong>Medium</strong> — Impact limitat sau necesită exploatare complexă. Planificați remedierea</li>
  <li><strong>Low</strong> — Risc minim. Remediați în cicluri normale de întreținere</li>
</ul>

<h3>Scanare în Docker Dash</h3>
<p>Mergi la <strong>Security → Vulnerability Scanner</strong>, selectează o imagine și apasă <strong>Scan</strong>. Rezultatele sunt grupate după severitate cu ID-uri CVE, pachete afectate și versiunile de fix afișate.</p>
