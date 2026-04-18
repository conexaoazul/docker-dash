# Docker Dash 6.3.0 → 6.4.0 — Remediation Plan

**Companion to:** `AUDIT_2026-04-18.md`
**Target release:** v6.4.0 — "Hardening"
**Strategy:** Three batches (Crypto/Auth · Infra/Boot · Routes/WS/Frontend), then docs + deploy

Each finding maps to: **fix description**, **files**, **acceptance test**.

---

## DEFERRED (with explanation, scheduled for v6.5)

| # | Finding | Why deferred |
|---|---|---|
| 16 | ldapjs decommissioned | Migration to `ldapts` is ~2 days work + behavior testing matrix. Schedule for v6.5. |
| 20 | Retroactive `down()` for 44 migrations | Going forward only — add `down` to all NEW migrations. Existing 44 stay one-way. |
| 27 | i18n ~25% keys missing | 218 strings × 10 languages = 2,180 translations. Needs translator. Stub with English fallback now; commission later. |
| 30 | In-memory rate limiter (horizontal scale) | Needs Redis or shared store. Document limitation in README; ship as-is for single-instance customers. |

---

## BATCH 1 — runs in parallel (3 agents, no file overlap)

### Agent A — Crypto & Auth fundamentals

**Files:** `src/utils/crypto.js`, `src/services/registry.js`, `src/services/auth.js`, `src/routes/auth.js`, `src/routes/hosts.js`, `src/services/ssh-tunnel.js`, `src/middleware/auth.js`

| # | Fix |
|---|---|
| 2  | `_getKey()`: throw on missing `ENCRYPTION_KEY` regardless of `APP_ENV`. Remove `'fallback-key'` literal. |
| 4  | Replace `_encrypt`/`_decrypt` in `services/registry.js` with calls to `utils/crypto.encrypt`/`decrypt`. Migrate existing rows on startup (try-decrypt-old, re-encrypt-new). |
| 3  | New service `src/services/host-config-crypto.js` — encrypt/decrypt the `ssh_config` JSON via `utils/crypto`. Update `routes/hosts.js` writes + `services/ssh-tunnel.js` reads + `services/docker.js` reads. Migration `045_encrypt_ssh_configs.js` re-encrypts existing rows. |
| 11 | `routes/auth.js` `_decodeJwtPayload`: verify signature using JWKS from issuer's `jwks_uri`. Validate `iss`, `aud`, `exp`, `nbf`. Reject HTTP issuers (require HTTPS). |
| 12 | `middleware/auth.js` SSO header path: require `SSO_TRUSTED_PROXY_IPS` env (CSV of IPs); reject if `req.ip` not in list. Fail-closed if env unset. |
| 13 | `services/ssh-tunnel.js`: validate `dockerSocket` matches `/^[a-zA-Z0-9_./-]+$/` and starts with `/`. Reject any value with `;`, `&`, `|`, backtick, `$(`, newline. |
| 18 | `services/auth.js` login: always run a dummy bcrypt compare against a fixed hash when user doesn't exist. |
| 21 | `middleware/auth.js`: when `req.user.must_change_password === 1`, reject all routes except `POST /auth/change-password` and `GET /auth/me`. Server-side enforcement. |
| 26 | `_provisionLdapUser`: replace `bcrypt.hashSync('!' + dn + Math.random(), 4)` with `crypto.randomBytes(32).toString('hex')` + bcrypt cost 12. |

**Acceptance:** `npm test` passes; new encryption key fail-fast tested; restart cycle proves SSH cred encryption works.

---

### Agent B — Infrastructure / Boot / Runtime image

**Files:** `Dockerfile`, `.env.example`, `docker-compose.yml`, `docker-compose.override.yml` (delete), `src/server.js`, `src/services/ssl.js`, `src/services/certificates.js`, `caddy-bootstrap/` (new)

| # | Fix |
|---|---|
| 7  | Replace `openssl` shell-out in `services/certificates.js` with Node 15+ built-in `crypto.X509Certificate` for `parsePem`. Keep `generateCsr` shelling to openssl BUT add `openssl` to Dockerfile (`apk add openssl`). |
| 8  | `.env.example`: replace defaults with auto-generated values via `entrypoint.sh` — if `APP_SECRET` is the placeholder, generate `openssl rand -hex 32` on first boot and write into `.env` (mount as bind). Alternative: ship a `scripts/init-env.sh` that the README points to. Updated README section. |
| 9  | DELETE `docker-compose.override.yml` from repo. Add `docker-compose.dev.yml` instead (must be explicitly chosen with `-f`). Update `.gitignore` to exclude `docker-compose.override.yml`. |
| 10 | New file `caddy-bootstrap/Caddyfile.default` — minimal HTTP-only Caddyfile (`:80 { respond ... }`). `docker-compose.yml` mounts it into `caddy-certs` volume on first start via init container OR Caddy command becomes `sh -c '[ -f /data/certs/Caddyfile ] || cp /bootstrap/Caddyfile.default /data/certs/Caddyfile; caddy run --config /data/certs/Caddyfile --adapter caddyfile'`. |
| 1  | `services/auth.js` `seedAdmin`: if `ADMIN_PASSWORD === 'admin'` AND `APP_ENV === 'production'`, generate a random 24-char password, write to `/data/admin-password.txt` (chmod 600), log a warning, and set `must_change_password=1`. |
| 1  | `server.js` boot guard: if admin user has password hash matching default `admin`, refuse to start unless `ALLOW_DEFAULT_ADMIN=true` (escape hatch for dev). |
| 33 | `server.js:32` helmet CSP: remove `'unsafe-eval'` from `scriptSrc`. Test charts still work; if Chart.js v3 is in use, upgrade or whitelist hashes. |

**Acceptance:** Dockerfile rebuild succeeds; fresh `docker compose up -d` boots green; certificate parsing works without openssl; HTTPS profile boots without manual Caddyfile pre-seed.

---

### Agent C — Frontend hardening

**Files:** `public/index.html`, `public/js/pages/system.js`, `public/js/pages/login.js` (or wherever forgot-password lives), `public/i18n/*.js` (stub additions only)

| # | Fix |
|---|---|
| 17 | `public/index.html:42-44` Replace "Contact your administrator" with a "Forgot password?" link → opens modal with email input → POST `/api/auth/request-password-reset`. Show "If an account exists, you'll get an email" regardless. |
| 32 | `public/js/pages/system.js:3473` Wizard launcher: before showing "Launch Wizard", call new endpoint `/api/system/secrets-wizard/preflight` which checks if openssl is available. If not, show a warning banner: "Certificate features require openssl in the runtime image". |
| 25 | `public/js/pages/system.js` wizard Step 4 "Track for Rotation": when user clicks "Register", first GET `/api/secrets-rotations?app=...&host=...` and warn if any tracked entries already exist for these env keys. Add "Update intervals" vs "Skip existing" radio. |
| 34 | Search frontend for `setupRequired`, `ENABLE_MULTI_HOST` references. Either wire them up or remove dead UI hooks. |

**Acceptance:** Login page shows reset link; wizard shows openssl warning when missing; existing rotations not silently overwritten.

---

## BATCH 2 — runs in parallel after Batch 1 (2 agents)

### Agent D — Routes / API hardening

**Files:** `src/routes/system.js`, `src/routes/secretsRotations.js`, `src/routes/misc.js`, `src/routes/auth.js`, every other route file (mass error sanitization)

| # | Fix |
|---|---|
| 5  | `routes/misc.js` `/api/database/restore`: reject if `Content-Length` > 500MB. Compute SHA-256 of uploaded blob; require `X-Backup-Sha256` header to match (admin pre-computes). Audit log entry includes the SHA. After restart, run an integrity check — confirm `audit_log` exists and the new hash chain validates. |
| 6  | `routes/system.js` `/secrets-wizard/deploy-remote`: (a) require new role `deploy-admin` (or scope per-host via `docker_hosts.allowed_users` JSON column — new migration 046). (b) Compute SHA-256 of script, log full hash to audit. (c) Cap script size at 1MB. (d) Validate `appName` matches `^[a-zA-Z0-9_-]+$` (no path components). (e) Reject scripts with shell-injection markers like backticks, `$(`, `eval` — emit warning. |
| 14 | `routes/system.js` `/certificates` POST: validate `sourcePath` against allow-list (configured via env `CERT_ALLOWED_PATHS=/etc/letsencrypt/live,/etc/ssl/certs`). Resolve to absolute path, check it starts with one of allowed prefixes. Same for `/refresh` and the cron job. |
| 25 | `routes/secretsRotations.js` `/bulk` ON CONFLICT: change to PRESERVE `rotation_interval_days`, `last_rotated_at`, `next_due_at`. Only update display fields (label, action, secret_name). Add explicit `force_update_intervals` bool param. |
| 27 | `routes/system.js` cert UNIQUE constraint: catch `SQLITE_CONSTRAINT_UNIQUE` and return 409 with friendly message. |
| 35 | `services/ssl.js`: read `CADDY_CONTAINER` from env (already does at line 10) — but now also handle "no caddy container exists" gracefully in `getCaddyStatus` and `reloadCaddy` — log warning, don't 500. |

**Acceptance:** Restore requires SHA header; deploy-remote logs script hash; cert paths can't escape allow-list; rotation re-register preserves intervals.

---

### Agent E — WS / CSRF / cron / migrations / audit / errors

**Files:** `src/server.js` (CSRF wire), `src/middleware/csrf.js` (NEW), `src/ws/index.js`, `src/jobs/index.js`, `src/services/audit.js`, `src/config/index.js`, `src/db/migrations/045_*.js`, `src/db/migrations/046_*.js` (with downs), mass `err.message → sanitized` sweep across routes

| # | Fix |
|---|---|
| 22 | `config/index.js:64` change `AUDIT_RETENTION_DAYS` default from `7` to `365` (PCI baseline). Document in README that compliance regimes need adjustment. |
| 23 | New `src/middleware/csrf.js` — double-submit cookie pattern: issue `XSRF-TOKEN` cookie on session create, require `X-XSRF-TOKEN` header on all state-mutating routes (POST/PUT/PATCH/DELETE). Skip for `Bearer` token auth (API key flow). Wire in `server.js`. |
| 24 | `ws/index.js`: validate `Origin` header against `WS_ALLOWED_ORIGINS` env (defaults to `req.headers.host`). Reject token-via-query when `WS_QUERY_TOKEN_ENABLED !== 'true'`. Add per-IP connection limit (default 10). |
| 31 | `jobs/index.js:404-428` `cronMatchesNow`: handle Sunday=7→0 normalization in weekday position. Add `*/N` step support inside ranges. Add unit tests. |
| 29 | `jobs/index.js:257-281` daily DB backup: write to `/data/backups/` (separate subdir), `chmod 600`, optionally encrypt with AES-256-GCM if `BACKUP_ENCRYPTION_KEY` env set. Add disk-space check before backup (require 2x DB size free). |
| 19 | NEW test files: `src/__tests__/secretsRotations.test.js`, `src/__tests__/certificates.test.js`, `src/__tests__/secrets-wizard.test.js`. Cover: classify env, generate script, register rotations, mark rotated, parse PEM, generate CSR, refresh cert, sourcePath validation. |
| 28 | `services/auth.js:48-55` password policy: require min 12 chars, at least 1 upper + 1 lower + 1 digit + 1 symbol. Optional HIBP check via `HIBP_API_ENABLED=true` env. |
| 19 (Agent E touches `services/audit.js`) | (no change here; audit is fine) |

**Acceptance:** New CSRF middleware enforced; WS rejects cross-origin; backup encrypted; tests pass; password policy enforced.

---

## PHASE 3 — me (the coordinator)

| # | Fix |
|---|---|
| 15 | Reconcile versions: bump `package.json` and `version.js` to `6.4.0`. Run `npm install` to regenerate `package-lock.json` cleanly. Update README badges + "Current version" line. |
| 26 | Test `install.sh` against current GHCR. If image missing, document workaround (build locally) in README. Add fallback: if `docker pull` fails, prompt to build from source. |

Then: deploy to 192.168.13.20, run smoke test, `git commit`, `git tag v6.4.0`, update CHANGELOG + whatsnew.

---

## Out-of-scope (won't fix in v6.4)
- F16 ldapjs swap → v6.5
- F20 retroactive migration `down()` → only new ones get them
- F27 i18n missing keys → needs translator
- F30 distributed rate limit → needs Redis
