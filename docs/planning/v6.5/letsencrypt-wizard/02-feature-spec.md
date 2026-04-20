# Feature Spec — Let's Encrypt Wizard

**Status:** Draft v1 · 2026-04-20
**Owner:** Bogdan Pricop
**Target release:** v6.5
**Companion:** `01-brainstorm.md` (decisions), `03-deep-spec.md` (gnarly bits), `04-assumption-audit.md` (risks)

This is the implementation contract. Reviewers should be able to verify each section as a checkable acceptance criterion.

---

## 1. Goals

1. Admin can issue a Let's Encrypt certificate for one or more domains via UI, in ≤5 clicks
2. Both HTTP-01 and DNS-01 challenge types supported
3. v6.5 launches with 5 DNS providers (Cloudflare, Route53, DigitalOcean, Hetzner, Linode); architecture supports adding more in 30-line PRs
4. DNS API credentials stored in the existing encrypted secrets vault (AES-GCM)
5. Issued certificates auto-renew via Caddy (no Docker Dash cron needed)
6. Issued certificates appear in the existing Certificate Manager (`v6.3`) for tracking
7. UI guidance forces scoped tokens (NOT global API keys); credential validation pre-flights against provider API where possible
8. Every action audit-logged with user identity and credential reference (NEVER credential value)

## 2. Non-goals

1. Custom ACME accounts (single shared account per Docker Dash instance)
2. ACME EAB (External Account Binding)
3. Custom CAs (Let's Encrypt prod + staging only)
4. Cert serving for arbitrary non-Caddy services
5. Multi-instance state coordination (single-instance only, like the rest of Docker Dash today)

## 3. User-facing flow

### Entry points

- **Primary:** System → Secrets → Certificates → "Request Let's Encrypt Certificate" button (next to existing "Track Certificate" + "Generate CSR")
- **Secondary:** Ctrl+K command palette → "Request Let's Encrypt"

### Step 1 — Domain & challenge

| Field | Type | Required | Validation |
|---|---|---|---|
| Domains | text (comma-separated) | yes | RFC 1035, max 100 entries; if any contains `*.`, force DNS-01 |
| Email for ACME notifications | email | yes | RFC 5322 |
| Challenge type | radio: `http-01` / `dns-01` | yes | wildcard domains disable HTTP-01 |
| Use Let's Encrypt staging? | toggle | no, default ON for first cert per domain | warning if user toggles OFF without prior staging success |

Help text:
- HTTP-01: "Port 80 must be reachable from the public internet."
- DNS-01: "We'll add a TXT record to your DNS provider via API. Works on internal networks. Required for wildcards."
- Staging: "Test your config against Let's Encrypt's staging server first to avoid rate limits. The cert won't be browser-trusted."

### Step 2 — Challenge configuration

If HTTP-01: read-only confirmation page, "Click Next to issue."

If DNS-01:

| Field | Type | Notes |
|---|---|---|
| Use existing credential | dropdown of saved credentials filtered by provider | optional |
| OR: Provider | dropdown (5 options for v6.5) | required if no existing |
| Provider-specific fields | varies (see provider registry) | shown after provider chosen |
| Save credential for reuse? | toggle + name input (if toggled) | default OFF |
| Validate credential before issuing? | toggle | default ON |

Per-provider help text links to docs (e.g., for Cloudflare, link to "How to create a scoped API token" with screenshot).

### Step 3 — Confirmation & issuance

Summary of what will happen:
- Domains: `[list]`
- Challenge: `[type]` via `[provider]` (if DNS-01)
- Credential: `[name or "(not saved)"]`
- Environment: `[Production | Staging]`
- Estimated time: 30s–5min depending on DNS propagation

**Issue Certificate** button → opens a progress panel (WebSocket-driven):

```
✓ Saving credential to vault
✓ Validating credential against provider API
✓ Updating Caddy configuration
✓ Reloading Caddy
⏳ Waiting for ACME challenge...
   ✓ DNS record added
   ⏳ Waiting for DNS propagation (this can take 1-5 minutes)
   ✓ Propagation confirmed
   ✓ ACME challenge passed
✓ Certificate issued
✓ Tracking in Certificate Manager
```

On success: green "Certificate issued — view in Certificate Manager" with link.
On failure: red error with classified cause (rate limit / DNS / credential / network) and suggested fix.

## 4. Backend architecture

```
┌──────────────────────────────────────────────────────────┐
│ public/js/pages/system.js — Wizard UI                    │
└────────────────────────┬─────────────────────────────────┘
                         │ HTTP + WebSocket
                         ▼
┌──────────────────────────────────────────────────────────┐
│ src/routes/acme.js                                       │
│ - GET  /providers                                        │
│ - POST /credentials  + GET / DELETE                      │
│ - POST /credentials/:id/validate                         │
│ - POST /issue        → returns job_id                    │
│ - GET  /jobs/:id     (poll fallback if WS unavailable)   │
│ - DELETE /cert/:domain                                   │
└────────────────────────┬─────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│ src/services/acme.js — Orchestrator                      │
│ - issueCertificate({domains, challenge, credentialsId,…})│
│ - validateCredential(providerId, credentials)            │
│ - removeCertificate(domains)                             │
└──────┬─────────────────┬───────────────────┬─────────────┘
       │                 │                   │
       ▼                 ▼                   ▼
┌──────────────┐ ┌──────────────────┐ ┌─────────────────┐
│ caddy-config │ │ dns-providers    │ │ utils/crypto    │
│ .js          │ │ .js              │ │ (existing)      │
│              │ │                  │ │ AES-GCM for     │
│ JSON-config  │ │ Provider         │ │ credentials     │
│ manipulation │ │ registry +       │ │                 │
│ + reload     │ │ validators       │ │                 │
└──────────────┘ └──────────────────┘ └─────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────┐
│ Caddy container (custom image with DNS plugins)          │
│ - Admin API on localhost:2019                            │
│ - JSON config at /config/caddy.json                      │
│ - Credentials at /etc/caddy/secrets.json (mounted)       │
└──────────────────────────────────────────────────────────┘
```

## 5. Files to create

| Path | Purpose | LOC estimate |
|---|---|---|
| `src/db/migrations/048_acme.js` | Tables + down() | 60 |
| `src/services/acme.js` | Orchestrator | 250 |
| `src/services/caddy-config.js` | JSON config manipulation | 200 |
| `src/services/dns-providers.js` | Provider registry + validators | 300 |
| `src/routes/acme.js` | HTTP endpoints | 250 |
| `src/__tests__/acme.test.js` | Unit + integration tests | 400 |
| `src/__tests__/caddy-config.test.js` | Config manipulation tests | 200 |
| `src/__tests__/dns-providers.test.js` | Provider validators tests | 250 |
| `docs/guides/letsencrypt-dns-wizard.md` | Built-in How-To (auto-imported via migration) | 150 |
| `docker/caddy/Dockerfile` | Custom Caddy image with plugins | 30 |
| `.github/workflows/caddy-image.yml` | Build + push image to GHCR | 80 |

## 6. Files to modify

| Path | Change |
|---|---|
| `src/server.js` | Mount `/api/system/acme` route |
| `public/js/api.js` | Add ACME methods (5-7 functions) |
| `public/js/pages/system.js` | Add wizard launcher button + 3-step modal |
| `public/i18n/{en,ro,...}.js` | Translation keys (English first, RO next, others stub) |
| `docker-compose.yml` | Switch Caddy image to `ghcr.io/bogdanpricop/docker-dash-caddy:6.5` + add `secrets.json` volume |
| `caddy-bootstrap/Caddyfile.default` | Comment about JSON config takeover |
| `CHANGELOG.md` | v6.5 entry |
| `public/js/pages/whatsnew.js` | v6.5 release |
| `src/db/migrations/048_howto_*` | Renumber to 049 (avoid collision) |

## 7. Database schema

```sql
-- Migration 048_acme.js

CREATE TABLE acme_credentials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,            -- user-given, e.g. "cloudflare-prod"
  provider_id TEXT NOT NULL,            -- 'cloudflare', 'route53', etc.
  credentials_encrypted TEXT NOT NULL,  -- AES-GCM(JSON.stringify(creds))
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT,
  last_validated_at TEXT,
  last_validation_status TEXT,          -- 'ok' | 'failed' | NULL
  last_validation_message TEXT
);

CREATE INDEX idx_acme_credentials_provider ON acme_credentials(provider_id);

CREATE TABLE acme_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domains TEXT NOT NULL,                -- JSON array
  challenge_type TEXT NOT NULL,         -- 'http-01' | 'dns-01'
  provider_id TEXT,                     -- NULL for HTTP-01
  credentials_id INTEGER,               -- FK acme_credentials.id, NULL for HTTP-01
  staging INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending'|'running'|'success'|'failed'
  output TEXT DEFAULT '',               -- progress log + final message
  error_class TEXT,                     -- 'rate_limit'|'dns'|'credential'|'network'|'caddy'|'other'
  cert_id INTEGER,                      -- FK tracked_certificates.id on success
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  completed_at TEXT,
  FOREIGN KEY (credentials_id) REFERENCES acme_credentials(id) ON DELETE SET NULL,
  FOREIGN KEY (cert_id) REFERENCES tracked_certificates(id) ON DELETE SET NULL
);

CREATE INDEX idx_acme_jobs_status ON acme_jobs(status);
CREATE INDEX idx_acme_jobs_created_at ON acme_jobs(created_at);

CREATE TABLE acme_managed_certs (
  domain TEXT PRIMARY KEY,              -- canonical SAN list joined with ','
  challenge_type TEXT NOT NULL,
  provider_id TEXT,
  credentials_id INTEGER,
  staging INTEGER NOT NULL DEFAULT 0,
  caddy_config_path TEXT NOT NULL,      -- pointer into Caddy JSON config tree
  cert_id INTEGER,                      -- FK tracked_certificates
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (credentials_id) REFERENCES acme_credentials(id) ON DELETE RESTRICT,
  FOREIGN KEY (cert_id) REFERENCES tracked_certificates(id) ON DELETE SET NULL
);
```

## 8. API surface

All routes under `/api/system/acme`. All require `admin` role (read-only ones may accept `operator` — see spec).

### `GET /providers`

Returns: list of supported DNS providers with metadata.

```json
{
  "providers": [
    {
      "id": "cloudflare",
      "name": "Cloudflare",
      "docsUrl": "https://...",
      "instructionsKey": "acme.providers.cloudflare.instructions",
      "fields": [
        {
          "key": "api_token",
          "label": "API Token (scoped, NOT Global API Key)",
          "type": "password",
          "required": true,
          "placeholder": "v1.0-...-..."
        }
      ],
      "supportsValidation": true
    }
  ]
}
```

### `GET /credentials`

Returns: list of saved credentials (NEVER the credential values).

```json
{
  "credentials": [
    { "id": 1, "name": "cloudflare-prod", "providerId": "cloudflare",
      "lastValidatedAt": "2026-04-20T10:00:00Z",
      "lastValidationStatus": "ok",
      "createdBy": 5, "createdAt": "2026-04-15T..." }
  ]
}
```

### `POST /credentials`

Body:
```json
{
  "name": "cloudflare-prod",
  "providerId": "cloudflare",
  "credentials": { "api_token": "v1.0-..." },
  "validateImmediately": true
}
```

Returns 201 with `{id, name, providerId, lastValidationStatus}`. Returns 409 if name already taken. Returns 400 if validation requested and fails.

### `PATCH /credentials/:id`

Update credential value (for rotation). Body same as POST sans `name` and `providerId`.

### `DELETE /credentials/:id`

Returns 409 if any active certificate references this credential (forces user to remove certs first).

### `POST /credentials/:id/validate`

Force re-validation against provider API. Returns `{ok, message}`.

### `POST /issue`

Body:
```json
{
  "domains": ["api.example.com", "*.api.example.com"],
  "email": "admin@example.com",
  "challengeType": "dns-01",
  "credentialsId": 1,           // OR inline credentials below
  "credentials": { ... },        // creates anonymous credential
  "providerId": "cloudflare",   // required if credentials inline
  "saveCredentialsAs": null,    // optional name to save inline creds
  "staging": false
}
```

Returns 202 with `{jobId}`. Connect to WebSocket `/ws?subscribe=acme:job:{jobId}` for live progress, OR poll `/jobs/:id`.

### `GET /jobs/:id`

Returns full job state including output log.

### `DELETE /cert/:domain`

Remove ACME-managed certificate. Removes Caddy config block, reloads Caddy, deletes from `acme_managed_certs`. Optionally `?keepCredential=true` to preserve.

### `GET /managed-certs`

List all ACME-managed certs with their credentials, status, last issuance.

## 9. UI surface

### New button on Certificates tab

Inside `_renderCertificates()` in `public/js/pages/system.js`:

```html
<button class="btn btn-primary" id="le-wizard-btn">
  <i class="fas fa-magic"></i> Request Let's Encrypt
</button>
```

### Modal — 3-step wizard

Reuses the same modal infra as Secrets Wizard (already exists). Step indicator at top, content middle, Back/Next/Cancel footer.

UI components needed:
- Domain multi-input with validation badges
- Provider dropdown with logo (logos in `public/img/dns-providers/`)
- Per-provider field set (rendered from provider registry metadata)
- Saved-credentials selector with "create new" option
- Live progress panel (WebSocket-driven, like Secrets Wizard remote deploy)

### Saved Credentials management

New small section at bottom of Certificates tab:

```
Saved DNS Credentials (3)
┌─────────────────────────────────────────────────────────┐
│ cloudflare-prod  Cloudflare  ✓ valid 2h ago  [edit][×] │
│ route53-staging  Route53     ⚠ failed 5d ago [edit][×] │
│ hetzner-home     Hetzner     ? unvalidated   [edit][×] │
└─────────────────────────────────────────────────────────┘
[+ Add credential]
```

## 10. Tests

Unit tests:
- `dns-providers.test.js` — registry shape, each provider's validator parses real API responses (mocked)
- `caddy-config.test.js` — addCertBlock / removeCertBlock generates valid JSON; idempotent
- `acme.test.js` — issueCertificate orchestration with mocked Caddy reload + cert file appearance

Integration test (CI-only, with `LE_STAGING_ENABLED=true`):
- End-to-end issuance against LE staging using a CI-controlled test domain (e.g. `dd-ci.example.org`) and a CI-only Cloudflare token (GitHub Actions secret)

Coverage target: ≥85% for new files.

## 11. Documentation

New built-in How-To guide (auto-imported via migration `048_howto_acme.js`):
- Slug: `letsencrypt-dns-wizard`
- Title: "Request a Let's Encrypt Certificate via DNS Challenge"
- EN + RO content
- Sections: when to use DNS-01, generating a scoped Cloudflare token (with screenshot), the wizard walkthrough, troubleshooting common errors

Also update:
- `README.md` — feature list mentions LE wizard
- `docs/guides/why-docker-dash-developers.md` — add to the "what Docker Dash does" list
- `docs/guides/why-docker-dash-developers.ro.md` — same

## 12. Acceptance criteria (verifiable)

| # | Criterion | How to verify |
|---|---|---|
| 1 | Admin can issue a Cloudflare DNS-01 cert in ≤5 clicks from Certificates tab | Manual smoke test |
| 2 | Issued cert appears in Certificate Manager within 60s | Manual; check `tracked_certificates` table |
| 3 | Removing a cert cleanly removes Caddyfile block + reloads Caddy | Curl Caddy admin API before/after |
| 4 | Multiple credentials per provider supported | Insert 3 Cloudflare credentials, switch between them |
| 5 | Failed issuance leaves no broken state | Force a bad token, verify no orphan rows |
| 6 | UI shows scoped-token instructions per provider | Visual review |
| 7 | All credentials encrypted at rest | Inspect SQLite, confirm `credentials_encrypted` is base64-blob |
| 8 | All issuance attempts logged to audit log | Query `audit_log` for `acme_*` actions |
| 9 | Certificate auto-renews via Caddy without Docker Dash involvement | Set test cert near expiry, observe Caddy renewal logs |
| 10 | Migration 048 has working `down()` | Run `migrate down`, verify tables gone |
| 11 | Custom Caddy image builds in CI | GitHub Actions green |
| 12 | Existing manual Caddyfile users don't break | Upgrade test from v6.4 with hand-edited Caddyfile |

## 13. Estimated effort

| Phase | Hours |
|---|---|
| Migration 048 + DB plumbing | 2 |
| `dns-providers.js` registry + 5 validators | 4 |
| `caddy-config.js` JSON manipulation | 4 |
| `acme.js` orchestrator | 4 |
| Routes + WebSocket progress | 3 |
| UI wizard (3 steps + saved-creds management) | 6 |
| Custom Caddy image build pipeline (Dockerfile + GHA) | 2 |
| Unit tests | 4 |
| Integration test against LE staging | 2 |
| Documentation (built-in guide EN + RO + README) | 3 |
| Code review + polish | 3 |
| **Total** | **37 hours** |

Buffer for unforeseen Caddy quirks: +25% = ~46 hours = ~6 working days.

Schedule across 4 sessions:
- Session 1 (10h): Migration + acme.js + caddy-config.js + provider registry
- Session 2 (10h): Routes + custom Caddy image + WebSocket plumbing
- Session 3 (10h): UI wizard + provider-specific UX
- Session 4 (6h): Tests + docs + polish + release

## 14. Release plan

- v6.5.0-beta1 — feature complete, available for community testing via `:beta` Docker tag, NOT in main
- v6.5.0-beta2 — bug fixes from beta1
- v6.5.0 — stable release, default Docker tag updated, custom Caddy image promoted to `:latest`

CHANGELOG entry, whatsnew page entry, blog post on dev.to ("v6.5: Let's Encrypt Wizard — DNS-01 in 5 clicks").

## 15. Out of scope (re-stated for clarity)

- Custom CAs
- ACME EAB
- Multiple ACME accounts
- Self-hosted ACME server (step-ca etc.)
- Wildcard SAN combinations beyond what UI supports
- Cross-instance cert coordination (HA)
- Cert serving for non-Caddy services (existing Certificate Manager upload flow remains)

## 16. Open questions

1. Should the WebSocket progress channel reuse existing WS infrastructure or have its own namespace? (Existing infra preferred; verify no conflicts.)
2. Should we expose a CLI tool (`docker-dash acme issue ...`) for Devops Dan persona? (Defer — API access is sufficient.)
3. Should DNS credentials be sharable across multi-tenant orgs? (Defer — single-tenant model today.)
4. Should we support combined `example.com + *.example.com` SAN cert in one issuance? (Yes — Caddy handles natively.)

## 17. Decision log

| Decision | Rationale | Date |
|---|---|---|
| Caddy plugins approach (option D) | Best ROI vs other 4 options (see brainstorm matrix) | 2026-04-20 |
| Tier 1 = 5 providers | Covers ~80% of expected demand | 2026-04-20 |
| Custom Caddy image | Fast cold start, controlled distribution | 2026-04-20 |
| JSON config (not Caddyfile) for ACME-managed | Easier programmatic mutation | 2026-04-20 |
| Credentials in mounted JSON file | Easier rotation than env vars | 2026-04-20 |
| Default to staging for first issuance | Protect users from rate limits | 2026-04-20 |
| Single shared ACME account | Avoid scope creep | 2026-04-20 |
