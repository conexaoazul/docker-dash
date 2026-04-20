'use strict';

// Bilingual How-To guide for v6.6 Container Remediation Wizard.

exports.up = function (db) {
  const guide = {
    slug: 'container-remediation-wizard',
    title: 'Remediate Container Security Issues via the Wizard',
    title_ro: 'Remediază problemele de securitate ale containerelor prin wizard',
    category: 'security',
    difficulty: 'intermediate',
    icon: 'fas fa-tools',
    summary: 'Fix common Docker security issues (privileged mode, missing limits, plain-text secrets, etc.) in 3 clicks with a dry-run preview, auto-rollback on failure, and an option to open a Git PR instead of applying live.',
    summary_ro: 'Rezolvă problemele comune de securitate Docker (privileged, limite lipsă, secrete plain-text, etc.) în 3 click-uri cu preview dry-run, auto-rollback la eșec, și opțiune să deschizi un Git PR în loc de apply live.',
    content: `<h2>What the wizard does</h2>
<p>The Remediation Wizard turns the existing Secrets Audit and CIS Benchmark findings into <strong>actionable fixes</strong>. You pick findings → see a YAML diff of the compose file + the exact CLI commands → apply live (with auto-rollback on failure) OR open a Git PR for review.</p>

<h2>When to use</h2>
<ul>
  <li>You ran the Secrets Audit (System → Secrets → Audit & Wizard) and see containers with issues → click the <strong>Fix</strong> button on that row</li>
  <li>A whole stack has multiple containers with recurring issues → click the <strong>cubes</strong> icon to fix the stack in one flow</li>
  <li>You want to review changes in Git before applying — use the <strong>Generate Git PR</strong> mode</li>
</ul>

<h2>The 20-entry remediation catalog</h2>
<p>Every fix maps to a known-good remediation. 4 of them apply <strong>live (zero downtime)</strong> via <code>docker update</code>:</p>
<ul>
  <li>Memory limit (CIS 5.10)</li>
  <li>CPU limit (CIS 5.11)</li>
  <li>PIDs limit</li>
  <li>Restart policy</li>
</ul>
<p>The other 16 require container recreation. The wizard shows the estimated downtime per finding and the total.</p>

<h2>3-step flow</h2>
<h3>Step 1 — Scope & findings</h3>
<p>Shows every applicable finding with severity badge (critical / warn / info) and "RECREATE" or "LIVE" badge. Critical + warn findings pre-selected by default. Info findings hidden by default — toggle "Show info severity" to review them.</p>

<h3>Step 2 — Preview diff</h3>
<p>Per container, an expandable section shows:</p>
<ul>
  <li><strong>Live update commands</strong> (if any) — zero downtime <code>docker update ...</code> calls</li>
  <li><strong>Compose YAML diff</strong> — GitHub-style red/green with line numbers, showing exactly what will change in the compose file on disk</li>
  <li><strong>Findings applied</strong> — with per-finding risk notes (e.g., "HIGH RISK: read_only: true can break apps that write outside tmpfs")</li>
</ul>

<h3>Step 3 — Apply</h3>
<p>Three modes:</p>
<ol>
  <li><strong>Apply live + recreate</strong> (default) — run live updates first, then recreate containers in <code>depends_on</code> order. Health check per container. <strong>Auto-rollback</strong> if any container fails health check (restores pre-apply compose file + re-recreates).</li>
  <li><strong>Generate Git PR</strong> (only for git-backed stacks) — clone repo, create branch <code>docker-dash/remediate-&lt;planId&gt;</code>, apply compose diff, commit, push. Does NOT touch running containers. The webhook auto-pull takes over when the PR is merged. Safest option.</li>
  <li><strong>Download patch</strong> (always available) — export a <code>.patch</code> file + shell script. Apply manually later. Escape hatch for offline / air-gapped setups.</li>
</ol>

<h2>Auto-rollback window</h2>
<p>After a successful apply, a <strong>60-second rollback window</strong> opens. The UI shows a "Rollback" button that restores the pre-apply compose file + re-recreates the containers. After 60 seconds, the window closes and rollback is no longer available via UI (you'd need to restore from a backup).</p>

<h2>What gets audit-logged</h2>
<p>Every action is hash-chained in the audit log (System → Audit):</p>
<ul>
  <li><code>remediate_plan</code> — plan generated, with scope + finding codes</li>
  <li><code>remediate_apply_start</code> — job started with plan SHA</li>
  <li><code>remediate_apply_success</code> / <code>_failed</code> / <code>_rolled_back</code></li>
  <li><code>remediate_pr_created</code> — branch + PR URL</li>
</ul>

<h2>Common errors and fixes</h2>
<table style="width:100%;border-collapse:collapse;font-size:12px">
<tr><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Error</th><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Cause</th><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Fix</th></tr>
<tr><td style="padding:6px">"Service failed health check: crash_loop"</td><td style="padding:6px">Fix broke the container — e.g., <code>read_only: true</code> on a container that writes outside tmpfs</td><td style="padding:6px">Auto-rollback ran. Review the YAML diff to identify which change. Re-run with fewer findings selected, or use Git-PR mode to test in a branch.</td></tr>
<tr><td style="padding:6px">"A remediation is already in progress"</td><td style="padding:6px">Concurrent job on same container / stack</td><td style="padding:6px">Wait for the other job to finish (view /api/remediate/jobs). One job per scope at a time.</td></tr>
<tr><td style="padding:6px">"Service 'X' not found in compose file"</td><td style="padding:6px">Compose labels point to a file that was edited manually</td><td style="padding:6px">Ensure the service name in compose matches the container label. Use artifact mode if compose has drifted.</td></tr>
<tr><td style="padding:6px">"Git-PR mode requires exactly one stack"</td><td style="padding:6px">Tried to PR a mix of stacks</td><td style="padding:6px">PR one stack at a time.</td></tr>
</table>

<h2>Catalog coverage</h2>
<p>v6.6 ships 20 catalog entries covering CIS Docker Benchmark 5.3–5.31 + Secrets Audit's plain-text-env-secret finding. Community PRs welcome for more — the pattern is a 30-line module in <code>src/services/remediation-catalog.js</code>.</p>

<h2>What the wizard does NOT do (v6.6)</h2>
<ul>
  <li>Auto-apply without confirmation (no "Level 5" — too risky)</li>
  <li>Test the fix on a sandbox clone first (deferred to v6.7)</li>
  <li>AI-suggested image-specific fixes (v7+)</li>
  <li>Remote-host compose edits via SSH (v6.7; today local host only for Apply mode; Git-PR works for any host)</li>
</ul>
`,
    content_ro: `<h2>Ce face wizard-ul</h2>
<p>Remediation Wizard transformă findings-urile din Secrets Audit și CIS Benchmark în <strong>remedieri aplicabile</strong>. Alegi findings-urile → vezi un diff YAML al fișierului compose + comenzile CLI exacte → aplici live (cu auto-rollback la eșec) SAU deschizi un Git PR pentru review.</p>

<h2>Când să folosești</h2>
<ul>
  <li>Ai rulat Secrets Audit (System → Secrets → Audit & Wizard) și vezi containere cu probleme → click pe butonul <strong>Fix</strong> pe rândul respectiv</li>
  <li>Un stack întreg are mai multe containere cu probleme recurente → click pe iconița <strong>cubes</strong> pentru a repara stack-ul într-un singur flow</li>
  <li>Vrei să revizuiești schimbările în Git înainte să le aplici — folosește modul <strong>Generate Git PR</strong></li>
</ul>

<h2>Catalog cu 20 de remedieri</h2>
<p>Fiecare fix mapează la o remediere cunoscută. 4 se aplică <strong>live (zero downtime)</strong> via <code>docker update</code>:</p>
<ul>
  <li>Memory limit (CIS 5.10)</li>
  <li>CPU limit (CIS 5.11)</li>
  <li>PIDs limit</li>
  <li>Restart policy</li>
</ul>
<p>Celelalte 16 necesită recrearea containerului. Wizard-ul arată downtime-ul estimat pe finding și totalul.</p>

<h2>Flux în 3 pași</h2>
<h3>Pas 1 — Scope & findings</h3>
<p>Afișează fiecare finding aplicabil cu badge de severitate (critical / warn / info) și badge "RECREATE" sau "LIVE". Findings critical + warn sunt pre-selectate default. Info-urile sunt ascunse default — toggle "Show info severity" pentru a le revizui.</p>

<h3>Pas 2 — Preview diff</h3>
<p>Per container, o secțiune expandabilă arată:</p>
<ul>
  <li><strong>Comenzi de live update</strong> (dacă există) — apel-uri <code>docker update ...</code> zero-downtime</li>
  <li><strong>Diff YAML pe compose</strong> — stil GitHub roșu/verde cu numere de linii, arătând exact ce se va schimba în fișierul compose de pe disk</li>
  <li><strong>Findings aplicate</strong> — cu note de risc per finding (ex: "HIGH RISK: read_only: true poate strica aplicațiile care scriu în afara tmpfs")</li>
</ul>

<h3>Pas 3 — Apply</h3>
<p>Trei moduri:</p>
<ol>
  <li><strong>Apply live + recreate</strong> (default) — rulează live updates prima oară, apoi recreează containerele în ordinea <code>depends_on</code>. Health check per container. <strong>Auto-rollback</strong> dacă orice container eșuează health check-ul (restaurează fișierul compose pre-apply + re-recreează).</li>
  <li><strong>Generate Git PR</strong> (doar pentru stack-uri git-backed) — clonează repo-ul, creează branch <code>docker-dash/remediate-&lt;planId&gt;</code>, aplică diff-ul compose, commit, push. NU atinge containerele care rulează. Webhook-ul auto-pull preia când PR-ul e mergeat. Cea mai sigură opțiune.</li>
  <li><strong>Download patch</strong> (mereu disponibil) — exportă un fișier <code>.patch</code> + shell script. Îl aplici manual mai târziu. Escape hatch pentru setup-uri offline / air-gapped.</li>
</ol>

<h2>Fereastră de auto-rollback</h2>
<p>După un apply reușit, se deschide o <strong>fereastră de rollback de 60 secunde</strong>. UI-ul afișează butonul "Rollback" care restaurează fișierul compose pre-apply + re-recreează containerele. După 60 secunde, fereastra se închide și rollback nu mai e disponibil via UI (ai nevoie de restaurare din backup).</p>

<h2>Ce se audit-loghează</h2>
<p>Fiecare acțiune e hash-chained în audit log (System → Audit):</p>
<ul>
  <li><code>remediate_plan</code> — plan generat, cu scope + codes de findings</li>
  <li><code>remediate_apply_start</code> — job început cu plan SHA</li>
  <li><code>remediate_apply_success</code> / <code>_failed</code> / <code>_rolled_back</code></li>
  <li><code>remediate_pr_created</code> — branch + PR URL</li>
</ul>

<h2>Erori comune și fix-uri</h2>
<table style="width:100%;border-collapse:collapse;font-size:12px">
<tr><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Eroare</th><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Cauză</th><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Fix</th></tr>
<tr><td style="padding:6px">"Service failed health check: crash_loop"</td><td style="padding:6px">Fix-ul a stricat containerul — ex: <code>read_only: true</code> pe un container care scrie în afara tmpfs</td><td style="padding:6px">Auto-rollback a rulat. Revizuiește diff-ul YAML pentru a identifica care schimbare. Re-rulează cu mai puține findings selectate, sau folosește Git-PR mode pentru a testa într-un branch.</td></tr>
<tr><td style="padding:6px">"A remediation is already in progress"</td><td style="padding:6px">Job concurent pe același container / stack</td><td style="padding:6px">Așteaptă să se termine celălalt job (view /api/remediate/jobs). Un job per scope la un moment.</td></tr>
<tr><td style="padding:6px">"Service 'X' not found in compose file"</td><td style="padding:6px">Label-urile compose pointează către un fișier care a fost editat manual</td><td style="padding:6px">Asigură-te că numele serviciului din compose matchează label-ul containerului. Folosește artifact mode dacă compose-ul a devenit desincronizat.</td></tr>
<tr><td style="padding:6px">"Git-PR mode requires exactly one stack"</td><td style="padding:6px">Ai încercat să faci PR la un mix de stack-uri</td><td style="padding:6px">PR câte un stack la un moment.</td></tr>
</table>

<h2>Acoperirea catalog-ului</h2>
<p>v6.6 livrează 20 de intrări în catalog acoperind CIS Docker Benchmark 5.3–5.31 + finding-ul plain-text-env-secret din Secrets Audit. PR-uri din comunitate binevenite pentru mai multe — pattern-ul e un modul de 30 de linii în <code>src/services/remediation-catalog.js</code>.</p>

<h2>Ce NU face wizard-ul (v6.6)</h2>
<ul>
  <li>Auto-apply fără confirmare (fără "Level 5" — prea riscant)</li>
  <li>Testează fix-ul pe un clone sandbox primul (amânat pentru v6.7)</li>
  <li>Fix-uri specifice imaginilor sugerate de AI (v7+)</li>
  <li>Edit-uri compose pe host remote via SSH (v6.7; azi doar local host pentru Apply mode; Git-PR merge pe orice host)</li>
</ul>
`,
  };

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
  insertOrUpdate.run(guide.slug, guide.title, guide.title_ro, guide.category, guide.difficulty, guide.icon, guide.summary, guide.summary_ro, guide.content, guide.content_ro);
};

exports.down = function (db) {
  db.prepare(`DELETE FROM howto_guides WHERE slug = 'container-remediation-wizard' AND is_builtin = 1`).run();
};
