---
title: Impune allowlist-uri outbound cu Egress Filter
summary: Restricționează la ce host-uri externe poate ajunge un container. Allowlist bazat pe SNI, IMDS blocat mereu, mod audit-only pentru migrare, emergency disable per policy. Arhitectură sidecar + iptables.
---

<h2>Modelul de amenințare</h2>
<p>Cea mai mare armă a unui container compromis este outbound-ul nerestricționat. Poate:</p>
<ul>
  <li><strong>Citește credențiale IAM</strong> de la endpoint-ul IMDS (<code>169.254.169.254</code>) și pivotează în AWS/GCP/Azure</li>
  <li><strong>Exfiltrează date</strong> către host-uri controlate de atacator</li>
  <li><strong>Contactează C2</strong> pentru persistență</li>
</ul>
<p>Outbound Filter îți dă un allowlist de hostname-uri per container sau stack. Restul e blocat. IMDS e blocat indiferent de ce zice allowlist-ul — apărare negociabilă.</p>

<h2>Arhitectura</h2>
<p>Trei piese mobile:</p>
<ol>
  <li><strong>Sidecar</strong> (<code>docker-dash-egress-filter</code>, Go, imagine ~2MB): ascultă pe port 29193, peek TLS SNI sau HTTP Host la fiecare conexiune, verifică allowlist-ul, forward sau reset. Fără decriptare TLS.</li>
  <li><strong>Runner</strong> (în Docker Dash): rulează un helper container efemer <code>alpine/nftables</code> cu <code>NET_ADMIN</code> care instalează reguli nftables în netns-ul containerului țintă, redirectând tot TCP-ul non-DNS/non-RFC1918 către sidecar.</li>
  <li><strong>DB + UI</strong>: config policy, ingest block log, apply/unapply per policy via REST.</li>
</ol>

<h2>Setup — doi pași</h2>

<h3>1. Pornește sidecar-ul</h3>
<pre><code>cd docker/egress-filter
docker build -t dd-egress-filter:v6.7 .
mkdir -p /data/egress-policy && echo '{"version":1,"mode":"enforce","allowlist":[],"updated_at":"2026-01-01T00:00:00Z"}' > /data/egress-policy/policy.json
docker run -d --name dd-egress-filter \
  -v /data/egress-policy/policy.json:/etc/dd-egress/policy.json \
  dd-egress-filter:v6.7</code></pre>

<h3>2. Configurează Docker Dash</h3>
<pre><code>services:
  app:
    environment:
      DD_EGRESS_SIDECAR_ENDPOINT: "172.17.0.5:29193"
      DD_EGRESS_SIDECAR_NAME: "dd-egress-filter"
      DD_EGRESS_BLOCKLOG_INGESTER: "1"</code></pre>
<p>Restart Docker Dash. Sidecar-ul primește SIGHUP la fiecare schimbare de policy automat.</p>

<h2>Folosirea UI-ului</h2>

<p>Mergi la <strong>Sistem → Egress</strong>. Vezi:</p>
<ul>
  <li><strong>Audit overview</strong> (din v6.6.2) — ce containere pot ajunge la internet + IMDS</li>
  <li><strong>Coloana Filter</strong> — per rând, fie buton "Enable filter" fie un badge de policy activă</li>
</ul>

<h3>Activează filter (prima dată)</h3>
<ol>
  <li>Click <strong>Enable filter</strong> pe orice rând</li>
  <li>Alege un preset:
    <ul>
      <li><strong>Registry-only</strong> — Docker / npm / pypi / rubygems. Pentru containere de build + imagini care trag doar dependențe.</li>
      <li><strong>Registries + GitHub</strong> — cele de mai sus plus GitHub/GHCR. Pentru workload CI.</li>
      <li><strong>Lockdown</strong> — nimic. Pentru batch jobs, baze de date, containere care nu ar trebui să vorbească cu internet-ul.</li>
      <li><strong>Audit-only</strong> — loghează dar nu blochează. <em>Folosește ăsta primul</em> la migrare — rulează o zi, verifică deny log, apoi comută pe <code>enforce</code>.</li>
      <li><strong>Custom</strong> — pune propria listă.</li>
    </ul>
  </li>
  <li>Verifică preview-ul allowlist-ului</li>
  <li>Click <strong>Save &amp; apply</strong>. Filter-ul e activ în ~2 secunde.</li>
</ol>

<h3>Block log</h3>
<p>Click pe chevron-ul unui rând ca să expandezi. Deny log-ul arată ultimele 25 de tentative cu hostname, port, și motiv. Retenție 30 zile / max 10k rânduri.</p>

<h3>Emergency disable</h3>
<p>Click pe iconița cog pe orice rând filtrat → <strong>Emergency disable</strong>. Asta scoate filter-ul ȘI șterge policy. Container-ul recapătă outbound complet în &lt;5 secunde. Acțiunea e audit-logată.</p>

<h2>Ce se blochează (invariantele)</h2>
<table style="width:100%;border-collapse:collapse;font-size:12px">
<tr><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Destinație</th><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Comportament</th></tr>
<tr><td style="padding:6px"><code>169.254.169.254</code>, <code>metadata.google.internal</code>, <code>169.254.170.2</code></td><td style="padding:6px"><strong>Blocat mereu</strong> — chiar dacă user-ul le pune în allowlist custom. Defense in depth.</td></tr>
<tr><td style="padding:6px"><code>127.0.0.0/8</code> (loopback)</td><td style="padding:6px">Permis mereu — niciodată spart de filter.</td></tr>
<tr><td style="padding:6px">Port 53 TCP/UDP (DNS)</td><td style="padding:6px">Permis mereu — containerele au nevoie de rezoluție.</td></tr>
<tr><td style="padding:6px">RFC1918 (<code>10/8</code>, <code>172.16/12</code>, <code>192.168/16</code>)</td><td style="padding:6px">Permis — păstrează service-to-service pe bridge-uri Docker. Strângem per-stack într-o ediție viitoare.</td></tr>
<tr><td style="padding:6px">Restul</td><td style="padding:6px">Hostname extras (SNI sau HTTP Host), verificat pe allowlist. Suport wildcard (<code>*.github.com</code>).</td></tr>
</table>

<h2>Evenimente audit-log</h2>
<p>Fiecare acțiune e hash-chained în audit log:</p>
<ul>
  <li><code>egress_policy_created</code> / <code>_updated</code> / <code>_applied</code> / <code>_unapplied</code></li>
  <li><code>egress_emergency_disable</code> — cu motiv</li>
</ul>

<h2>Gotchas comune</h2>
<table style="width:100%;border-collapse:collapse;font-size:12px">
<tr><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Simptom</th><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Cauză &amp; fix</th></tr>
<tr><td style="padding:6px">"Cannot apply filter to a container with NET_ADMIN"</td><td style="padding:6px">Container-ul poate modifica propriile iptables → bypass. Scoate <code>NET_ADMIN</code> + <code>SYS_ADMIN</code> + <code>privileged</code> primul via Remediation Wizard, apoi reaplică.</td></tr>
<tr><td style="padding:6px">"DD_EGRESS_SIDECAR_ENDPOINT not set"</td><td style="padding:6px">Setează env var-ul pe Docker Dash, restart. Vezi Setup pasul 2.</td></tr>
<tr><td style="padding:6px">Container-ul nu mai ajunge la registry după apply</td><td style="padding:6px">Preset-ul nu are hostname-ul de registry. Încearcă <code>Audit-only</code> primul, vezi ce-ar bloca, apoi rafinează.</td></tr>
<tr><td style="padding:6px">Block log e gol</td><td style="padding:6px">Ori nu s-a încercat nimic încă, ori ingester-ul nu rulează (<code>DD_EGRESS_BLOCKLOG_INGESTER=1</code>).</td></tr>
<tr><td style="padding:6px">Stack apply avortat la "db" — failed precheck</td><td style="padding:6px">Un container din stack are NET_ADMIN/privileged. Abort-ul whole-stack e deliberat — refuzăm stack-uri filtrate parțial.</td></tr>
</table>

<h2>Per-container vs. per-stack</h2>
<p>Ambele scope-uri merg. Pentru un compose stack, policy se aplică pe fiecare container cu label-ul <code>com.docker.compose.project</code>. Apply e tranzacțional: dacă un container pică la precheck, tot stack-ul e refuzat. Eșecuri mid-stream roll-back containerele deja aplicate.</p>

<h2>Ce NU e în acest release</h2>
<ul>
  <li><strong>Decriptare TLS</strong> — nu spargem niciodată trust chain-ul container-ului</li>
  <li><strong>Per-process filtering</strong> în interiorul unui container — un policy per container</li>
  <li><strong>Routing per-container allowlist</strong> în sidecar bazat pe source-IP — azi sidecar-ul rulează un singur policy agregat (union din toate active). Dacă ai nevoie de policy-uri izolate per container, rulează mai multe sidecar-uri denumite (dd-egress-filter-api, dd-egress-filter-db, etc.)</li>
  <li><strong>IPv6</strong> — IPv4 only în acest release</li>
</ul>

