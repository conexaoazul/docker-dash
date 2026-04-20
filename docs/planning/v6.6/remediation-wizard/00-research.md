# Container Remediation Wizard — Research Report

**Status:** Research (pre-brainstorm) · 2026-04-20
**Target release:** v6.6
**Companion:** brainstorm → feature-spec → deep-spec → preflight → implementation (full pipeline per `CLAUDE.md`)

Research conducted via Opus-assisted competitive review + codebase inspection. This document is input to the brainstorm; it does NOT make final scope decisions.

---

## 1. Executive summary

- **What we're building.** A modal-based wizard that turns the existing CIS Benchmark + Secrets Audit findings into *actionable fixes*. Users pick a single container or an entire Compose stack, review a proposed YAML + `docker update` patch set, preview the diff, and apply. Every action hashes into the existing audit chain.
- **Why now.** Every competitor — Portainer, Komodo, Dockge, Yacht — either stops at *policy enforcement* (block-at-create) or at *text advice* ("drop privileged"). No open-source Docker UI currently closes the flag-to-fix loop with a guided diff-preview-apply flow. Genuine, defensible differentiator.
- **Key decision.** Ship v1 as a unified wizard with two entry points (container or stack) at **automation level 3 ("Dry-run preview → Apply with confirmation")**, not level 4 or 5. Git-repo-backed stacks get a bonus mode: "open a PR against the Git repo" (level 2.5, artifact-generating). Level 5 auto-apply stays explicitly out of scope.
- **Rough effort.** ~12–16 dev days for v1: remediation catalog (~3d), wizard UI reusing 3-step modal (~3d), diff renderer (~2d), backend apply engine with recreate-vs-update router (~4d), audit log integration + tests (~2d), Git-PR mode (~1d), docs (~1d). No new services required; it's a composition of what Docker Dash already has.
- **Differentiator, one line.** *"Docker Dash doesn't just tell you your container is insecure. It shows you the exact compose diff, runs `docker update` live where possible, recreates safely where not, and logs every change to a tamper-evident audit chain — all behind one button."*

---

## 2. Competitive landscape

### Who flags vs. who fixes

| Tool | Flags | Text fix | Artifact | In-tool apply | Notes |
|---|:---:|:---:|:---:|:---:|---|
| **Portainer BE** | ✅ | partial | ❌ | partial (RBAC/policy at create) | "Security & constraints" is *prevention*, not *repair*. No post-hoc diff + repair wizard. |
| **Docker Scout** | ✅ | ✅ | ✅ (GH PR to Dockerfile) | ❌ | Real "View fixes" side panel. **Scope = image CVEs only — not runtime misconfig.** |
| **Komodo** | ❌ | ❌ | ❌ | ❌ | Deployment engine; no scanning. |
| **Dockge / Yacht** | ❌ | ❌ | ❌ | ❌ | Whitespace for us. |
| **docker-bench-security** | ✅ | ✅ (CLI text) | ❌ | ❌ | CIS gold standard. Pure CLI. |
| **Trivy / Trivy Operator (K8s)** | ✅ | ✅ (text `remediation` field) | ❌ | ❌ | Flags misconfigs; text-only. |
| **Kubescape** | ✅ | ✅ | ✅ (VAP auto-remediation, PR generation) | ✅ (operator mode) | K8s-only. **Nearest prior-art to what we propose.** |
| **Snyk IaC / Checkov** | ✅ | ✅ | ✅ (HCL snippets) | ✅ (`/apply` PR comment) | Best-in-class PR-comment UX. |
| **Dependabot** | ✅ | n/a | ✅ (PR) | ✅ (auto-merge) | Minimum-viable-version bump. |
| **AWS Inspector + Security Hub** | ✅ | ✅ | ✅ (SSM runbook) | ✅ (via Automation) | Enterprise; workflow model well-copied. |
| **Azure Defender for Cloud** | ✅ | ✅ | partial | ✅ ("Fix" button) | **"Fix" button on recommendation card is the single clearest UI pattern to steal.** |
| **Wiz** | ✅ | ✅ (AI contextual) | ✅ | ✅ (workflows) | "Self-Healing Cloud" = rule-driven auto-remediation with human-in-the-loop approval. Workflow skeleton worth copying. |

### Distilled verdict

- **Flag-only tools** are rarely loved. Users complain about "audit fatigue".
- **Artifact-generating tools** are loved when artifact is *reviewable* and *reversible*. PR model wins because Git is the rollback.
- **In-place apply** works for trivial fixes; feared for risky ones. **Gating UX is everything.**

### UI patterns worth stealing

1. **Azure Defender "Fix" button** — one button per finding, parameters dialog, apply.
2. **Snyk `/fix` slash-command in PR comments** — bulk-apply without leaving review flow.
3. **Docker Scout side-panel hierarchy (Recommended + Quick fixes)** — rank multiple fixes per issue.
4. **Kubescape's cluster-compatibility pre-check** — verify the fix is compatible BEFORE generating.
5. **Wiz workflow model** — finding → plan → approve → apply → verify → log.

---

## 3. Remediation catalog

Each entry maps a finding from `src/services/cis-benchmark.js` (C-1…C-12) + Secrets Audit to a concrete fix. Sources: OWASP Docker Security Cheat Sheet, CIS Docker Benchmark 5.x, `docker update` docs.

| # | Finding | Sev | Compose fix (YAML) | `docker update` live? | Requires recreate? | CIS |
|---|---|---|---|---|---|---|
| 1 | Privileged mode (C-1) | fail | Remove `privileged: true`. Add `cap_add:` list if needed. | ❌ | ✅ | 5.4 |
| 2 | `cap_add: [ALL]` (C-2) | fail | `cap_drop: [ALL]` + minimal `cap_add:` | ❌ | ✅ | 5.3 |
| 3 | Dangerous caps (SYS_ADMIN, NET_ADMIN, SYS_PTRACE) | warn | Remove from `cap_add` | ❌ | ✅ | 5.3 |
| 4 | Missing `no-new-privileges` (C-3) | warn | `security_opt: ["no-new-privileges:true"]` | ❌ | ✅ | 5.25 |
| 5 | `pid: host` (C-4) | fail | Remove | ❌ | ✅ | 5.28 |
| 6 | `network_mode: host` (C-5) | warn | Remove; use user-defined bridge | ❌ | ✅ | 5.29 |
| 7 | `ipc: host` (C-6) | warn | Remove | ❌ | ✅ | 5.16 |
| 8 | Writable root FS (C-7) | info | `read_only: true` + `tmpfs: [/tmp, /var/run]` | ❌ | ✅ | 5.12 |
| 9 | No memory limit (C-8) | warn | `mem_limit: 512m` | **✅** `docker update --memory 512m` | ❌ | 5.10 |
| 10 | No CPU limit (C-9) | info | `cpus: '1.0'` | **✅** `docker update --cpus 1` | ❌ | 5.11 |
| 11 | Sensitive bind RW (C-10) | fail | `:rw`→`:ro` | ❌ | ✅ | 5.5 |
| 12 | Docker socket RW | warn | `:ro` or socket-proxy | ❌ | ✅ | 5.31 |
| 13 | Privileged ports <1024 (C-11) | info | Remap via reverse proxy | ❌ | ✅ | 5.7 |
| 14 | Running as root (C-12) | warn | `user: "1000:1000"` | ❌ | ✅ | 4.1 |
| 15 | No PID limit | info | `pids_limit: 100` | **✅** `docker update --pids-limit 100` | ❌ | — |
| 16 | No restart policy | info | `restart: unless-stopped` | **✅** `docker update --restart unless-stopped` | ❌ | — |
| 17 | Plain-text env secret | fail | `_FILE` pattern + `secrets:` block | ❌ | ✅ | — |
| 18 | Image `:latest` / no digest pin | warn | `image: nginx@sha256:...` | ❌ | ✅ | 4.2 |
| 19 | No healthcheck | info | `healthcheck: {...}` | ❌ | ✅ | — |
| 20 | Unbounded logging | info | `logging: { driver: json-file, options: { max-size: 10m } }` | ❌ | ✅ | 2.12 |

**Key insight:** only **4 of 20** fixes (memory, CPU, pids, restart) are live-updatable. Every other hardening fix requires container recreation. This fundamentally shapes the UX — the tool must be honest about downtime from step 1.

---

## 4. UI pattern recommendation — 3-step modal

### Steps

1. **Scope & scan.** Auto-filled if entry was from audit table. Sortable list of findings with severity badge, title, affected container(s), "recreation required" badge, checkbox. Toggle "show info-severity too" (off by default — reduce fatigue). Group findings sharing a root cause (e.g., 10 containers missing `no-new-privileges`) → fix class in one action. **Azure Defender "Fix" pill per row.**

2. **Preview.** The big one. Left pane: compose YAML before. Right pane: compose YAML after, with additions green / removals red (CodeMirror merge view or unified diff). Below: collapsible "CLI commands we'll run" showing `docker update` for live-apply + `docker compose up -d` for recreate. Estimated-downtime badge per container ("~2s restart" vs "no restart"). **This is the "dry-run preview" users want.**

3. **Apply & verify.** Three radio options:
   - **Apply live + recreate** — run live-updatable fixes first (zero downtime), then `docker compose up -d` for the rest. Default.
   - **Generate Git PR** (only if stack is Git-backed) — commit to new branch, optionally push + open PR. Does NOT touch running container — relies on existing webhook auto-pull loop.
   - **Download patch** — export unified diff + `remediate.sh`. Escape hatch for offline / air-gapped.

   After apply: re-run the audit, show before/after score delta ("78/100 → 94/100"), link to audit log entry with chain hash.

### Why this UI

- Reuses existing 3-step modal convention (Secrets Wizard, LE Wizard, CSR). Zero user-retraining.
- Visual diff is **non-negotiable** — every loved tool shows before/after. Text-only is what makes docker-bench tedious.
- "Recreation required" is front-and-center, not buried.
- Batch by default + "apply one" — mirrors Snyk/Azure mental model.

### What NOT to build in v1

- No separate page — modal only.
- No linear scroll-page — too much data without chunking.
- No approval workflow (requester → approver) — single-user tool.

---

## 5. Scope — container / stack / both

**Recommendation: Option B — unified wizard, two entry points.**

| Option | Pros | Cons | Effort |
|---|---|---|---|
| A — separate flows | Simple per-surface | Code duplication; stack wizard is 90% same logic | Low-medium (high maintenance) |
| **B — unified, N containers** | DRY; stack = filter; consistent UI whether fixing 1 or 20 | Scope step needs clear count UX | **Medium** |
| C — loop per-container + aggregate | Matches "stack is list" mental model | Double the steps; noisy per-container diff; 10 approvals | Medium-high |

Data model is already uniform — stack = containers with `com.docker.compose.project=<name>` label. Wizard accepts array of container IDs; scope step tells user how many are in play.

### Entry points for v1

1. **Security page → finding row → "Fix" button** (single container, pre-filtered).
2. **Stack detail page → top-right "Remediate" button** (all containers, all findings).
3. **(Nice-to-have) CIS Benchmark page → "Fix all failing"** batch (all scanned, fails only).

---

## 6. Automation level

**Target: Level 3 (Dry-run preview) → Level 4 (Apply with confirmation). Offer Level 2 (artifact download) as escape hatch. No Level 5.**

| Level | What | v1? |
|---|---|---|
| 1 | Text advice | ❌ (what we have today, the problem) |
| 2 | Generated artifact | ✅ escape hatch |
| 3 | Dry-run preview | ✅ mandatory |
| 4 | Apply with confirmation | ✅ the point |
| 5 | Auto-apply + undo | ❌ too risky |

### Bonus tier 2.5 — Git-PR mode (first-class in v1)

For stacks from Git repos (we already have webhook auto-pull), offer **"Open PR against the repo"** alongside "Apply live":

- Generate YAML diff → commit to `docker-dash/remediate-<sha>` branch → push → optionally open PR (GitHub / GitLab / Gitea via `services/git.js`).
- Does NOT apply locally. Webhook auto-pull picks up the merge.
- Same pattern as Kubescape / Snyk — PR is the change surface, Git is the audit trail.
- Safest mode: user reviews diff in normal code-review flow.
- Low-effort — we already have Git integration. Strongest differentiator vs Portainer.

---

## 7. Risks

Ranked likelihood × impact.

| # | Risk | L | I | Mitigation |
|---|---|---|---|---|
| 1 | `read_only: true` breaks app writing outside tmpfs | **H** | M | (a) Auto-suggest common tmpfs paths based on image heuristics; (b) post-apply health check — if CrashLoops <60s, auto-rollback; (c) yellow banner on high-break-rate fixes. |
| 2 | Stack-wide recreate in wrong order → app down | M | **H** | Honor `depends_on`; topological order. Without `depends_on`, 1 service at a time + 10s pause + health check between. |
| 3 | Live `docker update --memory` below current RSS → OOMKill | M | M | Pre-check `memory_stats.usage`. Refuse limits < current RSS × 1.5. |
| 4 | Fix breaks image needing capability (VPN needs NET_ADMIN) | M | M | Per-image hint database. Start with common images (tailscale, wireguard, pihole). For unknown: "verify manually" note. |
| 5 | Stack is Git-managed; local fix overwritten on next pull | M | **H** (silent regression) | **Git-PR mode is default for git-backed stacks.** Blocking warning if user insists on local-apply. |
| 6 | Audit log chain compromised if fix breaks Docker Dash itself | L | H | Never self-remediate without explicit confirm + backup. |
| 7 | Remote SSH disconnect mid-apply → partial state | L | M | Transaction semantics; record last-successful step; surface "resume" action. |

---

## 8. Integration plan

### Critical for v1

1. **Audit log** (`src/services/audit.js`) — hash-chained entries for open/preview/apply-started/succeeded/failed/rolled-back. Mirror `secrets-wizard/deploy-remote` audit shape.
2. **CIS benchmark** (`src/services/cis-benchmark.js`) — extend findings with structured `remediationId` (e.g., `CIS-5.4-privileged`). Today findings are free-text `msg` field.
3. **Secrets Audit** — secondary input. Findings with `remediationId: SECRET-ENV-PLAINTEXT` route to existing Secrets Wizard via "Continue in Secrets Wizard" button.
4. **Multi-host SSH** (`src/services/ssh-tunnel.js`) — remote host containers use existing tunnel; Dockerode client already scoped.

### Nice-to-have for v1

5. **Git integration** (`src/services/git.js`) — enables "Open PR" mode. Already in codebase.
6. **Scheduled actions** — "apply at 02:00" via existing jobs system.

### Defer to v2

7. Sandbox containers for "test fix on clone first" — static checks don't reliably catch `read_only` breakage anyway.
8. Notification channels — audit log is enough for v1.
9. Rotation hand-off — lives in Secrets Wizard.

---

## 9. Proposed v1 scope + effort

### In scope

- Remediation catalog module `src/services/remediationCatalog.js` — 20 entries. Shape: `{ code, title, severity, liveUpdatable, requiresRecreation, composePatch(inspect) → YAML diff, cliCommands(inspect) → string[], riskNotes }`.
- `src/services/remediate.js` — `plan(containerIds[])` + `apply(planId)` + rollback. Audit-chained.
- Extend `cis-benchmark.js` findings with structured `code`. Breaking change to 1 caller (Security page).
- `src/routes/remediate.js` — `POST /plan`, `POST /apply`, `POST /pr`, `GET /:id/status`.
- `public/js/components/remediate-wizard.js` — modal, 3 steps, CodeMirror merge view.
- Entry-point hooks in `public/js/pages/security.js` + `public/js/pages/stacks.js`.
- Health-check + auto-rollback.
- Git-PR mode.
- Unit + integration tests.

### Out of scope (→ v2)

- Level 5 auto-apply / scheduled rollouts
- Sandbox-clone testing
- AI-suggested image-specific fixes
- Cross-stack fleet remediation
- Notification integrations beyond audit log
- i18n (English only v1; keys added for future)

### Effort

| Task | Days |
|---|---|
| Remediation catalog + tests | 3 |
| `remediate.js` service (plan/apply/rollback/health) | 4 |
| REST routes + authZ | 1 |
| Wizard modal UI + diff renderer | 3 |
| Entry hooks (security, stacks) + polish | 1 |
| Git-PR mode (reuses `services/git.js`) | 1 |
| Integration tests, smoke, audit verification | 2 |
| Docs + CHANGELOG | 1 |
| **Total** | **~16 days** solo / ~9 parallelized |

---

## 10. v2 / future

- **Level 5 with undo timer** — "Revert within 5 min" floating banner. Requires snapshotting pre-apply container definition.
- **Fleet mode** — 10 stacks × 3 hosts, "add no-new-privileges to all" in one plan. Needs queue + progress page.
- **AI-suggested fixes** (optional, gated behind API key) — for uncached issues, call LLM with image + inspect output, show suggestion with "verify manually" badge.
- **Per-image hint database** — crowd-sourced or first-party list of required caps / tmpfs paths / healthchecks. Turns mitigation from reactive to predictive.
- **Integration with `securityAlerts`** — when alert fires, auto-open wizard scoped to that finding.
- **Sandbox-clone mode** — once catalog mature enough for clone-based regression testing.
- **Policy mode** — turn findings+fixes into preventive admission-style policy ("refuse to start container without no-new-privileges"). Blurs into Portainer territory but closes loop to admission-time.
- **Expand CIS scan coverage** — current covers ~12 of ~40 relevant CIS 5.x items. Gaps: seccomp (5.21), AppArmor per-container (5.1), ulimits (5.18), cgroup usage (5.24).

---

## Bottom line

Docker Dash is uniquely positioned. It already has the four pillars:
- Structured scanning (CIS + secrets)
- Compose-on-disk (can safely diff YAML)
- Git integration (can open PRs)
- Hash-chained audit (can prove what changed)

Portainer has none of the first three in combination. Komodo has deployment but no scanning. Docker Scout has scanning but no compose ownership. **Nobody ships the "scan → diff → apply or PR → verify → audit" loop in one OSS tool.**

Steal the **Azure "Fix" button** (entry), **Snyk diff-in-PR** (review), **Kubescape compatibility pre-check** (safety), **Wiz workflow skeleton** (state machine). Ship **Level 3+4 with Git-PR as first-class third option.** Skip Level 5 and sandbox-clone for v1.

**v1 = ~16 solo days / ~9 parallelized.** Right-sized feature.

---

## Sources

- [Docker container update — Docker Docs](https://docs.docker.com/reference/cli/docker/container/update/)
- [Remediation with Docker Scout — Docker Docs](https://docs.docker.com/scout/policy/remediation/)
- [Portainer Security and compliance](https://docs.portainer.io/advanced/security)
- [OWASP Docker Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html)
- [docker/docker-bench-security](https://github.com/docker/docker-bench-security)
- [aquasecurity/trivy-operator](https://github.com/aquasecurity/trivy-operator)
- [kubescape/kubescape](https://github.com/kubescape/kubescape)
- [Snyk Pull Requests docs](https://docs.snyk.io/scan-with-snyk/pull-requests)
- [Remediate recommendations — Microsoft Defender for Cloud](https://learn.microsoft.com/en-us/azure/defender-for-cloud/implement-security-recommendations)
- [AWS Inspector + Security Hub](https://docs.aws.amazon.com/inspector/latest/user/securityhub-integration.html)
- [Introducing Wiz Workflows](https://www.wiz.io/blog/introducing-wiz-workflows)
- [Docker Compose Security Best Practices](https://compose-it.top/posts/docker-compose-security-best-practices)
