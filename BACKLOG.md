# Docker Dash — Known Backlog

**Last updated:** 2026-04-20 · Post-v6.6.0 release

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

### F30 — Distributed rate limiter (Redis-backed)

**Why deferred:** Current rate limiter is in-memory per-process. Works perfectly for single-instance deploys (the default). Horizontal-scale (multi-pod) breaks: each pod has its own counter, so a `10 req/min` limit becomes `10 × N pods` effectively.

**Why not fix now:** Docker Dash's product positioning is single-instance deploy. Horizontal scale requires:
- Redis container in compose
- Shared session store (currently SQLite-backed sessions, same issue)
- Sticky routing OR full session-sharing via Redis

All of the above = 3-5 days of infra work. Out of scope for a single-box product.

**Estimated effort:** 4-5 days.
**Proposed approach:** release as v7.0 "HA mode" with opt-in `DD_MODE=ha` env var; default stays single-instance.

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
- **express 4 → 5** — async router rewrite. Middleware ordering changes. Test matrix would be large. Defer to a dedicated upgrade session (8-12h).
- ~~**node-cron 3 → 4**~~ — ✅ shipped in v6.9.2. API for `schedule()` / `validate()` / `.stop()` stayed backward-compatible; no call-site changes.
- **helmet 8 → 9** (if/when released) — tracked separately in security audit cycle.

**Proposed approach:** bundle these into one "major-dep bump" session in v6.8+ with a full regression run, not sprinkle them into feature PRs.

## P3 — Operational

### GHCR push permission for custom Caddy image

**Why deferred:** Not a code issue — requires the repo owner to toggle "Read and write permissions" in Repo Settings → Actions → Workflow permissions. Can't be done via PR.

**Impact:** current GHA workflow builds the custom Caddy image but fails at push. Users building from source get the right image; GHCR users don't (they have to build locally).

**Fix:** one-time user action. Documented in `docs/planning/v6.5/letsencrypt-wizard/05-preflight-results.md`.

### LE staging integration test in CI

**Why deferred:** Requires storing a Cloudflare token as a GitHub Actions secret. Can't be automated without user action. The integration test code itself is trivial (~50 LOC).

**Estimated effort:** 2 hours once the secret is provisioned.

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

## What's in v6.6 (current release)

For context — everything above is beyond what's shipped. Current state:

- v6.6.0 Container Remediation Wizard (20-entry catalog, 3-step modal, Git-PR mode, auto-rollback)
- v6.5.0 Let's Encrypt Wizard (9 DNS providers, encrypted credential vault, zero-downtime rotation)
- v6.4.0 Hardening (31 of 35 pre-sale audit findings closed)
- 538 tests passing across 38 suites

---

## How to propose a new item

1. Is it truly blocked (infrastructure / external decision)? → P2 or P3
2. Can it be done in <1 day by a single dev? → P1 or "just do it" in the next session
3. Does it change the product's positioning (e.g., HA mode)? → Major version milestone

For items that become "just do it": open a GitHub issue with the `ready-to-implement` label.
