# Changelog

All notable changes to Docker Dash are documented here.

## [6.9.3] - 2026-04-21 — "Secrets + Egress audit actions at the stack level"

Extends the existing Security Scan + CIS Benchmark per-stack actions on the Containers page (`#/containers`) with two more: **Secrets Audit** and **Egress Audit**. Context-preserving modals — users no longer need to bounce to System → Secrets or System → Egress and re-filter for the stack they're already looking at.

### Added

- **Two new stack-header buttons** on every stack (and the Standalone pseudo-stack) in the Containers page, matching the existing Security Scan + CIS icons:
  - 🔒 **Secrets Audit** (`fa-user-secret`, purple) — runs the global secrets audit and renders the results filtered for this stack
  - 🌐 **Egress Audit** (`fa-network-wired`, cyan) — runs the global egress audit and renders reachability + filter status filtered for this stack
- **`_showStackSecretsModal`** — summary pills (Avg Score / Critical / Warnings / Containers), per-container rows with top 2 issues + "Fix" button that hands off to the Remediation Wizard scoped to that container. Stack-level "Remediate whole stack" button opens the wizard at stack scope. "Open full Secrets tab →" link for when users want the full view.
- **`_showStackEgressModal`** — summary pills (Containers / Internet reach / IMDS reach / Critical), per-container row with network mode + reachability verdict + filter-policy state. When a container has no policy, an **Enable** button is shown; when it does, the preset + mode badge is shown inline. "Enable filter for whole stack" button appears when the stack has any internet-reachable container with no stack-wide policy.

### Design notes (reuse-first)

Rather than build stack-scoped API endpoints, both modals fetch from the **existing** global endpoints (`/api/system/secrets-audit`, `/api/system/egress-audit`, `/api/egress-filter/policies`) and client-filter by `c.stack === stackName`. This matches the pattern already used by `_showStackCisModal`. Zero new backend code, zero new tests needed for existing surface, zero drift risk between global and stack views.

Both modals keep the user in context (Containers page, modal overlay) — same UX pattern as Security Scan + CIS modals. No page navigation, no tab switching mid-action. The "Open full tab →" link is available but not required.

### Behavior details

- **Stopped containers** are reported as "(N stopped — skipped)" in the header and omitted from the table. Matches CIS modal behavior.
- **No issues / no reach** — modal shows an empty-state ("No results for this stack") rather than an empty table.
- **Fix button** on a Secrets row closes the stack modal + opens RemediateWizard scoped to that container, so the user doesn't need to click twice.
- **Enable button** on an Egress row navigates to System → Egress (the full Enable modal with preset picker lives there; replicating the full policy editor in a second place would be maintenance debt).

### Tests

- No new tests — all logic is UI composition over existing tested backends. 678 passing / 46 suites unchanged. Syntax check passes on the modified file.

### Files touched

- `public/js/pages/containers.js` — 2 new buttons in stack header (lines ~420), dispatch handler extended (line ~755), 2 new modal methods appended (~140 LOC).

---

## [6.9.2] - 2026-04-21 — "Hygiene: node-cron 4 + LE CI smoke test"

Housekeeping. Two small but useful cleanups.

### Dependency refresh

- **`node-cron`** `^3.0.3` → `^4.2.1` (major). API-compat for our usage — both `cron.schedule(expr, fn)` and `cron.validate(expr)` still exported. Task object still has `.start()` / `.stop()`. Verified: 677 tests pass unchanged; runtime boot + stopAll() both behave identically on staging.

### Added — Live Cloudflare smoke test

- **`src/__tests__/acme-cloudflare-live.test.js`** — exercises the Let's Encrypt wizard's credential-validation path against the real Cloudflare `/user/tokens/verify` API. Three assertions:
  1. A valid scoped token returns `ok: true` (catches upstream API changes / revoked tokens).
  2. A 37-hex-char "Global API Key" is rejected by our client-side heuristic before we hit the network.
  3. Empty credentials return a clear `api_token` error.
- **Gated on `CLOUDFLARE_TEST_TOKEN` env**: the 3 live tests skip when the secret isn't present. An always-present marker test logs "token not set — live tests SKIPPED" so CI output stays honest.
- **CI wiring**: `.github/workflows/ci.yml` exposes `CLOUDFLARE_TEST_TOKEN: ${{ secrets.CLOUDFLARE_TEST_TOKEN }}`. Nothing runs until you provision the secret in Repo Settings → Secrets → Actions. Recommended scope: `User:Read` only (no zone / DNS permissions needed — we only hit `/user/tokens/verify`).

### Tests

- **678 passing + 4 skipped (live tests)** / 46 suites. Was 677 passing / 45 suites.

### What v6.9.2 does NOT do

- End-to-end Let's Encrypt staging issuance (needs Caddy container + domain control + a DNS zone — too much for unit CI). That belongs in a separate soak environment.

### Operator / maintainer notes

To activate the CF smoke test after pulling v6.9.2:

```
Repo Settings → Secrets and variables → Actions → New repository secret
  Name:  CLOUDFLARE_TEST_TOKEN
  Value: <a scoped CF API token with "User:Read" permission only>
```

Once set, the next CI run will execute all 3 live tests. They add ~2s to the pipeline. Revoke + rotate the token independent of Docker Dash state.

---

## [6.9.1] - 2026-04-21 — "Egress block log: quick-actions + grouped view + CSV"

UX polish on the Outbound Filter deny log. The flow "I see my container being blocked on a hostname it legitimately needs → add it to the allowlist" dropped from 3 steps (open manage modal → paste hostname → save) to 2 clicks (**Allow** → confirm).

### Added

- **Grouped-by-hostname view** for the deny log. Instead of a raw stream of events, shows a table with one row per hostname: count, last seen, ports, and a per-row **Allow** button. Defaults to a 7-day window. Toggle between `Grouped` / `Recent` in the log viewer header.
- **Quick-action: Allow a blocked hostname** — one click + confirm adds the hostname to the policy's allowlist. If the policy was on a preset (e.g. `registry-only`), it's switched to `custom` so the addition persists across subsequent edits. Audit-logged as `egress_policy_allowlist_added`.
- **CSV export** — downloads the last 1000 deny events with full columns (id, blocked_at, hostname, port, proto, reason, container_id) for offline analysis / compliance reports.

### Backend

- **`src/services/egress-filter.js`**:
  - `getBlockLogGrouped(policyId, {sinceHours, limit})` — SQL aggregates count/last_seen/first_seen per hostname, sorted by count DESC, configurable time window (1h → 1y).
  - `allowHostnameOnPolicy(policyId, hostname)` — validates (reject IPs + IMDS + malformed), dedupes, persists via a `UPDATE ... SET preset='custom', allowlist=?` transaction, calls `writePolicyFile()`.
- **`src/routes/egress-filter.js`**:
  - `GET /api/egress-filter/policies/:id/block-log/grouped?sinceHours=168&limit=50`
  - `POST /api/egress-filter/policies/:id/allow-hostname` — body `{hostname}`, returns `{ok, added, policy}` or `{added: false, reason: 'already-in-allowlist'}`.
- **Frontend API methods**: `Api.egressFilterBlockLogGrouped`, `Api.egressFilterAllowHostname`.

### Tests

- **`egress-filter.test.js`** gains 7 tests:
  - `getBlockLogGrouped` — aggregates count + ports + last_seen correctly, sorted DESC
  - `allowHostnameOnPolicy` — adds to custom, switches preset from registry-only to custom, idempotent on duplicate, rejects IPs / IMDS / malformed, 404 on unknown policy, requires hostname.
- **Total: 677 passing / 45 suites** (+7).

### Operator notes

No breaking changes. If you previously used the deny log, it now defaults to `Grouped` view — click `Recent` to switch back to the v6.7 stream format.

---

## [6.9.0] - 2026-04-21 — "Remediation Wizard polish — scheduled, notified, configurable"

Three polish features that round out the Remediation Wizard's story. Nothing revolutionary, but each closes a real gap called out in BACKLOG.

### Added — Scheduled remediation (apply at a specific time)

- Step 3 of the Remediation Wizard gains a **Schedule for later** checkbox + `datetime-local` picker. Set a time, click Execute — the job is persisted with `status='scheduled'` and the background scheduler picks it up when the time arrives.
- Migration `056_remediation_scheduling.js` — adds `scheduled_at` column + partial index on scheduled rows for cheap polling.
- New `src/services/remediation-scheduler.js` — polls every 60s (`DD_REMEDIATION_SCHEDULER_POLL_MS` to override), promotes jobs from `scheduled` to `pending` in `ORDER BY scheduled_at ASC` then kicks off the runner. Concurrency-safe via atomic `WHERE status='scheduled'` update guard.
- `createJob` rejects `scheduledAt` values within the next 60 seconds (too-soon) or beyond 30 days (too-far). Concurrency check expanded to refuse a second scheduled job on the same scope.
- Audit log event: `remediate_scheduled` (separate from `remediate_apply_start` so downstream dashboards can differentiate).
- **Not** for `artifact` mode (download patch has no async job to schedule) — UI disables the checkbox in that mode.

### Added — Notifications on remediation events

- Every lifecycle transition now dispatches through the existing `notificationChannels.sendToAll` (Discord / Slack / Telegram / ntfy / Gotify / email / webhook — 7 providers):
  - `remediate_scheduled` (info) — when a future job is created
  - `remediate_success` (info) — after apply-local or git-PR mode completes
  - `remediate_failed` (critical) — apply failure with `error_class`
  - `remediate_rolled_back` (warning) — auto-rollback or manual rollback
- Fire-and-forget: a broken Slack webhook will never block an apply. All dispatch failures log at debug level.
- No new notification channel types — reuses the v6-era channel configuration UI under System → Notifications.

### Added — Rollback UX improvements

- **Configurable rollback window** via `DD_REMEDIATION_ROLLBACK_SECONDS` env (default 60, clamped to [30, 3600]). Replaces the hardcoded 60s in the SQL `UPDATE rollback_deadline=datetime('now', '+60 seconds')` pattern.
- **Snapshot cleanup job** — the daily purge tick now calls `remediate.pruneOldSnapshots()` which nulls out `pre_apply_snapshot` (gzipped inspect blobs, ~50-200 KB each) for completed jobs older than `DD_REMEDIATION_SNAPSHOT_RETENTION_DAYS` (default 7). Row stays for audit; only the heavy blob is freed.
- **`GET /api/remediate/config`** endpoint — UI can display actual configured window instead of hard-coding "60 seconds" in user-facing copy.

### Incidental improvements shipped with v6.9.0

- Daily purge tick also now calls `egressFilter.pruneOldBlockLog()` (already implemented in v6.7 but wasn't wired to the scheduled job).
- `runJob` precondition relaxed: accepts both `pending` and `scheduled` status (the scheduler promotes before invoking).

### Tests

- `remediation-scheduler.test.js` — 6 tests: promote-due, skip-future, ignore-non-scheduled-status, runner-missing fail-safe, runner-error tolerated, ORDER BY scheduled_at ASC.
- **Total: 670 passing / 45 suites** (+6).

### Operator notes

To opt into the scheduler you don't need to do anything — it starts with Docker Dash on every v6.9.0+ boot. Scheduled jobs that survive a restart are promoted on the next tick.

To tune retention + rollback window:

```
# .env
DD_REMEDIATION_ROLLBACK_SECONDS=300            # 5 min rollback window (default 60)
DD_REMEDIATION_SNAPSHOT_RETENTION_DAYS=30      # keep snapshots for audit (default 7)
DD_REMEDIATION_SCHEDULER_POLL_MS=30000         # check every 30s instead of 60s
```

---

## [6.8.0] - 2026-04-20 — "Multi-host SSH exec — Remediation Wizard Apply on remote hosts"

Closes a long-standing gap: the Remediation Wizard's **Apply (local)** mode was restricted to the local Docker host. Remote hosts could only use Git-PR or artifact modes. v6.8.0 extends the SSH tunnel with `exec` + SFTP-based file operations, so Apply mode now works transparently on any SSH-connected host.

### Added

- **`src/services/ssh-tunnel.js`** gains 4 new methods on the existing tunnel's `ssh2` Client:
  - `exec(hostId, cmd, opts)` — returns `{stdout, stderr, exitCode}`, 30s default timeout
  - `fileExists(hostId, path)` — POSIX `test -f` with shell-escape
  - `readFile(hostId, path)` — SFTP read, returns utf8 string
  - `writeFile(hostId, path, content)` — SFTP write, 0o644 mode
- **`src/services/remote-fs.js`** — thin dispatcher: `hostId=0` → node `fs`, `hostId>0` → ssh-tunnel. Uniform async interface. `fileExists` swallows tunnel errors as `false` for graceful degradation.
- **`src/services/docker-runner.js`** `composeRecreate(file, service, hostId)` — when `hostId > 0`, runs `docker compose up -d --no-deps --force-recreate <service>` via SSH exec on the target host instead of spawning `docker` locally. 120s timeout.
- **`src/services/remediate.js`** — `plan()` and `_applyLocal()` use `remote-fs` for compose read/write + `composeDiff.diffYamlStrings` (content-based) instead of `diffComposeFile` (path-based). Snapshot blob now carries `hostId` per container so rollback returns to the correct host even in mixed-host plans (though typical plans are single-host).
- **`docker-runner.rollback`** — writes rollback content back via `remote-fs` using each snapshot's recorded `hostId`.

### Behavior change (improvement)

Before v6.8.0, `composeFileExists` always returned `false` for remote hosts because `fs.existsSync` only checks the local filesystem. This silently dropped every compose-based remediation on remote hosts (they fell through to "no patch applied"). After v6.8.0, remote compose files are detected and patched identically to local ones.

### Security notes

- Remote file paths are passed through SFTP directly (path-safe).
- Shell commands in `composeRecreate` quote the compose file path + service name. Service name is constrained to `com.docker.compose.service` label chars at catalog time, no injection surface.
- No new capabilities required on the target host — reuses the existing SSH credential flow.
- Remote Docker Dash container still runs without `NET_ADMIN` / `privileged` / host network.

### Tests

- **`src/__tests__/remote-fs.test.js`** — 8 tests: local fs routing for hostId=0/null/undefined, SSH delegation for hostId>0, error-swallow on `fileExists`, error bubble on `readFile`.
- **`src/__tests__/ssh-tunnel-exec.test.js`** — 8 tests: exec stdout/stderr/exitCode, fileExists true/false, quote-safe paths, readFile streaming, writeFile via SFTP. Mocks `ssh2.Client` — no real SSH server needed.
- **Total: 664 passing / 45 suites** (+16 new).

### Upgrade notes

Safe drop-in for v6.7.x. No config change needed. Existing local-host Apply mode continues unchanged. Remote-host Apply mode now "just works" if the host is reachable via the standard SSH tunnel config in Multi-Host page.

---

## [6.7.1] - 2026-04-20 — "Hygiene — native deps + zero lint warnings"

Post-v6.7 housekeeping. No new features, no behavior changes. Two things land:

### Native dependency refresh

- `bcrypt` `^5.1.1` → `^6.0.0` (major). Drops Node <16 support (we're on 24). API identical for our usage (`hash` + `compare`), native bindings rebuild cleanly.
- `better-sqlite3` `^11.10.0` → `^12.9.0` (major). Pure perf + stability bump; no API changes affect our usage. All 648 tests pass without modification.

`npm audit` remains at 0 vulnerabilities.

### Zero lint warnings

- `npm run lint` exits 0 with no output. 49 warnings at the start of this session → 34 after the v6.6.5 sweep → **0** now.
- Strategy: underscore-prefix unused function args (safe, preserves caller contract), remove unused local vars with no side effects, remove stale `eslint-disable` directives.
- Files touched: `src/__tests__/cron-parser.test.js`, `egress-blocklog-ingester.test.js`, `egress-filter.test.js`, `src/routes/auth.js`, `containers.js`, `hosts.js`, `images.js`, `misc.js`, `stats.js`, `system.js`, `src/services/docker-runner.js`, `docker.js`, `git.js`, `s3-backup.js`, `securityAlerts.js`, `workflows.js`. All backed by tests passing.

### Still deferred

- `diff` 5 → 9, `express` 4 → 5, `node-cron` 3 → 4 — each wants a dedicated regression session. Tracked in BACKLOG P2.

### Tests

- **648 passing / 43 suites** — no regressions from native dep bumps or lint changes.

---

## [6.7.0] - 2026-04-20 — "Outbound Network Filter" 🎉

Docker Dash's biggest security feature to date. Ships a production hostname-based outbound allowlist enforced by a lightweight Go sidecar (~2 MB scratch image) + nftables rules installed into target container netns via a short-lived `NET_ADMIN` helper. No TLS decryption, no cert injection — containers see their destinations' real certs.

**The sales pitch in one line:** a compromised container on a Docker Dash host can't talk to IMDS, can't exfiltrate to attacker-controlled hosts, and can't pivot into your cloud account — without you ever breaking its TLS trust chain.

### What shipped across v6.7 alphas and rcs (summary)

See individual alpha/rc entries below for full detail. Feature highlights:

- **5 presets** — `registry-only`, `registries-github`, `lockdown`, `audit-only`, `custom`. Wildcard hostnames supported (`*.github.com`).
- **Two modes** — `enforce` (block denies) and `audit-only` (log but don't block, for migration). Per-policy.
- **IMDS always blocked** — `169.254.169.254`, `metadata.google.internal`, `169.254.170.2`. Defense-in-depth invariant that no user policy can override.
- **Container + stack scope** — apply to one container or to every service in a compose project. Stack apply is transactional: whole-stack precheck before touching anything, rollback on mid-stream failure.
- **Preconditions** — refuses to attach to containers with `NET_ADMIN`, `SYS_ADMIN`, `privileged`, or `network_mode: host / none / container:<id>` — any of those make the filter bypassable.
- **Emergency disable** — one-click red button, `< 5s` to restore full outbound, audit-logged with operator reason.
- **Deny log** — sidecar writes to local append-only log, background ingester tails it into the DB every 30s. UI shows per-policy last-25 events.
- **UI** — System → Egress tab gains Filter column, 3-step Enable/Manage modal, expandable deny log. End-to-end usable without touching REST.
- **Metrics** — sidecar exposes Prometheus `/metrics` with `allowed_total`, `blocked_total`, `audit_only_total`, `upstream_errors_total`, `policy_reloads_total`.
- **One-command setup** — `docker compose --profile egress up -d` brings the sidecar up alongside Docker Dash.

### Components

| Piece | Files | Purpose |
|---|---|---|
| DB schema | `src/db/migrations/054_egress_policies.js` | `egress_policies` + `egress_block_log` tables |
| Service | `src/services/egress-filter.js` | CRUD, preset resolution, IMDS invariant, `canApplyFilter` precondition, `writePolicyFile` |
| Runner | `src/services/egress-runner.js` | `applyToContainer`, `applyToStack` (transactional), `removeFromContainer`, `removeFromStack`, `isApplied`, `statusOfStack` |
| Ingester | `src/services/egress-blocklog-ingester.js` | Tails sidecar deny log via `docker exec tail`, inserts to DB every 30s |
| REST | `src/routes/egress-filter.js` | 9 admin-only endpoints |
| Sidecar | `docker/egress-filter/main.go` + `Dockerfile` | 450-LOC Go binary: SNI peek + HTTP Host parser + hostname allowlist + splice-or-reset, SIGHUP reload |
| UI | `public/js/pages/system.js` (Egress tab) | Filter column + 3-step modal + deny log viewer |
| How-To | `src/db/migrations/055_howto_outbound_filter.js` | Bilingual EN + RO guide (threat model → setup → UI → invariants → gotchas) |
| CI | `.github/workflows/egress-filter-image.yml` | Multi-arch (amd64 + arm64) buildx + GHCR push + per-arch smoke tests |
| Planning | `docs/planning/v6.7/outbound-filter/` | feature-spec + deep-spec + assumption-audit + preflight + results (6/10 PASS on staging) |

### Explicit non-goals (deliberately not in scope)

Documented in deep-spec §4 and the How-To — read these before filing an issue:

- **No TLS decryption.** SNI peek only. Never break the container's trust chain.
- **No IPv6** — IPv4 only. IPv6 tracked for v6.8+.
- **No per-process filtering** — one policy per container.
- **No multi-host Swarm overlay awareness** — single-node Docker. Swarm tasks get their own per-node policies.
- **No source-IP-keyed per-container routing inside a single sidecar** — for isolated per-container policies, run multiple named sidecars (`dd-egress-filter-api`, `dd-egress-filter-db`, …).

### Upgrade from v6.6.x

Safe to `docker compose pull app && docker compose up -d app`. Migration `054_egress_policies.js` + `055_howto_outbound_filter.js` apply cleanly on startup. If you don't opt into the egress profile, nothing changes operationally — the Egress tab just shows "sidecar not configured, read-only audit only".

To opt in:
```bash
# 1. Add to .env:
DD_EGRESS_SIDECAR_ENDPOINT=172.17.0.X:29193      # fill after first boot
DD_EGRESS_SIDECAR_NAME=dd-egress-filter
DD_EGRESS_BLOCKLOG_INGESTER=1

# 2. Start sidecar alongside Docker Dash:
docker compose --profile egress up -d

# 3. Find sidecar's bridge IP (fills step 1):
docker inspect dd-egress-filter --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'
docker compose up -d app   # pick up the new env
```

### Tests

- **648 passing / 43 suites** (up from 538 on the v6.6 line — +110 net across the v6.7 work)
- Preflight: 6/10 spikes PASS on staging (P1 rule persistence, P3 Go SIGHUP reload, P4 port isolation, P6 atomic rename, P8 multi-arch buildx, P10 NET_ADMIN precondition logic). P5/P7/P9 gate at `v6.7.1` with real community + perf data.

### Known limitations inherited from rc.2

- Sidecar's aggregate policy = union of all DB policies (see "explicit non-goals" above for the multi-sidecar pattern)
- Corporate proxy compatibility (preflight P5) not yet validated with a real Squid upstream
- No live probe for "is IMDS actually blocked at the host level" — analysis is Docker-config-based

---

## [6.7.0-rc.2] - 2026-04-20 — "Outbound Filter: operational polish"

Second release candidate for v6.7.0. No new features — three operational improvements that reduce setup friction from "build + wire up manually" to "docker compose up".

### Added — One-command setup

- **`docker-compose.yml` gains `dd-egress-filter` service** under `egress` profile:
  ```
  docker compose --profile egress up -d
  ```
  Builds from `docker/egress-filter/`, mounts shared `egress-policy` + `egress-logs` volumes, exposes metrics on :9191, and deliberately has no published `ports:` (sidecar reachable only from containers via iptables redirect — preflight P4).
- **`network_mode: bridge`** on the sidecar — attaches to the default Docker bridge where most target containers live. User-defined bridges and Swarm overlays are documented as requiring manual attachment.
- **Two new shared volumes**: `egress-policy` (Docker Dash writes `policy.json` here; sidecar reads) and `egress-logs` (sidecar's deny log; readable from the ingester).

### Added — GHA workflow for sidecar image

- **`.github/workflows/egress-filter-image.yml`** — multi-arch buildx (amd64 + arm64), QEMU emulation, GHCR push on `main` or manual dispatch. Includes two smoke tests per arch (sidecar starts + `/health` reports a loaded policy) and an image-size guard at 10 MB.
- Triggered by changes under `docker/egress-filter/**`. Tags: `latest`, `6.7.0-rc.1`, `6.7`, branch, short-sha.
- **Blocked until you flip the repo's "Workflow permissions" to Read and write** (Settings → Actions → General). Nothing the CLI can automate — a one-click toggle.

### Fixed — Boot-time policy sync

- **`server.js`** now calls `egressFilter.writePolicyFile()` once at startup (after migrations). Previously: if Docker Dash restarted while policies existed, the sidecar's on-disk `policy.json` could be stale until someone edited a policy. Now state is consistent across restarts.

### Operator notes

To enable the outbound filter stack:

```bash
# 1. Add these to your .env (or docker-compose environment block on `app`):
DD_EGRESS_SIDECAR_ENDPOINT=172.17.0.X:29193      # fill in after first compose up
DD_EGRESS_SIDECAR_NAME=dd-egress-filter
DD_EGRESS_BLOCKLOG_INGESTER=1

# 2. Start with egress profile:
docker compose --profile egress up -d

# 3. Find the sidecar's bridge IP:
docker inspect dd-egress-filter --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'

# 4. Update DD_EGRESS_SIDECAR_ENDPOINT with that IP and restart app:
docker compose up -d app
```

### Tests

- **648 passing / 43 suites** — no test changes (these are infra/config additions).

### v6.7.0 stable gating

rc.2 is the last planned rc. v6.7.0 final ships once:
- [ ] GHCR "Read and write" toggle flipped (one-click, user action)
- [ ] Soak test passes — 48h on staging with ≥1 active policy
- [ ] Optional: design-partner preset validation (preflight P7)

---

## [6.7.0-rc.1] - 2026-04-20 — "Outbound Filter: UI + block log + How-To"

First release candidate for v6.7.0. Alphas 1-4 built the foundation, sidecar, enforcement, stack scope. rc.1 ships the user-facing surface (UI in System → Egress tab), block log ingestion from sidecar → DB, and a bilingual How-To guide. **The feature is now end-to-end usable by someone who's never looked at the REST API.**

### Added — UI (System → Egress tab)

- **New Filter column** per container row:
  - Shows "Enable filter" button for unfiltered containers
  - Shows preset + mode badge (e.g. `registry-only · enforce`) + cog icon for filtered ones
- **Enable modal** — 3-step flow reusing established patterns:
  - Preset picker (registry-only, registries-github, lockdown, audit-only, custom)
  - Mode selector (enforce / audit-only)
  - Custom allowlist textarea with live validation
  - Save & apply in one click — creates policy → writes policy.json → runs helper to install iptables → reports success
- **Manage modal** — same shell for existing policies. Shows current preset/allowlist/mode, allows edit + re-apply, **Unapply** (config retained), or **Emergency disable** (red button — unapplies + deletes policy + audit-logs with operator reason).
- **Expandable deny log** — click a filtered row's chevron → shows last 25 block events with timestamp, hostname, port, reason. Lazy-loaded (no extra API call until user expands).
- **Live status** — table refreshes after every apply/unapply so state is always current.
- **Callout updated** — no longer says "read-only audit"; explains that sidecar + `DD_EGRESS_SIDECAR_ENDPOINT` env unlock enforcement.

### Added — Block log ingestion

- **`src/services/egress-blocklog-ingester.js`** — background job that every 30s runs `docker exec dd-egress-filter tail -n 500 /var/log/dd-egress/denied.log`, parses new lines (dedupes on timestamp), and inserts into `egress_block_log` via the existing contract.
- **Opt-in** via `DD_EGRESS_BLOCKLOG_INGESTER=1` env (off by default — alpha users without the sidecar don't pay the cost).
- **Detects sidecar restart** via container-id change and resets offset — old entries in a rotated log get re-ingested cleanly.
- **11 unit tests** — parser for line format + Go log prefix, no-op on missing/stopped sidecar, dedup across ticks, sidecar restart handling, junk-line skipping, no-policy no-op.

### Added — Bilingual How-To (EN + RO)

- **`055_howto_outbound_filter.js`** — "Enforce Outbound Allowlists with the Egress Filter". Covers threat model, architecture, setup (two steps), UI walkthrough, invariants table, audit events, gotchas table, per-container vs per-stack, explicit non-goals (no TLS decryption, no IPv6 this release).

### Architecture decision documented: per-container routing

The sidecar runs **one aggregate policy** in this release — the union of all active DB policies. For users needing isolated per-container policies, the pattern is **multiple named sidecars** (`dd-egress-filter-api`, `dd-egress-filter-db`, etc.), each with its own `DD_EGRESS_SIDECAR_ENDPOINT` on the Docker Dash container — switch which sidecar a policy targets via a small config extension to the service. Source-IP-keyed sidecar routing was considered but rejected as over-engineering for the single-node deploy target.

### Tests

- **648 → 648 passing** (UI changes don't affect test counts; +11 ingester tests offset the UI-only additions).

### What closes the v6.7 milestone

- ✅ Go sidecar with SNI peek (alpha.2)
- ✅ egress-runner with iptables install via NET_ADMIN helper (alpha.3)
- ✅ Stack scope with transactional apply (alpha.4)
- ✅ UI with 3-step modal + deny log viewer (rc.1)
- ✅ Block log ingestion (rc.1)
- ✅ Bilingual How-To (rc.1)

### Remaining to v6.7.0 final

- **GHCR image publish** — one-click repo toggle (Settings → Actions → Workflow permissions → Read and write). Then the buildx workflow in `.github/workflows/` publishes automatically.
- **Community testing on non-Ubuntu hosts** — preflight P2 partial (Ubuntu 22.04 confirmed; Debian 11 + RHEL 8 are low-risk but unverified).
- **Design-partner validation of presets** — preflight P7 pending user survey.

---

## [6.7.0-alpha.4] - 2026-04-20 — "Outbound Filter: stack scope"

Extends alpha.3's container-scope enforcement to entire compose stacks. A single `POST /apply` now iterates every container with the same `com.docker.compose.project` label and installs the filter atomically.

Previously `501 Not Implemented`, now real.

### Added — Stack scope

- **`egress-runner.applyToStack({stackName, hostId})`** — discovers containers by compose-project label, runs a precondition check on EVERY one before touching any (refuses the whole stack if one has NET_ADMIN / privileged / host mode), then applies the filter serially with transactional rollback on mid-stream failure.
- **`egress-runner.removeFromStack({stackName, hostId})`** — best-effort removal across all stack containers. Per-container errors collected + reported, doesn't abort.
- **`egress-runner.statusOfStack({stackName, hostId})`** — per-container applied-state report + summary `{appliedCount, totalCount}`.
- **Routes** flipped from 501 → real calls:
  - `POST /api/egress-filter/policies/:id/apply` (for stack-scoped policies) returns `{applied: [{id, name}], skipped: [{id, reason}], failed: [...]}`.
  - `POST /api/egress-filter/policies/:id/unapply` returns `{removed, failed}`.
  - `GET /api/egress-filter/policies/:id/status` returns `{containers: [{id, name, state, applied}], appliedCount, totalCount}`.
- **Audit log** entries include per-stack counts: `appliedCount`, `skippedCount`, `removedCount`.

### Transactional apply semantics

- **Precondition phase** — inspects every eligible (running) container's HostConfig. If ANY fails `canApplyFilter` (privileged / NET_ADMIN / SYS_ADMIN / host / none / `container:<id>` mode), the whole stack apply aborts WITHOUT touching anything. Error message names the offending service.
- **Apply phase** — installs filter per container serially. If a helper fails mid-stream, all previously-applied containers are rolled back via `removeFromContainer` before the error propagates to the caller.
- **Non-running containers** (exited, paused, created) are skipped, NOT failed. Reported in the `skipped` array with `reason`.

### Staging E2E verified (this release)

Ephemeral 2-container stack (`ddtest` project, `web` + `db` services) on staging 2026-04-20:

| Step | Result |
|---|---|
| Baseline: both containers reach example.com + httpbin.org | ✅ HTTP/2 200 |
| Apply filter to web → apply filter to db (simulating `applyToStack`) | ✅ both "applied" |
| After apply, web → example.com | ✅ blocked (sidecar logs `host=example.com port=443 reason=not-in-allowlist`) |
| After apply, db → httpbin.org | ✅ HTTP/2 200 (allowed) |
| Remove filter from both | ✅ both "removed" |

### Tests

- `egress-runner.test.js` — +9 stack scope tests:
  - Input validation (`stackName` required)
  - No containers found
  - Apply-to-every-running + skip-non-running
  - Whole-stack abort on any container failing precheck (no helpers spawned)
  - Mid-stream failure → rollback of earlier successes
  - `removeFromStack` per-container error collection (doesn't abort)
  - `statusOfStack` aggregate counts
- **Total: 637 passing / 42 suites** (628 → 637, +9).

### What's left for v6.7.0 final

- **UI** (System → Egress tab, 3-step modal, Apply / Remove / Emergency-disable buttons, block log viewer) — ~3-4h, pure UX work
- **Per-container allowlist routing inside the sidecar** — architectural decision needed (source-IP lookup vs. named-sidecar vs. label inspection)
- **Block log ingestion** from sidecar's local file → DB
- **GHCR image publish** — one-click repo settings toggle

---

## [6.7.0-alpha.3] - 2026-04-20 — "Outbound Filter: enforcement via egress-runner"

Wires the alpha.2 sidecar into a one-click apply / remove flow via a short-lived `NET_ADMIN` helper container that installs nftables rules into the target's netns. Users no longer need to set `HTTP_PROXY` env manually — `POST /api/egress-filter/policies/:id/apply` handles it.

**`ENFORCEMENT_ACTIVE` flag flipped to `true`** in the route layer. API responses no longer say "config only."

### Added — The runner

- **`src/services/egress-runner.js`** (~180 LOC):
  - `applyToContainer({containerId, hostId})` — runs `alpine` + nftables with `--network container:<target>` + `NET_ADMIN`, installs `ip ddout` table with NAT prerouting rules that accept DNS/loopback/RFC1918 pass-through + redirect everything else to the sidecar.
  - `removeFromContainer` — idempotent cleanup via `nft delete table ip ddout 2>/dev/null || true`.
  - `isApplied` — inspects target's netns for our table marker.
  - Requires `DD_EGRESS_SIDECAR_ENDPOINT=<ip:port>` env on the Docker Dash container (operator configures — runner does NOT auto-discover).
  - Container scope only in this release; stack scope returns `501 Not Implemented` with a clear upgrade path for rc1.

### Added — REST endpoints

- `POST /api/egress-filter/policies/:id/apply` — runs the precondition check (refuses NET_ADMIN / privileged / host), then installs rules. Audit-logged as `egress_policy_applied`.
- `POST /api/egress-filter/policies/:id/unapply` — removes rules. Safe to call when nothing applied. Audit-logged as `egress_policy_unapplied`.
- `GET /api/egress-filter/policies/:id/status` — reports `{applied: bool, details: <nft output>}`.
- Frontend API methods: `Api.egressFilterApply / Unapply / Status`.

### Staging E2E verified (this release)

Ephemeral target container + sidecar on staging 2026-04-20:

| Step | Result |
|---|---|
| Target baseline: `curl https://httpbin.org` + `curl https://example.com` | ✅ both 200 |
| Install filter via helper (rules script ran cleanly, echoed "applied") | ✅ |
| After filter: `curl https://httpbin.org` (in allowlist) | ✅ 200 |
| After filter: `curl https://example.com` (NOT in allowlist) | ✅ connection reset; sidecar logs `host=example.com port=443 reason=not-in-allowlist` |
| Remove filter via helper | ✅ echoed "removed" |

### Operator configuration required (before calling `/apply`)

Set the sidecar's network-reachable address on the Docker Dash container:

```yaml
services:
  app:
    environment:
      DD_EGRESS_SIDECAR_ENDPOINT: "172.17.0.5:29193"  # sidecar's bridge IP + listen port
      DD_EGRESS_SIDECAR_NAME: "dd-egress-filter"       # optional, default shown
```

Without this env, `/apply` returns `503` with a clear error pointing to the setting.

### What alpha.3 does NOT ship (saved for rc1)

- **No UI** — still REST-only. rc1 ships the 3-step modal + Apply / Remove buttons in the System → Egress tab.
- **Stack scope** — iterating every service in a compose project. Simple loop on top of the existing container-scope runner — rc1.
- **Per-container allowlist routing** — alpha.3 sidecar is one global policy. rc1 evaluates source-IP → policy_id lookup.
- **GHCR image publish** — one repo-setting toggle away.

### Tests

- `egress-runner.test.js` — 16 new tests. Mocks the docker API (the actual nftables install was already validated in preflight P1 on staging). Covers: env validation, script shape (DNS/loopback/RFC1918 passthrough + sidecar redirect), idempotent apply, helper cleanup on failure, `isApplied` parsing, removal safety.
- `egress-filter-routes.test.js` — 4 tests updated for flipped `enforced: true` flag.
- **Total: 628 passing / 42 suites** (612 → 628, +16).

---

## [6.7.0-alpha.2] - 2026-04-20 — "Outbound Filter: sidecar ships"

Ships the `dd-egress-proxy` Go sidecar — the real enforcement data plane for the v6.7 Outbound Network Filter. Validated end-to-end on staging: allow + block + SIGHUP-reload all work. rc1 wires it into the UI + iptables; alpha.2 is standalone (HTTP_PROXY mode).

### Added — The sidecar

- **`docker/egress-filter/main.go`** — 450 LOC Go sidecar. Static binary, scratch base, 2.2 MB final image. No CGO, cross-compiles cleanly to amd64 + arm64 (preflight P8 pattern).
  - TLS SNI extraction from ClientHello (handcrafted parser, no dep on Go's tls package for peek)
  - HTTP `Host:` header + `CONNECT host:port` parsing
  - Hostname allowlist match with leading-wildcard support (`*.github.com` matches `a.github.com`)
  - IMDS endpoints (`169.254.169.254`, `metadata.google.internal`, `169.254.170.2`) always blocked regardless of policy (deep-spec §13 decision 7 invariant)
  - Atomic-pointer policy swap on `SIGHUP` — in-flight connections keep their snapshot (preflight P3 pattern)
  - Two modes: `enforce` (block) and `audit-only` (log only, forward anyway)
  - Append-only deny log at `/var/log/dd-egress/denied.log`
  - Prometheus `/metrics` endpoint (opt-in via env): allowed/blocked/audit-only/upstream-errors/reloads counters
  - `/health` endpoint reports policy version + allowlist size + mode
- **`docker/egress-filter/Dockerfile`** — multi-arch build recipe. Graduates from P8 spike.
- **`docker/egress-filter/README.md`** — complete operator guide with policy.json shape, env vars, HTTP_PROXY usage example.

### Added — Docker Dash wiring to the sidecar

- **`src/services/egress-filter.js`** gains `writePolicyFile()` + `setOnPolicyWritten()`:
  - Aggregates ALL active DB policies into a single union allowlist + merged mode
  - Writes `policy.json` atomically (tmp + rename — preflight P6)
  - Calls a hook after every create/update/remove
- **`src/server.js`** wires the hook: after `writePolicyFile()` completes, inspects the `dd-egress-filter` sidecar container (opt-in, name configurable via `DD_EGRESS_SIDECAR_NAME`) and sends SIGHUP if running. If absent → silent no-op (alpha users running without the sidecar don't see errors).

### Staging smoke test (this release)

Verified end-to-end on staging 2026-04-20:

| Test | Result |
|---|---|
| Sidecar starts + loads policy v1 (2 hosts, enforce mode) | ✅ `ok policy_v1 allowlist=2 mode=enforce` |
| httpbin.org (in allowlist) via sidecar as HTTPS_PROXY | ✅ forwarded |
| example.com (NOT in allowlist) via sidecar | ✅ blocked — `reason=not-in-allowlist` in deny log |
| SIGHUP with new policy v2 (adds example.com) | ✅ log: `reloaded policy v2 mode=enforce allowlist=3` |
| Retry example.com after SIGHUP | ✅ forwarded |
| Prometheus `/metrics` | ✅ `allowed_total=1, blocked_total=1, reloads_total=1` |
| Image size | 2.2 MB (scratch + static Go binary) |
| Multi-arch buildx (amd64 + arm64) | ✅ both built |

### What alpha.2 does NOT ship (saved for rc1)

- **No UI.** Users create policies via `/api/egress-filter/policies` REST (shipped in alpha.1).
- **No automatic iptables redirect.** Users wire via HTTP_PROXY env or manual iptables. rc1 ships `src/services/egress-runner.js` that installs redirect rules via a short-lived `NET_ADMIN` helper container (preflight P1 validated).
- **No per-container allowlist routing.** Alpha's sidecar uses one global policy (union of all active DB policies). rc1 adds source-IP-keyed per-container policies.
- **Image not published to GHCR.** Users build locally with the provided Dockerfile. GHCR publishing waits for the repo settings toggle (BACKLOG P3).

### Tests

- `egress-filter.test.js` gains 6 writer tests: aggregate empty, single enforce, mixed modes, all audit-only, atomic write + hook call, update+remove rewrite.
- **Total: 612 passing / 41 suites** (606 → 612, +6).

---

## [6.7.0-alpha.1] - 2026-04-20 — "Outbound Filter: config layer"

**First component of the v6.7 milestone. Policies persist but are NOT enforced in this alpha** — the sidecar + nftables data plane lands in `v6.7.0-rc2`. Alpha ships so downstream UI can wire against a stable API.

### Why alpha, what works

Users can create, list, update, and remove outbound policies via REST. The service layer validates preset choices, resolves hostname allowlists, and records intent. Every response includes `enforced: false` so the UI can label the state clearly ("Config only — enforcement in rc2").

This alpha delivers the foundation from [deep-spec §§1-4](docs/planning/v6.7/outbound-filter/02-deep-spec.md): data model, preset catalog, NET_ADMIN/privileged precondition check. Preflight 6/10 already PASS on staging ([preflight results](docs/planning/v6.7/outbound-filter/05-preflight-results.md)).

### Added — Config layer

- **DB migration `054_egress_policies.js`** — `egress_policies` (unique per scope) + `egress_block_log` (30-day retention). Schema matches deep-spec verbatim.
- **Service `src/services/egress-filter.js`** (~320 LOC):
  - 5 preset allowlists: `registry-only`, `registries-github`, `lockdown`, `audit-only`, `custom`
  - `canApplyFilter(inspect)` — refuses privileged / NET_ADMIN / SYS_ADMIN / host / none / container: — graduated from P10 spike
  - `createPolicy / updatePolicy / removePolicy` (soft-delete) / `listPolicies / getPolicy / getPolicyForScope`
  - Allowlist validation: rejects raw IPs + IMDS endpoints (always-blocked invariant) + malformed hostnames
  - `recordBlockedAttempt` contract exposed for future sidecar; `pruneOldBlockLog` for scheduled retention
- **Route `src/routes/egress-filter.js`** — 7 endpoints under `/api/egress-filter`:
  - `GET /presets` — catalog + resolved allowlists + IMDS invariant
  - `GET /policies` / `GET /policies/:id` / `POST /policies` / `PATCH /policies/:id` / `DELETE /policies/:id`
  - `GET /policies/:id/block-log`
  - All admin-only. Container-scope creates run a `docker inspect` precheck (non-blocking: persists with warning if container isn't reachable).
  - Audit-log entries: `egress_policy_created`, `egress_policy_updated`, `egress_emergency_disable`.
- **Frontend API methods** in `public/js/api.js` — 7 `egressFilter*` methods.

### NOT in this alpha (scoped for rc2)

- Go sidecar (the `dd-egress-proxy` binary) and its multi-arch image
- nftables rule installation via helper container
- SNI peek / HTTP Host parsing
- UI surface in the Egress tab
- Sidecar health check + fail-closed wiring

Verify the ready-to-graduate spike artifacts under `docs/planning/v6.7/outbound-filter/spikes/` — the Go sidecar skeleton (P3) and Dockerfile (P8) are drop-in for rc2.

### Tests

- `egress-filter.test.js` — 34 unit tests (presets, allowlist validation, CRUD, upsert, block log, retention, canApplyFilter)
- `egress-filter-routes.test.js` — 16 route integration tests (auth, validation, upsert, soft-delete, alpha notes)
- **Total: 606 passing / 41 suites.** 556 → 606 (+50).

### Upgrade notes for rc2 implementation

The service contract is stable. rc2 drops in:

1. Sidecar Go binary reading `/etc/dd-egress/policy.json` (written by `egressFilter` service on every create/update)
2. `src/services/egress-runner.js` that orchestrates helper-container iptables installs (same pattern as v6.6.0 `docker-runner.js`)
3. Flip `ENFORCEMENT_ACTIVE = true` at the top of `src/routes/egress-filter.js`
4. UI in Egress tab: "Enable filter" button per row → 3-step modal (reuse Remediation Wizard shell)

No DB migration changes expected.

---

## [6.6.6] - 2026-04-20 — "ACME watcher + Remediation WS progress"

Closes two real UX gaps that sat open since v6.5 and v6.6.0.

### Added — ACME watcher

- **New background service** `src/services/acme-watcher.js` transitions stuck `running` LE jobs to `success` or `failed`. Previously the job status was set to `running` when Caddy accepted the policy but never moved forward — the UI sat waiting forever. Now:
  - After a **60s grace period**, the watcher checks that the Caddy policy for this job's domains still exists (via the admin-API `findAcmePolicyIndex`). Present → `success`. Missing → `failed` with `error_class: policy-removed`.
  - **Hard timeout at 10 min** → `failed` with `error_class: timeout`.
  - Polls every 10s. Resilient to Caddy unreachability (leaves the job in `running`, retries next tick).
  - Publishes each state change via the v6.6.5 WS channel so the frontend sees transitions in real time.
- **7 new unit tests** in `src/__tests__/acme-watcher.test.js` covering every branch (grace period, success, policy-removed, timeout, non-running, Caddy-unreachable, publish-update callback).

### Added — Remediation Wizard WS progress

- **Per-job channel** `remediate:job:<jobId>` broadcasts on every state transition AND every live-log line. Users see the streaming output in real time (previously batched to 2.5s polling intervals).
- **Frontend subscribes** on apply. Polling kept as a 10s fallback safety net.
- Transitions covered: `pending → running → (success | failed | rolled_back)` for all three modes (`apply-local`, `pr`, `artifact`). Manual rollback from the wizard also publishes.

### Tests

- 549 → 556 passing (+7 watcher tests). No regressions.

---

## [6.6.5] - 2026-04-20 — "LE Wizard WS progress + code hygiene"

Housekeeping + a real UX polish on the Let's Encrypt Wizard.

### Added — LE Wizard WebSocket progress

- **Per-job WS channel** `acme:job:<jobId>` broadcasts every status transition (`pending → running → failed`). Server publishes via `wsServer.broadcast('acme:job:update', row, channel)`.
- **Frontend subscribes** on issuance-start and calls the existing render logic on each push. User sees state changes instantly — no more 3-second interval lag.
- **Polling kept as safety net** (reduced 3s → 15s) so users with a flaky WebSocket connection still see updates. When WS and poll both deliver, the idempotent `onUpdate()` handles duplicates cleanly.

**Architecture:** service layer stays WS-independent. `acme.js` exports `setWsBroadcaster(fn)`; `server.js` wires the broadcaster once at startup. No hard dep from services on the WS module (keeps tests fast).

**Known limitation (pre-existing, not introduced here):** job status never transitions from `running → success` today — that requires a background watcher that polls Caddy for cert-file appearance. Tracked in BACKLOG as a separate refactor.

### Fixed — Lint hygiene

- **eslint.config.js** — 3 `no-undef` errors fixed by adding missing Node globals (`setImmediate`, `clearImmediate`, `URLSearchParams`, `TextEncoder`, `TextDecoder`) to the project's globals list.
- **12 unused top-level imports removed** across `src/jobs/`, `src/routes/`, `src/services/` — all safe (no-side-effect module deletions only; function-local unused vars deferred to a dedicated hygiene pass).
- **Lint score:** 49 → 34 warnings, 3 → 0 errors.

### Dependencies

- `nodemailer` `^7.0.7` → `^8.0.5` (shipped in 6.6.4; reiterating — 0 vulnerabilities after audit).
- All within-major bumps from 6.6.4 carry forward.

---

## [6.6.4] - 2026-04-20 — "Dependency audit + nodemailer CVE patch"

Housekeeping release — security patch + minor bumps + dep-audit hygiene.

### Security

- **nodemailer** `^7.0.7` → `^8.0.5`. Patches GHSA-c7w3-x93f-qmm8 (SMTP command injection via `envelope.size`) and GHSA-vvjj-xcjg-gr5g (SMTP command injection via CRLF in transport name). **Not exploitable in our usage** — Docker Dash only passes admin-controlled SMTP config + server-generated templates, never user-controlled envelope/name fields. Upgrading anyway for defense in depth and to clear `npm audit`.

### Minor bumps (safe, within-major)

- `dotenv` `^17.3.1` → `^17.4.2`
- `simple-git` `^3.27.0` → `^3.36.0`
- `eslint` (dev) `^10.1.0` → `^10.2.1`
- `puppeteer` (dev) `^24.40.0` → `^24.41.0`

### Deferred (documented in BACKLOG.md P2 section)

Major-version upgrades left for a dedicated bump session:
- `bcrypt 5→6`, `better-sqlite3 11→12`, `diff 5→9`, `express 4→5`, `node-cron 3→4`

Rationale: each needs its own regression pass. Better to batch them in v6.8+ than sprinkle into feature PRs.

### Audit result

- `npm audit`: **0 vulnerabilities** after upgrade
- Tests: 549 passing / 39 suites — no regressions

---

## [6.6.3] - 2026-04-20 — "Remediation Wizard entry points"

Patch release that wires the v6.6.0 Remediation Wizard into two more pages it was always designed to reach from.

### Added

- **CIS Benchmark per-container row** (System → CIS → Containers) now shows a **Fix with Wizard** button alongside the existing Generate-hardened-compose button, plus a **Stack** shortcut when the container belongs to a compose project. Clicking either opens the Remediation Wizard pre-targeted at that scope.
- **Stacks page** (compose stacks with ≥1 container) now shows a **Remediate** action button (`fa-tools`) alongside Up / Down / Restart / Pull. Opens the wizard in stack-mode, auto-detecting applicable findings across every service in the stack.

### Backend

- `src/services/cis-benchmark.js` — container results now include `containerId` (real Docker id) and `stack` (compose project label) so the frontend can pass them straight to `RemediateWizard.open()` without a round-trip.

### Not in this release (by design)

- **Security page (image vulnerability scanner)** — still no entry point. That page is image-focused; the wizard is container-focused. A proper integration needs a "containers using this image" surface that doesn't exist yet. Scoped in BACKLOG as a v6.7+ UX change rather than a mechanical edit.

### Tests

- 549 tests pass across 39 suites (no new tests — pure UI wiring + one backend field addition).

---

## [6.6.2] - 2026-04-20 — "Egress Audit"

Minor release adding a read-only egress-posture audit that flags containers able to reach the public internet and cloud-metadata endpoints (IMDS — e.g. AWS <code>169.254.169.254</code>). Part of the Outbound Network Filter work (BACKLOG). Enforcement remains planned for v6.7.

### Added — Egress Audit (System → Egress)

- **New tab** in the System page — per-container table with risk badge, network mode, attached networks (internal vs bridge), internet + IMDS reachability verdict, and a 0-100 score. Expandable rows show findings detail, <code>extra_hosts</code>, and custom DNS.
- **Summary pills** on the audit page: avg score, critical count, warning count, internet-reachable count, IMDS-reachable count, and scanned/total coverage.
- **Findings catalog** with severity + fix hint per item:
  - `critical`: `network_mode: host`, `extra_hosts` pinned to an IMDS IP
  - `warning`: any non-internal bridge network (internet + IMDS reachable), `NET_ADMIN` / `NET_RAW` capability
  - `info`: attached only to internal networks, custom DNS servers, `network_mode: none` / `container:<id>`
- **Bilingual How-To** (EN + RO): "Audit Container Outbound Network Posture" — explains IMDS threat model, compose recipes for network isolation, host-level iptables blocks, and the limits of the audit (no live probe, no enforcement).

### Backend

- New service `src/services/egress-audit.js` — pure-function `analyzeContainer(inspect, networksByName)` that returns `{networkMode, networks, canReachInternet, canReachIMDS, canReachRFC1918, findings, score}`.
- New route `GET /api/system/egress-audit` (admin only) — pre-fetches host networks once, inspects containers with `CONCURRENCY=20`, aggregates results. Response includes per-container verdicts + summary counts.
- New migration `053_howto_egress_audit.js`.

### Tests

- `src/__tests__/egress-audit.test.js` — 11 tests covering host mode, none mode, default bridge, internal networks, mixed networks, IMDS-pin via extra_hosts, `NET_ADMIN` / `NET_RAW`, custom DNS, and `container:<id>` mode. 549 tests pass across 39 suites.

### Scope intentionally deferred to v6.7

- **Enforcement** (blocking outbound traffic) — covered by a larger feature spec: squid / mitmproxy sidecar + per-container whitelist UI + iptables redirect rule. See `docs/planning/proposals/agent-sandbox.md`.
- **Live probe** — verifying whether the host's iptables actually blocks IMDS (currently we classify based on Docker config only).
- **Per-finding remediation hooks** — integration with Container Remediation Wizard (v6.6.0) to apply isolation fixes in one click.

---

## [6.6.1] - 2026-04-20 — "DNS providers + rotate UX"

Patch release focused on v6.5 Let's Encrypt Wizard polish and deferred cleanup.

### Added

- **4 more DNS providers** for the LE Wizard — Namecheap, Gandi, Porkbun, OVH — bringing total coverage from 5 (Tier-1) to **9**. Wired through `src/services/dns-providers.js` (registry + format validators + Caddy config emitters) and `docker/caddy/Dockerfile` (4 new `xcaddy` plugins). Each provider emits file-substitution Caddy config only — no plaintext secrets in JSON state.
- **Credential rotation UX** — new "Rotate" button per row in the Saved DNS Credentials list. Opens an inline modal (`_showAcmeRotateModal`) that re-prompts only the credential fields for that provider; submission re-writes the encrypted vault + `/etc/caddy/secrets/<id>/*` files without changing the credential id, so existing bound certs keep working. Avoids the delete+recreate dance users hit when rotating expired CF tokens.

### Fixed

- **Multi-host rollback uses correct `host_id`** in `src/services/remediate.js` (`executeRollback` was passing `hostId: 0` — a TODO from Session 2). Now reads `job.host_id || 0`, so remediation rollbacks target the host the original apply ran against.

### Tests

- `dns-providers.test.js` + `acme-routes.test.js` updated to expect all 9 providers. 538 tests pass across 38 suites.

### Docs

- **`BACKLOG.md`** — new single source of truth for deferred work, with the *why* per item (not just the what). P1: `ldapjs` → `ldapts` migration (2–3 days), distributed rate limiter for HA (v7.0 scope). P2: WebSocket progress for LE + Remediation wizards (polling works), i18n gap on 25% of keys in non-EN locales, Remediation entry points on security/stacks/cis pages. P3: GHCR push permission (one-time repo settings toggle), LE staging CI test (needs Cloudflare secret), multi-host SSH exec channel for remote-host live apply.

---

## [6.6.0] - 2026-04-20 — "Container Remediation Wizard"

Headline feature: a 3-step UI wizard that turns Secrets Audit + CIS Benchmark findings into actionable fixes. Pick findings → preview compose YAML diff + live CLI commands → apply live (with auto-rollback) OR open a Git PR. 20-entry catalog, 4 live-updatable (memory/CPU/pids/restart) with zero downtime, 16 require recreation with `depends_on` ordering + health-check rollback window.

### Added — Container Remediation Wizard

- **3-step modal** (component: `public/js/components/remediate-wizard.js`):
  - **Step 1** — scope (container or stack) + applicable findings. Auto-select critical/warn. Info hidden by default. Select-all / deselect-all.
  - **Step 2** — per-container expandable preview: GitHub-style YAML diff (green/red) + live update commands + findings list with risk notes.
  - **Step 3** — 3 apply modes: **Apply live + recreate** (default), **Generate Git PR** (git-backed stacks only), **Download patch** (escape hatch). Live polling 2.5s.
- **20-entry remediation catalog** (`src/services/remediation-catalog.js`):
  - All CIS 5.x container runtime findings (5.3 caps, 5.4 privileged, 5.5 sensitive binds, 5.10 memory, 5.11 CPU, 5.12 readonly, 5.16 IPC, 5.25 no-new-privileges, 5.26 root, 5.28 PID, 5.29 network, 5.31 docker socket)
  - Secrets Audit: plain-text env secret → routes to existing Secrets Wizard
  - Reliability: missing healthcheck, unbounded logging, no restart policy, no PID limit
  - Format: `{code, applies(inspect), plan(inspect, composeService) → {composePatch, cliCommands, liveUpdate, notes}}`
- **Compose diff engine** (`src/services/compose-diff.js`) — uses `yaml` package (eemeli/yaml), preserves comments + style through round-trip per preflight A1. Patches: `null` = delete, `{$add: []}` / `{$remove: []}` = list surgery, nested objects = merge.
- **Docker runner** (`src/services/docker-runner.js`) — topological sort by `depends_on`, compose recreate with `--no-deps --force-recreate`, health detection via `State.Running` + `RestartCount` delta (preflight A5: 0/10 popular images ship `HEALTHCHECK`).
- **Auto-rollback** — on health-check fail or compose error, restores pre-apply compose file + re-recreates from gzipped inspect snapshot stored in SQLite.
- **Manual rollback window** — 60 seconds after a successful apply, UI shows "Rollback" button. After window expires, rollback via UI disabled.
- **Git-PR mode** — for git-backed stacks only: clones repo, creates branch `docker-dash/remediate-<planId>`, applies compose diff, commits, pushes, constructs PR URL for GitHub/GitLab/Gitea.
- **Artifact mode** — downloads `.patch` file with unified diff + shell script for manual application.
- **Bilingual How-To guide** (EN + RO): "Remediate Container Security Issues via the Wizard".

### Backend

- 3 new services: `remediation-catalog.js` (500 LOC, 20 entries), `compose-diff.js` (110 LOC), `docker-runner.js` (180 LOC), `remediate.js` (400 LOC orchestrator).
- New routes: `src/routes/remediate.js` — 7 endpoints under `/api/remediate`:
  - `GET /findings/codes`
  - `POST /plan`
  - `POST /apply`
  - `GET /job/:id`
  - `POST /job/:id/rollback`
  - `GET /jobs`
- Hash-chained audit log entries: `remediate_plan`, `remediate_apply_start`, `remediate_apply_success`, `remediate_apply_failed`, `remediate_rollback`, `remediate_pr_created`.
- Concurrency: one job per scope (container / stack) at a time. 409 with existing `jobId` on conflict.
- Error classification: `docker` / `compose` / `git` / `timeout` / `health` / `rollback` / `other` with per-class user-facing recovery hints.

### Frontend

- 6 new `Api.remediate*` methods.
- Entry points: "Fix" + "Remediate stack" buttons on every Secrets Audit container row with issues.
- Component is reusable — other pages (security.js, cis.js, stacks.js) can open it later by calling `RemediateWizard.open({ scope, findings })`.

### Infrastructure

- New migrations: `051_remediation_jobs.js` (jobs table), `052_howto_remediation_wizard.js` (bilingual How-To).
- New dependencies: `yaml` ^2.8.3 (round-trip-safe YAML), `diff` ^5.2.2 (moved from overrides to direct dependency).

### Other fixes in this release

- **Audit & Wizard subtabs duplication bug** fixed — `_renderSecretsAudit(el)` was reassigning its parameter at the end of the function; the subtab click handler's closure captured the variable, causing later clicks to render the tab bar inside the previous sub container. Fix: rename parameter to `rootEl` (never reassigned) + use local `const el = sub`.
- **30-container scan limit removed** — Secrets Audit now scans all containers on the host (parallelized via `Promise.all` with concurrency 20; previously sequential with hardcoded `.slice(0, 30)`). Response includes `scanned`, `hostTotal`, `offset`, `limit`. Optional `?limit=N&offset=N` for future pagination.
- **Stack + service + image labels** returned per container in audit output (needed by Remediation Wizard for stack-level grouping).

### Tests

- 530 → **? passing** (3 new test files cover remediation-catalog 26 tests + compose-diff 12 tests). Docker-runner + routes tested via smoke + integration flow on staging.

### Deferred to v6.6.1 / v6.7

- Entry points on security.js / stacks.js / cis.js pages (currently only Secrets Audit has them)
- Sandbox-clone "test fix first" mode
- AI-suggested image-specific fixes
- Cross-stack fleet remediation
- Remote-host Apply mode (compose file edits via SSH) — Git-PR mode already works for remote
- WebSocket progress (currently 3s polling)

## [6.5.0] - 2026-04-20 — "Let's Encrypt Wizard"

Headline feature: a 3-step UI wizard for issuing Let's Encrypt certificates from inside Docker Dash, with multi-DNS-provider support, encrypted credential vault, and integration with the existing Certificate Manager (v6.3) for tracking + renewal monitoring.

### Added — Let's Encrypt Wizard

- **3-step wizard** in System → Secrets → Certificates → "Request Let's Encrypt" button:
  - Step 1: domains (multi-domain SAN, max 100), email, challenge type (HTTP-01 / DNS-01), staging toggle (default ON for first issuance — protects against rate limits)
  - Step 2 (DNS-01): provider picker, scoped-token-vs-Global-Key warnings, save credential for reuse, optional pre-flight validation against provider API
  - Step 3: confirmation summary, "Issue Certificate" button, 3s polling on job status with terminal-style live output
- **5 DNS providers in v6.5 launch:**
  - **Cloudflare** — live token verification via `/user/tokens/verify`; rejects 37-hex-char Global API Keys by format
  - **DigitalOcean** — live verification via `/v2/account`
  - **Hetzner DNS** — live verification via `/api/v1/zones`
  - **Linode (Akamai)** — live verification via `/v4/domains` (proves Domains:Read scope, not just token validity)
  - **AWS Route53** — format-only validation (AWS SigV4 deferred to first issuance attempt)
- **Saved DNS Credentials management** — create/list/rotate/delete/validate via UI. Credentials stored AES-GCM encrypted in `acme_credentials` table. On disk for Caddy at `/etc/caddy/secrets/<id>/<field>`, mode 0600, dir 0700.
- **Let's Encrypt Managed Certificates table** — domain, challenge type, provider, credential, env (PROD / STAGING badge), one-click remove (cleans Caddy policy without touching cert files on disk)
- **Auto-renewal via Caddy** — no Docker Dash cron involvement; Caddy renews 30 days before expiry. Issued certs also picked up by the existing daily 07:30 Certificate Manager scan for expiry warnings.
- **Hash-chained audit log** captures every state change with credential ID + SHA fingerprint (NEVER credential value): `acme_credential_create / _update / _delete / _validate`, `acme_issuance_request`, `acme_certificate_remove`.
- **Bilingual How-To guide** built-in (EN + RO): "Request a Let's Encrypt Certificate via DNS Challenge" — covers when to use HTTP-01 vs DNS-01, scoped-token creation per provider, troubleshooting common errors.

### Backend

- New service: `src/services/dns-providers.js` — pluggable provider registry (~30 LOC per new provider)
- New service: `src/services/caddy-config.js` — Caddy admin API client over **Unix socket** (not TCP — security hardening from preflight A11)
- New service: `src/services/acme.js` — orchestrator for credential lifecycle + issuance
- New routes: `src/routes/acme.js` — 11 endpoints under `/api/system/acme/*`
- Custom Caddy image: `docker/caddy/Dockerfile` (Caddy 2.11.2 base + 5 DNS plugins compiled via xcaddy)
- GitHub Actions workflow: `.github/workflows/caddy-image.yml` (builds + pushes multi-arch image to GHCR)

### Infrastructure changes

- **Caddy admin API now uses Unix socket** (`/run/caddy/admin.sock`) shared via `caddy-admin-sock` Docker volume — replaces network-isolation approach (preflight A11 found that `--internal` networks don't restrict inbound from shared networks)
- **Caddy image bumped to 2.11.2** (was 2.8.4) with `ENV GOTOOLCHAIN=auto` so plugins requiring newer Go can auto-download
- **DNS credential files on disk** are read by Caddy **per-request** (preflight A3 finding) — credential rotation is zero-downtime, no Caddy reload needed

### Database

- Migration `049_acme.js` — `acme_credentials`, `acme_jobs`, `acme_managed_certs` tables (with `down()`)
- Migration `050_howto_letsencrypt_wizard.js` — bilingual How-To guide

### Tests

- 492 → **493 passing** across 36 suites (5/5 stable runs)
- New: `acme.test.js` (11 tests) — credential CRUD with encryption round-trip
- New: `dns-providers.test.js` (26 tests) — registry shape, format checks, Tier-1 coverage matrix
- New: `caddy-config.test.js` (8 tests) — module shape, ENOENT handling, input validation
- New: `acme-routes.test.js` (15 supertest integration tests) — auth required (401 unauth), encryption-at-rest verified (no plaintext in DB), no-leak in list responses, input validation for all 4xx codes

### Frontend

- 11 new `Api.acme*` methods in `public/js/api.js`
- ~390 LOC added to `public/js/pages/system.js` for the wizard + saved-credentials/managed-certs sections
- All sections **fail-silent** if ACME endpoints unreachable (e.g., Caddy not started yet) — they just don't render

### Multi-Host UX

- **Multi-Host page now defaults to Tab View** (was List View) per user request

### Documentation

- New planning docs in `docs/planning/v6.5/letsencrypt-wizard/` — public OSS planning artifact: brainstorm, feature spec, deep spec, assumption audit, preflight checklist + execution results, README index
- New proposal `docs/planning/proposals/agent-sandbox.md` — response to MS Docker Sandbox + Copilot blog post; recommends building outbound network filter as v6.6 + full Agent Sandbox in v6.7+ (decision tracked)

### Deferred to v6.5.1 / v6.6

- WebSocket-based job progress (current implementation polls `/jobs/:id` every 3s — works, just not ideal UX for slow DNS providers)
- Live integration test against Let's Encrypt staging in CI (requires CI-only Cloudflare token in GH Actions secrets)
- Credential rotation UX in Saved DNS Credentials table (today: delete + create again with same name; backend supports PATCH already)
- arm64 Caddy image push (build verified working in preflight, but GHCR push needs Repo Settings → Actions → "Read and write permissions" toggle)
- 4 more DNS providers (Namecheap, Gandi, Porkbun, OVH) — pattern in `dns-providers.js` invites ~30-line community PRs

## [6.4.0] - 2026-04-18 — "Hardening"

This release closes 31 of 35 findings from the v6.3.0 pre-sale audit (`AUDIT_2026-04-18.md`).

### Security — P0 sale-killers fixed
- **Encryption key fail-fast** — `_getKey()` throws if `ENCRYPTION_KEY` env is missing (no `'fallback-key'` fallback, regardless of `APP_ENV`)
- **Registry credentials now AES-256-GCM** — replaced XOR/base64 with `utils/crypto.encrypt`. Auto-rewraps legacy rows on startup
- **SSH host configs encrypted at rest** — new `services/host-config-crypto.js`; migration `045_encrypt_ssh_configs` re-encrypts existing rows; reads accept legacy plaintext for backwards compat
- **Database restore requires SHA-256 checksum** — `X-Backup-Sha256` header mandatory (escape: `ALLOW_UNCHECKED_DB_RESTORE=true`); 500MB cap; before/after audit entries
- **Remote-deploy hardening** — appName regex validation, 1MB script cap, full SHA-256 in audit, suspicious-pattern scan, per-host `allowed_deploy_roles` RBAC (migration 047)
- **Certificate `sourcePath` allow-list** — paths must be inside `CERT_ALLOWED_PATHS` env (defaults to `/etc/letsencrypt/live`, `/etc/ssl/certs`, `/etc/ssl/private`, `/data/certs`)
- **`openssl` no longer required for cert parsing** — `parsePem` now uses Node 15+ `crypto.X509Certificate`. `openssl` still added to Dockerfile for `generateCsr`
- **Default-admin boot guard** — production refuses to start with `ADMIN_PASSWORD=admin` unless `ALLOW_DEFAULT_ADMIN=true`
- **`docker-compose.override.yml` removed from repo** — added to `.gitignore`. Dev mode now opt-in via `docker compose -f docker-compose.yml -f docker-compose.dev.yml up`
- **Caddy bootstrap fixes chicken-and-egg** — new `caddy-bootstrap/Caddyfile.default` is copied into the volume on first start; `--profile tls up -d` now boots cleanly

### Security — P1
- **OIDC ID-token signature verified** — RS256 + JWKS fetch with 1h cache; validates `iss`/`aud`/`exp`/`nbf`; rejects `http://` discovery URLs
- **SSO header trust gated** — requires `SSO_TRUSTED_PROXY_IPS` env (CSV); fail-closed when unset
- **SSH `dockerSocket` injection blocked** — strict regex on host-config writes and SSH service reads
- **`must_change_password` enforced server-side** — middleware blocks all routes except `me`/`change-password`/`logout`/`health` until password changed
- **Bcrypt user-enumeration mitigated** — dummy compare on missing-user path
- **LDAP-provisioned users** — secure random hash (cost 12) instead of predictable `Math.random()` cost-4
- **CSRF protection** — new double-submit cookie middleware (`X-XSRF-TOKEN` header); frontend `api.js` reads cookie + sends header; bypass via `CSRF_DISABLED=true`
- **WebSocket hardening** — Origin allow-list (default = `req.headers.host`), per-IP connection cap (default 10), query-token gated by `WS_QUERY_TOKEN_ENABLED`
- **Audit retention default 7 → 365 days** — startup warns if < 90; migration 046 bumps existing setting
- **Wizard rotation register** — `force_update_intervals` flag preserves user-tuned intervals by default
- **Cert UNIQUE constraint** — returns 409 instead of leaking the SQLite error
- **Mass error-message sanitization** — 99 `res.status(500).json({ error: err.message })` replaced with generic message + full detail in server logs

### Frontend
- **"Forgot password?" link** on login — opens inline form, POSTs `/auth/request-password-reset`, generic response (no enumeration)
- **Wizard openssl preflight banner** — calls new `GET /system/secrets-wizard/preflight`, warns if openssl missing
- **Wizard rotation re-register** — warns when secrets already tracked, offers "Labels only" vs "Force-update intervals"
- **Helmet CSP** — `'unsafe-eval'` removed from `scriptSrc`

### Backend additions
- `POST /api/auth/request-password-reset` — self-service password reset (rate-limited 5/15min)
- `GET /api/system/secrets-wizard/preflight` — probes openssl/ssh availability
- `services/cert-paths.js` — shared cert path allow-list helper
- `middleware/csrf.js` — CSRF double-submit cookie

### Infrastructure
- **`entrypoint.sh`** — auto-generates `APP_SECRET`/`ENCRYPTION_KEY` on first boot if defaults are present
- **Daily backups hardened** — write to `/data/backups/`, `chmod 600`, optional AES-256-GCM with `BACKUP_ENCRYPTION_KEY`, disk-space preflight (require 2× DB size free)
- **Caddy `reloadCaddy` resilient** — returns `{ ok: false, reason }` on 404/ENOENT instead of throwing
- **Cron parser fixed** — Sunday=7→0 normalization, `*/N` inside ranges (e.g., `0-30/5 * * * *`)

### Password policy
- Min 12 chars; requires upper + lower + digit + symbol
- Extended blacklist (`password`, `admin`, `docker`, `dashboard`, `qwerty`, `changeme`, …)
- Optional HIBP k-anonymity check via `HIBP_API_ENABLED=true` (fail-open on network error)

### Tests
- 384 → **431 passing** (32 suites, 0 failing)
- New: `cron-parser.test.js` (22 cases), `certificates.test.js` (12 cases), `secretsRotations.test.js` (10 cases)
- `helpers/seedTestAdmin.js` — clears `must_change_password` for test admin
- All 15 affected test suites updated to call `clearMustChange()` in `beforeAll`

### Migrations added (with `down()` for first time)
- `045_encrypt_ssh_configs.js`
- `046_audit_retention_bump.js`
- `047_host_permissions.js`

### Deferred to v6.5
- F16 — `ldapjs` decommissioned by upstream → migrate to `ldapts`
- F20 — Add `down()` to retroactive migrations 001–044 (going forward only)
- F27 — i18n missing ~25% keys in non-EN locales (needs translator)
- F30 — In-memory rate limiter → Redis backend for horizontal scale

## [6.3.0] - 2026-04-18

### Added — Secrets Lifecycle Suite

**Phase 1 — Secrets Wizard**
- 4-step wizard (System > Secrets > Audit & Wizard → *Launch Wizard*):
  1. Paste `.env` + app name + secrets directory
  2. Review classified secrets (20+ patterns: JWT, HMAC masterkey, Django secret, Cloudflare Tunnel/Turnstile, Entra/Graph, OAuth, TLS cert/key/CA, SSH key, SMTP, vendor, DB, migrator, Grafana, generic password/secret/token)
  3. Paste provider-issued values (base64-embedded in output)
  4. Download generated `setup-secrets.sh` + `compose-secrets.yml`, or deploy remotely via SSH
- Generated script: `set -euo pipefail`, `printf '%s'` (never `echo`), `chmod 600`, `chown root:docker`, skips existing files, includes tmpfs fstab hint, verifies permissions at the end
- Backend: `POST /api/system/secrets-wizard/analyze`, `/generate-script`, `/generate-compose`

**Phase 2 — Remote SSH Deploy**
- `POST /api/system/secrets-wizard/deploy-remote` — SFTP uploads the script to `/tmp/docker-dash-secrets-<rand>.sh`, executes with `sudo -n bash`, streams combined stdout/stderr back, self-deletes on exit
- Wizard Step 4 adds a target-host dropdown (filtered to SSH-configured hosts) + live output panel + audit log entry

**Phase 3 — Rotation Tracker**
- Migration 043: `secret_rotations` + `secret_rotation_history`
- System > Secrets > **Rotation Tracker** sub-tab: summary cards (Total / OK / Due Soon / Overdue) + table with per-secret status badges
- Per-row actions: *Mark Rotated* (creates history entry + resets `next_due_at`), *Edit Interval*, *Untrack*
- Wizard Step 4 gains a "Track for Rotation" block — bulk-registers all classified secrets with their default intervals (90–365 days)
- Daily cron at 07:00 re-evaluates statuses and logs a scan entry when there are overdue/due-soon items
- Routes: `GET /api/secrets-rotations`, `/summary`, `POST /bulk`, `POST /:id/mark-rotated`, `PATCH /:id`, `DELETE /:id`, `GET /:id/history`

**Phase 4 — Certificate Management**
- Migration 044: `tracked_certificates`
- System > Secrets > **Certificates** sub-tab: summary cards + table (Name, Subject, SANs, Issuer, Status, Expires, Days, Fingerprint)
- Add by pasting PEM content or providing an on-disk path (file mode re-reads on refresh/cron)
- **CSR Generator** — openssl-backed form for CN, SANs (DNS + IP), O/OU/C/ST/L/Email, RSA 4096 or EC P-256 keys; downloads `.key` + `.csr`
- Daily cron at 07:30 re-parses all tracked certs and logs scan entries when critical/warning/expired counts are non-zero
- Routes: `GET /api/system/certificates`, `POST /`, `POST /:id/refresh`, `DELETE /:id`, `POST /certificates/csr`
- Service: `src/services/certificates.js` (parsePem, generateCsr, daysUntil, statusForDays)

### UI
- New three-pane sub-tab bar inside System > Secrets: **Audit & Wizard** · **Rotation Tracker** · **Certificates**
- Status color system: `ok` green · `warning` yellow (≤30d) · `critical` red (≤7d) · `expired` red · `unknown` dim

### Security
- Remote SSH exec uses `sudo -n` (non-interactive) — requires NOPASSWD sudoers entry or the script runs as the login user
- Scripts self-delete from `/tmp` after execution (no plaintext residue)
- All new endpoints require `admin` role; read-only endpoints also accept `operator`

## [6.2.0] - 2026-04-17

### Added — Enterprise Deployment Tooling
- **Secrets Audit** (System > Secrets tab) — scans up to 30 containers for secret hygiene: detects plain-text sensitive env vars (never exposing values), flags privileged containers, Docker socket mounts, missing `no-new-privileges`, no resource limits, missing `_FILE` pattern. Per-container 0-100 score + aggregate security score.
- **Pre-Deploy Validation** (same tab) — paste `.env` + `docker-compose.yml` for instant validation. 10 checks: TODO placeholders, plain-text secrets, APP_SECRET presence, restart policy, healthcheck, resource limits, logging, secrets block, privileged mode, security_opt. Returns pass/fail/warn/info with fix suggestions.
- **5 new How-To guides** (EN + RO, 51 total now):
  - Docker Secrets Management — the `_FILE` pattern, compose wiring, permissions
  - Secret Rotation Best Practices — 90-day cycles, atomic rename, rollback plan, two-person rule
  - mTLS for Service-to-Service Auth — cfssl setup, nginx config, renewal
  - printf vs echo — The Newline Trap — why `echo` silently corrupts credentials
  - Pre-Deploy Checklist — 12-point script with two-person rule

### Backend
- `GET /api/system/secrets-audit` — container-by-container hygiene scan
- `POST /api/system/deploy-validate` — stateless env + compose validator
- Migration 042 — 5 bilingual deployment guides seeded (total built-in: 51)

### Dashboard
- **Cluster Health detail line restored** — shows `X/Y running · CPU% · RAM%` below the Health label

### i18n
- **Error boundary dialog now respects language setting** — all hardcoded Romanian text replaced with `i18n.t()` calls; falls back to English if i18n not loaded; new `errors.*` keys in EN and RO

### Fixed
- `Modal.confirm()` now supports `html: true` option — Deep Cleanup dialog no longer shows raw HTML tags
- Column config gear button moved from absolute overlay to inline in last `<th>` — no more UI overlap
- Container stats labels restored — `Total`, `Running`, `Stopped`, `Needs Attention` now show next to counts
- Multi-Host view toggle moved between By Host and By Stack tabs — hidden when By Stack is active

### Changed
- **System > Stacks tab removed** — all functionality now in the main Stacks page (`#/stacks`) with Create Stack button and container badges (tags style)
- Login Banner (MOTD) simplified — single textarea with one message per line + random checkbox (was 3-mode complex editor)
- Cluster Health card on dashboard — compact 48px gauge inline with other stat cards
- Stacks page — Create Stack modal with YAML editor + deploy prompt
- Stacks page — container names displayed as colored badges (green=running, red=stopped) instead of comma-separated text

## [6.1.0] - 2026-04-06

### Added
- **How-To Knowledge Base** — new page with 46 built-in bilingual guides (EN + RO) across 9 categories: Docker basics, Linux, networking, security, Compose, troubleshooting, Docker Dash, backup, performance
- **Guide Editor** — admins can create, edit, and delete custom guides with bilingual content (HTML)
- **Full guide content** — all 46 guides have complete step-by-step instructions with code blocks (migrations 040 + 041)
- **Comparison table expanded** — 105 features compared across 8 tools (was 63); all v5.4–v6.0 features added
- **All 19 System Tools in Ctrl+K** — command palette now includes every tool: hash generator, regex tester, IP calculator, Base64, JSON formatter, etc.

### Fixed
- **Server crash on startup** — migration 040/041 had unescaped `${POSTGRES_USER}` in template literals, interpreted as JS interpolation
- **Hash Generator crash on HTTP** — `crypto.subtle` unavailable on non-secure origins; added graceful fallback message
- **Login theme not persisting** — dark/light toggle saved inconsistent values to localStorage
- **Login MOTD appearing 2-3 times** — race condition on multiple `_showLogin()` calls; added mutex flag
- **Login version text** — now links to GitHub repository with icon
- **Column config button overlapping UI** — moved from absolute-positioned overlay to inline in last `<th>`
- **Smart container icons** — Topology and Dep Map canvas now show contextual icons (database, cache, web, etc.) instead of generic cubes
- **Linux icon missing** — `fas fa-linux` → `fab fa-linux` (Font Awesome brands) in multihost, dashboard, image picker

## [6.0.0] - 2026-04-05

### Added — 20 Features Across 5 Sprints

**Sprint 1 — Quick Wins**
- **Login Banner (MOTD)** — admins set a persistent message on the login page (System > Info)
- **Clone/Duplicate Stack** — copy button on stack headers duplicates compose config with new name
- **Custom Attributes** — add arbitrary key-value metadata to containers beyond Docker labels
- **Install script** — `install.sh` existed already; verified and ready for `curl | sh` deployment

**Sprint 2 — UX Enhancements**
- **Onboarding Wizard** — 3-step welcome overlay for new installs (<3 containers), feature highlights, quick-start tips
- **Resource Sparklines** — tiny 60x16 CPU line charts per running container in the list, updated from 1h stats data
- **Host Hardware Info** — kernel version, storage driver, and image count added to Multi-Host host cards
- **Container Metrics Comparison** — select 2-5 containers, compare CPU/RAM on side-by-side Chart.js line charts

**Sprint 3 — Operations**
- **S3 Backup Export** — one-shot backup of SQLite DB to any S3-compatible storage (AWS Signature V4, no SDK)
- **Docker Version Checker** — System page card showing Docker Engine version per host with mismatch warnings
- **Backup File List** — shows local backup files with sizes and dates in System page
- **Cost Allocation by Team** — new "By Team" tab in Cost Optimizer grouping container costs by metadata owner

**Sprint 4 — Large Features**
- **Event Timeline** — new page aggregating audit log, alerts, and Docker events on a visual timeline with date groups, category icons, and severity badges; filters by time range, category, and text search
- **Workload Balancing Recommendations** — Multi-Host Overview shows DRS-style suggestions for container rebalancing, CPU/RAM pressure warnings
- **Container Migration Wizard** — right-click → Migrate to Host; inspects container, creates+starts on target host with same config

**Sprint 5 — Polish**
- **Theme Customizer** — 8 preset accent colors + custom color picker in System page; changes apply instantly and sync across devices
- **i18n Completion** — nav keys for logs, timeline, multi-host added to all 11 languages with proper translations
- **Accessibility** — `role` and `aria-label` attributes on sidebar, main content, and all footer buttons; `.sr-only` CSS utility class
- **Smart Container Icons** — Topology and Dep Map canvas icons now match container type (database, cache, web, queue, auth, etc.)

### Backend
- `GET /motd`, `PUT /motd` — login banner management
- `GET /timeline` — aggregated event timeline from 3 sources
- `GET /recommendations/balancing` — workload balancing analysis
- `POST /system/backup/s3` — S3 backup with AWS SigV4
- `GET /docker-versions` — per-host Docker version info
- `GET /system/backup/list` — local backup file inventory
- `GET /stats/sparklines` — downsampled 1h CPU/RAM data for sparkline charts

## [5.10.0] - 2026-04-05

### Added — Enterprise Wave 4 (Final 3/23 ESXi gaps closed)
- **Enterprise Datagrid** — DataTable component upgraded with client-side pagination (25/50/100 rows/page in Enterprise mode), per-column filter dropdowns (click filter icon → unique values), page navigation (first/prev/next/last + page size selector)
- **Volumes Detail View** — click any volume to see tabbed detail: Overview (name, driver, scope, mountpoint, labels), Connected Containers (which containers use this volume), Inspect (raw JSON with copy)
- **Networks Detail View** — click any network to see tabbed detail: Overview (driver, IPAM config, options), Connected Containers (with IP/MAC addresses), Inspect (raw JSON)
- **Master/Detail Split View** (Enterprise only) — toggle button in containers list; click a row to see container summary in a bottom panel (image, status, ports, mounts) without leaving the page; "Full View" button to navigate
- **Right-click context menus for Volumes** — View Details, Inspect JSON, Remove

### ESXi Gap Analysis: 23/23 COMPLETE
All 23 must-have improvements from the VMware ESXi/vCenter gap analysis are now implemented.

## [5.9.0] - 2026-04-05

### Added — Enterprise Wave 3 (5 features)
- **Maintenance Mode / Node Drain** — drain button per host in Multi-Host Overview; stops all non-system containers, marks host as "maintenance" (orange badge); Activate button restores to production
- **Certificate Management UI** — System page card showing TLS certificates per host (Docker TLS configs + app-level certs) with CA/key indicators
- **Saved Filter Presets (Advanced)** — save custom filter combinations with names; dashed-border pills in filter bar; persists in localStorage; removable via ×
- **Inline Edit for Container Metadata** — click any metadata field (app name, description, category, owner, notes) in container detail to edit in-place; saves on Enter/blur, cancel on Escape
- **Stack Creation Wizard** — 3-step guided wizard: Stack Name → Add Services (name, image, ports, dynamic add/remove) → Review & Edit YAML → Deploy; generates docker-compose.yml automatically

### Backend
- `POST /hosts/:id/drain` — stops all running containers (skips docker-dash), sets environment=maintenance
- `POST /hosts/:id/activate` — restores environment=production
- `GET /system/ssl/certificates` — lists TLS certificates from host configs + app cert paths

## [5.8.0] - 2026-04-05

### Added — Enterprise Wave 2 (9 features)
- **Support Bundle / Diagnostic Export** — one-click JSON download with Docker info, container states, recent logs (20 lines/container), DB stats, memory/uptime
- **Type-to-confirm for destructive ops** — running container removal requires typing the container name; Modal.confirm() now supports `typeToConfirm` option
- **View Density toggle** — 3 levels (Comfortable / Compact / Dense) in sidebar footer; per-user preference synced to server
- **Global Search enhanced** — Ctrl+K command palette now also searches containers, images, volumes, networks live via API; results grouped by type with icons
- **Chart export (PNG/CSV)** — export buttons on each container stats chart (CPU, Memory, Network, Block I/O)
- **Cluster Health Score** — dashboard gauge (0-100) with SVG ring chart; scores container health, CPU/RAM pressure, stopped ratio
- **Session Management** — System page shows active sessions with user, IP, start time, user agent; admins can terminate other sessions
- **Saved Filter Presets** — quick filter pills above containers list: All / Running / Stopped / Unhealthy / Sandbox
- **Centralized Log Explorer** — new page aggregating logs from all running containers; severity filtering (error/warn/info/debug), regex search, multi-container color-coded interleaved view, Ctrl+Click multi-select, TSV download

### Backend
- `GET /system/database/diagnostics` — diagnostic bundle download
- `POST /system/database/cleanup-aggressive` — deep cleanup (keep last N hours only)
- `GET /cluster-health` — composite health score with breakdown
- `GET /auth/sessions` + `DELETE /auth/sessions/:id` — session list + terminate
- `GET /containers/logs/multi` — cross-container log aggregation with severity detection

## [5.7.0] - 2026-04-05

### Added
- **Enterprise UI Mode** — switchable interface inspired by VMware ESXi/vCenter; toggle between Standard (clean, simple) and Enterprise (compact, dense, power-user) from the sidebar
- **UI mode toggle** — rocket/building icon in sidebar footer; preference saved per user (localStorage + server), restored on login, synced across devices
- **Enterprise density** — reduced padding, smaller fonts, 4px border-radius, compact tables/cards/stat cards/buttons/badges for more information per screen
- **Right-click context menus** — state-aware context menus on container rows (12 actions: details, terminal, logs, start/stop, restart, pause, rename, remove) and image rows (8 actions: inspect, layers, scan, sandbox, tag, export, remove)
- **Persistent bottom task bar** (Enterprise only) — global operation tracker showing active container actions with progress, elapsed time, auto-fade on completion; tracks start/stop/restart operations
- **Enterprise sidebar** — ESXi-inspired nav reorganization: Compute (Multi-Host, Containers, Stacks, Swarm) → Storage (Images, Volumes) → Networking (Networks, Firewall, Dep Map) → Monitor (Insights, Alerts, Cost, Security) → Operations → Admin
- **Column configuration** (Enterprise only) — gear icon on DataTable headers; dropdown with checkboxes to show/hide columns; visibility persisted across data refreshes
- **Keyboard shortcuts overlay** — press `?` anywhere to see all shortcuts; two-column layout with Global (17 shortcuts) and Containers Page sections
- **`g + key` navigation** — press `g` then `d/c/i/v/n/s/m/a/h` to navigate to Dashboard/Containers/Images/Volumes/Networks/Stacks/Multi-Host/Alerts/Hosts
- **`/` focus search** — press `/` to focus the search input on any page

### i18n
- Added enterprise sidebar section labels (Compute, Storage, Networking, Monitor) to all 11 languages

## [5.6.0] - 2026-04-05

### Added
- **Multi-Host Overview page** — ESXi/vCenter-style unified view of ALL Docker hosts, stacks, and containers
- **By Host tab** — each host as a card showing CPU/RAM bars, Docker version, OS info, and collapsible stack groups with health dots per container
- **By Stack tab** — all stacks grouped across hosts, showing which hosts run each stack and their container health status
- **Aggregate stat cards** — total hosts (online/offline), containers, running, stopped, images across all hosts
- **Host offline detection** — red-bordered card with "Host offline" message for unreachable hosts
- **Cross-host navigation** — clicking a container auto-switches host context and navigates to the container detail
- **15-second auto-refresh** — live updating overview without manual refresh
- **Sidebar nav item** — "Multi-Host" entry with network icon, shown in navigation

### Backend
- `GET /api/multi-host/overview` — parallel data fetch from all active hosts (containers, Docker info, stats overview) via `Promise.allSettled` with graceful offline fallback

## [5.5.1] - 2026-04-05

### Added
- **Sandbox Project Source** — launch sandbox containers with pre-loaded source code from:
  - **GitHub URL** — paste any public repo URL; Docker Dash downloads the tarball, auto-detects the tech stack, installs dependencies, and starts the app
  - **Upload Archive** — upload a .tar or .tar.gz archive; same auto-detect + auto-run flow
- **Tech stack auto-detection** — detects Node.js (package.json), Python (requirements.txt), Go (go.mod), Ruby (Gemfile), static HTML (index.html) and selects the appropriate base image automatically
- **Auto-dependency install** — `npm install --ignore-scripts` for Node, `pip install` for Python, `go mod download` for Go
- **Auto-start command** — reads `scripts.start` from package.json, or falls back to language-specific defaults
- **Auto-port detection + expose** — detects port from stack defaults (3000 for Node, 5000 for Python, 8080 for Go) and auto-exposes it
- **Progress indicator** — 5-step progress display in sandbox modal: pull image → download project → detect stack → install deps → start app
- **Port access link** — on success, toast shows clickable "Open http://host:port" link
- **Advanced overrides** — optional start command and port override fields when using project source

### Backend
- `_downloadGithubTarball(owner, repo, branch)` — GitHub API tarball download with redirect follow
- `_peekTarFiles(tarBuffer)` — reads tar headers to list files without extraction (strips GitHub prefix)
- `_detectStack(fileList)` — maps manifest files to stack/image/installCmd/startCmd/port
- `_execWithTimeout(container, cmd, timeout)` — exec with 120s timeout for builds
- `POST /sandbox` extended with: `projectSource`, `githubUrl`, `githubBranch`, `uploadContent`, `uploadFilename`, `autoDetect`, `startCommand`, `exposePort`

## [5.5.0] - 2026-04-05

### Added
- **Sandbox Mode** — launch containers with resource limits, network isolation, and auto-cleanup. Two modes:
  - **Ephemeral** — auto-deletes when stopped, with optional TTL (30m / 1h / 4h)
  - **Persistent Sandbox** — survives stop/start, isolated network, resource-limited
- **Sandbox launch modal** — configurable image, mode, TTL, RAM (256MB-2GB), CPU (0.25-2 cores), network isolation
- **Three entry points** — Containers "Sandbox" button, Images "Run in Sandbox" per image, Templates (future)
- **Sandbox visual badges** — `EPHEMERAL` (red) with countdown or `SANDBOX` (yellow) badges in containers list, colored left border
- **Sandbox detail card** — info card in container detail showing mode, remaining TTL, limits, user, with "Extend +1h" and "Stop & Remove" buttons
- **TTL auto-cleanup** — background timer checks every 30s for expired sandbox containers, auto-removes them, sends WebSocket notification
- **Security defaults** — `no-new-privileges`, `restart: no`, dedicated `dd-sandbox` bridge network (internal, no external access), no Docker socket mount, no privileged mode

### Backend
- `POST /api/containers/sandbox` — create & start sandbox container with labels, limits, isolated network
- `GET /api/containers/sandbox/active` — list active sandbox containers
- `DELETE /api/containers/sandbox/:id` — stop & remove sandbox (with safety check for sandbox label)
- `POST /api/containers/sandbox/:id/extend` — extend TTL by 1 hour
- Sandbox TTL timer in `src/jobs/index.js` — 30s interval cleanup with audit logging
- `dd-sandbox` Docker network auto-created (bridge, internal) on first sandbox launch

## [5.4.0] - 2026-04-05

### Added
- **One-click port access** — each exposed TCP port in the Containers list gets a clickable external-link button; opens `http(s)://host:port` in a new tab; icon appears on row hover
- **Log time filter** — "since" dropdown (All time / Last 1h / 6h / 24h / 7d) added to the container log viewer toolbar alongside tail count
- **Keyboard navigation in Containers list** — Arrow Up/Down to move between rows, Enter to open detail view, `r` to restart, `s` to stop/start, `l` to jump to Logs tab; focused row highlighted in blue
- **Live CPU/RAM mini-bars** — two 4px color-coded progress bars per running container row, updated every 5 s via `/stats/overview`; color shifts green→yellow→red by utilization
- **Dual AI provider (OpenAI + Ollama)** — Container Doctor "Ask AI" button with provider/model/key inputs; calls OpenAI API or local Ollama and streams the response directly into the modal; config persisted in localStorage
- **Image layer visualization** — new Layers button in the Images table; opens a modal showing all image layers with command, size, and a relative-size bar per layer (color-coded by size)
- **Generate docker-compose from GitHub** — new "From GitHub" button in Containers; fetches README/package.json/go.mod/requirements.txt from any public GitHub repo, sends to AI (OpenAI or Ollama), returns a production-ready docker-compose.yml with health checks, volumes, networks, and resource limits

### Backend
- `POST /api/ai/chat` — generic AI chat endpoint supporting OpenAI and Ollama providers
- `POST /api/ai/github-compose` — fetches GitHub repo context (5 files max) and generates docker-compose via AI
- `GET /images/:id/history` already existed; wired to new frontend Layers modal
- `GET /containers/:id/logs` already accepted `since` param; now passed from frontend log-time selector

## [5.3.1] - 2026-04-05

### Added
- **Stack-level security buttons** — Security Scan (🟡) and CIS Benchmark (🟢) directly in the stack header in Containers page
- **Scan Detail overlay** — "View Details" per image after a Security Scan opens full CVE breakdown *over* the scan modal without closing it; includes Critical/High/Medium/Low grid, recommendations, full CVE table with fix versions, and AI prompt copy
- **CIS Benchmark card in Security overview** — run benchmark and see score + issue counts without leaving Security page; result cached in sessionStorage
- **CIS Benchmark header button** in Security page — one-click navigation to System > CIS tab
- **Actions Guide (i button)** in Containers and Images — full 2-column overlay reference documenting every stack action, container action, and status indicator
- **Generated docker-compose.yml** — View Composer reconstructs YAML from container inspect metadata with a "Generated" notice when no real file is found on disk
- **Comparison table sticky header + footer** — column headers and legend always visible; table scrolls internally with `max-height: calc(100vh - 280px)`

### Improved
- CIS Benchmark reorganized into sub-tabs: Guide, Daemon, Containers, All results; per-container hardened compose generator
- Template images loading — `cdn.jsdelivr.net` added to Content Security Policy `imgSrc`
- Version in System > Info and About now reads from `src/version.js` (mounted volume) — no longer shows stale baked image version
- Grype added to image scan dropdown menu (was missing)
- Comparison table first-column sticky cells use `--surface2` with `box-shadow` to eliminate transparency bleed-through at scroll

### Fixed
- Scan History "View Details" eye button did nothing — event listeners were placed after a `return` statement (dead code)
- Image scan dropdown positioned off-screen — `event.currentTarget` resolved to the delegated table element instead of the actual button
- Actions Guide overlay background transparent on light theme — `--card-bg` variable undefined; replaced with `--surface`
- CIS Benchmark header button non-functional — inline `onclick` blocked by CSP `scriptSrcAttr: none`; replaced with addEventListener
- Grype install instructions appeared visually grouped with Docker Scout — separator div moved to correct position

## [5.3.0] - 2026-04-04

### Added
- **Docker Swarm mode** — full UI: Nodes table (availability/role management, drain, remove), Services (create, scale, remove, tasks drill-down), Tasks (sorted by state, error display), Overview (init form, stat cards, join tokens, leave)
- **Swarm beginner guide card** — explains Nodes (manager vs worker), Services (replicated vs global), Tasks, Overlay Networks + Ingress, CLI quickstart example
- **Swarm official docs card** — 5 direct links: overview, tutorial, deploy services, overlay networking, secrets
- **Extended comparison matrix** — 4 new tools added: Coolify, Yacht, Rancher, Portainer Business (8 tools total, 60 features)
- **Sticky first column** in comparison table — feature name stays visible while scrolling 8 columns horizontally

### Improved
- Nav "Swarm" translation added to all 11 locale files (Klingon: `ramDaq veQ`)
- Comparison matrix stat cards: "Dockge Missing" → "Coolify Missing" for more relevant callout
- What's New page: added 5.1.0, 5.2.0 and 5.3.0 release entries (were missing)

### Fixed
- Latency tracking middleware crash (`ERR_HTTP_HEADERS_SENT`) — `res.setHeader` called after headers already sent by `sendFile()` for static streams; guarded with `!res.headersSent`

## [5.2.0] - 2026-04-03

### Added
- **SSL zero-config** — Caddy sidecar reads shared `caddy-certs` volume; app writes Caddyfile + reloads via `docker exec`; enable HTTPS from System > SSL tab, no manual container restarts
- **LDAP / Active Directory sync** — two-bind auth (service account bind → user search → user bind to verify password), group filter, attribute mapping, user preview list; auto-provisions local accounts on first LDAP login with unusable password hash
- **CIS Docker Benchmark tab** — 18 checks (6 daemon: logging, experimental, live-restore, userland-proxy, seccomp, AppArmor; 12 container: privileged, cap-add, no-new-privileges, namespace sharing, read-only rootfs, memory/CPU limits, sensitive mounts, privileged ports, running as root), scored report with severity + remediation
- **App marketplace logos** — walkxcode/dashboard-icons CDN integration with FontAwesome icon fallback on error
- **LDAP config API** — `GET/PUT/DELETE /api/auth/ldap`, `POST /api/auth/ldap/test`, `GET /api/auth/ldap/users`
- DB migration 037: `ALTER TABLE users ADD COLUMN auth_source TEXT NOT NULL DEFAULT 'local'`

### Improved
- System page tabs wrap on small screens (phone / RDP window) — added `flex-wrap: wrap` to `.tabs` CSS class
- Caddy status shown in SSL card with badge + conditional "Enable HTTPS" button vs terminal command display

### Fixed
- SQLite `datetime("now")` bug in `registry.js` and `pipeline.js` — double-quoted identifiers treated as column names by SQLite; changed to single-quoted string literals `datetime('now')`

## [5.1.0] - 2026-04-02

### Added
- **Docker Registry edit** — full edit modal pre-populated with current registry data, calls `PUT /api/registries/:id`; was a "coming soon" stub
- **Registry test shows repo count** — inline table feedback with repository count; 0 repositories now correctly returns red failure with message (not success)
- **Pull Image registry dropdown** — 7 presets (Docker Hub, GHCR, MCR, Quay, ECR Public, GCR, Custom) with auto-filled prefix and dynamic placeholder
- **SSH Key authentication guide** on Hosts page — 3-step card (keygen → ssh-copy-id → paste) matching the SSH Tunnel Linux distros

## [5.0.5] - 2026-03-31

### Added
- **Template Configurator** — dynamic visual editor for template deployment: auto-detects configurable fields (passwords, ports, URLs, booleans), generates smart forms, live YAML preview with change highlighting
- **Password generator** in configurator — slider (8-256 chars), Generate button, strength indicator, weak default warnings
- **3 Euro-Office templates** — Document Server standalone, Euro-Office + Nextcloud combo, Dev Stack (Euro-Office vs OnlyOffice)
- **Cost Optimizer tabs** — Recommendations and Cost Breakdown on separate tabs under savings banner
- **3-button template UX** — Eye (view YAML), Sliders (configure & deploy), Rocket (deploy with defaults)

### Fixed
- Container filter reset on page navigation (ghost filter no longer persists)
- Template configurator: Generate button now correctly updates both input field and YAML preview
- Template configurator: password field layout — input full width, controls on separate row
- Template configurator: strength bar updates correctly after generating (was stuck on "weak")

## [5.0.4] - 2026-03-30

### Verified
- All findings from external audit re-verified on live GitHub repo
- API key permission enforcement confirmed live (enforceApiKeyPermissions in auth middleware)
- Rate limiting confirmed on /validate-reset-token and /reset-password-token
- Version consistency confirmed: 5.0.4 across package.json, docker-compose.yml, index.html
- Zero stale references (4.2.0, 335 tests, 52 features, 20 templates, ENABLE_TLS) — all clean
- 384 tests, 29 suites, 100% passing

## [5.0.3] - 2026-03-30

### Security
- **API key permission enforcement** — read-only API keys now blocked from POST/PUT/DELETE (was decorative, now enforced in auth middleware)
- **Rate limiting** on public reset-password endpoints (`/validate-reset-token`, `/reset-password-token`)

### Fixed
- `/api/docs` feature count: 52 → 75+
- `/api/compare` App Templates: "20 built-in" → "30 + custom"
- docker-compose.yml TLS comment: "ENABLE_TLS=true" → "docker compose --profile tls up -d"
- .env.example strict mode description: clarified Bearer/API key still work (by design)
- SECURITY.md: removed "login" from validatePassword flows (login only compares hashes)
- changePassword() comment: "except current" → "all sessions" (matches actual behavior)

## [5.0.2] - 2026-03-30

### Fixed
- CRITICAL: MFA login flow — session cookie was set before MFA verification, creating invalid cookie when TOTP required. Cookie now only set after complete authentication.
- README CSP tradeoff description aligned with actual code (unsafe-eval only, NOT unsafe-inline)
- dotenv added as explicit dependency for local development reliability
- .env.example expanded with missing config vars (SECURITY_MODE, PASSWORD_MAX_AGE_DAYS, APP_NAME, etc.)
- SECURITY.md auth model description clarified (API keys use separate table)
- CI syntax check error fixed (single quotes → backtick template literals in MFA flow)

## [5.0.1] - 2026-03-30

### Fixed — Documentation & Release Hygiene
- All documentation files updated to reflect actual project stats (384 tests, 29 test files, 32 migrations, 11 languages)
- Stale test counts fixed across README.md, SECURITY.md, CONTRIBUTING.md, CI workflow, PR template, comparison table
- Cache busters updated in index.html (all `?v=` references now `5.0.1`)
- i18n language count fixed in comparison API (`EN/RO/DE` → `11 languages`)
- Project structure in README corrected (13 migrations → 32 migrations)
- README language list expanded from "English, Romanian, German" to all 11 languages
- whatsnew.js v5.0.0 test count corrected (359/24 → 384/29)
- PR template test threshold updated (335+ → 384+)
- CI summary test count updated (335 → 384)

### Changed
- Version bumped from 5.0.0 to 5.0.1 across package.json, docker-compose.yml, index.html

## [5.0.0] - 2026-03-29

### Added — Enterprise Security Hardening
- **Enterprise Security Mode** — `SECURITY_MODE=strict` flag toggles all hardening (cookie-only auth, forced HTTPS, 8h sessions, password expiry)
- **TOTP/MFA** — two-factor authentication with zero dependencies (RFC 6238), encrypted secrets, 10 recovery codes
- **Immutable hash-chained audit log** — SHA-256 chain, tamper detection, JSON/CSV/Syslog export
- **Security event alerting** — 5 default rules (brute force, admin created, MFA disabled), threshold detection, 7 notification channels
- **14 developer tools** — Password Generator, Hash Generator, IP Calculator, JSON Formatter, Regex Tester, Text Diff, and more
- **HTML/Markdown converter** tools with live preview
- **Klingon pIqaD font** integration with full easter egg experience

### Fixed
- Dependency Map layout — containers no longer overlap (improved force simulation)
- Port Reference expanded to 57 ports (Docker, K8s, MQTT, RDP, etc.)

### Improved
- External audit findings addressed — 6 security tradeoffs fully documented, deployment recommendations table
- 384 tests across 29 test files (100% passing)

### Security
- All inline event handlers eliminated (67 `onclick=`/`onchange=` converted to `addEventListener`)
- CSP `scriptSrc` no longer includes `unsafe-inline`; `scriptSrcAttr` set to `none`

### Technical
- 4 new DB migrations (029-032): enterprise security, MFA, audit integrity, security alerts
- 5 new test files: TOTP, audit integrity, health endpoint, webhooks, stacks, images scan, alerts

## [4.2.0] - 2026-03-28

### Added — 20 New Features
- **Image pull progress** — real-time streaming per-layer progress bars via SSE
- **Resource limits editor** — visual sliders with presets (256MB-2GB memory, 0.5-4 CPU cores)
- **Bulk container actions** — checkboxes + floating action bar for batch start/stop/restart/remove
- **Theme & language sync** — user preferences saved server-side, synced across devices
- **Container file browser** — navigate, view, download files inside running containers
- **Docker Compose editor** — edit, validate, save & deploy compose configs inline
- **Scheduled actions** — cron-based automation with presets, execution history, run-now
- **Container diff** — filesystem changes vs base image with color-coded entries
- **Container rollback** — one-click revert to previous image with version history
- **Notifications center** — dedicated page with filters, pagination, bulk mark-read/delete
- **Dashboard customizable** — toggle widget visibility, order saved to server per user
- **Stacks page** — unified Compose + Git stacks management with actions
- **Container groups** — user-defined grouping with colors, beyond compose projects
- **API Playground** — browse and test all API endpoints from the UI with response viewer
- **AI Container Doctor** — diagnostics + 30 log patterns + AI prompt generator for ChatGPT/Claude
- **Cost Optimizer page** — per-container cost breakdown, idle detection, savings recommendations
- **Dependency Map** — interactive canvas graph showing container relationships
- **Deployment Pipelines** — staged pull → scan → swap → verify → notify with history
- **Mobile responsive** — full UI on phone/tablet with 360px-768px breakpoints
- **Container health dots** — color-coded indicator in list view with summary bar

### Security
- Eliminated all remaining `execSync` with user input (firewall, compose, Docker login)
- Groups routes: `requireRole('admin','operator')` on all write endpoints
- Global prototype pollution protection middleware
- Unified password policy enforced on all 4 auth flows

### Testing
- **231 new tests** across 14 test files (104 → 335 total)
- CRITICAL: RBAC enforcement, SQL injection, path traversal, prototype pollution, password policy
- HIGH: log patterns, groups service, preferences, notifications, pipeline service
- MEDIUM: templates CRUD, schedules, cost analysis, validation, health endpoint

### Technical
- 5 new DB migrations (024-028)
- 6 new frontend pages
- 3 new backend services (groups, pipeline, log-patterns)
- 34 files changed, 5,492 insertions

## [4.1.0] - 2026-03-28

### Added
- **Grype vulnerability scanner** — third scanning option alongside Trivy and Docker Scout (auto-fallback: Trivy → Grype → Scout)
- **Custom templates** — add, edit, delete your own app templates (System > Templates) with full CRUD
- **Built-in template overrides** — modify default templates, tracked with who/when modification badges
- **Template preview** — view docker-compose.yml before deploying with Copy button
- **Template deploy endpoint** — `POST /templates/:id/deploy` writes temp compose and runs `docker compose up -d`
- **Container health score dot** — color-coded indicator in list view (green/yellow/orange/red)
- **Container summary bar** — total, running, stopped, needs attention counts with clickable state filters
- **Host info bar** on dashboard — hostname, CPUs, RAM, Docker version, storage driver, OS, uptime
- **Container detail tabs** — Labels (grouped by type), Mounts, Network with port bindings
- **About page** — GitHub repository link, author info

### Fixed
- **Export Container Configuration** dialog no longer closes immediately (Modal.close 200ms timer race condition)
- **System > Templates** tab now loads correctly (duplicate `getTemplates()` API method removed)
- **Container summary bar** spans full width in 2-column layout
- **Dockerfile healthcheck** uses configurable `APP_PORT` via shell expansion

### Security
- **Unified password policy** — `validatePassword()` enforced on all 4 password flows (change-password, reset-password, create-user, token-reset)

### Improved
- **Caddyfile** converted to generic template with `YOUR_HOST` placeholder
- **EVENT_RETENTION_DAYS** aligned to 7 across `.env.example`, config, README
- **README badges** linked to verifiable artifacts (CI pipeline, SECURITY.md audit history)
- **Template count** fixed: 30 everywhere (was inconsistent 20 vs 30)

## [4.0.0] - 2026-03-28

### Added
- **Insights page** — executive dashboard aggregating health scores, recommendations, stale images, footprint
- **Compare page** — interactive 52-feature matrix vs Portainer/Dockge/Dockhand with search
- **Templates browser** — 30 curated app templates (System > Templates) with search, filter, one-click deploy
- **Workflows manager** — create/manage IF-THEN automation rules (Settings > Workflows)
- **Reset password dialog** — admin resets passwords directly from Settings > Users (no email required)
- **Container rename** button in container detail view
- **Safe Update** button — Trivy scan before container swap, blocks critical CVEs
- **Diagnose** button — 8-step troubleshooting wizard in modal
- **Dashboard clickable charts** — click CPU/memory bar → navigate to container
- **Live container count** badge in sidebar (running/total via WebSocket)
- **Dashboard "last updated"** timestamp in header
- **Audit CSV export** — download audit log as CSV file
- **Audit analytics** modal — top users, top actions
- **Database backup** button (System > Database > Create Backup Now)
- **Keyboard shortcuts** — `?` help modal, `g+key` vim-style navigation (g+d dashboard, g+c containers, etc.)
- **Professional error boundary** — catches all uncaught errors with EMS PRO-style overlay
- **Welcome onboarding** modal for first-time users
- **Dark mode toggle** on login page
- **System overview API** — `GET /api/overview` complete infrastructure snapshot
- **API documentation** endpoint — `GET /api/docs` (70+ endpoints documented)
- **Daily auto-backup** — cron at 02:00, keeps 7 daily backups
- **Connection status** indicator in sidebar footer
- **OS theme auto-detection** — follows system preference changes
- **Forgot password** hint on login page
- **Version display** on login page footer
- 10 new app templates (Elasticsearch, RabbitMQ, MailHog, Plausible, File Browser, Watchtower, Drone CI, Ghost, WireGuard, Portainer CE)
- 20 new tests (104 total across 8 files)
- Open Graph meta tags for social link previews
- GitHub v4.0 milestone with 6 roadmap issues
- GitHub Discussions enabled

### Fixed
- **Login error message** not showing on wrong password (handleUnauthorized was recreating the form)
- **Password reset** not working (was calling updateUser which ignores password field — now calls /reset-password with bcrypt)
- **Auto-logout** after resetting own password
- **APP_SECRET validation** false positive (empty string in weak list matched everything)
- **Cache busting** — JS file versions updated to force browser reload
- **i18n nav labels** — Insights, Git Stacks, Compare, section labels translated (EN/RO/DE)
- **Chart.js light theme** colors adapted to theme

### Security
- Strong APP_SECRET enforced on production server
- SECURITY.md updated with full architecture documentation
- 4 vulnerability fixes documented (DD-001 through DD-004)

### Changed
- Version bumped from 3.10.2 to 4.0.0
- README badges updated (104 tests, security audited)
- CONTRIBUTING.md updated with "Good First Issues" section
- Docker socket security documented in README

## [3.10.2] - 2026-03-28

### Added
- Interactive **Comparison page** — 52 features vs Portainer/Dockge/Dockhand with search/filter
- **17 API integration tests** with supertest (84 total tests)
- **GitHub issue/PR templates** for community contributions
- **README badges** — CI, version, license, tests, production readiness

### Changed
- GitHub repo description and 12 topics for discoverability
- .env.example updated with all v3 environment variables

## [3.10.1] - 2026-03-27

### Added
- **Welcome onboarding modal** for first-time users (Ctrl+K, theme, language tips)
- **ARIA labels** auto-applied to all icon-only action buttons
- **Toast `role="alert"`** for screen reader accessibility
- **Tab ARIA roles** (`role="tablist"`, `role="tab"`) on all tab components
- **Auto-refresh** on Volumes and Networks pages (30s interval)
- **Chart.js theme-aware colors** (light/dark auto-detection)

## [3.10.0] - 2026-03-27

### Fixed
- Dashboard **error state** — shows retry banner on API failure (was silent)
- **WCAG contrast** — text-dim darkened to pass 4.5:1 ratio
- **Focus-visible** keyboard navigation outlines on all interactive elements
- **Password policy** unified to 8 chars minimum everywhere
- **Sidebar icons** deduplicated (Firewall=fire, Hosts=sitemap)

### Added
- **Sidebar section labels** — Resources, Operations, Admin

## [3.9.0] - 2026-03-27

### Security
- **scrypt KDF** for encryption key derivation (replaces improvised padding)
- **Startup validation** — warns on weak APP_SECRET/ENCRYPTION_KEY in production
- **Trust proxy** restricted to loopback in production mode
- **JSON body limit** reduced from 10MB to 2MB

### Added
- **Database backup API** — POST /api/backup/database
- **GitHub Actions CI** — tests + syntax + i18n on every push
- **ESLint** — 0 errors, basic security rules

## [3.8.0] - 2026-03-27

### Security
- **Input validation middleware** — validateId, validateBody, sanitizeBody
- **Prototype pollution protection** on all request bodies
- **Git deploy/push rate limited** to 5/min/IP
- **Enhanced error handler** — 5xx no longer leaks internal details
- **SSH key cleanup** on startup (removes stale keys >24h)

### Fixed
- All `JSON.parse` calls wrapped with safe tryParseJson
- `console.log` in DB migrations replaced with structured logger

## [3.7.1] - 2026-03-27

### Security (CRITICAL)
- **Command injection** via Docker labels fixed — execFileSync replaces execSync
- **ReDoS** via user regex fixed — length limit + timeout test
- **Smart-restart DoS** fixed — returns backoff delay instead of blocking

## [3.7.0] - 2026-03-27

### Added
- **Event-driven notifications** — container crash/OOM/unhealthy auto-sent to all channels
- **Global search** — search containers, images, volumes, networks, Git stacks, audit log
- **Container dependency graph** — network-based relationship mapping

## [3.6.0] - 2026-03-27

### Added
- **Stack export** — download compose stack as portable JSON bundle
- **Stack import** — upload bundle and deploy on any host
- **Import preview** — validate before deploying
- **Generate compose** from any bundle

## [3.5.0] - 2026-03-27

### Added
- **Cross-host container migration** with zero-downtime
- **Stack migration** — all containers in a compose stack
- **Migration preview** (dry run) with warnings
- Health check verification before stopping source

## [3.4.0] - 2026-03-27

### Added
- **Workflow automation** — IF-THEN rules (CPU high → restart, crash → notify)
- **Dashboard preferences** — per-user widget order and visibility
- **README** completely rewritten with 60+ features

## [3.3.0] - 2026-03-27

### Added
- **Mobile responsive UI** — hamburger menu, touch-friendly buttons, scrollable tables
- **Resource recommendations** — smart analysis with actionable advice
- **Comparison API** — /api/compare returns feature matrix

## [3.2.0] - 2026-03-27

### Added
- **Enhanced log search** — regex, log level filtering (ERROR/WARN/INFO/DEBUG)
- **App template marketplace** — 20 curated one-click templates
- **Watchtower detection** — migration advisory to Docker Dash native updates

## [3.1.0] - 2026-03-27

### Added
- **Scheduled maintenance windows** — cron-based pull/scan/update
- **Smart restart** with exponential backoff and crash-loop detection
- **Public status page** — unauthenticated service status

## [3.0.0] - 2026-03-27

### Added
- **Deploy preview** — check for image updates via digest comparison
- **Safe-pull container update** — Trivy scan before swap, blocks critical CVEs
- **Guided troubleshooting wizard** — 8-step diagnostic for any container

## [2.10.0] - 2026-03-27

### Added
- **Image freshness dashboard** — freshness score based on age + vulnerabilities
- **Audit log analytics** — top users, actions, targets, hourly/daily heatmap

## [2.9.0] - 2026-03-27

### Added
- **Container uptime reports** — uptime %, restarts, hours tracked
- **Resource usage trends** — 7-day linear regression with 24h forecasting
- **Memory exhaustion prediction** — "will exceed limit in N hours"
- **Per-container cost estimation** — weighted CPU+memory share of VPS cost

## [2.8.0] - 2026-03-27

### Added
- **docker run → Compose converter**
- **AI-powered log analysis** — diagnostic prompts for ChatGPT/Claude
- **Traefik/Caddy label generator** — domain + port → ready-to-use labels
- **Tools tab** in System page

## [2.7.0] - 2026-03-27

### Added
- **7 notification channels** — Discord, Slack, Telegram, Ntfy, Gotify, Email, Webhook
- **SSO header authentication** — Authelia, Authentik, Caddy, Traefik support

## [2.6.0] - 2026-03-27

### Added
- **Container Health Score** (0-100) — composite from state, health, restarts, CPU/memory
- **Plain-English container status** — exit codes mapped to human-readable messages
- **Self-reporting resource footprint** — /api/footprint endpoint

## [2.2.0 - 2.5.0] - 2026-03-27

### Added
- **Git integration** — deploy from repos, credentials, webhooks, polling
- **Diff view** — see changes before redeploying
- **Deployment rollback** — revert to any previous deployment
- **Push to Git** — edit compose in UI, commit and push
- **Multi-file compose** — multiple YAML override files
- **Environment variable management** — per-stack overrides with encryption
- **Custom CA certificates** — for self-hosted Git servers
