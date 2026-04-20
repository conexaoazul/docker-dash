# Assumption Audit — Let's Encrypt Wizard

**Status:** Draft v1 · 2026-04-20
**Companion:** `01-brainstorm.md`, `02-feature-spec.md`, `03-deep-spec.md`

Plans fail because of unverified assumptions, not because of unverified code. This document lists every load-bearing assumption in the spec and proposes a cheap validation experiment for each, **to be done before writing production code**.

Each assumption has:
- **Claim** — what we're betting is true
- **Risk if wrong** — what breaks
- **Validation** — how to check cheaply
- **Fallback** — what we do if validation fails

---

## A1. Caddy admin API supports the JSON config mutations we need ✅ VALIDATED 2026-04-20

**Claim:** `POST /config/apps/tls/automation/policies` appends to the policies array atomically; `DELETE /config/apps/tls/automation/policies/N` removes by index; both can be called without restart.

**Result:** PASS with refinement. PUT-first-then-POST pattern needed: `apps/tls` doesn't exist initially, so the first cert needs `PUT /config/apps/tls` to bootstrap the structure; subsequent certs use POST to append. DELETE-by-index works as expected. See `05-preflight-results.md` Section A1.

**Risk if wrong:** Whole architecture (option D) collapses. Forces fallback to Caddyfile rewrite (fragile) or option E (Node ACME).

**Fallback if wrong:** Use Caddy's `POST /load` to push the entire config tree on each change. Not needed.

---

## A2. Caddy's `{file.path}` substitution can extract JSON paths ⚠ INVALIDATED — fallback in use 2026-04-20

**Claim:** `{file./etc/caddy/secrets/123.json:api_token}` resolves to the JSON value at key `api_token` in that file.

**Result:** FAIL. Caddy treats `:api_token` as part of the path, not as a JSON extractor; substitution returned empty. Fallback (one file per field) tested and works. See `05-preflight-results.md` Section A2.

**Risk if wrong:** Multi-field credentials (Route53 needs access_key + secret_key + region) need one file per field, increasing filesystem ops 3-5x and adding directory-creation complexity. **Bounded — adopted as the implementation path.**

**Fallback in use:** Layout `/etc/caddy/secrets/<id>/<field>` with directory `0700`, files `0600`.

---

## A3. Caddy's DNS plugins reload credentials from file on config reload ✅ VALIDATED + BONUS 2026-04-20

**Claim:** When Caddy reloads (via admin API or signal), it re-reads files referenced via `{file.path}` substitution, picking up rotated credentials.

**Result:** PASS, **and stronger than expected** — Caddy reads file substitutions on EVERY request, not at config-load time. Credential rotation requires NO Caddy reload at all. Atomic file replace (`tmp + rename`) is sufficient. Zero-downtime, zero-restart credential rotation. See `05-preflight-results.md` Section A3.

**Spec impact:** dropped the "trigger Caddy reload after rotation" step from the credential rotation flow.

---

## A4. The 5 Tier-1 Caddy DNS plugins compile cleanly with current Caddy version ✅ FULLY VALIDATED 2026-04-20

**Claim:** `xcaddy build` with our 5 plugins produces a working binary on both `linux/amd64` and `linux/arm64`.

**Result (amd64):** PASS, but required two adjustments from initial spec:
- Caddy version bumped 2.8.4 → 2.11.2 (route53@v1.6.0 needs Go 1.25 + Caddy 2.10.2+)
- `ENV GOTOOLCHAIN=auto` added to let Go auto-download required toolchain version

Build time ~2 min, image 163 MB, all 5 DNS plugins listed in `caddy list-modules`. See `05-preflight-results.md` Section A4.

**Result (arm64):** PASS via GitHub Actions multi-arch buildx (`648b2f5`, run 24650042876, 2026-04-20). Both `linux/amd64 builder` and `linux/arm64 builder` reached "exporting to image" — all 5 plugins compiled cleanly on arm64 under QEMU emulation against Go 1.25 (auto-downloaded via GOTOOLCHAIN=auto). Total wall time 19m40s.

The run reported failure overall ONLY because of GHCR `permission_denied: write_package` at the push step — an operational permissions issue, not an architectural one. Fix: enable "Read and write permissions" in Repo Settings → Actions → Workflow permissions, then re-trigger.

**Risk if arm64 fails:** ARM64 users (Raspberry Pi, Mac M-series) lose plugin support. v6.5 launches AMD64-only, alienating ~40% of homelab audience.

**Fallback if any plugin fails on arm64:** Drop that plugin from Tier 1, revisit in v6.6. Document compatibility matrix per architecture.

---

## A5. Each provider's API has a non-destructive validation endpoint

**Claim:** For each Tier 1 provider, we can call an API endpoint that proves a token works AND has DNS write permission, without actually changing DNS.

**Risk if wrong:** "Validate before issuing" UX feature can't work; users discover token is bad only when ACME fails (burning a rate limit slot).

**Per-provider check:**

| Provider | Validation endpoint | Confirmed works? |
|---|---|---|
| Cloudflare | `GET /user/tokens/verify` | ✅ — returns success + scopes |
| Route53 | `GET /2013-04-01/hostedzone` | ✅ — read-only call, requires `route53:ListHostedZones` (which any DNS-edit IAM policy includes) |
| DigitalOcean | `GET /v2/account` | ✅ — works with read scope; doesn't prove DNS write specifically (limitation) |
| Hetzner DNS | `GET /api/v1/zones` | ✅ — requires API key with read access |
| Linode | `GET /v4/profile` | ⚠ proves token works but not DNS scope; could check `/v4/domains` instead |

**Validation (1 hour):**
- For each provider, get a sandbox token, run the proposed validation call, verify response shape

**Fallback if wrong (per provider):** Skip validation step for that provider; warn user "we couldn't pre-flight; if it fails, double-check token scope."

---

## A6. Let's Encrypt rate limits don't bite during dev/testing

**Claim:** Our development and CI testing won't burn through LE rate limits on a real domain. Staging environment exists for this.

**Risk if wrong:** Project gets blocked from issuing real certs for a domain for up to a week. Awkward but not breaking.

**Validation (15 min):**
- Confirm LE staging endpoint URL (`https://acme-staging-v02.api.letsencrypt.org/directory`) is documented and unchanged
- Confirm Caddy supports staging via `acme_ca` config field
- Confirm staging certs are NOT browser-trusted (so we can't accidentally use them in prod)

**Fallback if wrong:** Use Pebble (LE's local test ACME server). Heavier setup but full control.

---

## A7. Caddy's automatic renewal works without Docker Dash involvement

**Claim:** Once a cert is issued via our wizard, Caddy renews it ~30 days before expiry without requiring Docker Dash to be running.

**Risk if wrong:** We need to build our own renewal cron, doubling complexity. Or worse: certs expire silently.

**Validation (manual, 30 min):**
1. Issue a cert via our wizard
2. Stop Docker Dash (`app` container only, leave Caddy running)
3. Verify Caddy logs show no errors
4. Verify cert file remains intact and is served correctly
5. (Long-term: simulate near-expiry by manipulating cert file timestamps; verify Caddy renews)

**Fallback if wrong:** Add a daily cron in Docker Dash that triggers Caddy's renewal endpoint. Doable but adds coupling.

---

## A8. Docker Dash's existing daily cert scan picks up Caddy-issued certs

**Claim:** The 07:30 cron in `src/jobs/index.js` that re-parses `tracked_certificates` will discover certs Caddy puts on disk, IF we add them to the table when issuance succeeds.

**Risk if wrong:** Issued certs don't appear in Certificate Manager UI. Wizard succeeds but user can't see the cert.

**Validation:** Trivial — we control both ends. Just write the new cert into `tracked_certificates` immediately after Caddy reports success.

---

## A9. Users will trust scoped tokens over global API keys

**Claim:** Users will follow our UI guidance to create scoped tokens (Cloudflare API tokens, AWS IAM roles with limited Route53 scope), instead of pasting global API keys.

**Risk if wrong:** Users paste Cloudflare Global API Key (full account access). One leaked DB = entire Cloudflare account compromised.

**Validation:** Can't be empirically validated pre-launch. Mitigation:
- Cloudflare Global API Key has a different format (32-char hex) than scoped tokens (`v1.0-...`). Detect format and warn.
- For Cloudflare specifically, the `api_token` Caddy field only accepts scoped tokens (it's a different code path than Global Key in Caddy plugin). So users physically can't use the Global Key here. Confirm by reading `caddy-dns/cloudflare` source.

**Fallback if wrong:** Active warning in UI, link to provider's "how to create scoped token" docs prominently. Refuse to save credentials matching global-key pattern.

---

## A10. ARM64 GitHub Actions runners exist and are usable for our Caddy build

**Claim:** GitHub provides ARM64 runners (or buildx with QEMU works fast enough) to build the multi-arch image in CI.

**Risk if wrong:** ARM64 image takes 30+ minutes to build via QEMU emulation. Slow CI, expensive (Actions minutes).

**Validation (30 min):**
- Check GitHub Actions docs for ARM64 runner availability
- If ARM64 runners are paid/limited, estimate emulation time via `docker buildx build --platform linux/arm64` test locally

**Fallback if wrong:** Build AMD64 in CI fast, ARM64 nightly only. Or use a self-hosted ARM64 runner (Raspberry Pi).

---

## A11. The Caddy `tls-internal` Docker network isolation works ❌ INVALIDATED → ✅ PIVOTED to Unix socket 2026-04-20

**Claim:** Adding a `tls-internal: { internal: true }` network to docker-compose.yml restricts admin API access to only the `app` and `caddy` services on that network.

**Result:** **FAIL.** `--internal` on a Docker network blocks OUTBOUND traffic from that network only. Containers attached to it still receive INBOUND from any other network they share. Since Caddy must be on the `default` network to serve 80/443, putting it ALSO on `tls-internal` doesn't restrict who can reach its admin port — anyone on `default` can hit `caddy:2019`. **An intruder container on the default network successfully fetched the full Caddy config including secrets.**

**Pivot tested:** Caddy admin API on a Unix socket (`unix//run/caddy/admin.sock`), shared with the `app` container via a mounted Docker volume (`caddy-admin-sock`). TCP attempts from any container → refused. App container with mounted socket → full access. Stronger security posture than the original plan.

See `05-preflight-results.md` Section A11.

**Spec impact:**
- Drop `tls-internal` network from `docker-compose.yml`
- Add `caddy-admin-sock` named volume, mounted RW in both `app` and `caddy`
- `caddy-bootstrap/Caddyfile.default` adds `admin unix//run/caddy/admin.sock` directive
- `services/caddy-config.js` uses Node `http.request` with `socketPath` (not fetch with TCP URL)

---

## A12. Existing v6.4 Caddy users won't break on upgrade

**Claim:** Switching the default Caddy image from `caddy:2-alpine` to our custom build won't break users who have hand-edited Caddyfiles.

**Risk if wrong:** Upgrade of Docker Dash from 6.4 → 6.5 silently breaks users' TLS. Major incident.

**Validation (1 hour):**
1. Set up a v6.4 instance with self-signed cert configured via UI
2. Set up another v6.4 instance with hand-edited Caddyfile (e.g., custom redirects)
3. Upgrade both to v6.5
4. Verify both still serve their previous configs unchanged

**Fallback if wrong:** Don't change default image in v6.5. Make custom Caddy image opt-in via env var (`CADDY_IMAGE=ghcr.io/.../custom`). v6.6 evaluates safe default switch.

---

## A13. WebSocket-based progress reuses existing infra cleanly

**Claim:** `src/ws/index.js` can add a new subscription topic (`acme:job:N`) without affecting existing subscriptions.

**Risk if wrong:** New WS code conflicts with existing log streaming, container event subscriptions. Hard-to-diagnose intermittent bugs.

**Validation (1 hour):**
- Read `src/ws/index.js` to understand subscription model
- Prototype the new topic in a branch, run all WS-related tests, verify no regressions
- If clean: proceed; if messy: refactor WS layer first as separate PR

**Fallback if wrong:** Use Server-Sent Events (SSE) for progress instead. New endpoint `/api/system/acme/jobs/:id/stream` with `text/event-stream`. Simpler than WS, less infrastructure.

---

## A14. Existing CI test infrastructure can run integration tests

**Claim:** Our existing GitHub Actions CI can run an integration test that issues a real Let's Encrypt staging cert.

**Risk if wrong:** No automated regression coverage for the most important code path. Bugs ship.

**Validation (2 hours):**
1. Verify CI runner can reach `acme-staging-v02.api.letsencrypt.org` (likely yes)
2. Verify CI runner can spawn a Caddy container alongside the test process (Docker-in-Docker support)
3. Set up a CI-only Cloudflare token in GitHub Secrets, set up a CI-only test domain (`ci.docker-dash.dev` or similar)
4. Write a minimal integration test that issues + verifies a staging cert
5. Run in CI; ensure it completes in <5 min

**Fallback if wrong:** Integration test runs nightly only via cron, manually re-runnable. Unit tests with mocked Caddy admin API cover most of the logic.

---

## A15. The provider abstraction generalizes cleanly to all 5 Tier-1 providers

**Claim:** The `dns-providers.js` registry shape (fields[], validate(), toCaddyConfig()) accommodates Cloudflare, Route53, DigitalOcean, Hetzner, Linode without per-provider hacks.

**Risk if wrong:** Special cases bloat the orchestrator. UI form rendering breaks. Spec misleads contributors who try to add a 6th provider.

**Validation (3 hours):**
- Implement all 5 provider entries in the registry
- Verify each has `validate()` working
- Verify each `toCaddyConfig()` produces valid Caddy JSON for that plugin
- Verify the UI form renders all 5 from metadata alone

**Fallback if wrong:** Allow per-provider escape hatches in the registry shape. Document them.

---

## A16. Caddy's ACME implementation handles SANs correctly

**Claim:** A single Caddy TLS policy with `subjects: ['example.com', 'www.example.com', '*.example.com']` issues ONE cert covering all three SANs in a single ACME order.

**Risk if wrong:** We'd issue 3 separate certs instead of 1 SAN cert. Wastes rate limit slots, harder to manage.

**Validation (30 min):**
- Read Caddy docs on multi-subject policies
- Test with staging: configure 3 subjects, observe ACME logs, verify resulting cert has all SANs

**Fallback if wrong:** Document limitation, restrict UI to single-subject certs initially, add SAN support in v6.6.

---

## A17. Estimated effort (37 base, 46 with buffer) is realistic

**Claim:** A solo developer with full Docker Dash context can ship this in ~6 working days.

**Risk if wrong:** Schedule slip, scope cut, half-shipped feature.

**Validation:** None possible pre-build. Mitigation:
- After session 1 (10h), reassess. If we're already 50% over, scope-cut Tier 1 to 3 providers (Cloudflare + Route53 + DigitalOcean) and defer Hetzner/Linode to v6.5.1
- If session 1 went smoothly, proceed as planned

---

## A18. The audit log captures enough detail to satisfy compliance reviews

**Claim:** Logging `{credentialId, providerId, domains, errorClass}` (without credential value) is sufficient for compliance audit ("who issued what cert when, using which credential").

**Risk if wrong:** Compliance-driven users (Enterprise Eric persona) can't pass audits. Undermines security narrative.

**Validation:** Send proposed audit entries to one Enterprise Eric–type contact for review before shipping.

**Fallback:** Add fields as needed. Cheap to extend.

---

## A19. Users want named, reusable credentials (not anonymous per-cert)

**Claim:** The "save credential as" UX is a feature users will use, not noise. Named credentials reduce friction for MSP-type users who issue many certs.

**Risk if wrong:** Adds DB complexity (`acme_credentials` table) for negligible benefit. Could simplify to "credential is always per-cert."

**Validation:** Survey 3-5 self-hosters / MSPs informally. Quick poll on r/selfhosted.

**Fallback if wrong:** Remove the save/reuse UX, store credentials inline in `acme_managed_certs.credentials_encrypted`. Simpler schema, lose multi-cert reuse.

---

## A20. The wizard fits in the existing Modal infrastructure

**Claim:** The 3-step wizard pattern from Secrets Wizard works for ACME without UI infrastructure changes.

**Risk if wrong:** Need to build new modal patterns. Adds 3-5h to estimate.

**Validation:** Sketch the wizard's screens against existing modal templates. Verify each step fits within `Modal.open()`'s rendering model.

**Fallback if wrong:** Build the wizard as a dedicated route page (`/system/acme-wizard`) instead of a modal.

---

## Summary — go/no-go decision matrix

Phase 1 executed 2026-04-20 in ~50 min wall time. Findings in `05-preflight-results.md`.

| Assumption | Status | Outcome |
|---|---|---|
| A1 — Caddy admin API mutations | ✅ VALIDATED | PUT-then-POST-then-DELETE pattern works |
| A2 — Caddy file substitution JSON paths | ⚠ INVALIDATED | Fallback to one-file-per-field adopted |
| A3 — Caddy reloads credentials from file | ✅ VALIDATED + BONUS | Per-request reload — no restart needed for rotation |
| A4 — 5 plugins compile clean amd64 | ✅ VALIDATED (Caddy 2.11.2 + GOTOOLCHAIN=auto) | preflight 2026-04-20 |
| A4 — 5 plugins compile clean arm64 | ✅ VALIDATED via GHA buildx (run 24650042876) | 2026-04-20 |
| A11 — Network isolation for admin API | ❌ INVALIDATED → ✅ PIVOTED | Unix socket + shared volume |
| A12 — v6.4 → v6.5 upgrade safe | ⏳ PENDING | Defer to first staging integration test |

**Decision: 🟢 GO for implementation.** Spec amendments applied (Caddy 2.11.2, Unix socket admin, GOTOOLCHAIN=auto, drop reload-after-rotation, one-file-per-field). Two pending items (arm64, v6.4 upgrade safety) are non-blockers for Session 1.

→ `00-preflight.md` operationalizes this list.
→ `05-preflight-results.md` documents Phase 1 execution + spec amendments.
