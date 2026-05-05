---
title: 'Cere un certificat Let''s Encrypt via DNS challenge'
summary: 'Emite certificate Let''s Encrypt gratuite din Docker Dash via DNS-01 challenge — funcționează pe rețele interne, suportă wildcards, cu 5 provideri DNS (Cloudflare, Route53, DigitalOcean, Hetzner, Linode).'
---

<h2>Ce face wizard-ul</h2>
<p>Wizard-ul cere un certificat Let's Encrypt real pentru unul sau mai multe domenii via clientul ACME built-in al lui Caddy. Treci prin 3 pași într-un modal, dai click pe "Issue" și certul ajunge în politicile de automatizare Caddy — se reînnoiește automat la fiecare 60 zile fără alte intervenții.</p>

<h2>Când să folosești DNS-01 vs HTTP-01</h2>
<table style="width:100%;border-collapse:collapse;font-size:13px">
<tr><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Challenge</th><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Folosește când…</th></tr>
<tr><td style="padding:6px"><strong>HTTP-01</strong></td><td style="padding:6px">Port-ul 80 e accesibil din internet public pe acest host. Cel mai simplu. Fără API tokens.</td></tr>
<tr><td style="padding:6px"><strong>DNS-01</strong></td><td style="padding:6px">Rețele interne/private (fără port 80 public), certificate wildcard (<code>*.example.com</code>), sau nu vrei să expui port 80.</td></tr>
</table>

<h2>Cerințe</h2>
<ul>
  <li>Profilul TLS Caddy pornit: <code>docker compose --profile tls up -d</code></li>
  <li>Pentru DNS-01: cont la unul dintre providerii suportați (Cloudflare, AWS Route53, DigitalOcean, Hetzner DNS, Linode)</li>
  <li>Controlezi DNS-ul pentru domeniul/domeniile pentru care vrei certul</li>
</ul>

<h2>Pas 1 — Creează un API token cu scope la providerul DNS</h2>
<p>Folosește un <strong>scoped token, NU un Global API Key</strong>. Docker Dash respinge Cloudflare Global Keys după format. Pentru alți provideri avertizează dar acceptă.</p>

<h3>Cloudflare</h3>
<ol>
  <li>Cloudflare Dashboard → My Profile → API Tokens → <strong>Create Token</strong></li>
  <li>Folosește template-ul <strong>"Edit zone DNS"</strong></li>
  <li>La <strong>Zone Resources</strong>, selectează <strong>doar zona/zonele specifice</strong> pentru care vrei să emiți certs (nu "All zones")</li>
  <li>Opțional restricționează după IP și TTL</li>
  <li>Continue → Create Token → copiază token-ul imediat (afișat o singură dată)</li>
</ol>

<h3>AWS Route53</h3>
<p>Creează un user IAM cu această policy minimală (înlocuiește <code>HOSTED_ZONE_ID</code>):</p>
<pre><code>{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["route53:ListHostedZones", "route53:GetChange"],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": ["route53:ChangeResourceRecordSets"],
      "Resource": "arn:aws:route53:::hostedzone/HOSTED_ZONE_ID"
    }
  ]
}</code></pre>

<h3>DigitalOcean</h3>
<p>API → Tokens → Generate New Token → Personal Access Token cu scope <strong>Read+Write</strong>.</p>

<h3>Hetzner DNS</h3>
<p>Hetzner DNS Console → API tokens → Create new. Token-ul are scriere completă pe DNS — păstrează-l în siguranță.</p>

<h3>Linode</h3>
<p>Cloud Manager → My Profile → API Tokens → Create Token. Limitează accesul la <strong>Domains: Read/Write</strong> — restul "None".</p>

<h2>Pas 2 — Deschide wizard-ul</h2>
<p>Mergi la <strong>System → Secrets → Audit & Wizard → Certificates</strong> sub-tab → click pe butonul <strong>Request Let's Encrypt</strong> (gradient albastru).</p>

<h2>Pas 3 — Treci prin wizard</h2>

<h3>Wizard Step 1: Domenii & Challenge</h3>
<ul>
  <li><strong>Domenii</strong>: separate cu virgulă. Exemplu: <code>api.example.com, *.api.example.com</code></li>
  <li><strong>Email</strong>: email-ul tău pentru notificări ACME (Let's Encrypt te alertează la expirare/probleme)</li>
  <li><strong>Tip challenge</strong>: alege HTTP-01 sau DNS-01. Wildcards forțează automat DNS-01.</li>
  <li><strong>Folosește Let's Encrypt staging</strong>: <strong>lasă-l ON pentru prima emitere</strong> pe un domeniu nou. Certele staging nu sunt browser-trusted, dar nu contează la rate limits. După ce confirmi că merge, repetă cu staging OFF.</li>
</ul>

<h3>Wizard Step 2: Provider & Credențiale</h3>
<ul>
  <li>Alege <strong>Create new</strong> sau <strong>Use saved credential</strong></li>
  <li>Selectează providerul DNS</li>
  <li>Paste token-ul/token-urile din Pas 1 mai sus</li>
  <li>Toggle <strong>Save this credential for reuse</strong> dacă vei emite mai multe certe cu aceeași credențială (în v6.5 trebuie să salvezi credențialele pentru DNS-01 — credențialele anonime nu sunt suportate)</li>
  <li>Toggle <strong>Validate credential</strong> pentru a apela API-ul providerului și a confirma că token-ul merge înainte să consumi un slot din rate limit Let's Encrypt</li>
</ul>

<h3>Wizard Step 3: Confirmare & Emitere</h3>
<ul>
  <li>Verifică tabelul de sumar (domenii, email, challenge, credențială, env)</li>
  <li>Click pe <strong>Issue Certificate</strong></li>
  <li>Wizard-ul face poll la fiecare 3 secunde. Status: <code>pending → running → success</code> (sau <code>failed</code>)</li>
  <li>Output-ul e streamat într-un terminal negru — vezi "DNS record added", "waiting for propagation", "ACME challenge passed", "certificate issued"</li>
  <li>Timp total: 30 secunde pentru HTTP-01, 1-5 minute pentru DNS-01 depinzând de viteza propagării providerului</li>
</ul>

<h2>După emitere</h2>
<ul>
  <li>Certul apare în tabelul <strong>Let's Encrypt Managed Certificates</strong> pe același sub-tab</li>
  <li>Caddy auto-renoiește 30 zile înainte de expirare — fără intervenție Docker Dash</li>
  <li>Certul apare și în <strong>Tracked Certificates</strong> (via scanul daily de la 07:30) ca să primești warning-uri de expirare</li>
  <li>Audit log capturează emiterea cu ID-ul credențialei (nu valoarea) și SHA fingerprint</li>
</ul>

<h2>Erori comune și fix-uri</h2>
<table style="width:100%;border-collapse:collapse;font-size:12px">
<tr><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Eroare</th><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Cauză</th><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Fix</th></tr>
<tr><td style="padding:6px">Caddy admin socket not found</td><td style="padding:6px">Profilul TLS nu e pornit</td><td style="padding:6px"><code>docker compose --profile tls up -d</code></td></tr>
<tr><td style="padding:6px">This looks like a Cloudflare Global API Key</td><td style="padding:6px">Ai folosit un Global Key (37 caractere hex)</td><td style="padding:6px">Creează un API Token cu scope (vezi Pas 1)</td></tr>
<tr><td style="padding:6px">Token verification failed</td><td style="padding:6px">Token revocat, expirat, sau scope greșit</td><td style="padding:6px">Regenerează token-ul cu scope-ul corect</td></tr>
<tr><td style="padding:6px">DNS challenge failed (după 5 min)</td><td style="padding:6px">Propagare DNS lentă</td><td style="padding:6px">Retry — Caddy va relua de unde s-a oprit</td></tr>
<tr><td style="padding:6px">Wildcard domains require dns-01</td><td style="padding:6px">Ai ales HTTP-01 cu un domeniu wildcard</td><td style="padding:6px">Wizard-ul corectează automat la Next; doar continuă</td></tr>
<tr><td style="padding:6px">Let's Encrypt rate limit hit</td><td style="padding:6px">Prea multe emiteri pentru acest domeniu în ultima săptămână</td><td style="padding:6px">Așteaptă, sau folosește mediul staging pentru a testa config-ul</td></tr>
</table>

<h2>Ștergerea unui certificat managed</h2>
<p>Din tabelul <strong>Let's Encrypt Managed Certificates</strong>, click pe iconița trash → confirmă. Asta elimină politica de automatizare Caddy. Fișierele cert pe disk în <code>/data/caddy</code> NU sunt șterse (Caddy poate continua să le servească până la următorul reload — intenționat, fără întreruperea serviciului).</p>

<h2>Rotația unei credențiale</h2>
<p>Dacă API token-ul de provider scapă sau expiră:</p>
<ol>
  <li>Generează un nou token la provider</li>
  <li>Tabelul Saved DNS Credentials → click pe butonul de validare ca să testezi noul token</li>
  <li>(Apel API manual până când UI-ul pentru rotație vine în v6.5.1) — pentru moment, șterge credențiala veche + creează una nouă cu același nume</li>
</ol>
<p>Caddy citește fișierul de credențiale <strong>la fiecare request</strong> (verificat în preflight), deci rotația e zero-downtime — fără reload Caddy.</p>

<h2>Migrare de la TLS pe bază de Caddyfile</h2>
<p>Dacă anterior ai editat Caddyfile manual pentru a emite certe, politicile wizard-ului coexistă via tree-ul JSON config al Caddy. Nu adăuga directive <code>tls</code> manuale în Caddyfile pentru aceleași domenii — Caddy va dedupa dar cu ordine imprevizibilă.</p>
