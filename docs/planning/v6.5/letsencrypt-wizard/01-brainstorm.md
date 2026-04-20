# Brainstorm — Let's Encrypt Wizard

**Status:** Draft v1 · 2026-04-20
**Owner:** Bogdan Pricop
**Target release:** v6.5

This document explores the design space, alternative approaches, and the decision tree that leads to the chosen architecture documented in `02-feature-spec.md`.

---

## Problem statement

Today, getting a Let's Encrypt certificate via DNS-01 challenge inside Docker Dash requires:

1. Manually editing `Caddyfile` with the right `tls` directive and DNS provider plugin
2. Building or installing a Caddy image that includes the right plugin (default `caddy:2-alpine` doesn't ship with any DNS plugins)
3. Setting up environment variables for the DNS API token
4. Restarting the Caddy container
5. Hoping it works on the first try (each Let's Encrypt mistake counts toward weekly rate limits)

That's a lot of friction. Most users either (a) skip HTTPS entirely on internal services, (b) use self-signed certs and accept browser warnings, or (c) buy commercial certs at $50+/year per domain.

The asymmetry: Caddy already does **all** of this automatically — but only after the user has gone through the painful manual setup. We want to expose Caddy's capability through a 3-click wizard.

---

## Audience personas

### 1. Homelab Hannah
- Runs Nextcloud, Vaultwarden, Jellyfin behind a router with no port-forwarding
- Wants `nextcloud.home.lan` to have a real cert (no browser warnings on her family's iPads)
- Has a Cloudflare account because she uses Cloudflare Tunnel
- **Needs:** wildcard cert via DNS-01 (no public HTTP-01 access)

### 2. Sysadmin Sam
- Manages 3 internal services for a 50-person company (Gitea, internal wiki, Grafana)
- Can't open port 80 to the public internet (firewall policy)
- Has Route53 access for `internal.acme.com`
- **Needs:** individual certs per service via DNS-01, scoped IAM token

### 3. MSP Mark
- Manages 30 client servers, each with 2-5 services that need HTTPS
- Each client has different DNS provider (Cloudflare, GoDaddy, Hetzner, etc.)
- Doesn't want to remember which token goes with which client
- **Needs:** per-client credentials stored centrally with names, multi-tenant org

### 4. Enterprise Eric
- Internal tooling for a 500-person company
- Compliance requires audit trail of every certificate request
- Has restricted Cloudflare API token (only `Zone:DNS:Edit` for one zone)
- **Needs:** rotation tracking, audit log, scoped-token enforcement

### 5. (Anti-persona) Devops Dan
- Already runs Traefik with `acme.json`, knows what he's doing
- Doesn't want our wizard, would rather have an API
- **Needs:** stay out of his way; expose the API but don't force the UI

---

## User stories (what success looks like)

```
As Homelab Hannah,
I want to issue a wildcard cert for *.home.lan via Cloudflare DNS-01
in fewer than 5 clicks,
so that I never see a browser warning on my family's tablets again.
```

```
As Sysadmin Sam,
I want to save my Route53 IAM token under the name "acme-prod-r53"
and reuse it for 5 different cert requests,
so that I don't paste my token 5 times.
```

```
As MSP Mark,
I want to see all my saved DNS credentials in one place with
provider type and last-validation status,
so that I can audit which tokens are still active across clients.
```

```
As Enterprise Eric,
I want every certificate issuance request logged in the hash-chained
audit log with the requesting user and the credential ID used (but
NOT the credential value itself),
so that I can prove who requested what and when, in compliance reviews.
```

```
As Devops Dan,
I want POST /api/system/acme/issue to accept a JSON body and return
a job ID, so I can call it from my own automation without going
through the UI.
```

---

## Solutions considered

### A) Wrap `certbot` (the analyzed `twonas/docker-certbot-cloudflare` approach)

```
[Docker Dash UI] → [spawns certbot container] → [generates cert] → [writes to volume]
                                                                  → [reload Caddy to pick up]
```

**Pros:**
- Well-known tool
- Wide provider support via `certbot-dns-*` plugins

**Cons:**
- Separate process, separate scheduling (cron for renewal)
- Caddy already does this, so we'd duplicate a renewal mechanism
- Certbot doesn't do OCSP stapling
- No integration with Caddy's automatic redirect / TLS serving
- Requires installing python3 + certbot in our slim image (or running another container)

**Verdict:** Rejected. Duplicates Caddy's existing capability with a worse implementation.

---

### B) Use `lego` (Go ACME client by `go-acme`)

```
[Docker Dash UI] → [spawns lego CLI] → [generates cert] → [writes to disk]
                                                          → [Caddy picks up]
```

**Pros:**
- 50+ DNS providers supported (broader than Caddy plugin ecosystem)
- Single static binary, easy to ship
- Go-native, fast

**Cons:**
- Same renewal duplication issue as certbot
- Adds another runtime dependency
- Caddy's renewal is more battle-tested in this ecosystem

**Verdict:** Rejected for v6.5. Reconsider in v6.6 if Caddy plugin coverage proves insufficient.

---

### C) Pure Node.js ACME via `acme-client` npm package

```
[Docker Dash app] → [Node ACME client] → [generates cert in process]
                                       → [writes to disk]
                                       → [signals Caddy to reload]
```

**Pros:**
- Zero external dependencies
- Maximum control: custom retry, custom rate limit handling, custom audit
- Can support any DNS provider with a few hundred lines of code per provider
- No Caddy plugin compilation needed

**Cons:**
- We'd be reimplementing what Caddy already does well
- We become responsible for renewal cron, OCSP stapling, etc.
- Significant scope increase (~2000 LOC for a robust implementation)
- Need to test against ACME staging on our CI

**Verdict:** Tempting but oversized for v6.5. Revisit in v7 if we want to remove Caddy dependency entirely.

---

### D) Use Caddy with DNS plugins (chosen approach)

```
[Docker Dash UI] → [writes Caddy JSON config + credentials file]
                → [signals Caddy to reload via admin API]
                → [Caddy issues cert via ACME]
                → [Cert appears in shared volume]
                → [Certificate Manager picks up via existing daily scan]
```

**Pros:**
- Leverages Caddy's mature, battle-tested ACME implementation
- Caddy handles auto-renewal, OCSP stapling, modern crypto, retry logic
- Same code path as Caddy's normal HTTP-01 flow — well-tested
- Issued cert is immediately served by Caddy (no extra wiring)
- Minimal new code in Docker Dash (~600 LOC estimated)
- Integrates cleanly with our existing Caddy sidecar architecture

**Cons:**
- Limited to DNS providers with Caddy plugins (~30 providers, but Cloudflare/Route53/DO/Hetzner/Linode — the major ones — are well-covered)
- Requires custom Caddy image with plugins compiled in (default image lacks them)
- Caddy admin API mutations are slightly more complex than Caddyfile edits

**Verdict:** **CHOSEN.** Best fit for v6.5 scope and existing architecture.

---

### E) Hybrid: Node ACME for issuance + Caddy for serving

```
[Docker Dash app] → [Node ACME client issues cert]
                  → [writes to /data/certs/*.pem]
                  → [Caddy loads cert from disk via tls directive]
```

**Pros:**
- Provider universe = whatever we implement in Node (potentially all)
- Caddy still handles serving, OCSP stapling
- Keeps cert issuance logic in our own code (auditable)

**Cons:**
- Two systems doing renewal (Caddy might also try) — coordination issues
- More moving parts than D
- Without Caddy issuing, we lose Caddy's automatic OCSP refresh

**Verdict:** Rejected for v6.5. Possible v7 architecture if D hits provider gaps.

---

## Decision matrix

| Criterion | Weight | (A) certbot | (B) lego | (C) Node ACME | (D) Caddy plugins | (E) Hybrid |
|---|---|---|---|---|---|---|
| LOC to write | 3 | 4 | 4 | 1 | **5** | 2 |
| Provider coverage | 4 | 4 | **5** | 5 (in theory) | 3 | 5 |
| Renewal robustness | 5 | 2 | 3 | 2 | **5** | 3 |
| Integration with existing infra | 5 | 1 | 1 | 3 | **5** | 4 |
| OCSP / modern TLS features | 3 | 2 | 2 | 2 | **5** | 5 |
| Security posture | 4 | 3 | 3 | 5 | **5** | 5 |
| Maintenance burden | 4 | 3 | 3 | 1 | **5** | 2 |
| **Weighted total** | | 78 | 86 | 75 | **138** | 105 |

D wins clearly. The next-best is E, which we keep as a v7 fallback option.

---

## DNS provider prioritization

Based on rough Stack Overflow / GitHub issue volume + r/selfhosted mention frequency + existence of Caddy plugin:

### Tier 1 — must support in v6.5 launch
- **Cloudflare** — by far the most popular DNS for self-hosters; the analyzed repo's choice
- **AWS Route53** — enterprise / AWS-native users
- **DigitalOcean** — common with VPS-first users
- **Hetzner** — popular in EU homelab community
- **Linode (Akamai)** — fading but still common

### Tier 2 — add in v6.6 or PR-driven
- Namecheap
- Gandi
- Porkbun (popular among indie hackers)
- Google Cloud DNS
- Azure DNS
- OVH
- Vultr

### Tier 3 — community contribution welcome
- All the rest in `caddy-dns/*` GitHub org (~25 more)

The provider abstraction (`src/services/dns-providers.js`) makes adding a Tier 2 provider a 30-line PR.

---

## Caddy plugin distribution — three options

Caddy plugins are compiled into the Caddy binary via `xcaddy`. Default `caddy:2-alpine` image has none of the DNS plugins.

### Option 1 — ship a custom Docker image with plugins pre-compiled

```dockerfile
FROM caddy:2-builder AS builder
RUN xcaddy build \
  --with github.com/caddy-dns/cloudflare \
  --with github.com/caddy-dns/route53 \
  --with github.com/caddy-dns/digitalocean \
  --with github.com/caddy-dns/hetzner \
  --with github.com/caddy-dns/linode

FROM caddy:2-alpine
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
```

Built via GitHub Actions, pushed to `ghcr.io/bogdanpricop/docker-dash-caddy:2-dns`.

**Pros:** fast cold start, works offline, image versioned with Docker Dash
**Cons:** rebuild required per plugin update; ~10 MB extra image size

### Option 2 — build at runtime in user's container

`docker-compose.yml` runs `xcaddy build` on first start.

**Pros:** users always get latest plugins
**Cons:** 60-90s first-boot delay, requires Go toolchain in image, fails offline

### Option 3 — dynamic plugin loading

Caddy doesn't support runtime plugin loading. Not an option.

**Decision:** Option 1. We control the image, we ship a known-good combination, users get fast boots.

---

## Out of scope for v6.5

Documented to prevent scope creep:

- ❌ Custom CA support (only Let's Encrypt prod + staging)
- ❌ ACME EAB (External Account Binding) for ZeroSSL etc.
- ❌ Multiple ACME accounts per Docker Dash instance
- ❌ Auto-detection of "you're about to hit Let's Encrypt rate limit" (basic warning only)
- ❌ Cert serving for non-Caddy services (mTLS endpoints, etc.) — handled by existing Certificate Manager upload flow
- ❌ Automatic DNS record creation for the user's apex domain (out of our scope; user owns DNS)
- ❌ Self-hosted ACME server support (e.g., step-ca) — possible v6.6 if asked

---

## Critical decisions made in this brainstorm

1. **Use Caddy + DNS plugins, not certbot/lego/Node ACME** — leverages existing infra
2. **Ship custom Caddy image** with Tier 1 plugins pre-compiled — fast, reliable
3. **Switch internal Caddy config to JSON format** — easier to programmatically manipulate than Caddyfile
4. **Store DNS credentials in encrypted secrets vault** — reuse existing AES-GCM infrastructure
5. **Mount credentials as a JSON file into Caddy** (not env vars) — easier rotation without restart
6. **Force scoped tokens** — UI guidance + provider-specific validation
7. **Tier 1 = 5 providers** — covers ~80% of expected use; add more on demand
8. **Default to Let's Encrypt staging** for first issuance — protects users from rate limits
9. **Caddy admin API on localhost only** (already the case) — no network exposure
10. **No new ACME account creation** — Caddy manages a single shared account per instance

---

## Next steps

→ `02-feature-spec.md` — implementation contract based on these decisions
→ `03-deep-spec.md` — design for the trickier parts (Caddy config templating, credential rotation, error states)
→ `04-assumption-audit.md` — challenge the risky assumptions before building
→ `00-preflight.md` — verify environment is ready for implementation
