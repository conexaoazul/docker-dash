---
title: Docker Dash for Developers Using Git
summary: 'You know git and CI/CD but haven''t bought into Docker yet? The git → Docker mental bridge, the 5 stuck points, and why Docker Dash beats Portainer + Dockge + bash scripts for your situation.'
category: basics
difficulty: intermediate
icon: fab fa-git-alt
---


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

