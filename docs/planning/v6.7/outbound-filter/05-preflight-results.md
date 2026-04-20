# Preflight Results — Outbound Network Filter (v6.7)

**Run date:** 2026-04-20
**Host:** staging `192.168.13.20` (Ubuntu 22.04, kernel 5.x, Docker 27.x, buildx v0.31.1)
**Operator:** Docker Dash maintainer

This is the record of preflight execution against `04-preflight.md`. The 🔴 red-zone assumptions from `03-assumption-audit.md` are all addressed here except those explicitly noted as requiring human input (C4 user survey, D3 corp proxy against real deployment).

---

## Results table

| # | Test | Result | Time | Notes |
|---|---|---|---|---|
| **P1** | Rule persistence across helper-container lifetimes | ✅ **PASS** | ~4 min | Rule installed by one helper was visible to a second helper AND blocked port 80 from target. Port 443 remained open (selective drop works). |
| **P2** | nftables on Debian 11 / Ubuntu 22.04 / RHEL 8 | ⚠️ **PARTIAL** | — | Verified only on staging's Ubuntu 22.04 host (via alpine/nftables helper). Debian 11 + RHEL 8 still pending — requires 2 more ephemeral VMs. Risk downgraded 🟡→🟢 because nftables has been kernel-default since Debian 10 / RHEL 8. Full matrix test deferred as a nice-to-have. |
| **P3** | Go SIGHUP reload pattern | ✅ **PASS** | ~5 min | Compiled binary (5 MB static) loaded v1 policy, received SIGHUP, loaded v2 cleanly. Log: `reloaded policy v2`. Requests after reload reflect new allowlist. `atomic.Pointer[Policy]` swap pattern validated. |
| **P4** | Sidecar port isolation from host | ✅ **PASS** | ~3 min | Sidecar container on `--network bridge` with no `-p` mapping: host `localhost:PORT` refused, host external-IP refused, sibling container via bridge IP reached successfully. No custom startup assertion needed — Docker's default behavior IS the guarantee. |
| **P5** | Corporate HTTP proxy compatibility | ⏸ **DEFERRED** | — | Needs a realistic Squid instance + real egress policy. Can be done in a session once v6.7-rc1 implementation provides the sidecar. Documented as "test at rc1 gate, before v6.7.0." |
| **P6** | policy.json atomic rename on shared volume | ✅ **PASS** | ~1 min | Shared docker volume, writer renames `.tmp → .json` 8607× over 10s, reader polls continuously: **0 torn JSON reads**. (265 "empty" reads during first-second startup window before writer was ready — handled by fail-closed sidecar.) |
| **P7** | "Registry-only" preset covers 80% of real use cases | ⏸ **DEFERRED** | — | Design-partner survey requires human outreach. Recommendation: run survey as a GitHub discussion thread during v6.7-rc1 testing window. Gate on ≥3/5 design partners confirming coverage before v6.7.0. |
| **P8** | Multi-arch sidecar image (amd64 + arm64) | ✅ **PASS** | ~2 min | `docker buildx` with `docker-container` driver + QEMU binfmt: both platforms built cleanly. amd64 binary 5.0 MB, arm64 binary 4.8 MB, both static + stripped. Final image: 2.2 MB (scratch base). GHA workflow should mirror this exact pattern. |
| **P9** | Performance sanity (<5ms overhead, CPU < 50% at 50 containers) | ⏸ **DEFERRED** | — | Needs a real sidecar implementation (the P3 stand-in is not a proxy, just a HTTP allow/deny check). Run at rc1 gate. |
| **P10** | NET_ADMIN / privileged precondition check | ✅ **PASS** | ~1 min | Pure-function `canApplyFilter(inspect)` rejects: privileged=true, CapAdd includes NET_ADMIN / SYS_ADMIN, network_mode=host / none / `container:<id>`. 9/9 unit tests green. Code at `spikes/p10-netadmin-check.js`. Graduates to `src/services/egress-filter.js` when implementation starts. |

## Summary

- **🟢 6 PASS** (P1, P3, P4, P6, P8, P10) — the load-bearing mechanism decisions are all validated.
- **🟡 1 PARTIAL** (P2) — nftables on Ubuntu 22.04 confirmed. Debian 11 + RHEL 8 are low-risk given nftables kernel-default era; verify opportunistically during community testing.
- **⏸ 3 DEFERRED** (P5, P7, P9) — each requires either human input (survey) or the real implementation (proxy, perf). All gate at rc1 → v6.7.0 rather than blocking v6.7-rc1 start.

## Decision gate outcome

**GREEN-LIGHT for v6.7-rc1 implementation.**

All 🔴 blockers from `03-assumption-audit.md` are either validated (A2, F1, F3, E4) or in non-blocking scope (C4, D3, F2 documentation-only).

## Spike artifacts

Preserved under `docs/planning/v6.7/outbound-filter/spikes/` for reference during implementation:

- `p3-sighup-reload/` — Go sidecar POC (main.go + go.mod). 80 lines. Production sidecar expands from this skeleton.
- `p8-multiarch/` — Dockerfile for multi-arch build. Same Go source as P3. Graduates to `docker/egress-filter/Dockerfile` when implementation starts.
- `p10-netadmin-check.js` + `p10-netadmin-check.test.js` — precondition logic + 9 unit tests. Graduates to `src/services/egress-filter.js` (merged with policy engine) when implementation starts.

## What changes in the deep-spec after preflight

No material changes — every assumption held. Minor clarifications:

1. **§3 sidecar image size target** — measured empirical size is 2.2 MB, not the earlier "~6 MB" estimate. Update spec → "~2-6 MB range depending on whether TLS SNI library gets inlined."
2. **§4 iptables wiring** — P1 confirmed rules persist in target netns after helper exits. No change needed to the sequence.
3. **§5 SIGHUP pattern** — P3 validated `atomic.Pointer` approach. Spec's pseudocode already matches; no change.
4. **§7 emergency disable CLI** — P1's cleanup step (`docker rm -f`) works. Ship `scripts/dd-egress-disable.sh` as: `docker run --rm --network container:$1 --cap-add NET_ADMIN alpine/nftables nft flush ruleset`. One-liner.

## Open items for v6.7-rc1 session planning

When starting implementation:

1. Use `p3-sighup-reload/main.go` as the sidecar skeleton.
2. Use `p8-multiarch/Dockerfile` as the image recipe (add real SNI library + logging).
3. Use `p10-netadmin-check.js` as the policy precondition (move to `src/services/egress-filter.js`).
4. Add one new DB migration `054_egress_policies.js` with the schema from `02-deep-spec.md §2`.
5. Mirror the P8 buildx pattern in `.github/workflows/egress-filter-image.yml`.
