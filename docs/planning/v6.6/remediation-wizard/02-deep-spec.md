# Deep Spec — Container Remediation Wizard

**Status:** Draft v1 · 2026-04-20
**Companion:** `01-feature-spec.md` (overall contract)

Dives into the parts where wrong choices cost days. Each section has chosen approach + alternatives + rationale.

---

## 1. Catalog entry data shape — detail

Every catalog entry is a stateless module exporting a single object. No classes, no inheritance — copy-paste pattern for contributors.

```js
// src/services/remediation-catalog.js

module.exports = {
  'CIS-5.4-privileged': {
    code: 'CIS-5.4-privileged',
    title: 'Privileged mode',
    category: 'security',
    severity: 'critical',
    cisRef: '5.4',
    liveUpdatable: false,
    requiresRecreation: true,
    riskLevel: 'medium',
    riskNotes: 'Removing privileged may break containers needing specific kernel capabilities. Check image docs.',

    applies(inspect) {
      return inspect.HostConfig?.Privileged === true;
    },

    plan(inspect, composeService) {
      return {
        composePatch: { privileged: null },  // null = deletion marker
        cliCommands: [],
        liveUpdate: null,
        notes: 'Container will be recreated without privileged flag.',
      };
    },
  },

  'CIS-5.10-no-memory-limit': {
    code: 'CIS-5.10-no-memory-limit',
    title: 'No memory limit',
    category: 'resource',
    severity: 'warn',
    cisRef: '5.10',
    liveUpdatable: true,
    requiresRecreation: false,
    riskLevel: 'low',
    riskNotes: 'Safe limit auto-computed as 2× current RSS. If container has high memory variance, consider a higher limit.',

    applies(inspect) {
      return (inspect.HostConfig?.Memory || 0) === 0;
    },

    plan(inspect, composeService) {
      const currentRss = inspect._stats?.memory_stats?.usage || 128 * 1024 * 1024;
      const safeLimit = Math.max(256 * 1024 * 1024, currentRss * 2);
      const limitMb = Math.ceil(safeLimit / (1024 * 1024));
      return {
        composePatch: { mem_limit: limitMb + 'm' },
        cliCommands: [],
        liveUpdate: `docker update --memory ${limitMb}m --memory-swap ${limitMb}m ${inspect.Id}`,
        notes: `Memory limit set to ${limitMb}m (2× current RSS). No restart needed.`,
      };
    },
  },

  // ... 18 more
};
```

### `applies()` contract

- Pure function. No Docker API calls.
- Input: `inspect` output from `docker inspect` + optional `_stats` field (for mem/cpu readings injected by the orchestrator).
- Returns boolean.
- Fast — called for every (container × every catalog entry) combination during planning.

### `plan()` contract

- Pure function in terms of the input. No Docker API calls.
- Input: `inspect` + `composeService` block if compose file was parsed (null otherwise — handle gracefully).
- Returns an object with 4 fields:
  - `composePatch` — YAML patch object (null values = deletions, present values = replacements). Compose-diff engine merges this into the service block.
  - `cliCommands` — array of non-live-update commands (e.g., ones for pre-setup like creating a tmpfs dir).
  - `liveUpdate` — single `docker update ...` command if applicable, else null.
  - `notes` — human-readable explanation rendered in the wizard.

### `composePatch` deletion semantics

Use `null` as a sentinel for "delete this key". Compose-diff engine handles it:

```js
// Before (in compose)
services:
  web:
    privileged: true
    security_opt:
      - seccomp:unconfined

// Patch
{ privileged: null, security_opt: null }

// After
services:
  web:
    (both keys gone)
```

For list surgery (e.g., remove specific `cap_add` entries but keep others), use a more expressive primitive:

```js
{ cap_add: { $remove: ['SYS_ADMIN', 'NET_ADMIN'] } }
```

The compose-diff engine recognizes `$remove` / `$add` / `$replace` prefixed with `$`.

---

## 2. Compose diff engine — choice + implementation

### YAML library decision

Use **`yaml`** (eemeli/yaml) npm package, not `js-yaml`:

- Preserves comments, blank lines, style (single vs double quote, block vs flow)
- Round-trip safe — parse + modify + stringify produces clean output that passes a diff of "only the lines we touched changed"
- Modern, typed, well-maintained

Add `yaml` to `package.json` dependencies.

### Algorithm

```js
// src/services/compose-diff.js
const YAML = require('yaml');
const Diff = require('diff');  // already in overrides (^5.2.2)

function diffComposeFile(filePath, serviceName, patch) {
  const before = fs.readFileSync(filePath, 'utf8');
  const doc = YAML.parseDocument(before);
  const serviceNode = doc.get(['services', serviceName]);
  if (!serviceNode) throw new Error(`Service '${serviceName}' not in ${filePath}`);

  applyPatch(serviceNode, patch);

  const after = String(doc);  // serializes preserving style
  const unified = Diff.createPatch(filePath, before, after, '', '');

  return { before, after, unified };
}

function applyPatch(node, patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      // Deletion
      if (node.has(key)) node.delete(key);
    } else if (value && typeof value === 'object' && value.$remove) {
      // List surgery — remove items
      const list = node.get(key);
      if (YAML.isSeq(list)) {
        for (let i = list.items.length - 1; i >= 0; i--) {
          if (value.$remove.includes(String(list.items[i]))) list.items.splice(i, 1);
        }
      }
    } else if (value && typeof value === 'object' && value.$add) {
      // List surgery — add items
      const list = node.get(key) || new YAML.YAMLSeq();
      if (!node.has(key)) node.set(key, list);
      for (const item of value.$add) {
        if (!list.items.some(i => String(i) === String(item))) list.add(item);
      }
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      // Nested merge
      if (!node.has(key)) node.set(key, new YAML.YAMLMap());
      applyPatch(node.get(key), value);
    } else {
      // Scalar / list replacement
      node.set(key, value);
    }
  }
}

module.exports = { diffComposeFile, applyPatch };
```

### Edge cases to handle

- Compose file uses `deploy.resources.limits.memory` vs legacy `mem_limit` — detect which syntax the file uses; patch accordingly
- Service defined across multiple compose files (v2 feature via `COMPOSE_FILE`) — only support the primary file in v1; warn if more
- Environment defined as list (`- FOO=bar`) vs map (`FOO: bar`) — preserve style
- Orphan containers (not part of any compose project) — show "No compose file" badge; only offer `docker update` live fixes + artifact download (no recreate via compose)

---

## 3. Recreate ordering — `depends_on` handling

### The problem

A stack has services `db`, `redis`, `api`, `web` with `depends_on` edges:

```yaml
api:
  depends_on: [db, redis]
web:
  depends_on: [api]
```

Recreating them in arbitrary order breaks the stack momentarily. User types `docker compose up -d web` → Docker also restarts `api`, `db`, `redis` as side-effects if versions changed. But if we recreate one service at a time with `--no-deps`, we control the order.

### Algorithm

```js
// src/services/docker-runner.js

/**
 * Topological sort of compose services by depends_on.
 * @param {object} composeDoc - parsed compose file
 * @param {string[]} servicesToTouch - subset to reorder
 * @returns {string[]} ordered service names (leaves first)
 */
function topoOrder(composeDoc, servicesToTouch) {
  const services = composeDoc.services || {};
  const visited = new Set();
  const result = [];

  function visit(name) {
    if (visited.has(name)) return;
    visited.add(name);
    const deps = services[name]?.depends_on || [];
    const depList = Array.isArray(deps) ? deps : Object.keys(deps);
    for (const d of depList) {
      if (servicesToTouch.includes(d)) visit(d);
    }
    result.push(name);
  }

  for (const s of servicesToTouch) visit(s);
  return result;
}
```

### Recreate loop

```js
async function recreateInOrder(composeFile, servicesToTouch, docker) {
  const doc = YAML.parseDocument(fs.readFileSync(composeFile, 'utf8'));
  const order = topoOrder(doc.toJS(), servicesToTouch);
  // Reverse topo: deps first (db, then redis, then api, then web)
  const log = [];
  for (const service of order) {
    log.push(`⏳ Recreating ${service}...`);
    await execDockerCompose(composeFile, ['up', '-d', '--no-deps', service]);
    log.push(`✓ Recreated ${service}`);
    const ok = await waitHealthy(service, composeFile, 30_000);
    if (!ok) {
      log.push(`✗ ${service} failed health check — aborting`);
      throw new RemediationError('health', { service });
    }
  }
  return log;
}
```

### Health check wait

- If service has `healthcheck`, poll `docker inspect --format '{{.State.Health.Status}}'` until `healthy` (timeout 30s)
- If no healthcheck: check `State.Running === true` AND no CrashLoop in last 10s (inspect `RestartCount` delta)
- If timeout or unhealthy: raise `RemediationError('health')` → triggers rollback

---

## 4. Rollback mechanism

### What gets snapshotted

Before any change, for EACH affected container, capture:

```js
const snapshot = {
  inspect: JSON.parse(JSON.stringify(inspectResult)),  // deep clone
  composeFileBefore: fs.readFileSync(composeFile, 'utf8'),
  composeFileMtime: fs.statSync(composeFile).mtime,
};
```

Stored gzipped in `remediation_jobs.pre_apply_snapshot` (SQLite TEXT column, base64 after gzip).

### Rollback triggers

1. **Automatic** — during apply, if any step fails (health check, docker exec error, compose error), rollback runs before returning failure
2. **Manual** — within 60s of `status='success'`, user can click "Rollback" → runs the reverse operations

### Rollback operations by fix type

| Original fix | Rollback |
|---|---|
| Live update (memory/cpu/pids/restart) | Live update back to pre-apply value |
| Compose recreate | Restore pre-apply compose file content; `docker compose up -d --no-deps --force-recreate` affected services |
| Git-PR mode | Close the PR + delete the branch (if we created it) |
| Artifact mode | N/A (user didn't apply anything) |

### Rollback edge cases

- If compose file was modified by another process after our apply → conflict. Refuse to rollback, tell user to diff manually.
- If image was pulled during apply and original image was cleaned up → pull original image first.
- Sanity: rollback never destroys user data. Volumes/bind mounts untouched.

---

## 5. Git-PR mode — integration with `services/git.js`

### What the existing git service does

Grep `src/services/git.js` — today supports cloning repos for stack deployments + webhook-triggered pulls. Does NOT currently support pushing or PR creation.

### What we need to add

Three new methods in `src/services/git.js` (or a new `git-pr.js` to avoid risk of breaking existing):

```js
async function createBranch(repoPath, branchName) { /* ... */ }
async function commitChanges(repoPath, files, message, author) { /* ... */ }
async function pushBranch(repoPath, branchName) { /* ... */ }
async function createPullRequest(repoCredId, repoRef, branchName, title, body) {
  // POST to GitHub/GitLab/Gitea API
  // Uses credentials from existing git_credentials table
}
```

### PR flow

1. Resolve stack → Git repo + credentials (from existing `docker_stacks` / `git_credentials` tables)
2. Clone / `git pull` the repo to a temp workspace
3. `createBranch(workspace, 'docker-dash/remediate-<short-hash>')`
4. Apply compose patches to the files
5. `commitChanges(workspace, ['docker-compose.yml'], 'remediate: fix CIS-5.4 privileged on myapp-web', 'Docker Dash <bot@docker-dash>')`
6. `pushBranch(workspace, branchName)`
7. If credential has API token → `createPullRequest(...)` → returns PR URL
8. Else → return the push URL + "please open PR manually"

### Security

- Git credentials are already encrypted (v6.4 audit fix F3). No change.
- Audit log entry: `remediate_pr_created` with repo ref + branch + PR URL (not token).

### Fallback

If the stack is NOT from a Git repo, Git-PR mode is hidden in the UI.

---

## 6. Concurrency + locking

### Rule 1: one remediation per container at a time

Before creating a plan, check:

```sql
SELECT id FROM remediation_jobs
WHERE status IN ('pending', 'running')
  AND scope_id = ?
  AND host_id = ?
LIMIT 1
```

If exists → 409 with existing `jobId`. UI shows "A remediation is already in progress for this container; view its status".

### Rule 2: apply is exclusive across the whole stack

For stack-wide apply, lock entire stack:

```sql
SELECT id FROM remediation_jobs
WHERE status IN ('pending', 'running')
  AND scope_type = 'stack'
  AND scope_id = ?  -- stack name
LIMIT 1
```

### Rule 3: live updates are serialized per-container

If two findings on the same container both produce `docker update` commands (e.g., both memory and CPU limits), merge them into a single `docker update --memory N --cpus M` call. Don't run two `docker update`s in parallel — Docker serializes internally anyway, but merging gives a cleaner audit trail.

---

## 7. Error classification

Classify every failure into one of 7 buckets. Maps to user-facing error message + suggested fix.

| `error_class` | Detected by | User message | Suggested fix |
|---|---|---|---|
| `docker` | Docker API returned non-2xx | "Docker API error" | "Check Docker daemon; `docker info`" |
| `compose` | `docker compose up -d` returned non-zero | "Compose file invalid" | "Review the diff; YAML syntax error?" |
| `health` | Health check timed out OR CrashLoop | "Container failed to become healthy" | "Fix may be incompatible. Auto-rollback triggered. Check logs: `docker logs <name>`" |
| `git` | Git operation failed | "Git error" | "Check credentials; branch may already exist" |
| `timeout` | Apply step exceeded 5 min | "Step took too long" | "Retry; consider applying one fix at a time" |
| `rollback` | Rollback itself failed | "ROLLBACK FAILED — manual intervention needed" | "SSH to the host; restore compose file manually; file an issue" |
| `other` | Uncategorized | "Unexpected error" | "See job output; file an issue with the job ID" |

### `rollback` is the only error_class that blocks recovery

Every other error class → rollback runs automatically. A rollback failure is the one scenario where human intervention is required; the UI surfaces a big red banner with the exact commands the user should run.

---

## 8. WebSocket progress channel

Reuse the pattern established in v6.5 LE Wizard (polling `/job/:id` every 3s) but promote to WebSocket here because remediation can take 2-5 min for stack-wide applies.

New WS topic: `remediate:job:N`.

Events emitted:
- `plan_generated`
- `apply_started`
- `container_inspect_saved` (once per affected container)
- `live_update_done` / `live_update_failed`
- `compose_file_written`
- `recreate_started` (service name)
- `recreate_health_check_ok` / `recreate_health_check_failed`
- `audit_refreshed` (score_before + score_after)
- `complete` (with final status)
- `rollback_started` / `rollback_done` / `rollback_failed`

Falls back to 3s polling if WS unavailable.

---

## 9. Audit log entries

Every state change hash-chained via existing `auditService`. Mirror `deploy-remote` shape.

| `action` | Details |
|---|---|
| `remediate_plan` | `{ scopeType, scopeId, findings, stepsCount, totalDowntimeMs }` |
| `remediate_apply_start` | `{ jobId, mode, scopeType, scopeId, planSha256 }` |
| `remediate_apply_success` | `{ jobId, scoreBefore, scoreAfter, durationMs }` |
| `remediate_apply_failed` | `{ jobId, errorClass, stepThatFailed, rolledBack: true }` |
| `remediate_rollback` | `{ jobId, reason, success }` |
| `remediate_pr_created` | `{ jobId, repoRef, branchName, prUrl }` |
| `remediate_artifact_downloaded` | `{ jobId, fileHashes }` |

Credentials NEVER in audit details. Plan SHA is stable reference to full plan (stored in `remediation_jobs.plan_json`).

---

## 10. Catalog expansion — community PR pattern

Adding a new remediation is a 30-line PR. Documented in `CONTRIBUTING.md`:

1. Add an entry to `src/services/remediation-catalog.js` (see §1 shape)
2. Add structured `remediationId` to the relevant finding in `src/services/cis-benchmark.js` OR `src/routes/system.js` secrets-audit
3. Add a unit test in `src/__tests__/remediation-catalog.test.js`

Future contributors don't touch the orchestrator, wizard UI, or routes.

---

## 11. Why v2 / v3 items are out

### "Auto-apply with undo timer" (Level 5)

Read_only breaks apps that write outside tmpfs. Auto-applying means users discover the break-rate AFTER it hits prod. Undo timer mitigates but doesn't prevent the paging-in-the-middle-of-the-night scenario. Defer until the catalog has enough maturity that break-rates per fix are well-understood.

### "Sandbox-clone test"

Creates a container clone, applies the fix, runs a probe. Sounds great; in practice:
- Probe quality is the bottleneck (HTTP 200 ≠ app is healthy)
- Write-path breaks only manifest under real traffic
- Doubles container count per stack during apply (resource pressure)

Prefer: health-check + auto-rollback, which catches the same breakage AFTER apply but without the resource cost.

### "AI-suggested image-specific fixes"

Useful for "tailscale needs NET_ADMIN", but:
- Requires LLM dependency (opt-in)
- Suggestions need human verification ("verify manually" badge)
- Crowd-sourced hint database (v2) scales better

---

## 12. Performance budget

| Operation | Target | Hard limit |
|---|---|---|
| `/plan` endpoint (single container) | <500 ms | <3 s |
| `/plan` endpoint (stack of 10) | <2 s | <10 s |
| Compose diff rendering (in browser) | <100 ms | <500 ms |
| Apply live update (per container) | <2 s | <10 s |
| Apply recreate (per container) | <15 s | <60 s |
| Full stack apply (10 containers) | <60 s | <5 min |

If hard limit exceeded → timeout error + rollback.

---

## 13. Test matrix

### Unit tests (Jest, mocked Docker API)

- Each of 20 catalog entries: `applies()` + `plan()` with synthetic inspect inputs
- Compose diff engine: add/delete/nested merge/list surgery/preserves comments
- Topo sort of `depends_on`
- Error classifier

### Integration tests (supertest + in-memory DB)

- `POST /plan` with valid/invalid scope
- `POST /apply` full lifecycle (mocked docker runner)
- Git-PR mode with mocked git service
- Rollback within window / outside window
- Concurrent plan requests (dedup)

### Smoke tests (against local Docker — run manually, not in CI)

- Apply memory limit to a live container → verify `docker inspect` reflects it
- Apply `read_only: true` to nginx → verify recreate works
- Force-break a fix (bad read_only) → verify auto-rollback

### No CI integration tests against real Docker

Too environment-sensitive. Smoke tests are the manual gate.

---

## 14. Open questions rollup

From `01-feature-spec.md §13` and this doc:

1. **YAML library: `yaml` vs `js-yaml`** — need `yaml` for round-trip safety. Add to deps.
2. **Rollback snapshot: full inspect JSON** — gzipped, stored in SQLite TEXT. Sized at ~20KB per container; acceptable.
3. **PR creation without API credentials** — push branch + return URL; user opens PR manually.
4. **RBAC for remediation** — admin-only (no operator). Matches existing wizards.
5. **Dry-run via `docker compose config`** — skip v1; the YAML diff is dry-run enough.
6. **Orphan containers (no compose file)** — offer live updates + artifact download only; no recreate.
7. **Multi-file compose projects** — v1 only handles primary file; warn if more.
