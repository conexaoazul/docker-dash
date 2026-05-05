---
title: Docker Dash pentru developeri care folosesc Git
summary: Știi git și CI/CD dar n-ai intrat încă în Docker? Modelul mental git → Docker, cele 5 locuri unde te blochezi, și de ce Docker Dash bate Portainer + Dockge + scripturi bash pentru situația ta.
---


<div style="padding:14px 18px;background:var(--accent-dim);border-left:4px solid var(--accent);border-radius:6px;margin-bottom:18px">
  <strong style="color:var(--accent)">Pentru developeri care folosesc deja git.</strong> Înțelegi version control, repo-uri, branches, CI. Probabil n-ai intrat încă deplin în Docker. Ghidul ăsta face puntea mentală și explică de ce Docker Dash bate alternativele în situația ta.
</div>

<h2>"Știu git. De ce să mă apuc de Docker?"</h2>
<p>Git îți versionează <strong>codul</strong>. Docker îți versionează <strong>mediul în care rulează codul</strong>.</p>
<p>Modelul mental dacă deja folosești git:</p>

<table style="width:100%;border-collapse:collapse">
<tr><th style="text-align:left;border-bottom:1px solid var(--border);padding:8px 6px">Git</th><th style="text-align:left;border-bottom:1px solid var(--border);padding:8px 6px">Docker</th></tr>
<tr><td style="padding:6px"><code>git commit</code></td><td style="padding:6px">image (snapshot imutabil)</td></tr>
<tr><td style="padding:6px">branch / tag</td><td style="padding:6px">image tag (<code>v1.2.0</code>, <code>latest</code>, <code>staging</code>)</td></tr>
<tr><td style="padding:6px"><code>git clone</code></td><td style="padding:6px"><code>docker pull</code></td></tr>
<tr><td style="padding:6px">GitHub / GitLab</td><td style="padding:6px">Docker registry (Docker Hub, GHCR, Harbor)</td></tr>
<tr><td style="padding:6px"><code>package.json</code></td><td style="padding:6px"><code>docker-compose.yml</code></td></tr>
<tr><td style="padding:6px">diff între commits</td><td style="padding:6px">image layers (fiecare RUN/COPY = un layer)</td></tr>
<tr><td style="padding:6px"><code>git revert</code></td><td style="padding:6px"><code>docker compose up image:v1.1.0</code> (rollback instant)</td></tr>
</table>

<p style="margin-top:14px">Dacă ai trăit vreodată "merge pe local, nu merge pe server" sau "trebuie să convingem ops să-ți instaleze Redis" — Docker e răspunsul. <strong>Compose-ul devine sursa adevărului pentru toată infrastructura ta de runtime</strong>, exact cum <code>package.json</code> e sursa adevărului pentru dependențe.</p>

<h2>Cele 5 locuri unde dev-ii care folosesc git se blochează la Docker</h2>
<ol>
  <li><strong>Volume vs bind mounts</strong> — "unde naiba îmi trăiește baza de date după restart"</li>
  <li><strong>Networking</strong> — "de ce nu se poate conecta containerul <code>web</code> la <code>db</code> deși sunt amândouă pornite"</li>
  <li><strong>Compose vs Swarm vs Kubernetes</strong> — "îmi trebuie K8s pentru 3 container-e?" (nu, niciodată)</li>
  <li><strong>Image hygiene</strong> — "de ce am 1.2 GB pentru un app Node de 12 MB"</li>
  <li><strong>Secrete</strong> — <code>.env</code> în git, păcatul originar</li>
</ol>
<p>Un UI bun pentru Docker rezolvă vizual #1, #2, #5 — nu mai trebuie să-ți amintești comenzi <code>docker network inspect</code> la 2 noaptea.</p>

<h2>"OK, dar de ce Docker Dash și nu Portainer / Dockge / scripturi bash?"</h2>

<h3>Portainer</h3>
<ul>
  <li><strong>Tot ce contează pentru orice firmă reală e paywall:</strong> OIDC, SSO, LDAP, audit log, RBAC granular, MFA. Costă <strong>$95/server/an</strong>.</li>
  <li>Stack-urile compose <strong>trăiesc într-o bază internă a Portainer</strong> — dacă pică Portainer, configurațiile tale dispar din vedere până-l reînvii.</li>
  <li>Issue <a href="https://github.com/portainer/portainer/issues/3582" target="_blank">#3582 pe GitHub</a> e plin de utilizatori furioși că un PR comunitar de OAuth a fost transformat în feature plătit.</li>
</ul>

<h3>Dockge</h3>
<ul>
  <li>Excelent pentru "compose, frumos, simplu". Compose pe disc, nu în DB — exact ce vrei.</li>
  <li><strong>Limitat:</strong> fără audit log, fără MFA, fără RBAC, fără multi-host serios, fără scanări de imagini.</li>
  <li>Dacă ai 3 container-e în homelab — perfect. Dacă ai un server de producție — rămâi în urmă.</li>
</ul>

<h3>Scripturi bash + SSH</h3>
<ul>
  <li>Funcționează până în ziua în care îți trebuie audit ("cine a oprit container-ul de prod la 3 dimineața?") sau RBAC ("dezvoltatorul nou să poată reporni dar nu să șteargă").</li>
  <li>Suporți tu mental tot statusul cluster-ului. Distractiv pentru 5 servicii, neglijabil periculos pentru 50.</li>
</ul>

<h3>Docker Dash</h3>
<ul>
  <li><strong>Tot ce paywall-uiește Portainer Business, free, în același pachet:</strong> OIDC, LDAP, SSO via header, audit log cu hash chain SHA-256 (compliance-friendly), RBAC pe trei niveluri, MFA cu cod de recuperare, scanare imagini cu Trivy/Grype/Docker Scout, CIS Docker Benchmark integrat.</li>
  <li><strong>Multi-host prin tunel SSH</strong> — fără agent pe serverul remote. Adaugi un host nou cu cheie SSH, gata.</li>
  <li><strong>Stack-urile Compose pleacă din git repo:</strong> conectezi un repo, alegi branch, deploy-ul rulează <code>docker compose up -d</code> cu webhook auto-pull. Rollback un click.</li>
  <li><strong>Secrets Wizard</strong> (recent) — paste un <code>.env</code> complet, primește un script bash hardenat care creează fișiere <code>*_FILE</code> cu permisiuni 600, owner <code>root:docker</code>, opțional cu deploy SSH automat. Plus Rotation Tracker care te bate la cap când expiră secretele.</li>
  <li><strong>Certificate Manager</strong> — track la PEM-uri, expirare, generator CSR (RSA 4096 / EC P-256).</li>
  <li><strong>Single binary feel</strong> — un container, fără DB externă, fără Redis, fără build step. 80 MB image, 50 MB RAM. Merge pe N100 sau pe c5.large fără diferență.</li>
  <li><strong>MIT, fără telemetrie, fără signup, fără "register your instance"</strong>.</li>
</ul>

<h2>Workflow-ul tău cu Docker Dash dacă deja folosești git</h2>
<pre><code>1. Push la repo cu docker-compose.yml
2. Docker Dash detectează prin webhook
3. Pull la cod, docker compose up -d cu noua imagine
4. Audit log: "deploy webhook → user X → commit abc123 → success în 12s"
5. Dacă ceva crapă: rollback la versiunea anterioară din UI, un click</code></pre>
<p>Ai GitOps fără Argo CD, fără K8s, fără YAML kafka-esc.</p>

<h2>De unde să începi</h2>
<ul>
  <li>Deschide <strong>Stacks</strong> din meniul stâng — conectează primul tău git repo</li>
  <li>Deschide <strong>Hosts</strong> — adaugă un server remote cu o cheie SSH (fără instalare de agent)</li>
  <li>Deschide <strong>System → Secrets → Audit & Wizard</strong> — paste un <code>.env</code> real și uită-te cum clasifică 20+ tipuri de secrete și generează scriptul de setup hardenat</li>
  <li>Deschide <strong>System → Audit Log</strong> — vezi tot hash-chain-ul fiecărei acțiuni din momentul instalării</li>
</ul>

