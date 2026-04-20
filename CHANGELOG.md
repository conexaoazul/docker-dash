# Changelog

All notable changes to Docker Dash are documented here.

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
