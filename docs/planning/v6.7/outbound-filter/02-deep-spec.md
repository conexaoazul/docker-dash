# Deep Spec — Outbound Network Filter (v6.7)

**Status:** Draft v1 · 2026-04-20
**Companion:** `01-feature-spec.md` (contract)

Where the expensive decisions live. Each section states the chosen approach, the alternatives considered, and the reason for the choice — so later contributors don't have to re-debate them.

---

## 1. Enforcement mechanism ★

**Chosen:** **Sidecar pattern** — one shared `docker-dash-egress-filter` container per Docker Dash host, mounting `/var/run/docker.sock`. It runs `nftables` + a minimal HTTP CONNECT proxy. Filtered containers get an iptables `OUTPUT` redirect (installed at apply-time by a short-lived `NET_ADMIN` helper container).

**Why this and not the alternatives:**

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **A. Per-container iptables only** (no proxy) | Simplest. No extra processes. | IP-based only — can't do hostname allowlists. Users have to manually resolve `docker.io` → changing IP set every few hours. TLS SNI not usable (packet inspection is its own rabbit hole). | Rejected — fails "allowlist by hostname" UX goal |
| **B. Per-container MITM proxy sidecar** (one sidecar per filtered container) | Hostname-accurate. Per-container isolation. | 1 sidecar × N filtered containers = resource creep. Breaks TLS (needs cert injection). Won't work with containers that pin CA bundles. | Rejected — MITM-TLS is a non-starter for this product |
| **C. Shared sidecar + SNI inspection + iptables redirect** ★ | Hostname-accurate via SNI for TLS, host header for plaintext. No TLS break. One sidecar serves all filtered containers. | Slightly more complex than A. Has to route per-container traffic to a known backend. | **Chosen** |
| **D. eBPF-based per-cgroup filter** | Zero sidecar. Kernel-speed. | Needs kernel 5.8+ with BPF-LSM. Many users still on older hosts. Tooling immature. | Rejected — not portable enough for a single-container product target |

The sidecar's data plane is intentionally simple: nftables rules mark traffic from filtered containers, OUTPUT chain redirects to the sidecar's local port, sidecar peeks at the first packet (TLS ClientHello SNI, or HTTP Host header), compares to the policy, and either forwards or returns a `connection reset`.

No TLS decryption. No cert injection. No CA rewriting. Ever. A filtered container sees `registry.npmjs.org`'s real cert, not our cert.

## 2. Data model

New DB migration `054_egress_policies.js`:

```sql
CREATE TABLE egress_policies (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  scope_type    TEXT NOT NULL CHECK (scope_type IN ('container', 'stack')),
  scope_key     TEXT NOT NULL,            -- container_id or stack_name
  host_id       INTEGER NOT NULL DEFAULT 0,
  preset        TEXT NOT NULL,            -- 'registry-only' | 'registries-github' | 'lockdown' | 'custom' | 'audit-only'
  allowlist     TEXT NOT NULL,            -- JSON array of hostnames (resolved + wildcards)
  mode          TEXT NOT NULL DEFAULT 'enforce',  -- 'enforce' | 'audit-only'
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by    TEXT NOT NULL,
  updated_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (scope_type, scope_key, host_id)
);

CREATE TABLE egress_block_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  policy_id     INTEGER NOT NULL REFERENCES egress_policies(id) ON DELETE CASCADE,
  container_id  TEXT NOT NULL,
  hostname      TEXT NOT NULL,
  port          INTEGER NOT NULL,
  proto         TEXT NOT NULL,            -- 'tcp' | 'udp'
  blocked_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reason        TEXT NOT NULL             -- 'not-in-allowlist' | 'imds-pin' | 'rfc1918-external'
);

CREATE INDEX idx_egress_block_log_policy ON egress_block_log(policy_id, blocked_at DESC);
```

**Retention:** block log keeps last **30 days OR 10k rows**, whichever is lower. Pruned by existing background job infrastructure (add a tick in `src/services/jobs.js`).

**Why these tables and not `settings` / JSON blob:**
- Policies are queried per-request by the sidecar (when resolving "is this host allowed") — needs real tables.
- Block log needs range scans for the UI — SQLite indexed.
- `UNIQUE (scope_type, scope_key, host_id)` prevents accidentally stacking two policies on one container (well-defined single-source-of-truth).

## 3. Sidecar image contract

```
docker-dash-egress-filter:v6.7
├── /usr/bin/dd-egress-proxy       # single Go binary, ~6 MB static
├── /etc/dd-egress/policy.json     # mounted read-only from host, reloaded on SIGHUP
└── /var/log/dd-egress/denied.log  # appended; tailed by Docker Dash via bind mount
```

**Why Go and not Node:**
- Binary size (static ~6 MB) is a fraction of a Node+runtime image (~60 MB+).
- Cold start <50 ms vs Node's ~400 ms — matters when the sidecar restarts during a policy update.
- Network code (socket + TLS SNI peek) is one of Go's strengths.
- Policy logic is <500 LOC; staying in the same language as Docker Dash isn't worth the image weight.

**Communication from Docker Dash to sidecar:**
- Docker Dash writes `/etc/dd-egress/policy.json` (via the shared host volume).
- Sends the sidecar a `SIGHUP` via `docker kill --signal=HUP dd-egress-filter`.
- Sidecar reloads the policy atomically. No restart, no dropped in-flight connections.

**On sidecar failure:** the iptables `OUTPUT` rule redirects to a port that is now refusing connections, so the filtered container loses outbound (fail-closed). Docker Dash's background job `egress-health-check` runs every 30s and alerts via Toast if sidecar stops.

## 4. iptables / nftables wiring

The redirect rule per filtered container is the operationally fragile part. Decisions:

**Chosen approach:** use a short-lived privileged helper container to install rules, don't run Docker Dash with `NET_ADMIN`.

**Apply sequence when enabling a filter on a running container:**

1. Docker Dash writes policy to DB + `policy.json`, sends SIGHUP to sidecar.
2. Docker Dash runs `docker run --rm --network container:<target-id> --cap-add NET_ADMIN alpine/nftables sh -c "nft add chain ip ddout {type route hook output priority 0\\;}; nft add rule ip ddout ip daddr != <sidecar-ip> tcp dport != 53 meta mark set 0x42 counter; nft add rule ip ddout meta mark 0x42 dnat to <sidecar-ip>:8080"`.
3. The rule persists inside the target container's network namespace even after the helper exits (namespace-scoped, not container-scoped).
4. DB row `active = 1`.

**Why helper container and not `NET_ADMIN` on Docker Dash itself:**
- Docker Dash stays locked down (CIS 5.3, 5.4 compliant).
- Helper has minimal blast radius: ~2 second lifetime, no persistent state, one job to do.
- Matches the pattern established by the v6.6.0 remediation runner.

**Why nftables and not iptables:**
- Both are installed on modern distros (kernel 4.19+). nftables gives atomic ruleset swap, needed for policy updates without race windows.
- Rules added via `nft` can be read back via `nft list ruleset` for the audit trail. `iptables-save` is messier.
- Alpine base has `nftables` package at ~1.5 MB.

**Remove sequence:** `docker run --rm --network container:<target-id> --cap-add NET_ADMIN alpine/nftables nft flush chain ip ddout`. If the helper fails, we ship a fallback: `docker kill` the target and re-create it from its `inspect` snapshot (same mechanism as v6.6.0 remediation rollback).

## 5. Hostname resolution + SNI peek

The sidecar's forward path, per new connection:

1. Accept connection on local port (redirected from filtered container).
2. Peek 1-2 KB at first packet.
3. **TLS:** parse ClientHello, extract SNI.
4. **HTTP plaintext:** parse `Host:` header.
5. **Neither (raw TCP):** fall back to destination IP + reverse DNS (best-effort; if RDNS fails, the connection is allowed IF the IP is in the policy's resolved-IP cache, else blocked). This covers `git://` and similar.
6. Compare the hostname against the policy allowlist (wildcard matching via `path.matches(glob)`).
7. If allowed: dial through to the real destination, splice the two sockets. If blocked: log + reset.

**The ambiguity we accept:** a container that sends raw TLS 1.3 without SNI (rare, some old clients) is blocked regardless of IP. We log this as `reason: 'no-sni'` so users can spot it and adjust their policy.

**DNS:** containers still use Docker's embedded DNS at `127.0.0.11`. DNS traffic is NOT routed through the sidecar (it's hop-by-hop resolution). This means a malicious container could DNS-exfiltrate — but data-ex via DNS is a separate problem outside v6.7 scope. Documented as a known limitation.

## 6. UI flow (Egress tab extensions)

The v6.6.2 Egress Audit table gains one column and two row-actions:

| Existing cols → | Risk | Container | Network Mode | Networks | Reachability | Score | [chev] |
|---|---|---|---|---|---|---|---|
| **Add** | | | | | | | **Filter** |

**New `Filter` cell content per row:**
- If no policy: `<button>Enable filter</button>`
- If policy active enforce: `<span class="badge">registry-only · enforce</span>` + `<button>Edit</button>` + `<button title="Emergency disable">🚨</button>`
- If policy audit-only: `<span class="badge">registry-only · audit</span>` (amber) + same actions

**The modal (3-step, reuses Remediation Wizard component shell):**

- **Step 1 — Scope** — confirms container / stack selection. Shows count of affected containers for stack mode.
- **Step 2 — Policy** — preset selector + live preview of resolved allowlist. Custom mode has a textarea with line-by-line validation (reject invalid hostnames, highlight wildcards).
- **Step 3 — Apply** — dry-run summary: "Will affect N containers, 0 restarts, filter active within ~3s." Apply button + 60s emergency-disable countdown badge.

## 7. Emergency disable

**Required UX invariant:** if something is wrong, the user must be able to get rid of the filter without SSH'ing to the host.

Three paths (all functional offline-from-prod):

1. **UI button.** Red icon on the filtered row. Confirm dialog. Backend removes the iptables rule via helper container. DB row flipped to `active=0`. <5s end-to-end.
2. **CLI escape hatch.** Ship `scripts/dd-egress-disable.sh` in the repo that reads a container id argument and runs the same helper command standalone. Works when Docker Dash itself is broken.
3. **Uninstall path.** If the user removes `docker-dash-egress-filter` container, all rules become ineffective (connections fail-closed) — the CLI script flushes rules and is the only manual step needed.

Emergency disable is **logged to the audit log with operator reason** (mandatory field). Defense in depth: we want to see misuse if this button is ever the "quick fix" people reach for routinely.

## 8. Testing matrix

| Test | Fixture | What we verify |
|---|---|---|
| **Policy apply — container, running** | `node:20 sh -c sleep 3600` | iptables rule present in container's netns; curl to `npmjs.org` succeeds; curl to `example.com` gets `ECONNREFUSED` |
| **Policy apply — stack (3 services)** | docker-compose with web + api + db | All 3 get the rule atomically; rollback if any one fails |
| **Block log** | container + 5× curl to blocked host | 5 rows in `egress_block_log`; UI shows them in <2s |
| **SIGHUP reload** | container with active policy; change allowlist | Existing connections unaffected; new connections use new allowlist |
| **Sidecar crash → fail closed** | `docker kill dd-egress-filter` | curl from filtered container fails (refused); Docker Dash toast fires |
| **Emergency disable** | policy active → click red button | Rule removed; container regains full outbound in <5s |
| **IMDS block override** | policy = 'custom' with `169.254.169.254` in allowlist | Still blocked — IMDS is never allowed, regardless of custom policy |
| **Same-stack RFC1918 allowed** | web + db on same compose network | web can reach db; web can't reach internet |
| **Host-mode container** | `network_mode: host` | Policy refuses to attach; clear error message "cannot filter host-network containers" |
| **container:<id> mode** | shared netns | Policy applies to the parent container, affects both |
| **v6.6.2 audit unchanged** | existing egress-audit API | No contract break; same response shape |

Target: ≥15 new tests in `src/__tests__/egress-filter.test.js` + an integration fixture that boots a real sidecar + alpine container.

## 9. Audit log events

Hash-chained entries (same infra as v6.6):
- `egress_policy_created` — who, scope, preset, mode
- `egress_policy_updated` — delta of allowlist
- `egress_policy_applied` — scope, container_ids affected, duration_ms
- `egress_policy_removed` — reason
- `egress_emergency_disable` — who, reason (required), scope
- `egress_sidecar_failure` — auto, from health check

## 10. Observability for the product itself

- **Sidecar Prometheus endpoint** at `:9191/metrics` (opt-in via env var): `dd_egress_connections_allowed_total`, `_blocked_total`, `_policy_reload_seconds`.
- **Background job heartbeat** surfaced on Dashboard: "Egress filter: 3 active policies, healthy."
- **Dashboard widget** (v6.7.1 polish): "Blocked requests in last 24h" with top 5 hostnames.

## 11. What we're explicitly NOT building in v6.7

Enumerated to prevent scope creep:

- Policy learning mode ("apply audit-only for 48h, suggest allowlist from observed traffic") — v6.8 candidate.
- Per-process filtering — not possible without eBPF, and eBPF is deferred.
- Filter templates marketplace / shared community policies — v7+.
- Multi-cloud IMDS detection (more than the 4 already in egress-audit) — incremental as needed.
- Integration with Container Remediation Wizard ("fix egress exposure" as a finding) — v6.7.1 polish.

## 12. Rollout

- **v6.7-rc1** — sidecar image + backend + API. No UI. Internal dogfooding for 3-5 days on staging.
- **v6.7-rc2** — UI modal + block log viewer. External testers.
- **v6.7.0** — ship with at least one migration guide ("from v6.6.2 audit to enforcement").
- **v6.7.1** — Dashboard widget, Prometheus metrics.

## 13. Decision log (for future contributors)

| # | Decision | Alternative considered | Why |
|---|---|---|---|
| 1 | Shared sidecar, not per-container | 1-per-container sidecar | Resource scaling + UX |
| 2 | SNI peek, no TLS MITM | Cert-injection MITM | Trust boundary — never break the container's TLS trust anchor |
| 3 | Go sidecar binary | Node sidecar | Image size, cold start |
| 4 | Helper container for iptables, not NET_ADMIN on Docker Dash | Give Docker Dash NET_ADMIN | Keeps main app CIS-compliant |
| 5 | nftables, not iptables | iptables | Atomic ruleset swap |
| 6 | Fail-closed on sidecar crash | Fail-open | Security > availability for this feature |
| 7 | IMDS always blocked, even with policy override | Let users opt-in | Defense in depth; if user needs IMDS they should be explicit in code, not config |
| 8 | 30d / 10k row block log retention | Unbounded | SQLite doesn't like unbounded growth |
| 9 | Single DB-unique policy per scope | Stacked policies | Ambiguity is worse than expressive power for this feature |
| 10 | IPv4 only in v6.7 | Dual-stack | Scope; IPv6 deferred to v6.8 |
