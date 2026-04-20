# Feature Spec — Container Remediation Wizard

**Status:** Draft v1 · 2026-04-20
**Target release:** v6.6
**Companion:** `00-research.md` (decisions + catalog + competitive landscape)

This is the implementation contract. Reviewers should be able to verify each section as a checkable acceptance criterion.

---

## 1. Goals

1. Admin can fix a single container's security issue in ≤3 clicks from the Security page
2. Admin can fix all issues across a Compose stack in ≤5 clicks
3. Before any change is applied, the user sees a visual diff of the affected compose YAML + the exact CLI commands that will run
4. For git-backed stacks, admin can open a PR against the Git repo instead of applying locally
5. 20 remediation patterns implemented in v1 (per catalog in `00-research.md §3`) covering all current CIS findings + the top Secrets Audit findings
6. Live-updatable fixes (`docker update --memory/--cpus/--pids-limit/--restart`) apply with zero downtime; others cleanly recreate with health-check + auto-rollback
7. Every action hash-chained into the existing audit log

## 2. Non-goals (v1)

1. Auto-apply (Level 5) / scheduled rollouts → v2
2. Sandbox-clone "test fix on copy first" → v2
3. AI-suggested image-specific fixes → v2
4. Cross-stack fleet remediation → v2
5. i18n (English only v1; keys added for future translation)
6. Multi-user approval workflow (single-user tool)

## 3. User-facing flow

### Entry points

1. **Security page → finding row → "Fix" button** (single container, pre-filtered to that finding)
2. **System → Secrets → Audit & Wizard → container row → "Remediate" button** (single container, all findings)
3. **Stacks page → stack row → "Remediate" button** (all containers in stack, all findings)
4. **CIS Benchmark page → "Fix all failing" batch button** (all scanned containers, fails only)

### 3-step modal (mirrors existing Secrets/LE wizards)

**Step 1 — Scope & findings**

- Header shows: `N container(s) in scope`, `M finding(s) selected`
- Sortable list of findings (one row per finding × affected container, grouped by root cause):
  - Severity badge (critical/warn/info)
  - Finding title (e.g., "Privileged mode", "No memory limit")
  - Affected: `container-name` (or `stack X: 10 containers`)
  - "Recreation required" yellow badge if applicable
  - Estimated downtime: "~2s restart" or "no restart"
  - Checkbox (pre-checked for critical+warn, unchecked for info)
- Top toolbar:
  - Toggle "Show info severity" (off by default)
  - "Select all" / "Deselect all"
- Footer: Next button enabled only if ≥1 finding selected

**Step 2 — Preview**

- Top: tabs per affected compose file (usually 1, but a stack can span services declared across files)
- Main pane: side-by-side diff
  - Left: compose YAML before
  - Right: compose YAML after, with additions green + removals red
- Below diff: collapsible "CLI commands we'll run":
  - Live updates first: `docker update --memory 512m abc123def456`
  - Then: `docker compose up -d --no-deps service-name` in dependency order
- Below CLI: "Estimated total downtime: ~12 seconds across 3 containers"
- Footer: Back + Next

**Step 3 — Apply mode selection + execution**

Three radio options (stack-dependent):

- **Apply live + recreate** (default for non-git stacks). Runs live updates first, then recreates in dependency order with health-check + 60s rollback window. Live log panel.
- **Generate Git PR** (shown only for git-backed stacks). Commits diff to new branch + optionally pushes + opens PR. Does NOT touch running containers. Live log shows git operations.
- **Download patch** (always available). Exports `remediate.patch` (unified diff) + `remediate.sh` + `ROLLBACK.md`. User applies manually.

Execute button → live log panel → on success: re-run audit, show score delta, green check. On failure → red X + error class + suggested recovery + "Rollback" button (if live-apply).

## 4. Backend architecture

```
┌──────────────────────────────────────────────────────────┐
│ public/js/components/remediate-wizard.js (modal)         │
└────────────────────────┬─────────────────────────────────┘
                         │ HTTP (+ WS for live log)
                         ▼
┌──────────────────────────────────────────────────────────┐
│ src/routes/remediate.js                                  │
│ - POST /plan         → returns plan object              │
│ - POST /apply        → returns jobId, starts async      │
│ - POST /pr           → git PR mode                      │
│ - GET  /job/:id      → poll status                      │
│ - POST /job/:id/rollback (within 60s window)            │
└────────────────────────┬─────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│ src/services/remediate.js                                │
│ - plan(findings[]) → RemediationPlan                    │
│ - apply(plan) → JobId + async runner                    │
│ - rollback(jobId)                                       │
│ - openPr(plan, stackId)                                 │
└──┬──────────────┬──────────────┬──────────────────┬─────┘
   │              │              │                  │
   ▼              ▼              ▼                  ▼
┌──────────┐ ┌──────────┐ ┌────────────┐ ┌────────────────┐
│ catalog  │ │ compose- │ │ docker     │ │ services/git,  │
│ .js      │ │ diff.js  │ │ runner.js  │ │ ssh-tunnel,    │
│ 20       │ │ YAML     │ │ update +   │ │ audit          │
│ entries  │ │ parse +  │ │ recreate   │ │ (existing)     │
│          │ │ merge    │ │ ordering   │ │                │
└──────────┘ └──────────┘ └────────────┘ └────────────────┘
```

## 5. Files to create

| Path | Purpose | LOC est |
|---|---|---|
| `src/db/migrations/051_remediation_jobs.js` | `remediation_jobs` table + `down()` | 60 |
| `src/services/remediation-catalog.js` | 20 remediation patterns with `code/composePatch/cliCommands/riskNotes` | 500 |
| `src/services/compose-diff.js` | YAML parse (js-yaml) + merge + unified diff output | 200 |
| `src/services/docker-runner.js` | Recreate ordering via `depends_on`, health-check wait, rollback primitive | 250 |
| `src/services/remediate.js` | Orchestrator: plan/apply/rollback/openPr | 300 |
| `src/routes/remediate.js` | HTTP endpoints + authz + audit log hooks | 200 |
| `public/js/components/remediate-wizard.js` | 3-step modal + diff renderer | 500 |
| `src/__tests__/remediation-catalog.test.js` | Every catalog entry: inspect → expected diff | 300 |
| `src/__tests__/compose-diff.test.js` | Parse/merge/diff edge cases | 200 |
| `src/__tests__/remediate-routes.test.js` | Supertest integration | 250 |
| `docs/guides/remediation-wizard.md` + `.ro.md` | User documentation (bilingual) | 150 |

## 6. Files to modify

| Path | Change |
|---|---|
| `src/services/cis-benchmark.js` | Add `remediationId` (structured code like `CIS-5.4-privileged`) next to each `msg` |
| `src/routes/system.js` | Add `remediationId` to secrets-audit findings too |
| `src/server.js` | Mount `/api/remediate` route |
| `public/js/api.js` | Add `Api.remediate*` methods |
| `public/js/pages/security.js` | "Fix" button on each finding row |
| `public/js/pages/system.js` | "Remediate" button on each secrets-audit container row |
| `public/js/pages/stacks.js` | "Remediate" button on each stack row |
| `public/js/pages/cis.js` | "Fix all failing" batch button |
| `CHANGELOG.md`, `whatsnew.js` | v6.6.0 entry |
| `README.md` | Features list + test count badge |

## 7. Database schema

```sql
-- Migration 051_remediation_jobs.js
CREATE TABLE remediation_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mode TEXT NOT NULL,                  -- 'apply-local' | 'apply-ssh' | 'pr' | 'artifact'
  scope_type TEXT NOT NULL,            -- 'container' | 'stack'
  scope_id TEXT NOT NULL,              -- container ID or stack name
  host_id INTEGER NOT NULL DEFAULT 0,
  plan_json TEXT NOT NULL,             -- serialized plan (findings, patches, commands)
  status TEXT NOT NULL DEFAULT 'pending',
  -- 'pending' | 'running' | 'success' | 'failed' | 'rolled_back'
  current_step TEXT DEFAULT '',        -- human-readable progress marker
  output TEXT DEFAULT '',              -- stdout/stderr log
  error_class TEXT,                    -- 'docker' | 'compose' | 'git' | 'health' | 'timeout' | 'rollback' | 'other'
  score_before INTEGER,
  score_after INTEGER,
  pre_apply_snapshot TEXT,             -- JSON of inspect output for rollback
  git_branch TEXT,                     -- set in 'pr' mode
  git_pr_url TEXT,                     -- set in 'pr' mode
  rollback_deadline TEXT,              -- 60s after success; UI shows countdown
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  completed_at TEXT
);
CREATE INDEX idx_remediation_jobs_status ON remediation_jobs(status);
CREATE INDEX idx_remediation_jobs_created_at ON remediation_jobs(created_at);
CREATE INDEX idx_remediation_jobs_scope ON remediation_jobs(scope_type, scope_id);
```

## 8. API surface

All routes under `/api/remediate`, require `admin` role.

### `POST /plan`

Request:
```json
{
  "scope": { "type": "container", "id": "abc123def456" },
  "findings": ["CIS-5.4-privileged", "CIS-5.25-no-new-privileges"]
}
```

OR stack-wide:
```json
{
  "scope": { "type": "stack", "name": "myapp", "hostId": 0 },
  "findings": ["CIS-5.10-no-memory-limit"]
}
```

Response 200:
```json
{
  "planId": "eyJ...base64...",
  "steps": [
    {
      "containerId": "abc123...",
      "containerName": "myapp-web-1",
      "composeFile": "/path/to/docker-compose.yml",
      "composeFileExists": true,
      "service": "web",
      "diff": "--- before\n+++ after\n...",
      "cliCommands": ["docker update --memory 512m abc123..."],
      "requiresRecreation": false,
      "estimatedDowntimeMs": 0
    }
  ],
  "totalDowntimeMs": 12000,
  "gitBacked": true,
  "gitRepoId": 3,
  "warnings": [
    "Container 'myapp-db' has 384MB RSS; proposed mem_limit=512m is tight — consider 1024m"
  ]
}
```

### `POST /apply`

Body: `{ "planId": "eyJ...", "mode": "apply-local" | "apply-ssh" }`

Returns 202: `{ "jobId": 123 }`. Subscribe via WebSocket `acme:remediate-job:123` for live log OR poll `GET /job/:id`.

### `POST /pr`

Body: `{ "planId": "eyJ...", "commitMessage": "optional override", "branchName": "optional override" }`

Returns 202: `{ "jobId": 124, "branchName": "...", "prUrl": null }` (prUrl populated on job completion).

### `POST /job/:id/rollback`

Only valid if job is in `success` state AND `rollback_deadline > now`. Reverts container(s) to pre-apply snapshot. Returns 200 or 409 if outside window.

### `GET /job/:id`

Returns full job state including `output`, `current_step`, `score_before`, `score_after`, `rollback_deadline`.

### `GET /findings/codes`

Returns the complete list of structured remediation codes the catalog supports. Used by frontend to build "filter by finding type" dropdown.

## 9. Catalog entry shape

Each of the 20 entries in `src/services/remediation-catalog.js`:

```js
{
  code: 'CIS-5.4-privileged',
  title: 'Privileged mode',
  severity: 'critical',
  cisRef: '5.4',
  liveUpdatable: false,
  requiresRecreation: true,
  riskLevel: 'medium',  // 'low' | 'medium' | 'high' (high = known-break-rate)
  riskNotes: 'Removing privileged may break containers that need specific capabilities. Check image docs.',

  /**
   * Detect if this remediation applies to this container.
   * @param {object} inspect - full docker inspect output
   * @returns {boolean}
   */
  applies(inspect) {
    return inspect.HostConfig?.Privileged === true;
  },

  /**
   * Generate the compose YAML patch.
   * @param {object} inspect
   * @param {object} composeFile - parsed YAML if available
   * @returns {{ composePatch: object, cliCommands: string[], liveUpdate: string|null }}
   */
  plan(inspect, composeFile) {
    return {
      composePatch: { services: { [inspect.serviceName]: { privileged: null /* remove */ } } },
      cliCommands: [],
      liveUpdate: null,
      notes: 'Container will be recreated.',
    };
  },
}
```

## 10. Acceptance criteria (verifiable)

| # | Criterion | How to verify |
|---|---|---|
| 1 | Fix a single privileged container in ≤3 clicks from Security page | Manual smoke |
| 2 | Fix 10 containers in a stack in ≤5 clicks from Stacks page | Manual smoke |
| 3 | Before/after YAML diff visible in step 2 | Visual review |
| 4 | Live-updatable fix (memory) applies with zero downtime | Load test during apply |
| 5 | Recreate fix triggers controlled restart with `depends_on` order honored | Smoke with multi-service stack |
| 6 | Auto-rollback triggers if container CrashLoops within 60s | Force break (e.g., add bad `read_only` to container that writes to /var/log) |
| 7 | Git-PR mode creates a branch + commits diff + (if configured) opens PR | Integration test against test Gitea repo |
| 8 | Every plan/apply/rollback logged in audit_log with SHA chain | Query after apply |
| 9 | Artifact mode produces copy-paste-able patch + shell script | Download + diff vs hand-written |
| 10 | All 20 catalog entries have unit tests with synthetic inspect inputs | `npm test` |

## 11. Estimated effort

| Task | Days |
|---|---|
| Migration 051 + DB plumbing | 0.5 |
| remediation-catalog.js (20 entries) | 3 |
| compose-diff.js (YAML merge + unified diff) | 1.5 |
| docker-runner.js (recreate order + health + rollback) | 2.5 |
| remediate.js orchestrator | 2 |
| REST routes + WS progress | 1.5 |
| remediate-wizard.js (UI + CodeMirror diff) | 3 |
| Entry-point hooks (security / system / stacks / cis) | 1 |
| Git-PR mode | 1 |
| Unit + integration tests | 2 |
| Docs (bilingual How-To + CHANGELOG) | 1 |
| **Total solo** | **~19 days** |

With dev in 2 parallel tracks (catalog+service vs UI+routes) converging at integration: **~11 days**.

## 12. Release plan

- `v6.6.0-beta1` — feature-complete, available via `:beta` Docker tag
- `v6.6.0-beta2` — fixes from beta1
- `v6.6.0` — stable, default tag updated, blog post + dev.to article

## 13. Open questions

1. Should `compose-diff.js` use `js-yaml` or `yaml` npm package? (Latter preserves comments; former already in deps — verify.)
2. Should rollback snapshot be the full `docker inspect` JSON or just the diff? (Former is safer; more storage. Suggest: inspect JSON, GZIP'd.)
3. For the Git-PR mode, if the repo has no open PR surface (like a private Gitea), should we push the branch and leave PR creation to the user? Or require a connected PR API?
4. Should the wizard support previewing plans for containers the user doesn't have RBAC on? (No — block at step 1 with clear error.)
5. Should we support "dry-run" via `docker compose config` before recreate? Adds safety but complicates flow — skip for v1.

## 14. Decision log

| Decision | Rationale | Date |
|---|---|---|
| Unified wizard (Option B), not per-surface | DRY; stack is just a filter on containers | 2026-04-20 |
| Automation Level 3+4, NO Level 5 | Level 5 risk not worth marginal UX win in v1 | 2026-04-20 |
| Git-PR as first-class third mode | Reuses existing git integration; safest UX for git-backed stacks | 2026-04-20 |
| 20 catalog entries in v1 (not 40+) | Covers all current CIS findings + top Secrets Audit; community PRs for rest | 2026-04-20 |
| Modal UI (not dedicated page) | Matches existing Secrets/LE Wizard convention | 2026-04-20 |
| Rollback window: 60s after apply | Long enough to catch crash-loops; short enough to not pollute UI | 2026-04-20 |
| Storage of pre-apply snapshot: full inspect JSON gzipped | Safer than diff; fits in SQLite TEXT column | 2026-04-20 |
