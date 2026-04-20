# Deep Spec — Let's Encrypt Wizard

**Status:** Draft v1 · 2026-04-20
**Companion:** `02-feature-spec.md` (overall design)

This document goes deep on the parts of the wizard where the design has real complexity and the wrong choice will cost weeks. Each section is a sub-design with chosen approach + alternatives considered + rationale.

---

## 1. Caddy config storage strategy — Caddyfile vs JSON

Caddy supports two config formats:

**Caddyfile** (text-based, human-friendly):
```
api.example.com {
  tls admin@example.com {
    dns cloudflare {env.CLOUDFLARE_TOKEN}
  }
  reverse_proxy backend:3000
}
```

**JSON** (Caddy's native internal format):
```json
{
  "apps": {
    "tls": {
      "automation": {
        "policies": [
          {
            "subjects": ["api.example.com"],
            "issuers": [{
              "module": "acme",
              "email": "admin@example.com",
              "challenges": {
                "dns": {
                  "provider": { "name": "cloudflare", "api_token": "{env.CF_TOKEN}" }
                }
              }
            }]
          }
        ]
      }
    },
    "http": {
      "servers": {
        "srv0": {
          "listen": [":443"],
          "routes": [{ "match": [{"host": ["api.example.com"]}], "handle": [...] }]
        }
      }
    }
  }
}
```

### Trade-offs

| Aspect | Caddyfile | JSON |
|---|---|---|
| Human readability | ✅ excellent | ❌ verbose |
| Programmatic mutation | ❌ requires text manipulation (fragile) | ✅ structured tree |
| Atomic updates | ❌ rewrite whole file | ✅ admin API PATCH |
| Hot reload without restart | ✅ via signal | ✅ via admin API |
| Round-trip safe | ❌ comments and formatting lost | ✅ JSON in = JSON out |
| Existing Docker Dash usage | ✅ what we ship today | — |

### Decision

**Hybrid mode:**

- **Boot-time:** Caddy still starts with a Caddyfile (the `caddy-bootstrap/Caddyfile.default`) so zero-config users get an HTTP listener. Existing `services/ssl.js` flow for self-signed certs remains Caddyfile-based.
- **ACME-managed certs:** managed exclusively via JSON config tree, mutated via Caddy's admin API on a **Unix socket** at `/run/caddy/admin.sock` (see Section 10 for security rationale — TCP would be reachable from arbitrary user containers on the same Docker network).

This way:
- Existing users with hand-edited Caddyfiles are not broken
- ACME certs get clean, atomic, programmatic management
- We don't rewrite anyone's Caddyfile
- Admin API is unreachable over the network — only mountable via shared volume

### How it works

Caddy actually compiles Caddyfile → JSON internally. So at runtime, both representations exist. We talk to admin API via Unix socket and:

1. **First-time bootstrap** (the `tls` app may not exist yet): `PUT /config/apps/tls` with `{"automation":{"policies":[{...}]}}`
2. **Subsequent appends:** `POST /config/apps/tls/automation/policies` with one policy object
3. **Removal:** `DELETE /config/apps/tls/automation/policies/{index}`

Path traversal fails if the parent doesn't exist — so the orchestrator detects "tls app present?" first via `GET /config/apps/tls` and PUTs vs POSTs accordingly.

Caddy validates and applies atomically. If invalid, returns 400 with a clear error (no half-applied state).

The admin API supports these granular mutations cleanly. **Verified in preflight A1** — see `05-preflight-results.md`.

### Implementation skeleton

```js
// src/services/caddy-config.js
const http = require('http');

const CADDY_ADMIN_SOCKET = process.env.CADDY_ADMIN_SOCKET || '/run/caddy/admin.sock';

/**
 * Make an HTTP request to Caddy admin API over Unix socket.
 * @param {string} method - GET/PUT/POST/DELETE
 * @param {string} path - e.g. '/config/apps/tls/automation/policies'
 * @param {object} [body] - JSON body
 */
function caddyApi(method, path, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      socketPath: CADDY_ADMIN_SOCKET,
      method,
      path,
      headers: body ? { 'Content-Type': 'application/json' } : {},
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        if (res.statusCode >= 400) {
          return reject(new Error(`Caddy admin ${method} ${path} → ${res.statusCode}: ${data}`));
        }
        resolve(data ? JSON.parse(data) : null);
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function fetchConfig() {
  return caddyApi('GET', '/config/');
}

async function addAcmePolicy({ subjects, email, challengeType, providerConfig }) {
  const policy = {
    subjects,
    issuers: [{
      module: 'acme',
      email,
      challenges: challengeType === 'dns-01'
        ? { dns: { provider: providerConfig } }
        : {}, // HTTP-01 is default
    }],
  };

  // Detect whether the tls app exists yet
  let tlsExists = true;
  try { await caddyApi('GET', '/config/apps/tls'); }
  catch { tlsExists = false; }

  if (!tlsExists) {
    // Bootstrap the whole tls app
    await caddyApi('PUT', '/config/apps/tls', { automation: { policies: [policy] } });
  } else {
    // Append to existing policies array
    await caddyApi('POST', '/config/apps/tls/automation/policies', policy);
  }
}

async function removeAcmePolicyBySubjects(subjects) {
  const cfg = await fetchConfig();
  const policies = cfg?.apps?.tls?.automation?.policies || [];
  const targetSet = new Set(subjects);
  const idx = policies.findIndex(p =>
    Array.isArray(p.subjects) &&
    p.subjects.length === subjects.length &&
    p.subjects.every(s => targetSet.has(s))
  );
  if (idx === -1) return false;
  await caddyApi('DELETE', `/config/apps/tls/automation/policies/${idx}`);
  return true;
}

module.exports = { caddyApi, fetchConfig, addAcmePolicy, removeAcmePolicyBySubjects };
```

### Edge case: Caddy is not running

If `caddy` container is stopped (TLS profile not enabled), the wizard should fail gracefully with: "Caddy is not running. Start the TLS profile first: `docker compose --profile tls up -d`."

Detection: `GET /config/` throws (`ENOENT` on socket file or `ECONNREFUSED` if socket is dead) → return 503 from our API.

---

## 2. Credential injection into Caddy

Caddy's JSON config can reference credentials in three ways:

**A) Inline plain value:**
```json
{ "name": "cloudflare", "api_token": "v1.0-actual-token-here" }
```
Visible in `GET /config/`. Bad.

**B) Environment variable substitution:**
```json
{ "name": "cloudflare", "api_token": "{env.CF_PROD_TOKEN}" }
```
Caddy reads `CF_PROD_TOKEN` from its env at config-load time.

**C) File substitution:**
```json
{ "name": "cloudflare", "api_token": "{file./etc/caddy/secrets/cf_prod}" }
```
Caddy reads the file **on every request** that needs the value (verified preflight A3 — not at config-load only). This means **credential rotation is zero-downtime, zero-reload**.

### Trade-offs

| Aspect | Inline | Env vars | File mount |
|---|---|---|---|
| Visible in config dump | ❌ | ✅ hidden | ✅ hidden |
| Rotation without Caddy restart | ✅ | ❌ requires restart | ✅ **atomic file replace, no reload needed** |
| Multi-credential support | ✅ | ✅ N env vars | ✅ N files |
| Audit trail (who accessed) | — | — | possible via filesystem audit |

### Decision

**File mount.** Specifically:

- Docker volume `caddy-secrets:/etc/caddy/secrets:ro` mounted into Caddy container
- Each credential lives at `/etc/caddy/secrets/<credential_id>/<field>` (the SQLite row ID + field name)
- File contents = raw credential value (just the token/key)
- When credential is updated: atomically replace via `tmp + rename`
- **No Caddy reload needed** — file substitution is per-request

### Multi-field credentials

Some providers (Route53, Linode with region, etc.) need multiple fields. Preflight A2 confirmed Caddy's `{file.path:key}` syntax does NOT extract JSON paths — fall back to one file per field:

```
/etc/caddy/secrets/<credential_id>/api_token         (Cloudflare)
/etc/caddy/secrets/<credential_id>/access_key_id     (Route53)
/etc/caddy/secrets/<credential_id>/secret_access_key
/etc/caddy/secrets/<credential_id>/region
```

Per-credential directory `0700`, files `0600`. Caddy config references each individually:

```json
{
  "name": "route53",
  "access_key_id": "{file./etc/caddy/secrets/7/access_key_id}",
  "secret_access_key": "{file./etc/caddy/secrets/7/secret_access_key}",
  "region": "{file./etc/caddy/secrets/7/region}"
}
```

### Implementation

```js
// src/services/acme.js

const CADDY_SECRETS_DIR = process.env.CADDY_SECRETS_DIR || '/data/caddy-secrets';

/**
 * Write credential field files atomically. Caddy picks up changes on next
 * request — NO reload required.
 */
async function writeCredentialFiles(credentialId, credentials) {
  const fs = require('fs').promises;
  const path = require('path');
  const dir = path.join(CADDY_SECRETS_DIR, String(credentialId));
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  for (const [key, value] of Object.entries(credentials)) {
    const filePath = path.join(dir, key);
    const tmpPath = filePath + '.tmp';
    await fs.writeFile(tmpPath, String(value), { mode: 0o600 });
    await fs.rename(tmpPath, filePath);  // atomic replace
  }
}

async function deleteCredentialFiles(credentialId) {
  const fs = require('fs').promises;
  const path = require('path');
  await fs.rm(path.join(CADDY_SECRETS_DIR, String(credentialId)), { recursive: true, force: true });
}

async function rotateCredential(credentialId, newCredentials) {
  // Just rewrite the files. No Caddy reload.
  await writeCredentialFiles(credentialId, newCredentials);
}
```

The Docker Dash `app` container mounts `caddy-secrets:/data/caddy-secrets:rw` so it can write the files. Caddy mounts the same volume read-only at `/etc/caddy/secrets`.

`docker-compose.yml` change:
```yaml
services:
  app:
    volumes:
      - caddy-secrets:/data/caddy-secrets:rw  # write side
  caddy:
    volumes:
      - caddy-secrets:/etc/caddy/secrets:ro   # read side
      - caddy-admin-sock:/run/caddy:rw         # admin API socket (see Section 10)

volumes:
  caddy-secrets:
  caddy-admin-sock:
```

---

## 3. Provider abstraction interface

Single source of truth for what providers we support and how each is configured.

```js
// src/services/dns-providers.js

const PROVIDERS = {
  cloudflare: {
    id: 'cloudflare',
    name: 'Cloudflare',
    docsUrl: 'https://developers.cloudflare.com/fundamentals/api/get-started/create-token/',
    instructionsKey: 'acme.providers.cloudflare.instructions',
    fields: [
      {
        key: 'api_token',
        label: 'API Token (scoped, NOT Global API Key)',
        type: 'password',
        required: true,
        placeholder: 'eyJhbGc...',
        helpText: 'Use a token with Zone:DNS:Edit permission for the specific zone.',
      },
    ],
    caddyPluginPackage: 'github.com/caddy-dns/cloudflare',
    caddyConfigKey: 'cloudflare',
    /**
     * @returns {Promise<{ok: boolean, message: string, scope?: string[]}>}
     */
    async validate(creds) {
      const res = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
        headers: { Authorization: `Bearer ${creds.api_token}` },
      });
      const json = await res.json();
      if (!json.success) {
        return { ok: false, message: json.errors?.[0]?.message || 'Invalid token' };
      }
      // Optionally check token scope (Cloudflare exposes it)
      return { ok: true, message: 'Token valid', scope: json.result?.policies };
    },
    /**
     * Convert stored credentials to Caddy DNS provider config block.
     * Uses file substitution for security.
     */
    toCaddyConfig(credentialId) {
      return {
        name: 'cloudflare',
        api_token: `{file./etc/caddy/secrets/${credentialId}/api_token}`,
      };
    },
  },

  route53: {
    id: 'route53',
    name: 'AWS Route53',
    docsUrl: 'https://docs.aws.amazon.com/.../iam-policy-route53.html',
    instructionsKey: 'acme.providers.route53.instructions',
    fields: [
      { key: 'access_key_id', label: 'Access Key ID', type: 'text', required: true },
      { key: 'secret_access_key', label: 'Secret Access Key', type: 'password', required: true },
      { key: 'region', label: 'Region', type: 'text', required: false, placeholder: 'us-east-1' },
    ],
    caddyPluginPackage: 'github.com/caddy-dns/route53',
    caddyConfigKey: 'route53',
    async validate(creds) {
      // Use AWS Signature V4 to call route53:ListHostedZones
      // ... (see implementation)
    },
    toCaddyConfig(credentialId) {
      return {
        name: 'route53',
        access_key_id: `{file./etc/caddy/secrets/${credentialId}/access_key_id}`,
        secret_access_key: `{file./etc/caddy/secrets/${credentialId}/secret_access_key}`,
        region: `{file./etc/caddy/secrets/${credentialId}/region}`,
      };
    },
  },

  digitalocean: { /* ... */ },
  hetzner:      { /* ... */ },
  linode:       { /* ... */ },
};

module.exports = {
  list: () => Object.values(PROVIDERS).map(p => ({ ...p, validate: undefined, toCaddyConfig: undefined })),
  get: (id) => PROVIDERS[id],
  validate: (id, creds) => PROVIDERS[id]?.validate(creds),
  toCaddyConfig: (id, credentialId) => PROVIDERS[id]?.toCaddyConfig(credentialId),
};
```

### Adding a new provider

A community PR adds Tier 2/3 provider in 3 steps:

1. Add entry to `PROVIDERS` map (~30 lines)
2. Add `--with github.com/caddy-dns/<provider>` to `docker/caddy/Dockerfile`
3. Update `02-feature-spec.md` provider tier list

That's it. The orchestrator, UI, route, and storage are all generic.

---

## 4. WebSocket progress channel

Issuance can take 30s–5min depending on DNS propagation. Synchronous HTTP would either timeout or hold the connection open.

### Design

```
[Frontend] -- POST /api/system/acme/issue --> [Backend]
                                              creates job (id=42), returns 202 + {jobId: 42}
[Frontend] -- WebSocket subscribe acme:job:42 --> [Backend]
                                              pushes events as job progresses
[Backend orchestrator]:
  - emits "credential_validated"
  - emits "caddy_config_updated"
  - emits "caddy_reloaded"
  - emits "challenge_started"
  - emits "challenge_dns_record_added"
  - emits "challenge_propagation_confirmed"
  - emits "challenge_passed"
  - emits "certificate_issued"
  - emits "tracked_in_certificate_manager"
  - emits "complete" (with result)

OR on failure:
  - emits "error" with {phase, errorClass, message, suggestion}
```

### Reuse existing WS infra

`src/ws/index.js` already has subscription channels for container events, log streams, etc. Add `acme:job:N` topic.

If WebSocket connection is unavailable (proxy strips it, browser blocked), fall back to polling `GET /jobs/:id` every 2s.

### State persistence

Job state lives in `acme_jobs` table — survives Docker Dash restart. If a job is `running` at startup and Caddy is no longer running it, we need to detect orphans and mark them `failed` with `error_class='orphan'`.

Cron sweep: every 5 min, find jobs with `status='running'` and `started_at < now - 10 min` → mark failed.

---

## 5. Error classification & user-facing messages

ACME failures fall into 6 buckets. Wizard maps backend errors to UI hints.

| `error_class` | Detection | UI message | Suggested fix |
|---|---|---|---|
| `rate_limit` | ACME response: "too many certificates already issued" | "Let's Encrypt rate limit hit. You can issue at most 50 certs/week per registered domain, 5 duplicates/week, 5 failed validations/hour." | "Wait an hour, or use staging environment to test config." |
| `dns` | ACME response: "DNS problem", "no TXT record found", or our timeout | "DNS challenge failed. The TXT record either wasn't created or wasn't propagated in time." | "Check provider API token has DNS write permission. If using a slow DNS provider, try again — propagation can take 5+ minutes." |
| `credential` | Provider validator returned `ok: false`, OR Caddy reports auth failure | "Provider credentials invalid or insufficient permissions." | "Verify the token is scoped correctly. See the provider's docs link in the wizard." |
| `network` | fetch errors to ACME or provider API | "Network error contacting Let's Encrypt or DNS provider." | "Check Docker Dash's outbound internet access. Try again." |
| `caddy` | Caddy admin API returned non-2xx | "Caddy configuration error." | "Check Caddy logs: `docker logs docker-dash-caddy`. Often a config syntax issue we should have caught — please file an issue." |
| `other` | Anything we didn't classify | "Unexpected error. See logs." | "Open an issue with the job ID." |

The classification function lives in `acme.js`:

```js
function classifyError(err, phase) {
  const msg = (err.message || '').toLowerCase();
  if (msg.includes('rate limit') || msg.includes('too many')) return 'rate_limit';
  if (msg.includes('dns problem') || msg.includes('txt record') || phase === 'dns_propagation') return 'dns';
  if (msg.includes('auth') || msg.includes('credential') || msg.includes('forbidden') || msg.includes('401') || msg.includes('403')) return 'credential';
  if (msg.includes('econnrefused') || msg.includes('etimedout') || msg.includes('enotfound')) return 'network';
  if (phase === 'caddy_reload' || phase === 'caddy_config') return 'caddy';
  return 'other';
}
```

---

## 6. Concurrency & locking

Two admins issuing certs simultaneously could:
- Both append to the same `policies` array → race condition in Caddy admin API
- Both try to write to the same credential file → torn write

### Mitigations

**Caddy admin API:** atomic per-call. Two concurrent POSTs to `/config/apps/tls/automation/policies` are fine — Caddy serializes them internally. Verified in Caddy docs.

**Credential file writes:** atomic via `tmp + rename` (single-credential), but two requests writing the SAME credential could interleave. Mitigation: SQLite-level lock around credential writes.

**ACME job dedup:** if the same domain set is requested twice within 30 seconds, return the first job's ID instead of starting a duplicate. Spec:

```sql
SELECT id FROM acme_jobs
WHERE domains = ?
  AND status IN ('pending', 'running')
  AND created_at > datetime('now', '-30 seconds')
ORDER BY id DESC LIMIT 1;
```

If found, return existing `jobId` from `POST /issue` instead of creating new.

---

## 7. Migration from existing setups

Three states a user might be in pre-v6.5:

### a) Brand new install
- Caddyfile is the bootstrap default
- No certs issued
- Wizard works from scratch — no migration needed

### b) Self-signed cert flow (existing v6.x feature)
- User has gone through SSL UI to generate self-signed
- Caddyfile has been written by Docker Dash
- Wizard offers: "Replace self-signed for this domain with Let's Encrypt cert?" → atomic swap

### c) Hand-edited Caddyfile
- User has manually customized Caddyfile (we can detect: it's not the bootstrap default content, no Docker Dash markers)
- Wizard warns: "Your Caddyfile contains custom configuration. ACME-managed certs will be added via Caddy's JSON config and will coexist with your Caddyfile. Don't add manual `tls` directives for the same domains."
- Both formats coexist at runtime. Caddy merges. We don't touch their Caddyfile.

### Caddyfile detection markers

When Docker Dash writes a Caddyfile, prepend a marker comment:
```
# Auto-generated by Docker Dash — do not edit manually
# To customize, switch to JSON config mode in System → SSL/TLS
```

If marker is missing, treat as user-customized and don't touch.

---

## 8. Auto-renewal monitoring

Caddy auto-renews at ~60-day cert age (LE certs are 90 days). Caddy logs a renewal event. We rely on Caddy for the renewal itself but add monitoring:

- Existing daily 07:30 cert expiry scan in `jobs/index.js` already catches certs expiring soon
- For ACME-managed certs, additionally: if `not_after - now < 14 days` AND Caddy hasn't renewed, emit a security alert ("Certificate renewal appears to have failed for X.example.com")
- Detection: query `acme_managed_certs`, join with `tracked_certificates`, check `not_after` distance

User-facing: red banner on Certificates tab if any ACME cert is in `<14 days` state.

---

## 9. Audit log entries

Every meaningful action is logged. Per finding F22 in the audit, retention is now 365 days.

| Action | When | Details (NEVER credential value) |
|---|---|---|
| `acme_credential_create` | POST /credentials | `{name, providerId, validateOnSave: bool, validationStatus}` |
| `acme_credential_update` | PATCH /credentials/:id | `{credentialId, providerId, fieldsRotated: [keys]}` |
| `acme_credential_delete` | DELETE /credentials/:id | `{credentialId, providerId, name}` |
| `acme_credential_validate` | POST /credentials/:id/validate | `{credentialId, providerId, status, message}` |
| `acme_issuance_request` | POST /issue | `{jobId, domains, challengeType, providerId, credentialsId, staging}` |
| `acme_issuance_success` | job complete | `{jobId, domains, certFingerprintSha256, providerId, durationMs}` |
| `acme_issuance_failed` | job failed | `{jobId, domains, errorClass, errorMessage, providerId}` |
| `acme_certificate_remove` | DELETE /cert/:domain | `{domain, certId}` |

All entries include user_id, IP, timestamp via existing audit infra.

---

## 10. Caddy admin API security

Caddy's admin API is unauthenticated by design (intended for trusted local clients). The original plan was to put Caddy on a dedicated `tls-internal` Docker network with `--internal: true` and bind admin to TCP only on that network.

**Preflight A11 proved this approach FAILS:** `--internal` on a Docker network blocks OUTBOUND traffic from that network only. Containers attached to the network can still receive INBOUND from any other network they share. Since Caddy must be on the `default` network to serve 80/443 to user-facing containers, putting it ALSO on `tls-internal` doesn't restrict who can reach its admin port — anyone on `default` can hit `caddy:2019`.

### Decision: Unix socket admin API

```caddyfile
{
  admin unix//run/caddy/admin.sock
}
```

The socket file is created by Caddy at boot. Mount it via a shared Docker volume so only the `app` container can talk to it:

```yaml
services:
  app:
    volumes:
      - caddy-admin-sock:/run/caddy:rw
  caddy:
    volumes:
      - caddy-admin-sock:/run/caddy:rw

volumes:
  caddy-admin-sock:
```

**Verified in preflight A11:**
- TCP attempt from intruder container on shared network → `HTTP 000` (refused — no TCP listener)
- Unix socket from app container with mounted volume → `HTTP 200` (full config returned)

**Stronger security posture than the original plan:**
- Cannot be reached over TCP from anywhere — no port to scan
- Sharable only via volume mount — explicit, declarative, auditable in `docker-compose.yml`
- Socket file recreated by Caddy on bind — survives Caddy restarts cleanly
- Permissions on the socket file (`s-w-------`, owner root) restrict access at OS level too

### Caddy entrypoint requirement

Caddy must `mkdir -p /run/caddy` before binding (default image already does this via the volume mount). If running outside Docker for some reason, ensure the directory exists with appropriate permissions before starting Caddy.

### Future enhancement (v6.6+)

Caddy 2.7+ supports `admin.identity` (mTLS with client certs) which would allow remote admin API access in HA deployments. Not needed for v6.5 single-instance scope.

---

## 11. Caddy custom image — build pipeline

`docker/caddy/Dockerfile` (verified working in preflight A4):

```dockerfile
# syntax=docker/dockerfile:1
ARG CADDY_VERSION=2.11.2
FROM caddy:${CADDY_VERSION}-builder AS builder

# Allow auto-download of newer Go toolchain when plugins require it
# (route53 v1.6.0 requires Go 1.25, builder ships 1.24)
ENV GOTOOLCHAIN=auto

# Floating versions for now — plugin ecosystem moves quickly with security fixes.
# Re-pin once API stabilizes.
RUN xcaddy build \
  --with github.com/caddy-dns/cloudflare \
  --with github.com/caddy-dns/route53 \
  --with github.com/caddy-dns/digitalocean \
  --with github.com/caddy-dns/hetzner \
  --with github.com/caddy-dns/linode

FROM caddy:${CADDY_VERSION}-alpine
COPY --from=builder /usr/bin/caddy /usr/bin/caddy

LABEL org.opencontainers.image.source="https://github.com/bogdanpricop/docker-dash"
LABEL org.opencontainers.image.description="Caddy with DNS plugins for Docker Dash Let's Encrypt Wizard"
LABEL org.opencontainers.image.licenses="Apache-2.0"
```

**Build measured in preflight (amd64):** ~2 minutes wall time, image size 163 MB (vs ~80 MB stock Caddy alpine, +83 MB for 5 plugins — acceptable).

**arm64 still unverified.** Run via GitHub Actions buildx with `--platform linux/arm64` in a separate PR before main implementation lands.

`.github/workflows/caddy-image.yml`:

```yaml
name: Build Caddy Custom Image

on:
  push:
    paths:
      - 'docker/caddy/**'
      - '.github/workflows/caddy-image.yml'
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-qemu-action@v3
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v5
        with:
          context: docker/caddy
          platforms: linux/amd64,linux/arm64
          push: true
          tags: |
            ghcr.io/bogdanpricop/docker-dash-caddy:latest
            ghcr.io/bogdanpricop/docker-dash-caddy:${{ env.CADDY_VERSION }}
            ghcr.io/bogdanpricop/docker-dash-caddy:6.5
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

`docker-compose.yml` updates:

```yaml
services:
  caddy:
    image: ghcr.io/bogdanpricop/docker-dash-caddy:6.5
    # ... rest unchanged
```

If image pull fails (offline / GHCR down), fallback to `caddy:2-alpine` is documented but loses DNS plugin support.

---

## 12. UI wizard — state machine

Reuse the same modal infrastructure as Secrets Wizard. State:

```js
const state = {
  step: 1,
  domains: [],
  email: '',
  challengeType: 'http-01',
  staging: true,        // default ON for first cert
  // dns-01 specific
  credentialMode: 'new',  // 'new' | 'existing'
  existingCredentialId: null,
  providerId: null,
  credentials: {},      // {api_token: '...'} or {access_key: '...', secret_key: '...'}
  saveCredentialAs: null,  // string or null
  validateBeforeIssue: true,
  // step 3 — issuance
  jobId: null,
  jobStatus: null,
  jobOutput: [],
};
```

Step transitions only allowed if validation passes. Back button preserves state.

WebSocket subscription opens on step 3 click. Component cleans up subscription on modal close.

---

## 13. Failure recovery scenarios

### A) Caddy crashes mid-issuance
- ACME job stuck in `running`
- Cron sweep marks failed after 10 min
- User sees clear error, can retry
- No partial cert state (Caddy is atomic on cert acquire)

### B) DNS propagation never completes
- Caddy retries with backoff (built in)
- Our timeout: 5 minutes
- After timeout, mark failed with `dns` error class
- Caddy may continue trying in background (not our problem; it'll succeed eventually if config is correct)

### C) Docker Dash crashes mid-issuance
- Job state `running` in DB
- On restart, cron sweep marks failed
- User can retry from Certificates tab

### D) Credential rotated mid-issuance
- The credential file is written before Caddy reloads
- If credential is updated DURING issuance: Caddy may use old or new (race), but ACME response will tell us if auth failed
- Mitigation: lock credential rows during job execution

### E) Caddy plugin missing
- ACME job fails with "unknown DNS provider 'xyz'"
- Classify as `caddy` error
- User-facing message: "DNS provider plugin not available in this Caddy build. This shouldn't happen — please file an issue."

---

## 14. Performance budget

| Operation | Target | Hard limit |
|---|---|---|
| Provider list endpoint | <50 ms | <500 ms |
| Credential validation | <2 s | <10 s |
| Caddy reload | <2 s | <10 s |
| Full ACME issuance (HTTP-01) | <30 s | <120 s |
| Full ACME issuance (DNS-01, fast provider) | <60 s | <300 s |
| Full ACME issuance (DNS-01, slow provider like Route53) | <120 s | <300 s |

If hard limits exceeded, fail with timeout error.

---

## 15. Open implementation questions

1. Caddy `{file.path}` JSON path support — verify or fall back to one-file-per-field
2. Caddy admin API authentication for v6.5 vs v6.6 — start without (network-isolated), add mTLS in v6.6
3. WebSocket vs Server-Sent Events for progress — WS reuses existing infra; SSE simpler but new infra
4. Should we vendor Caddy plugin source as git submodule? — no, just pin version in xcaddy
5. ARM64 plugin compatibility — verify in CI build

These need answers before code starts. → `04-assumption-audit.md`
