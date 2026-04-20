# Let's Encrypt Wizard — v6.5 Planning

> **Status:** Specification draft (not yet implemented)
> **Target release:** v6.5
> **Last updated:** 2026-04-20

This directory contains the full planning artifacts for the Let's Encrypt Wizard feature, following Docker Dash's planning pipeline (brainstorm → assumption audit → feature spec → deep spec → preflight → implementation).

The work was prompted by the analysis of [twonas/docker-certbot-cloudflare](https://github.com/twonas/docker-certbot-cloudflare) — that repo confirmed real user demand for "request a Let's Encrypt cert from a UI without touching shell scripts." Rather than replicate certbot (which would duplicate Caddy's existing capability), this feature exposes Caddy's mature ACME stack through a 3-step UI wizard with multi-DNS-provider support.

---

## Read in this order

| # | File | Purpose | Read time |
|---|---|---|---|
| 1 | [01-brainstorm.md](01-brainstorm.md) | Design space exploration, alternatives considered, decisions made | 10 min |
| 2 | [02-feature-spec.md](02-feature-spec.md) | Implementation contract — files, schema, API, UI, acceptance criteria | 15 min |
| 3 | [03-deep-spec.md](03-deep-spec.md) | The gnarly bits in detail (Caddy config, credential injection, errors, concurrency) | 15 min |
| 4 | [04-assumption-audit.md](04-assumption-audit.md) | Risky assumptions + cheap validations to do before coding | 10 min |
| 5 | [00-preflight.md](00-preflight.md) | Operational checklist to verify environment + assumptions | 5 min |
| 6 | [05-preflight-results.md](05-preflight-results.md) | **NEW** — Results of preflight Phase 1 execution + spec amendments | 8 min |

Total: ~63 min reading. Preflight Phase 1 already executed (50 min wall time).

---

## TL;DR for the impatient

**What:** A 3-step wizard inside Docker Dash → System → Secrets → Certificates that lets admins request Let's Encrypt certificates via HTTP-01 or DNS-01 challenges. v6.5 supports Cloudflare, Route53, DigitalOcean, Hetzner, and Linode. Issued certs auto-renew via Caddy and appear in the existing Certificate Manager for tracking.

**Why:** Today, getting a wildcard or internal-network cert via DNS-01 requires manual Caddyfile edits, custom Caddy image build, env var setup, and container restart. We want it in 5 clicks.

**How:** Use Caddy's native ACME implementation (already in the project) with DNS plugins compiled into a custom Caddy image. Manage cert config via Caddy's JSON admin API. Store DNS API credentials in the existing AES-GCM secrets vault as files mounted into Caddy. Surface progress via WebSocket. Track issued certs via the existing Certificate Manager (v6.3) infrastructure.

**Effort:** ~37 hours of focused work, ~46 hours with buffer = 6 working days across 4 sessions.

**Differentiation:** No competitor (Portainer, Dockge, Komodo, Yacht) ships this. v6.5 will be the only Docker UI with a built-in DNS-01 ACME wizard, scoped-token enforcement, and credential vault integration.

---

## Status tracker

- [x] Brainstorm complete
- [x] Feature spec drafted
- [x] Deep spec drafted
- [x] Assumption audit complete
- [x] Preflight checklist drafted
- [x] **Preflight Phase 1 executed (5 of 6 critical assumptions validated; results in `05-preflight-results.md`)**
- [x] **Spec amendments applied** (Caddy 2.11.2, Unix socket admin, GOTOOLCHAIN=auto, drop reload-after-rotation, one-file-per-field)
- [x] **arm64 build validation in GitHub Actions** (run 24650042876 — both arch's compiled cleanly, only push to GHCR failed on permissions — fix is operational)
- [ ] Enable Repo Settings → Actions → Workflow permissions = "Read and write" → re-trigger build
- [x] **Session 1: Migration 049 + service skeletons** (461 tests passing, +30 new)
- [x] **Session 2: All 5 Tier-1 providers + HTTP routes + integration tests** (492 tests, +31 new)
- [ ] Enable GHCR write permissions (Repo Settings) + re-trigger Caddy image build
- [ ] Session 3: UI wizard
- [ ] Session 4: WebSocket progress + integration tests + docs + release
- [ ] Session 2: Routes + custom Caddy image
- [ ] Session 3: UI wizard
- [ ] Session 4: Tests + docs + release
- [ ] v6.5.0-beta1 tag
- [ ] v6.5.0 stable release

---

## Open invitations to contributors

If you're reading this and want to help:

- **Easiest first PR:** add a Tier-2 DNS provider to `dns-providers.js` (~30 lines). Suggested: Namecheap, Gandi, Porkbun, OVH. See `03-deep-spec.md` Section 3 for the abstraction.
- **High value:** preflight execution (`00-preflight.md` Phase 1) — find blockers before we sink time
- **Documentation:** translation of the planned built-in How-To guide into your language (we have EN + RO; want DE, FR, ES, etc.)
- **Edge cases:** any provider quirks you've hit personally (rate limits, DNS API gotchas, etc.) → comment on the relevant deep-spec section

File issues with the `letsencrypt-wizard` label on GitHub.

---

## Why these specs are public

Most projects keep planning artifacts internal. We publish ours because:

1. **Transparency** — community can shape the design before code is written
2. **Trust** — proves the project is planned, not slapped together
3. **Documentation** — future maintainers (us included) understand WHY decisions were made
4. **Onboarding** — contributors see how we think before they write a line of code
5. **Honesty about risk** — `04-assumption-audit.md` openly lists what could go wrong

If you find a flaw in the plan, [file an issue](https://github.com/bogdanpricop/docker-dash/issues/new) with the `letsencrypt-wizard` label. Better to fix it on paper than in production.

---

## Companion documents elsewhere in the repo

- [AUDIT_2026-04-18.md](../../../../AUDIT_2026-04-18.md) — the v6.4.0 security audit that informs the security posture of this feature
- [REMEDIATION_PLAN.md](../../../../REMEDIATION_PLAN.md) — the v6.4.0 fix plan, model for this planning style
- [CHANGELOG.md](../../../../CHANGELOG.md) — historical context
- `docs/guides/` — bilingual user-facing guides; v6.5 will add `letsencrypt-dns-wizard.{md,ro.md}`

---

*This planning directory is committed to the public repo as a signal of open development. Comments, critiques, and PRs are welcome.*
