# Docker Dash — Known Backlog

**Last updated:** 2026-04-22 · Post-v6.13.0 release (sweep cleanup)

This is the single source of truth for deferred work. Each item lists WHY it's deferred (not just WHAT), so future contributors don't waste cycles rediscovering the rationale.

---

## P1 — Enterprise readiness

### F16 — `ldapjs` replacement with `ldapts`

**Status (updated 2026-04-22):** ✅ Shipped in v6.13.0. `src/services/ldap.js` rewritten against `ldapts`'s Promise-based API; public interface preserved bit-for-bit so no caller changes needed. `ldapjs` and its 9 deprecated `@ldapjs/*` sub-packages fully removed. 740 tests passing (unchanged — no LDAP tests in repo; change statically verified).

**Remaining follow-up (manual staging tests before next enterprise rollout):**
1. OpenLDAP simple bind + search with `userFilter` containing nested `(&(...)(...))`
2. Active Directory bind with quoted CN in DN (`CN="Last, First",OU=...`) — `strictDN: true` default in ldapts may reject what ldapjs accepted
3. AD `memberOf` group-matching case-insensitive substring match
4. LDAPS with self-signed cert + `tlsSkipVerify: true`
5. LDAPS with valid CA + `tlsSkipVerify: false` (no accidental bypass)
6. UTF-8 in username (e.g. `müller`)
7. Username containing `*` / `(` / `)` / `\` (injection-escape path)
8. Connection timeout on unreachable host (~5s)
9. Empty search result handling

**Enterprise LDAP users:** test on staging before updating production. Confidence is medium (code correct per docs, but unverified against a live server).

### F30 — Distributed rate limiter (Redis-backed) — opt-in HA mode

**Status (updated 2026-04-22):** 🟡 Partial — foundation shipped in v6.17.0 (preview).

**v6.17.0 (shipped):**
- `src/services/cluster.js` — HA abstraction with `DD_MODE=ha` opt-in. Zero overhead for standalone users.
- Redis-backed rate limiter via `INCR + PEXPIRE` fixed-window (2× looser than standalone sliding-window at bucket boundaries — documented trade-off).
- `docker-compose --profile ha` with `redis:7-alpine` service (optional, off by default).
- `ioredis` as `optionalDependencies` (not `dependencies`). Standalone installs don't pull it.
- 23 new tests via `ioredis-mock` (no real Redis needed to run the suite).
- `docs/features/ha-mode.md` — operator-facing reference.

**Still deferred for v7.0.0 (per [`plans/deep-spec-ha-mode.md`](plans/deep-spec-ha-mode.md)):**
- v7.0.0-alpha.1 — WebSocket pub/sub via Redis (fix "user on replica A misses events from replica B")
- v7.0.0-rc.1 — Leader election via `SET NX PX` for the 13 cron jobs, Docker event stream, SSH tunnels, git polling
- v7.0.0 stable — failover runbook, sticky-session LB docs, staging soak

**Known v6.17.0 limitations (loudly documented):** **don't run multi-replica in HA mode yet.** Every replica runs every cron job → duplicate backups, concurrent `VACUUM` risk. Single-replica HA mode is only useful for operational drill (Prometheus scrape, LB config) before v7.0 rolls out true multi-replica.

---

## P2 — UX polish

### LE Wizard: WebSocket progress (replace 3s polling)

**Status (updated 2026-04-20):** ✅ Shipped in v6.6.5. Channel `acme:job:<jobId>` broadcasts on each state transition; polling kept as 15s safety net. Service layer stays WS-independent (broadcaster injected at startup).

**Still open:** the pre-existing gap that `acme_jobs.status` never transitions `running → success`. Requires a background Caddy-state watcher. Tracked below.

### LE Wizard: Background watcher for issuance completion

**Status (updated 2026-04-20):** ✅ Shipped in v6.6.6. `src/services/acme-watcher.js` polls every 10s, 60s grace period, 10min hard timeout. 7 unit tests. Publishes via the v6.6.5 WS channel.

### Remediation Wizard: WS progress for live log streaming

**Status (updated 2026-04-20):** ✅ Shipped in v6.6.6. Per-job channel `remediate:job:<id>` broadcasts on every state transition AND every log line. Polling kept as 10s safety net.


### Remediation Wizard: entry points on security.js / stacks.js / cis.js

**Status (updated 2026-04-21):** ✅ Fully shipped. v6.6.3 added CIS + stacks entry points. v6.9.4 closes the `security.js` gap with "Containers using this image" drill-down modal — click the wrench icon on any image scan row → lists running containers using that image → Fix button opens RemediateWizard scoped to container.

### i18n: 25% of keys missing in non-EN locales

**Status (updated 2026-04-21):** ✅ Tooling shipped in v6.11.0. New System → Translations tab integrates Google Translate + DeepL free-tier APIs (500k chars/month each, tracked per-provider/month with hard quota stop) plus a review/export workflow. Keys stay missing until an admin runs auto-translate → reviews → exports the locale file → commits. That's a 10-minute flow per language now instead of "wait for translators."

**What still requires human oversight:** Reviewing machine translations before shipping them. The UI forces per-row Accept/Reject (no bulk accept) precisely so a bad auto-translation doesn't land in production.

---

## P2 — Dependency majors (deferred after 2026-04-20 audit)

**Current state:** npm audit shows 0 vulnerabilities after v6.6.4 bump (nodemailer 7→8). All within-major patches applied (dotenv, eslint, puppeteer, simple-git).

Available major upgrades, deliberately not taken:

- ~~**bcrypt 5 → 6**~~ — ✅ shipped in v6.7.1 (native deps refresh). Rebuilt against Node 24.
- ~~**better-sqlite3 11 → 12**~~ — ✅ shipped in v6.7.1 (native deps refresh). Prepared-statement API stayed backward-compatible.
- ~~**diff 5 → 9**~~ — ✅ shipped in v6.10.0. API for `createPatch` stayed compatible across v5→v9; no code change needed beyond `npm install` + overrides bump. All 10 compose-diff tests green.
- ~~**express 4 → 5**~~ — ✅ shipped in v6.14.0. Actually only needed 2 line changes + dropping an obsolete `path-to-regexp: ^0.1.13` override from `overrides` (added for a v4 CVE that's irrelevant on v5 where the transitive dep is `path-to-regexp@8.4.2`). 740 tests passing unchanged. BACKLOG's 8-12h estimate was too pessimistic — real cost was ~2h because the codebase was already v5-idiomatic. Deep-spec at `plans/deep-spec-express5-migration.md` for details.
- ~~**node-cron 3 → 4**~~ — ✅ shipped in v6.9.2. API for `schedule()` / `validate()` / `.stop()` stayed backward-compatible; no call-site changes.
- **helmet 8 → 9** (if/when released) — tracked separately in security audit cycle.

**Proposed approach:** bundle these into one "major-dep bump" session in v6.8+ with a full regression run, not sprinkle them into feature PRs.

## P3 — Operational

### GHCR push permission for custom Caddy image

**Status (updated 2026-04-22):** ✅ Resolved. GHA workflows `caddy-image.yml` and `egress-filter-image.yml` now successfully build + push to `ghcr.io/<owner>/docker-dash-caddy` and `docker-dash-egress-filter` on every tag push. Workflow permissions are configured correctly.

### LE staging integration test in CI

**Status (updated 2026-04-22):** Code shipped in v6.9.2 — `src/__tests__/acme-cloudflare-live.test.js` hits Cloudflare's `/user/tokens/verify` endpoint when `CLOUDFLARE_TEST_TOKEN` env/secret is set. Intentionally skipped (one of the 4 skipped tests in the suite) when the secret is absent.

**Still pending (user action, not code):** provision `CLOUDFLARE_TEST_TOKEN` as a GitHub Actions secret in Repo Settings → Secrets and variables → Actions. After that, the test runs on every push and will catch:
- Credential-validation drift if Cloudflare deprecates token endpoints
- Token revocation / expiry
- Global API Key vs scoped token format regressions

**Effort:** 5 minutes (paste one token into a GHA secret).

### GHA actions on deprecated Node.js 20

**Status (updated 2026-04-22):** ✅ Shipped in v6.13.1. All 4 workflows (`ci.yml`, `docker-build.yml`, `caddy-image.yml`, `egress-filter-image.yml`) bumped to the first Node-24 major of each action: `actions/checkout@v5`, `actions/setup-node@v5`, `docker/setup-qemu-action@v4`, `docker/setup-buildx-action@v4`, `docker/login-action@v4`, `docker/metadata-action@v6`, `docker/build-push-action@v6`. Kept `node-version: '20'` for tests (mirrors the production Dockerfile base image); only the actions' own runtime moved to Node 24.

**Pre-deadline:** was 2026-06-02 GitHub-forced. Done with 40+ days of margin.

### F20 — Retroactive `down()` for 44 existing migrations

**Decision:** NOT doing this. Going forward only. All migrations from 043 onwards have `down()`. Retroactively adding them to 001-042 would be ~1 day of mechanical work with zero operational value (those migrations shipped; no one rolls back to 6.1 by deleting migration 041).

### Multi-host SSH exec channel

**Status (updated 2026-04-20):** ✅ Shipped in v6.8.0. `src/services/ssh-tunnel.js` gained `exec / fileExists / readFile / writeFile`; `src/services/remote-fs.js` dispatches local-vs-remote; `remediate.js` + `docker-runner.js` use remote paths transparently for any `hostId > 0`. Remediation Wizard Apply mode now works end-to-end on remote hosts.

---

## P3 — Nice-to-have

- Sandbox-clone "test fix on copy first" mode for Remediation Wizard (v6.7+)
- AI-suggested image-specific fixes via LLM API (opt-in, v7+)
- Cross-stack fleet remediation (v7+)
- Docker Dash's own `docker update` sandbox for risky updates
- Per-image hint database for Remediation Wizard (crowd-sourced or first-party)
- Scheduled remediation rollouts (apply at 02:00)
- Email/Slack notifications on remediation apply/rollback
- Rollback UX improvements (side-by-side "before vs after" beyond 60s window, by keeping extended snapshots)

---

## What's in the current release (v6.13.0)

For context — everything above is beyond what's shipped. Current state:

- v6.13.0 ldapjs → ldapts migration (deprecated client replaced; interface preserved)
- v6.12.2 NAS How-To guides complete (TrueNAS SCALE + QNAP + OMV)
- v6.12.1 Cloud vendor badges via DMI probe (AWS/GCE/Azure/DO/Hetzner/VMware/etc.)
- v6.12.0 Platform auto-detection + branded badges on Multi-Host page
- v6.11.x Translations tooling (Google + DeepL, quota tracking, runtime DB overrides)
- v6.10.0 Per-container Security sub-tab (Secrets + Egress + CIS + Image Vulns)
- v6.9.x Per-stack Secrets/Egress audit + Remediation drill-down from Security page
- v6.8.0 Multi-host SSH exec channel (Remediation Wizard works on remote hosts)
- v6.7.x Outbound Network Filter sidecar
- v6.6.0 Container Remediation Wizard (20-entry catalog, 3-step modal, Git-PR mode, auto-rollback)
- v6.5.0 Let's Encrypt Wizard (9 DNS providers, encrypted credential vault, zero-downtime rotation)
- v6.4.0 Hardening (31 of 35 pre-sale audit findings closed)
- **740 tests passing + 4 skipped across 50 suites**

---

## How to propose a new item

1. Is it truly blocked (infrastructure / external decision)? → P2 or P3
2. Can it be done in <1 day by a single dev? → P1 or "just do it" in the next session
3. Does it change the product's positioning (e.g., HA mode)? → Major version milestone

For items that become "just do it": open a GitHub issue with the `ready-to-implement` label.
