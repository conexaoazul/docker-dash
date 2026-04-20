# Preflight Results — Phase 1 Execution

**Date:** 2026-04-20
**Executor:** Bogdan Pricop (with Claude Opus)
**Environment:** staging server `192.168.13.20`, isolated `caddy-preflight-*` containers
**Total time:** ~50 minutes
**Verdict:** 🟢 **GO for implementation, with two spec amendments**

---

## Summary

| Assumption | Status | Notes |
|---|---|---|
| **A1** — Caddy admin API JSON mutations | ✅ PASS | PUT to bootstrap app, POST to append, DELETE by index — all confirmed |
| **A2** — File substitution JSON path syntax | ⚠ PARTIAL | `{file.path:key}` does NOT extract JSON — fall back to one-file-per-field (already in spec) |
| **A3** — Credential reload from file | ✅ PASS WITH BONUS | Caddy reads file on EVERY request — no reload needed for rotation |
| **A4** amd64 — 5 plugins compile | ✅ PASS | Required Caddy 2.11.2 (not 2.8.4) due to plugin dependency upgrades |
| **A11** — Network isolation for admin API | ❌ FAIL — pivot needed | TCP admin reachable from any container on shared network. **Switched to Unix socket.** |

**Two amendments to feature spec:**
1. **Caddy admin API on Unix socket** (`unix//run/caddy/admin.sock`), shared with `app` via mounted volume — NOT TCP on a network
2. **Bump Caddy version requirement** to 2.11.2 (was 2.8.4) for plugin compatibility

Neither is a blocker. Implementation can proceed with revised spec.

---

## A1 — Caddy admin API JSON mutations ✅

**Setup:** Vanilla `caddy:2-alpine` with `admin 0.0.0.0:2019` directive added (default is localhost-only — first surprise).

**Result:** Full CRUD cycle works on `apps/tls/automation/policies`:

```
PUT  /config/apps/tls   {"automation":{"policies":[...]}}    → 200
POST /config/apps/tls/automation/policies (append)            → 200
GET  /config/apps/tls/automation/policies                     → returns array
DELETE /config/apps/tls/automation/policies/0                 → 200
```

**Caveat:** Path traversal fails if parent path doesn't exist. Workflow:
- First-ever ACME cert → PUT bootstrap on `apps/tls`
- Subsequent → POST append on `apps/tls/automation/policies`
- Removal → DELETE by index (we track index in `acme_managed_certs.caddy_config_path`)

**Spec impact:** none. Implementation should detect "tls app exists?" before deciding PUT-bootstrap vs POST-append.

---

## A2 — File substitution with JSON paths ⚠

**Test:** `respond "{file./etc/caddy/secrets/cred.json:api_token}"` with file containing `{"api_token":"json-path-test-value"}`.

**Result:** Returned `token=` (empty) — Caddy treats `:api_token` as part of the path, not a JSON extractor.

**Verified fallback works:** `respond "{file./etc/caddy/secrets/api_token}"` with plain-text file containing `plain-value-in-file` returns `v=plain-value-in-file`. ✅

**Spec impact (already accommodated in `03-deep-spec.md` Section 2):** Use one file per credential field:
```
/etc/caddy/secrets/<credential_id>/api_token       (Cloudflare)
/etc/caddy/secrets/<credential_id>/access_key_id   (Route53)
/etc/caddy/secrets/<credential_id>/secret_access_key
/etc/caddy/secrets/<credential_id>/region
```

Slightly more filesystem ops but cleaner separation. Per-credential directory `0700`, files `0600`.

---

## A3 — Credential reload from file ✅✨

**Test sequence:**
1. Write `initial-value` to credential file → request returns `v=initial-value` ✅
2. Overwrite file with `rotated-new-value`, **NO config reload** → request returns `v=rotated-new-value` ✅✨
3. Trigger reload via `POST /load` → still `v=rotated-new-value` ✅

**Surprising finding:** Caddy reads file substitutions on EVERY request, not at config-load time. **Credential rotation is zero-downtime, zero-reload.** Just atomically replace the file (`tmp + rename`).

**Spec impact:** Update `03-deep-spec.md` Section 2 to remove the "trigger Caddy reload after rotation" step. Just write the new file value, done.

This is significantly better than expected. Rotation flow becomes:
```js
// New rotation logic
async function rotateCredential(credentialId, newCredentials) {
  const dir = path.join(CADDY_SECRETS_DIR, String(credentialId));
  for (const [key, value] of Object.entries(newCredentials)) {
    const filePath = path.join(dir, key);
    await fs.writeFile(filePath + '.tmp', value, { mode: 0o600 });
    await fs.rename(filePath + '.tmp', filePath);  // atomic
  }
  // No Caddy reload needed!
}
```

---

## A4 amd64 — Custom Caddy image with 5 DNS plugins ✅

**Initial attempt:** `caddy:2.8.4-builder` (per spec) → FAILED.
- `route53@v1.6.0` requires Go 1.25.0; builder has Go 1.23.4

**Second attempt:** `caddy:2.10.0-builder` → still FAILED.
- Same plugin requires Go 1.25.0; this builder has Go 1.24.6

**Third attempt:** `GOTOOLCHAIN=auto` env to let Go auto-download required toolchain → FAILED differently.
- `route53@v1.6.0` requires `caddyserver/caddy/v2@v2.10.2`, builder is 2.10.0

**Final attempt:** `caddy:2.11.2-builder` (latest stable) with `GOTOOLCHAIN=auto` → ✅ **PASS in 1m55s**

**Verified output:**
```
Caddy version: v2.11.2
Modules listed: dns.providers.cloudflare, dns.providers.digitalocean,
                dns.providers.hetzner, dns.providers.linode, dns.providers.route53
Image size: 163 MB (vs ~80MB stock caddy:2-alpine — acceptable +83 MB for 5 plugins)
```

**Spec amendments:**
1. Update `02-feature-spec.md` Section 6: change Caddy base image from `2.8.4` to `2.11.2`
2. Update `03-deep-spec.md` Section 11: same
3. Add `ENV GOTOOLCHAIN=auto` to Dockerfile (allows future plugin upgrades to pull required Go versions automatically)

**arm64 not yet validated.** Cross-compilation via QEMU would take ~30 min. Defer to GitHub Actions where buildx + native arm64 runners are available. **Risk:** if arm64 fails for any plugin, drop that plugin from Tier 1.

---

## A11 — Network isolation for admin API ❌ → ✅ via pivot

**Original plan:** Put Caddy on `tls-internal` (with `--internal: true`) network alongside `app`. Other containers on `default` network can't reach Caddy admin.

**Test:** Spawned an intruder Alpine container on `default` network. Result:
```
HTTP 200 — full Caddy config returned, including all secrets
```

**Why it failed:** Caddy admin was on `0.0.0.0:2019`. When Caddy is on TWO networks (default for serving 80/443, tls-internal for admin), all its ports are reachable from BOTH networks. The `--internal` flag only blocks OUTBOUND from the internal network — it doesn't restrict who can connect TO containers on it.

**Pivot tested and confirmed:** Caddy admin on Unix socket.

**New configuration:**
```caddyfile
{
  admin unix//run/caddy/admin.sock
}
```

Volume mount in `docker-compose.yml`:
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

**Re-test results:**
```
A11.5 Intruder via TCP        → HTTP 000 (refused) ✅
A11.6 Legit app via socket    → HTTP 200 (full config) ✅
```

**Spec amendments:**
1. **Drop the `tls-internal` network requirement** from `02-feature-spec.md` and `03-deep-spec.md`
2. **Add `caddy-admin-sock` named volume** to docker-compose.yml plan
3. **Update `services/caddy-config.js`** in spec to use Node's `http.request` with Unix socket path:
   ```js
   const http = require('http');
   const SOCKET_PATH = process.env.CADDY_ADMIN_SOCKET || '/run/caddy/admin.sock';

   function caddyApi(method, path, body) {
     return new Promise((resolve, reject) => {
       const req = http.request({
         socketPath: SOCKET_PATH,
         method, path,
         headers: { 'Content-Type': 'application/json' },
       }, res => {
         let data = '';
         res.on('data', c => data += c);
         res.on('end', () => resolve({ status: res.statusCode, body: data }));
       });
       req.on('error', reject);
       if (body) req.write(JSON.stringify(body));
       req.end();
     });
   }
   ```
4. **`bootstrap/Caddyfile.default`** must include the `admin unix//run/caddy/admin.sock` directive
5. **Caddy container must `mkdir -p /run/caddy`** before binding (entrypoint snippet)

This is actually a stronger security posture than the network-isolation plan. Unix sockets:
- Cannot be reached over TCP from anywhere
- Sharable via volume mount only (explicit, declarative)
- Cleanly survive Caddy restarts (socket file recreated on bind)

---

## Spec amendments summary (apply BEFORE implementation)

### Update `02-feature-spec.md`

- Section 6 "Files to modify": add `caddy-bootstrap/Caddyfile.default` change (admin Unix socket directive)
- Section 6: change `docker-compose.yml` updates — drop `tls-internal` network, add `caddy-admin-sock` volume
- Section 6: update Caddy image build — version 2.11.2 (not 2.8.4), add `GOTOOLCHAIN=auto` env

### Update `03-deep-spec.md`

- Section 1: note that `PUT` is needed first for the `tls` app, then `POST` to append
- Section 2: **strike** "trigger reload" step — file substitution is per-request
- Section 2: confirm one-file-per-field layout
- Section 10: **rewrite** "Caddy admin API security" to describe Unix socket approach, not network isolation
- Section 11: update Dockerfile — Caddy 2.11.2 base, `GOTOOLCHAIN=auto` env

### Update `04-assumption-audit.md`

- A1, A3, A4 (amd64) → mark validated
- A2 → mark validated (one-file-per-field is the path)
- A11 → mark "original approach FAILED, pivoted to Unix socket — validated"
- arm64 (subset of A4) → still pending; defer to GHA

---

## Effort delta

Original estimate (`02-feature-spec.md` Section 13): **37h base, 46h with buffer**

Adjustments after preflight:
| Change | Δ effort |
|---|---|
| Unix socket pivot (drop network setup, simpler client) | **−2h** (simpler than mTLS would have been) |
| Per-request file reload (no rotation reload step) | **−1h** |
| Bump Caddy version + GOTOOLCHAIN env | **+0h** (just config changes) |
| Plugin version testing across Caddy/Go matrix | **+2h** (account for future upgrades) |

**Net: 36h base, 45h with buffer.** Slightly under the original estimate.

---

## Outstanding items before coding

- [ ] **arm64 build validation** — push the working amd64 Dockerfile to a GHA branch with `buildx --platform linux/arm64`, verify all 5 plugins compile. ~2h CI time. Run as a separate PR before main implementation.
- [ ] **A5 Provider validation endpoints** — manual test with real API tokens for Cloudflare/Route53/DigitalOcean/Hetzner/Linode. Defer until implementing each provider in `dns-providers.js` (just-in-time validation).
- [ ] **A12 v6.4 → v6.5 upgrade safety** — manual test with a v6.4 instance + custom Caddyfile, upgrade to a branch build of v6.5. Defer until first integration test on staging.

None of these are blockers for starting Session 1 (Migration + service skeletons).

---

## Decision

✅ **Proceed to implementation.** Apply the 5 spec amendments above, then start Session 1.

The architectural assumption (use Caddy + DNS plugins) is sound. The two surprises (admin endpoint binding, network isolation) were caught cheaply in preflight, exactly as intended. Spec adjustments are minor.

---

## Reproducibility — exact commands used

All tests ran on `192.168.13.20`. Containers named `caddy-preflight-*`. Test files in `/tmp/caddy-preflight/`. Cleanup performed at end.

Full command transcripts are available in the conversation history. Key Dockerfile that worked:

```dockerfile
ARG CADDY_VERSION=2.11.2
FROM caddy:${CADDY_VERSION}-builder AS builder

ENV GOTOOLCHAIN=auto

RUN xcaddy build \
  --with github.com/caddy-dns/cloudflare \
  --with github.com/caddy-dns/route53 \
  --with github.com/caddy-dns/digitalocean \
  --with github.com/caddy-dns/hetzner \
  --with github.com/caddy-dns/linode

FROM caddy:${CADDY_VERSION}-alpine
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
```

Key Caddyfile bootstrap that worked:

```
{
  admin unix//run/caddy/admin.sock
}
:80 {
  respond "Docker Dash — configure HTTPS via UI" 200
}
```
