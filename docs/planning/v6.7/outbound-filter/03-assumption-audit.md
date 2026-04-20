# Assumption Audit — Outbound Network Filter (v6.7)

**Status:** Draft v1 · 2026-04-20
**Companion:** `02-deep-spec.md`

Every planning doc makes claims about "X will work" or "Y is fine." This audit inventories those claims, rates their risk, and tells you which ones to validate BEFORE writing code vs. which ones are safe to assume.

Rating scale: **Likelihood wrong × Impact if wrong**

- 🟢 Low / Low — fine, note and move on
- 🟡 Medium — verify with a spike (30 min – 2 h)
- 🔴 High — block the milestone until addressed; preflight-critical

---

## A. Enforcement mechanism assumptions

| # | Assumption | L×I | Why it matters | Verification |
|---|---|---|---|---|
| A1 | nftables is available on target user hosts (kernel ≥ 4.19, Debian/Ubuntu/RHEL modern) | 🟡 M×H | Core tech. If users run old CentOS 7 or Oracle Linux 7, rules won't install. | Check nft/iptables inside `alpine/nftables` helper on a real user-representative host (Ubuntu 20.04, Debian 11, RHEL 8). Fall back to iptables-legacy module if nft unavailable. |
| A2 | Rules added by a helper container via `--network container:<id>` persist in the target's netns after helper exits | 🔴 H×H | Whole architecture depends on it. If rules are scoped to the helper's process lifetime, the filter disappears when helper exits. | **Preflight spike.** Run the apply sequence manually; restart helper; verify rules still present via `docker run --rm --network container:<target> alpine nft list ruleset`. |
| A3 | SNI peek works reliably across TLS 1.2, 1.3, and ECH-disabled traffic | 🟡 M×H | If ECH (Encrypted ClientHello) is widespread enough, SNI becomes useless. | Survey: what % of Docker Hub / npm / GitHub traffic uses ECH today? Answer: near-zero in 2026. Risk deferred; revisit in v6.8. |
| A4 | The sidecar's SIGHUP-reload actually reloads policy without dropping in-flight connections | 🟡 M×M | Wording in §3 promises "atomic reload." Go's SIGHUP handler must swap the allowlist without touching goroutines that are mid-splice. | Design check: policy is read via `atomic.LoadPointer`. Existing goroutines keep their snapshot. Standard Go pattern, low risk. |
| A5 | Containers with `network_mode: host` cannot be filtered by this design | 🟢 L×L | Already documented as out-of-scope + refused in UI. | No verification — covered in spec. |

## B. Performance assumptions

| # | Assumption | L×I | Why it matters | Verification |
|---|---|---|---|---|
| B1 | Sidecar adds <5ms latency for allowed connections | 🟡 M×M | Users will notice if npm install slows down. | Bench: 1000 sequential `curl` through the sidecar vs direct. Accept if p95 < 5ms overhead. |
| B2 | One sidecar can serve ~50 filtered containers without becoming a bottleneck | 🟡 M×M | Our "single shared sidecar" architecture relies on it. | Synthetic load test. If CPU > 50% at 50 containers × 10 req/s each, reconsider sidecar replica count. |
| B3 | nftables rule per-container adds no measurable host-level overhead | 🟢 L×M | Rules are per-netns, not global. | Known from kernel docs; don't need to verify. |

## C. User experience assumptions

| # | Assumption | L×I | Why it matters | Verification |
|---|---|---|---|---|
| C1 | Users understand "allowlist by hostname" without explanation | 🟡 L×M | If users think "allow port 443 → allow all HTTPS," they'll get confused when the filter blocks `evil.com:443`. | Clear How-To guide (like v6.6.2 pattern). In-modal explanation of "SNI matching" in plain terms. |
| C2 | "Emergency disable" is rarely used | 🟢 L×L | If it's used routinely, the feature is broken. | Observability metric on uses-per-week; alert if > 5%/week in production deployments. |
| C3 | Users will want to paste allowlists from `.env`-like files | 🟡 M×L | People hate retyping. Copy-paste from docs is common. | Textarea accepts newline-separated, comma-separated, or whitespace-separated. Trim + dedupe. |
| C4 | Preset "Registry-only" covers 80% of real-world use cases | 🔴 H×M | If it covers only 30%, users abandon the preset and use Custom → that means we got the preset wrong. | **Validate with BACKLOG.md user feedback or 3-5 design partner users** before v6.7 ships. If preset needs tweaking, iterate. |

## D. Compatibility assumptions

| # | Assumption | L×I | Why it matters | Verification |
|---|---|---|---|---|
| D1 | Works on Docker 20.10+ (last 4 years of releases) | 🟢 L×M | The rest of Docker Dash already targets this floor. | Same — no new lower bound. |
| D2 | Works with Docker Swarm services (but doesn't try to sync across replicas) | 🟡 M×M | Swarm services have task replicas on different nodes. Our filter is per-task-per-node. Users on Swarm may expect fleet-level policy. | Explicit docs: "Swarm replicas each need their own policy." v6.7 ships without Swarm awareness, add in v6.8 if demand. |
| D3 | Works when host is behind a corporate HTTP(S) proxy | 🔴 H×H | Many enterprise users set `HTTP_PROXY` env on containers. Our sidecar + SNI matching still works (CONNECT tunnels are visible to SNI). But if the corporate proxy is itself on a filtered-out domain, chicken-and-egg. | Document: "Ensure your corporate proxy hostname is in the policy allowlist before applying." Test with a toy Squid instance as the upstream. |
| D4 | Works with IPv6-disabled hosts | 🟢 L×L | v6.7 is IPv4-only (explicit scope). | No-op. |
| D5 | Works when the filtered container uses custom DNS (e.g., `1.1.1.1`) | 🟡 M×M | DNS traffic bypasses the sidecar. The container resolves whatever it wants — but connections still go through us. | OK in theory; add to test matrix. |

## E. Operational assumptions

| # | Assumption | L×I | Why it matters | Verification |
|---|---|---|---|---|
| E1 | The sidecar image (`docker-dash-egress-filter`) can be built reproducibly in GHA without special permissions | 🟡 M×M | If it needs privileged BuildKit features or multi-arch runners we don't have, shipping is blocked. | Start with a POC Dockerfile + `docker buildx build --platform linux/amd64,linux/arm64` locally. Port to GHA. |
| E2 | Users are OK with pulling a new image (`docker-dash-egress-filter`) on first use | 🟢 L×L | Same pattern as v6.5 `docker-dash-caddy`. Users already accepted that. | No-op. |
| E3 | Block log can be pruned safely by the existing background-job infra | 🟢 L×L | Existing pattern, migration 046 already bumped retention for audit logs. | No-op. |
| E4 | Shared volume between Docker Dash and sidecar is safe under concurrent writes (policy.json updates from DD + read from sidecar) | 🟡 M×M | File-level race: DD writes new policy.json while sidecar is reading. SIGHUP reload assumes atomic replacement. | Implementation pattern: DD writes to `policy.json.tmp`, fsyncs, then `rename()`. POSIX atomic. Verify on the user-representative filesystem (some network FS don't honor rename atomicity). |

## F. Security assumptions (the most important table)

| # | Assumption | L×I | Why it matters | Verification |
|---|---|---|---|---|
| F1 | A compromised filtered container cannot escape its netns to modify iptables rules | 🔴 H×H | If it can, the entire feature is theater. | Container without `NET_ADMIN` capability has no way to modify its own netns's nft ruleset. Verified by kernel design. Docker default is to drop NET_ADMIN. Feature refuses to attach to containers that have NET_ADMIN in CapAdd (UI error message). |
| F2 | A compromised filtered container cannot bypass the filter via raw sockets, ICMP tunnels, DNS exfiltration, or side-channel | 🔴 H×H-but-scope | Known limitation. We don't claim to prevent advanced data exfiltration. | Explicit docs: "This is a perimeter filter, not a data-loss-prevention tool." If user needs that, recommend eBPF/cilium. |
| F3 | The sidecar's listening port is reachable only from filtered containers, not from the internet | 🔴 H×H | If the sidecar port is published on the host, anyone can proxy through it. | Sidecar runs with `network_mode: bridge` + NO published ports. Only reachable via the iptables redirect from within filtered containers' netns. Document explicitly. Add a startup check that refuses to start if sidecar has published ports. |
| F4 | The helper container that installs iptables rules cannot be abused by a malicious container owner | 🟡 M×H | Helper runs with `NET_ADMIN` and `--network container:<target-id>`. If the "target-id" comes from an unchecked user input, a privilege escalation vector. | Target container id is taken from DB (which is admin-controlled), never from URL params. Strict allowlist: only `[a-f0-9]{12,64}`. Covered by existing route middleware. |
| F5 | Docker Dash admin role is required to create/modify policies | 🟢 L×H | Same auth model as CIS, Secrets, Egress Audit. | Existing `requireRole('admin')` middleware. No-op. |
| F6 | If the sidecar is compromised, impact is limited to the filtered containers (not the host) | 🟡 M×H | Sidecar has `/var/run/docker.sock` mounted (needed for helper-container spawning). If RCE in sidecar → full host takeover. | Evaluate: does sidecar actually need docker.sock? §4 says the helper runs as a separate short-lived container started by Docker Dash itself, not the sidecar. Confirm wiring: sidecar has no docker.sock mount. If it does, remove it before shipping. |

## G. Scope / product assumptions

| # | Assumption | L×I | Why it matters | Verification |
|---|---|---|---|---|
| G1 | Target users are teams of 1-10 developers deploying on a single Docker host | 🟢 L×M | Docker Dash positioning. | Same as existing assumptions. |
| G2 | Users run their sidecar alongside their workload (not on a separate node) | 🟢 L×L | Same box. | No-op. |
| G3 | v6.7 is the right release to bundle this with — doesn't need to wait for an "enterprise" tier | 🟡 L×M | If this is a paid-feature candidate, shipping as OSS gives it away. | Product call. Default assumption: ships in OSS for now (matches existing feature positioning). Can carve out later if monetization emerges. |

---

## Summary — blockers before implementation

Items rated 🔴 that need resolution before starting code:

- **A2** — helper container rule persistence. Preflight spike.
- **C4** — validate "Registry-only" preset covers real use cases. User research or 3-5 design partners.
- **D3** — corporate HTTP proxy support. Smoke-test with Squid upstream.
- **F1** — container can't modify its own netns rules (verify by spec; feature refuses NET_ADMIN containers).
- **F2** — advanced exfiltration not in scope (document loudly).
- **F3** — sidecar port not exposed to host (startup-time check).

Items rated 🟡 that need preflight spikes:

- **A1** — test on Debian 11, Ubuntu 20.04, RHEL 8.
- **A4** — verify SIGHUP reload pattern (likely fine, quick Go POC).
- **B1, B2** — perf bench.
- **E1** — GHA multi-arch build POC.
- **E4** — policy.json atomic rename on user's storage.

All 🔴 + 🟡 items are addressed in `04-preflight.md` as concrete, time-boxed verification tasks.
