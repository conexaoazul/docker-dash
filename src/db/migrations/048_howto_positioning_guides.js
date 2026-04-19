'use strict';

// Two flagship "Why Docker / Why Docker Dash" guides, EN + RO, surfaced
// directly from the How-To page header so first-time visitors can read them
// before exploring anything else.

exports.up = function (db) {
  const guides = [
    {
      slug: 'why-docker-dash-beginners',
      title: 'Why Docker & Docker Dash — Beginner\'s Guide',
      title_ro: 'De ce Docker și Docker Dash — pentru începători',
      category: 'basics',
      difficulty: 'beginner',
      icon: 'fas fa-rocket',
      summary: 'Never touched Docker? Start here. The shipping-container metaphor explained without jargon, plus why a visual dashboard makes Docker actually friendly.',
      summary_ro: 'Nu ai atins Docker niciodată? Începe aici. Metafora "container" explicată fără jargon, plus de ce un dashboard vizual face Docker prietenos cu adevărat.',
      content: `
<div style="padding:14px 18px;background:var(--accent-dim);border-left:4px solid var(--accent);border-radius:6px;margin-bottom:18px">
  <strong style="color:var(--accent)">Welcome!</strong> If you're brand new to Docker, read this first. By the end you'll understand <em>what Docker actually does</em>, <em>why it matters</em>, and <em>how Docker Dash makes it usable without living in the terminal</em>.
</div>

<h2>What is Docker, really?</h2>
<p>Imagine your application is a <strong>cooking recipe</strong>. The code is the recipe — but to actually cook, you need a kitchen, ingredients, an oven, all configured exactly right.</p>
<p>The classic problem in software is called <strong>"works on my machine"</strong>. You cook perfectly at home, but when you give the recipe to your friend, theirs comes out different — they have a different oven, a different pan, a different pot.</p>
<p><strong>Docker fixes this</strong> by putting the recipe + the kitchen + the ingredients into a single sealed box ("container") that runs <em>identically</em> wherever you take it: your laptop, your company's server, the cloud, the Raspberry Pi sitting on your shelf.</p>

<h2>Why this is a big deal</h2>
<ul>
  <li><strong>Install any app in 30 seconds</strong>, no more "open terminal, install Python 3.11 not 3.12, make a symlink, edit a config file…"</li>
  <li><strong>Uninstall cleanly</strong> — no leftover files scattered through the system, no broken OS</li>
  <li><strong>Two apps don't fight over the same resources</strong> — each in its own box</li>
  <li><strong>Backup and migration is easy</strong> — pack the box, send it to another server, runs the same</li>
</ul>

<h2>OK, I get Docker. Why do I need Docker Dash?</h2>
<p>Docker is controlled from <strong>the terminal with text commands</strong>: <code>docker run</code>, <code>docker ps</code>, <code>docker logs</code>, <code>docker exec</code>… For someone who doesn't live in the terminal, that's like being asked to program your oven by writing Morse code.</p>
<p><strong>Docker Dash is the visual control panel for Docker.</strong> Instead of typing:</p>
<pre><code>docker logs -f --tail 200 my-app | grep ERROR</code></pre>
<p>You click on the container, click on "Logs", type "ERROR" in the filter. Done.</p>

<h2>What you see in the first 30 seconds after opening it</h2>
<ul>
  <li><strong>Every app running</strong>, with live CPU and RAM (like Task Manager)</li>
  <li><strong>Start / Stop / Restart buttons</strong> for each container</li>
  <li><strong>Live logs</strong>, searchable, with download buttons</li>
  <li><strong>Disk statistics</strong> — who's using space and how much</li>
  <li><strong>"Old" images</strong> not used in weeks — one click to clean them up</li>
</ul>

<h2>Why Docker Dash and not something else?</h2>
<ul>
  <li><strong>Free, no limits</strong> — Portainer (the most popular alternative) charges $95/year per server for basic features like Google login or backups</li>
  <li><strong>One single container</strong> — install with one command, no external database, no complicated setup</li>
  <li><strong>80 MB on disk, 50 MB RAM</strong> — runs on the cheapest VPS or a Raspberry Pi</li>
  <li><strong>51 step-by-step guides built in</strong>, in English and Romanian — no Googling required</li>
  <li><strong>Zero lock-in</strong> — if tomorrow you uninstall Docker Dash, your containers stay running, nothing breaks</li>
</ul>

<h2>What you can do in your first hour</h2>
<ol>
  <li>Install Docker Dash (2 minutes)</li>
  <li>See everything running on your server, visually</li>
  <li>Start a new app (Nextcloud, WordPress, Vaultwarden) with 3 clicks from the built-in templates</li>
  <li>Set up automatic daily backups</li>
  <li>Enable 2FA on your admin account</li>
</ol>

<p style="padding:14px;background:var(--surface2);border-radius:6px;margin-top:18px"><strong>Total cost:</strong> zero. Not a trial, not freemium, no credit card required. Open source, MIT license.</p>

<h2>Where to go next</h2>
<ul>
  <li>Open the <strong>Containers</strong> page in the left menu — see what's running</li>
  <li>Try <strong>Templates</strong> to deploy a new app in seconds</li>
  <li>Browse the other How-To Guides on this page — there are 51 in total covering everything from basic Docker commands to advanced security</li>
  <li>Press <strong>Ctrl + K</strong> anywhere in the app to open the command palette</li>
</ul>
`,
      content_ro: `
<div style="padding:14px 18px;background:var(--accent-dim);border-left:4px solid var(--accent);border-radius:6px;margin-bottom:18px">
  <strong style="color:var(--accent)">Bun venit!</strong> Dacă ești complet nou în Docker, citește asta prima oară. La final vei înțelege <em>ce face Docker de fapt</em>, <em>de ce contează</em> și <em>cum Docker Dash îl face folosibil fără să trăiești în terminal</em>.
</div>

<h2>Ce e Docker, mai exact?</h2>
<p>Imaginează-ți că aplicația ta e o <strong>rețetă de gătit</strong>. Codul e rețeta, dar ca să gătești efectiv ai nevoie de bucătărie, ingrediente, cuptor, totul setat exact cum trebuie.</p>
<p>Problema clasică în software se numește <strong>"merge la mine pe calculator"</strong>. Tu ai gătit perfect acasă, dar când dai rețeta la prietenul tău, lui îi iese altfel — pentru că are alt cuptor, altă farfurie, altă oală.</p>
<p><strong>Docker rezolvă asta</strong> punând rețeta + bucătăria + ingredientele într-o singură cutie sigilată ("container") care merge <em>identic</em> oriunde o duci: pe laptopul tău, pe serverul firmei, pe cloud, pe Raspberry Pi-ul din hol.</p>

<h2>De ce e mare lucru</h2>
<ul>
  <li><strong>Instalezi orice aplicație în 30 secunde</strong>, fără "deschide terminal, instalează Python 3.11 nu 3.12, fă symlink, editează config…"</li>
  <li><strong>Ștergi tot fără urme</strong> — nu rămân fișiere prin sistem, nu se strică sistemul de operare</li>
  <li><strong>Două aplicații nu se mai bat pe aceleași resurse</strong> — fiecare în cutia ei</li>
  <li><strong>Backup și mutare ușoară</strong> — împachetezi cutia, o trimiți pe alt server, merge la fel</li>
</ul>

<h2>OK, am înțeles Docker. De ce am nevoie de Docker Dash?</h2>
<p>Docker se controlează din <strong>terminal cu comenzi text</strong>: <code>docker run</code>, <code>docker ps</code>, <code>docker logs</code>, <code>docker exec</code>… Pentru cineva care nu trăiește în terminal, e ca și cum ți-ar cere să programezi cuptorul scriind cod în Morse.</p>
<p><strong>Docker Dash e panoul de control vizual pentru Docker.</strong> În loc să tastezi:</p>
<pre><code>docker logs -f --tail 200 my-app | grep ERROR</code></pre>
<p>Dai click pe container, click pe "Logs", scrii "ERROR" în filtru. Gata.</p>

<h2>Ce vezi în primele 30 secunde după ce-l deschizi</h2>
<ul>
  <li><strong>Toate aplicațiile</strong> care rulează, cu CPU și RAM live (ca Task Manager)</li>
  <li><strong>Buton Start / Stop / Restart</strong> pentru fiecare container</li>
  <li><strong>Logs live</strong>, căutabile, cu butoane de descărcare</li>
  <li><strong>Statistici de disc</strong> — cine ocupă spațiu și cât</li>
  <li><strong>Imagini "vechi"</strong> care n-au mai fost folosite de săptămâni — un click și sunt șterse</li>
</ul>

<h2>De ce Docker Dash și nu altceva?</h2>
<ul>
  <li><strong>Gratis, fără limitări</strong> — Portainer (cea mai populară alternativă) cere $95/an pe server pentru funcții de bază precum login cu Google sau backup</li>
  <li><strong>Un singur container</strong> — instalezi cu o comandă, fără bază de date externă, fără setări complicate</li>
  <li><strong>80 MB pe disc, 50 MB de RAM</strong> — merge până și pe cel mai ieftin VPS sau Raspberry Pi</li>
  <li><strong>51 ghiduri pas-cu-pas în română și engleză</strong> — built-in, nu trebuie să googlești</li>
  <li><strong>Nu te leagă de el</strong> — dacă mâine vrei să-l ștergi, container-ele tale rămân acolo, nimic nu se sparge</li>
</ul>

<h2>Ce poți face în prima oră</h2>
<ol>
  <li>Instalezi Docker Dash (2 minute)</li>
  <li>Vezi tot ce-ți rulează pe server, vizual</li>
  <li>Pornești o aplicație nouă (Nextcloud, WordPress, Vaultwarden) cu 3 click-uri din șabloanele built-in</li>
  <li>Setezi backup automat zilnic</li>
  <li>Activezi 2FA pentru contul tău admin</li>
</ol>

<p style="padding:14px;background:var(--surface2);border-radius:6px;margin-top:18px"><strong>Costul total:</strong> zero. Nu e trial, nu e freemium, nu cere card. Cod sursă deschis, licență MIT.</p>

<h2>Unde mergi mai departe</h2>
<ul>
  <li>Deschide pagina <strong>Containers</strong> din meniul stâng — vezi ce-ți rulează</li>
  <li>Încearcă <strong>Templates</strong> pentru a porni o aplicație nouă în secunde</li>
  <li>Răsfoiește celelalte How-To Guides de pe pagina asta — sunt 51 în total, de la comenzi Docker de bază până la securitate avansată</li>
  <li>Apasă <strong>Ctrl + K</strong> oriunde în aplicație ca să deschizi paleta de comenzi</li>
</ul>
`,
    },
    {
      slug: 'why-docker-dash-developers',
      title: 'Docker Dash for Developers Using Git',
      title_ro: 'Docker Dash pentru developeri care folosesc Git',
      category: 'basics',
      difficulty: 'intermediate',
      icon: 'fab fa-git-alt',
      summary: 'You know git and CI/CD but haven\'t bought into Docker yet? The git → Docker mental bridge, the 5 stuck points, and why Docker Dash beats Portainer + Dockge + bash scripts for your situation.',
      summary_ro: 'Știi git și CI/CD dar n-ai intrat încă în Docker? Modelul mental git → Docker, cele 5 locuri unde te blochezi, și de ce Docker Dash bate Portainer + Dockge + scripturi bash pentru situația ta.',
      content: `
<div style="padding:14px 18px;background:var(--accent-dim);border-left:4px solid var(--accent);border-radius:6px;margin-bottom:18px">
  <strong style="color:var(--accent)">For developers who already use git.</strong> You understand version control, repos, branches, CI. You may not have fully bought into Docker yet. This guide bridges the mental model and explains why Docker Dash specifically beats the alternatives in your situation.
</div>

<h2>"I know git. Why should I bother with Docker?"</h2>
<p>Git versions your <strong>code</strong>. Docker versions <strong>the environment that code runs in</strong>.</p>
<p>The mental model if you already use git:</p>

<table style="width:100%;border-collapse:collapse">
<tr><th style="text-align:left;border-bottom:1px solid var(--border);padding:8px 6px">Git</th><th style="text-align:left;border-bottom:1px solid var(--border);padding:8px 6px">Docker</th></tr>
<tr><td style="padding:6px"><code>git commit</code></td><td style="padding:6px">image (immutable snapshot)</td></tr>
<tr><td style="padding:6px">branch / tag</td><td style="padding:6px">image tag (<code>v1.2.0</code>, <code>latest</code>, <code>staging</code>)</td></tr>
<tr><td style="padding:6px"><code>git clone</code></td><td style="padding:6px"><code>docker pull</code></td></tr>
<tr><td style="padding:6px">GitHub / GitLab</td><td style="padding:6px">Docker registry (Docker Hub, GHCR, Harbor)</td></tr>
<tr><td style="padding:6px"><code>package.json</code></td><td style="padding:6px"><code>docker-compose.yml</code></td></tr>
<tr><td style="padding:6px">diff between commits</td><td style="padding:6px">image layers (each RUN/COPY = one layer)</td></tr>
<tr><td style="padding:6px"><code>git revert</code></td><td style="padding:6px"><code>docker compose up image:v1.1.0</code> (instant rollback)</td></tr>
</table>

<p style="margin-top:14px">If you've ever lived through "works locally, doesn't work on the server" or "we need to convince ops to install Redis" — Docker is the answer. <strong>The compose file becomes the source of truth for your entire runtime infrastructure</strong>, exactly like <code>package.json</code> is the source of truth for dependencies.</p>

<h2>The 5 places git-savvy devs get stuck on Docker</h2>
<ol>
  <li><strong>Volumes vs bind mounts</strong> — "where the hell does my database actually live after a restart"</li>
  <li><strong>Networking</strong> — "why can't the <code>web</code> container connect to <code>db</code> when both are running"</li>
  <li><strong>Compose vs Swarm vs Kubernetes</strong> — "do I need K8s for 3 containers?" (no, never)</li>
  <li><strong>Image hygiene</strong> — "why is my Node app 1.2 GB"</li>
  <li><strong>Secrets</strong> — <code>.env</code> in git, the original sin</li>
</ol>
<p>A good Docker UI fixes #1, #2, #5 visually — you no longer need to remember <code>docker network inspect</code> commands at 2 in the morning.</p>

<h2>"OK but why Docker Dash and not Portainer / Dockge / bash scripts?"</h2>

<h3>Portainer</h3>
<ul>
  <li><strong>Everything that matters for any real company is paywalled:</strong> OIDC, SSO, LDAP, audit log, granular RBAC, MFA. Costs <strong>$95/server/year</strong>.</li>
  <li>Compose stacks <strong>live in Portainer's internal database</strong> — if Portainer crashes, your configs vanish from view until you bring it back up.</li>
  <li>GitHub issue <a href="https://github.com/portainer/portainer/issues/3582" target="_blank">#3582</a> is full of users furious that a community-contributed OAuth PR was turned into a paid feature.</li>
</ul>

<h3>Dockge</h3>
<ul>
  <li>Excellent for "compose, beautiful, simple". Compose on disk, not in DB — exactly what you want.</li>
  <li><strong>Limited:</strong> no audit log, no MFA, no RBAC, no serious multi-host, no image scanning.</li>
  <li>If you have 3 containers in a homelab — perfect. If you have a production server — you're behind.</li>
</ul>

<h3>Bash scripts + SSH</h3>
<ul>
  <li>Works until the day you need an audit ("who stopped the prod container at 3 am?") or RBAC ("the new dev should be able to restart but not delete").</li>
  <li>You hold the entire cluster status in your head. Fun for 5 services, dangerously fragile at 50.</li>
</ul>

<h3>Docker Dash</h3>
<ul>
  <li><strong>Everything Portainer Business paywalls, free, in the same package:</strong> OIDC, LDAP, SSO via header, audit log with SHA-256 hash chain (compliance-friendly), three-tier RBAC, MFA with recovery codes, image scanning with Trivy/Grype/Docker Scout, CIS Docker Benchmark integrated.</li>
  <li><strong>Multi-host through SSH tunnel</strong> — no agent on the remote server. Add a new host with an SSH key, done.</li>
  <li><strong>Compose stacks deploy from git repos:</strong> connect a repo, pick a branch, deploy runs <code>docker compose up -d</code> with auto-pull webhooks. One-click rollback.</li>
  <li><strong>Secrets Wizard</strong> (recent) — paste a complete <code>.env</code>, get a hardened bash script that creates <code>*_FILE</code> entries with permissions 600, owner <code>root:docker</code>, optionally with automatic SSH deployment. Plus Rotation Tracker that nags you when secrets expire.</li>
  <li><strong>Certificate Manager</strong> — track PEMs, expiry, CSR generator (RSA 4096 / EC P-256).</li>
  <li><strong>Single binary feel</strong> — one container, no external DB, no Redis, no build step. 80 MB image, 50 MB RAM. Runs on N100 or c5.large with no difference.</li>
  <li><strong>MIT licensed, no telemetry, no signup, no "register your instance"</strong>.</li>
</ul>

<h2>Your workflow with Docker Dash if you already use git</h2>
<pre><code>1. Push to repo with docker-compose.yml
2. Docker Dash detects via webhook
3. Pull the code, docker compose up -d with the new image
4. Audit log: "deploy webhook → user X → commit abc123 → success in 12s"
5. If something breaks: rollback to the previous version from the UI, one click</code></pre>
<p>You get GitOps without Argo CD, without K8s, without Kafka-esque YAML.</p>

<h2>Where to start</h2>
<ul>
  <li>Open <strong>Stacks</strong> in the left menu — connect your first git repo</li>
  <li>Open <strong>Hosts</strong> — add a remote server with an SSH key (no agent install needed)</li>
  <li>Open <strong>System → Secrets → Audit & Wizard</strong> — paste a real <code>.env</code> file and watch it classify 20+ secret types and generate a hardened setup script</li>
  <li>Open <strong>System → Audit Log</strong> — see the full hash-chained trail of every action since installation</li>
</ul>
`,
      content_ro: `
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
`,
    },
  ];

  const insertOrUpdate = db.prepare(`
    INSERT INTO howto_guides (slug, title, title_ro, category, difficulty, icon, summary, summary_ro, content, content_ro, is_builtin)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT(slug) DO UPDATE SET
      title = excluded.title, title_ro = excluded.title_ro,
      category = excluded.category, difficulty = excluded.difficulty,
      icon = excluded.icon, summary = excluded.summary, summary_ro = excluded.summary_ro,
      content = excluded.content, content_ro = excluded.content_ro,
      is_builtin = 1
  `);
  for (const g of guides) {
    insertOrUpdate.run(g.slug, g.title, g.title_ro, g.category, g.difficulty, g.icon, g.summary, g.summary_ro, g.content, g.content_ro);
  }
};

exports.down = function (db) {
  db.prepare(`DELETE FROM howto_guides WHERE slug IN ('why-docker-dash-beginners', 'why-docker-dash-developers') AND is_builtin = 1`).run();
};
