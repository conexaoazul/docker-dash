# Preflight — Outbound Network Filter (v6.7)

**Status:** Draft v1 · 2026-04-20
**Purpose:** Eliminate the highest-risk unknowns from the assumption audit BEFORE writing production code. Each item has a clear go/no-go outcome + a time box.

Run all items on the current staging host (`192.168.13.20`) unless otherwise noted. Total estimated time: **4-6 hours**. Any 🔴 assumption that emerges unaddressable here triggers a return to `02-deep-spec.md §1` for mechanism reconsideration.

---

## P1 — Rule persistence across helper-container lifetimes ⚠️

**Validates assumption:** A2 (critical)
**Time box:** 30 min
**Go criteria:** Rules added by a helper via `--network container:<target>` remain active in target's netns after helper exits AND another helper's `nft list ruleset` can see them.

**Procedure:**

```bash
# 1. Start a long-running target container
TARGET=$(docker run -d alpine sh -c "sleep 3600")

# 2. Install a filter rule via a short-lived helper
docker run --rm --network container:$TARGET --cap-add NET_ADMIN \
  alpine sh -c "apk add -q nftables && \
    nft add table ip ddtest && \
    nft add chain ip ddtest output '{ type filter hook output priority 0; }' && \
    nft add rule ip ddtest output tcp dport 80 drop && \
    nft list ruleset"

# 3. Verify rule persists with a NEW helper
docker run --rm --network container:$TARGET --cap-add NET_ADMIN \
  alpine sh -c "apk add -q nftables && nft list ruleset"

# 4. Verify functional effect
docker exec $TARGET sh -c "apk add -q curl && curl -m 3 -sI http://example.com/; echo exit=\$?"
# Expected: exit=28 (connect timeout / refused)
```

**Outcomes:**

- ✅ If step 3 shows the rule AND step 4 shows the block: **go**. Architecture confirmed.
- ❌ If step 3 shows empty ruleset: **no-go**. Rule was scoped to helper's lifetime. Pivot: either make helper long-lived (bad for UX) OR ship sidecar with `NET_ADMIN` + itself sets rules when it sees new policies (reconsider §4).

## P2 — nftables on user-representative hosts

**Validates:** A1
**Time box:** 1 h (parallel across hosts)
**Go criteria:** `nft --version` works and the sequence from P1 completes without errors on: Debian 11, Ubuntu 22.04, RHEL 8.

**Procedure:** Use cloud-init on three ephemeral VMs, run the P1 sequence, note any distro quirks.

**Outcomes:**
- ✅ All three pass: go.
- ❌ One fails: add a fallback path (legacy iptables) in §4.
- ❌ Two+ fail: reconsider mechanism entirely.

## P3 — SIGHUP reload pattern for sidecar

**Validates:** A4
**Time box:** 45 min
**Go criteria:** A minimal Go HTTP server reloads its config on SIGHUP without dropping in-flight connections.

**Procedure:** Stand up a 100-line Go program that:
1. Accepts connections, echoes "policy version X" for each request
2. Handles SIGHUP by atomic-swapping an `atomic.Value` holding the policy
3. Start 10 concurrent `curl` loops, SIGHUP mid-run, verify all requests complete

Sample pseudocode in §3 of deep-spec.

**Outcomes:**
- ✅ All requests return HTTP 200: go.
- ❌ Any connection drops: reconsider reload strategy (e.g., full restart with graceful shutdown via `SO_REUSEPORT`).

## P4 — Sidecar port not reachable from host external interfaces

**Validates:** F3 (critical)
**Time box:** 15 min
**Go criteria:** When sidecar is running, `curl http://<host-public-ip>:<sidecar-port>` fails from another machine, AND from `localhost` on the host — only the iptables-redirected traffic from filtered containers can reach it.

**Procedure:**
```bash
# Start sidecar (bridge network, no published ports)
docker run -d --name dd-egress-test \
  --network bridge \
  --label dd-egress=true \
  alpine sh -c "nc -lk 8080"  # stand-in

# From host
curl -m 2 http://localhost:8080/                                   # → should fail
curl -m 2 http://$(hostname -I | awk '{print $1}'):8080/           # → should fail

# From another container on the same bridge network
TARGET=$(docker run -d alpine sh -c "sleep 60")
docker exec $TARGET sh -c "apk add -q curl && curl -m 2 http://<sidecar-container-ip>:8080/"
# → succeeds only because it's on the same bridge
```

**Outcomes:**
- ✅ Both host-side curls fail, container-to-container works: go.
- ❌ Host-side curl succeeds: sidecar port is leaking. Fix: sidecar must bind to its bridge interface only, not `0.0.0.0`. Add a startup-time assertion.

## P5 — Corporate proxy compatibility

**Validates:** D3
**Time box:** 45 min
**Go criteria:** Filtered container with `HTTP_PROXY=http://corp-proxy:3128` can reach allowlisted hosts via the corp proxy when the corp proxy's hostname is in the policy.

**Procedure:**
1. Launch Squid as an "upstream corp proxy": `docker run -d --name corp-squid -p 3128 ubuntu/squid`
2. Policy allowlist includes `corp-squid` (resolve via Docker internal DNS)
3. Launch filtered container with `HTTP_PROXY=http://corp-squid:3128`
4. `curl -x $HTTP_PROXY https://example.com` should succeed (Squid CONNECTs to example.com, Squid itself is allowed)
5. `curl https://example.com` (direct, not via proxy) should fail

**Outcomes:**
- ✅ Both expected behaviors: go. Document the pattern in How-To.
- ❌ Proxy requests fail anyway: debug SNI peek logic; proxy CONNECT requests embed SNI correctly, should work.

## P6 — policy.json atomic rename on shared volume

**Validates:** E4
**Time box:** 20 min
**Go criteria:** Writing policy.json to `/etc/dd-egress/policy.json.tmp` then `rename()` is atomic as seen by a reader on the same mounted volume.

**Procedure:**
1. Docker volume `dd-egress-policy` mounted rw into both DD container and sidecar container.
2. Python/Node script reads `policy.json` in a tight loop (1000 times).
3. Another script writes-then-renames `policy.json` every 10ms.
4. Reader must never see: missing file, empty file, partial JSON.

**Outcomes:**
- ✅ No partial reads over 30s: go.
- ❌ Partial reads observed: switch to FIFO pipe or Unix socket for policy updates.

## P7 — Preset coverage design-partner validation

**Validates:** C4
**Time box:** 2-3 days (async, not blocking)
**Go criteria:** At least 3 of 5 design partners confirm "Registry-only" preset covers ≥80% of their containers without manual edits.

**Procedure:**
- Survey 5 users via GitHub discussion post or Slack DM
- Ask: "Here's the preset list [paste]. For each of your production containers, would this preset work as-is, with 1-2 additions, or would you need full custom?"
- Tally; iterate preset list if needed.

**Outcomes:**
- ✅ ≥3/5 say "works as-is or with 1-2 additions": go with current preset.
- ❌ Majority say "full custom": revisit preset design. Consider second preset like "Tier-1 cloud infra" (AWS, GCP APIs).

## P8 — Build sidecar image reproducibly for arm64 + amd64

**Validates:** E1
**Time box:** 1 h
**Go criteria:** `docker buildx build --platform linux/amd64,linux/arm64 -t dd-egress-filter:test .` succeeds locally. CI workflow passes on both architectures.

**Procedure:**
1. Write a minimal Dockerfile (Go build → scratch base → ~6 MB image).
2. Build multi-arch locally with buildx.
3. Port to a GHA workflow (`.github/workflows/egress-filter-build.yml`) similar to existing `caddy-image.yml`.
4. Push to GHCR staging tag, pull + run on both arm64 and amd64 hosts.

**Outcomes:**
- ✅ Image runs on both: go.
- ❌ Go cross-compilation fails: pin Go toolchain, use CGO_ENABLED=0 for static binary. Known-good recipe.

## P9 — Performance sanity

**Validates:** B1, B2
**Time box:** 1 h
**Go criteria:**
- p95 latency overhead on allowed requests < 5ms
- Sidecar CPU < 50% at 50 filtered containers × 10 req/s

**Procedure:**
1. Baseline: 10 containers × `wrk -t4 -c100 -d30s https://example.com` directly
2. Same with filter applied (example.com in allowlist)
3. Compare p50/p95/p99 latency
4. Scale to 50 containers, monitor sidecar `docker stats`

**Outcomes:**
- ✅ Both within budget: go.
- ❌ Latency regresses: profile the Go sidecar, likely SNI parsing hot path. Consider caching allow/deny decisions per (src-ip, dst-hostname) pair.
- ❌ CPU pegs: consider multiple sidecar replicas (rule-steered by container id hash). Adds complexity.

## P10 — NET_ADMIN detection on filtered targets

**Validates:** F1 refinement
**Time box:** 15 min
**Go criteria:** Before attaching a filter, API refuses containers that have `NET_ADMIN` (or `SYS_ADMIN`, or `--privileged`) in their config. Returns 422 with clear message.

**Procedure:**
Unit-test scenario on a `inspect` mock with `HostConfig.CapAdd = ['NET_ADMIN']`. Ensure policy-create API returns 422 "Cannot apply outbound filter to a container with NET_ADMIN/SYS_ADMIN capability — the container can bypass it."

**Outcomes:**
- ✅ 422 with right message: go.
- ❌ Attach succeeds: fix precondition check before any iptables operations.

---

## Preflight tracker

Record results in `05-preflight-results.md` (to be created during execution, matching v6.5 + v6.6 pattern):

```markdown
| # | Test | Result | Date | Notes |
|---|---|---|---|---|
| P1 | Rule persistence | ✅/❌ | | |
| P2 | Distro matrix | ✅/❌ | | |
| ... |
```

## Decision gate after preflight

If **any 🔴 item fails and the fix requires architecture changes**, stop and return to `02-deep-spec.md §1`. Don't patch around a fundamental mismatch — the cost grows geometrically once implementation starts.

If all 🔴 items pass and 🟡 items are resolved or scoped as known-limitations with user-facing docs: **green-light to v6.7-rc1 implementation.**
