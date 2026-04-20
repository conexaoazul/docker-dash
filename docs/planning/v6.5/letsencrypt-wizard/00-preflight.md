# Preflight Checklist — Let's Encrypt Wizard

**Status:** Draft v1 · 2026-04-20
**Companion:** `04-assumption-audit.md` (the assumptions this preflight verifies)

This checklist is the gate between "we have a plan" and "we can write production code." Skip a step here, pay 10× the cost mid-implementation.

**Estimated total time:** 8–12 hours (1.5 working days).

---

## Phase 0 — Environment readiness (~30 min)

- [ ] **Personal repo `bogdanpricop/docker-dash` has GHCR push permissions** (verify in repo settings → Packages → Allow GitHub Actions)
- [ ] **Local development environment can run `xcaddy` builds** (Go toolchain installed, or use the official `caddy:builder` image)
- [ ] **Local Docker can run buildx with QEMU for cross-arch builds** (`docker buildx ls` shows multi-platform support)
- [ ] **A test domain you control exists** for issuance experiments (suggested: subdomain of a personal domain, e.g., `dd-test.your-domain.tld`)
- [ ] **Cloudflare account with API token creation access** for the test domain (free tier is fine)

---

## Phase 1 — Validate load-bearing assumptions (~6 hours)

These are the experiments from `04-assumption-audit.md`. Do them in order. **STOP if any reveal a blocker** (marked ⚠).

### ⚠ A1 — Caddy admin API supports JSON config mutations (1h)

```bash
# Spin up vanilla Caddy with admin API exposed
docker run --rm -d --name caddy-test -p 2019:2019 caddy:2-alpine \
  caddy run --config /etc/caddy/Caddyfile

# Try the proposed mutation
curl -X POST http://localhost:2019/config/apps/tls/automation/policies \
  -H "Content-Type: application/json" \
  -d '{"subjects": ["test.example.com"], "issuers": [{"module": "internal"}]}'

# Verify it appears
curl http://localhost:2019/config/ | jq .apps.tls.automation.policies

# Try delete by index
curl -X DELETE http://localhost:2019/config/apps/tls/automation/policies/0

# Verify gone
curl http://localhost:2019/config/ | jq .apps.tls.automation.policies
```

**Pass criteria:** Both POST and DELETE return 200 OK. The config GET reflects the changes.

**If fail:** Architecture changes needed. Stop and revisit `01-brainstorm.md`.

---

### A2 — Caddy file substitution supports JSON paths (30m)

```bash
# Create a JSON credentials file
mkdir -p /tmp/caddy-secrets
echo '{"api_token":"test-value"}' > /tmp/caddy-secrets/cred.json

# Create a Caddyfile that references it
cat > /tmp/Caddyfile <<EOF
:8080 {
  respond "{file./tmp/caddy-secrets/cred.json:api_token}"
}
EOF

# Run Caddy with that config
docker run --rm -v /tmp:/tmp caddy:2-alpine caddy run --config /tmp/Caddyfile --adapter caddyfile

# In another terminal:
curl http://localhost:8080
```

**Pass criteria:** Response body is `test-value` (the JSON path was extracted).

**If fail:** Use one-file-per-field. Document in deep spec.

---

### A3 — Caddy reloads credentials from file on config reload (45m)

```bash
# Continue from A2 setup
echo '{"api_token":"new-value-after-rotation"}' > /tmp/caddy-secrets/cred.json

# Reload Caddy via admin API (no restart)
curl -X POST http://localhost:2019/load -H "Content-Type: application/json" -d @config-pushed-via-A1.json

# Test the response again
curl http://localhost:8080
```

**Pass criteria:** Response body is `new-value-after-rotation` (Caddy re-read the file on reload).

**If fail:** Document credential rotation as requiring container restart.

---

### ⚠ A4 — Tier-1 plugins compile clean on amd64 AND arm64 (2h)

```bash
# Create the planned Dockerfile
mkdir -p /tmp/caddy-build
cat > /tmp/caddy-build/Dockerfile <<'EOF'
FROM caddy:2.8.4-builder AS builder
RUN xcaddy build \
  --with github.com/caddy-dns/cloudflare \
  --with github.com/caddy-dns/route53 \
  --with github.com/caddy-dns/digitalocean \
  --with github.com/caddy-dns/hetzner \
  --with github.com/caddy-dns/linode

FROM caddy:2.8.4-alpine
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
EOF

# Build amd64
docker buildx build --platform linux/amd64 -t caddy-test:amd64 /tmp/caddy-build

# Build arm64 (slow with QEMU; ~10-30 min)
docker buildx build --platform linux/arm64 -t caddy-test:arm64 /tmp/caddy-build

# Verify each: list-modules should show 5 dns providers
docker run --rm --platform linux/amd64 caddy-test:amd64 caddy list-modules | grep dns.providers
docker run --rm --platform linux/arm64 caddy-test:arm64 caddy list-modules | grep dns.providers
```

**Pass criteria:** Both architectures built successfully. Both `caddy list-modules` show all 5 plugins.

**If amd64 fails:** Investigate which plugin breaks; drop or pin earlier version.
**If arm64 fails:** Drop arm64 from initial release; document.

---

### A5 — Each provider has a working validation endpoint (1h, 12 min/provider)

For each Tier 1 provider:
1. Create a sandbox/test API token
2. Call the planned validation endpoint
3. Verify response shape matches spec

| Provider | Test command |
|---|---|
| Cloudflare | `curl -H "Authorization: Bearer $CF_TOKEN" https://api.cloudflare.com/client/v4/user/tokens/verify` |
| Route53 | `aws route53 list-hosted-zones` (with test IAM creds) |
| DigitalOcean | `curl -H "Authorization: Bearer $DO_TOKEN" https://api.digitalocean.com/v2/account` |
| Hetzner | `curl -H "Auth-API-Token: $HETZNER" https://dns.hetzner.com/api/v1/zones` |
| Linode | `curl -H "Authorization: Bearer $LINODE" https://api.linode.com/v4/profile` |

**Pass criteria:** Each call returns 200 with parseable JSON.

**If fail (any provider):** Skip pre-flight validation for that provider; note in feature spec.

---

### ⚠ A11 — Docker network isolation works (30m)

```bash
# Set up networks per spec
docker network create --internal docker-dash-tls-internal
docker network create docker-dash-default

# Spawn Caddy on both networks
docker run --rm -d --name caddy-test \
  --network docker-dash-default \
  caddy:2-alpine
docker network connect docker-dash-tls-internal caddy-test

# Spawn a third container on default network only
docker run --rm -it --network docker-dash-default alpine sh -c \
  "wget -qO- caddy-test:2019/config/ || echo 'BLOCKED (good)'"
```

**Pass criteria:** Output is `BLOCKED (good)` (admin API not reachable from non-tls-internal containers).

**If fail:** Implement Caddy admin API mTLS auth. Adds ~3h to spec.

---

### ⚠ A12 — v6.4 → v6.5 upgrade is safe (1h)

```bash
# Set up a v6.4 instance with custom Caddyfile
git checkout v6.4.0
docker compose up -d
# In UI: enable HTTPS, generate self-signed for test.local
# Manually edit Caddyfile to add a custom redirect
sudo nano /var/lib/docker/volumes/docker-dash-caddy-certs/_data/Caddyfile

# Now upgrade
git checkout main
docker compose pull
docker compose up -d

# Verify the custom Caddyfile and self-signed cert still work
curl -k https://test.local
```

**Pass criteria:** Custom Caddyfile preserved. Self-signed cert still served. No errors in Caddy logs.

**If fail:** Default image doesn't auto-switch in v6.5. Make it opt-in via `CADDY_IMAGE` env var.

---

## Phase 2 — Optional but recommended validations (~2 hours)

These reduce risk but aren't blockers.

### A6 — LE staging endpoint accessible (15m)

```bash
curl -s https://acme-staging-v02.api.letsencrypt.org/directory | jq .
```

Verify response has `newAccount`, `newOrder`, etc. URLs.

### A14 — CI integration test feasibility (2h)

Set up a minimal GitHub Actions job that:
1. Spins up our custom Caddy image
2. Sets a Cloudflare DNS API token (from GitHub Secrets)
3. Issues a staging cert for a CI-controlled domain
4. Verifies cert appears

If the round trip takes <5min in CI, we're good for full integration tests.

If too slow: relegate to nightly cron, manual trigger on PRs touching ACME code.

---

## Phase 3 — Spec sign-off (~1 hour)

After preflight phases pass:

- [ ] **Update `02-feature-spec.md`** with any spec changes resulting from preflight findings
- [ ] **Update `03-deep-spec.md`** if implementation details changed
- [ ] **Update `04-assumption-audit.md`** with confirmation/refutation of each assumption
- [ ] **Self-review the spec** for internal consistency
- [ ] **(Optional)** Get a second set of eyes on the spec from a peer or via `/review` skill

---

## Phase 4 — Working environment setup (~1 hour)

Before writing first line of code:

- [ ] **Branch:** `feat/letsencrypt-wizard` cut from `main`
- [ ] **Test domain DNS** configured for issuance tests
- [ ] **Cloudflare API token** stored in `~/.dd-test-cf-token` (gitignored, use for local dev)
- [ ] **GitHub Actions secret** `LE_TEST_CF_TOKEN` set (for CI integration tests)
- [ ] **Local Docker Dash dev instance** running with current `main`, ready to compare before/after
- [ ] **Calendar block** of 4×6h sessions across 2 weeks

---

## Phase 5 — Coding kickoff

Once Phases 0–4 are all green:

- Open `02-feature-spec.md` Section 13 (estimated effort breakdown)
- Begin Session 1: Migration + DB + service skeletons
- Commit per logical chunk, push frequently
- Use the assumption-audit findings to inform implementation choices

---

## Stop conditions

Halt implementation and re-plan if any of these become true mid-build:

- Caddy admin API behavior surprises us in production-like scenarios (vs the controlled preflight)
- ARM64 Caddy build pipeline breaks repeatedly
- A Tier-1 provider's Caddy plugin shows undocumented behavior we can't work around
- v6.4 upgrade safety (A12) regresses unexpectedly
- Estimated effort balloons >75% past plan (currently 46h with buffer; >80h triggers re-scope)

---

## Decision gate

✅ **Preflight passes** → proceed to Session 1 of implementation
⚠ **Preflight has 1-2 fallbacks** → revise spec, re-estimate effort, proceed
❌ **Preflight has ≥3 blockers** → re-evaluate architecture; consider option E (Node ACME) instead of D (Caddy plugins)
