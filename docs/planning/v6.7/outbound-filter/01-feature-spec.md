# Feature Spec — Outbound Network Filter (v6.7)

**Status:** Draft v1 · 2026-04-20
**Companion:** `02-deep-spec.md` (how)

The contract: what users do, what the system does, what's explicitly out-of-scope for v6.7.

---

## 1. The user story

> *"I want to allow this container to reach Docker Hub + npm and nothing else — including blocking the IMDS endpoint."*

From the **System → Egress** tab a user clicks **Enable filter** on any row with a non-empty reachability verdict. A 3-step modal opens:

1. **Scope** — container or whole compose stack (stack = apply same policy to every service).
2. **Policy** — pick one of three presets or edit a custom list:
   - **Registry-only** — `docker.io`, `registry-1.docker.io`, `ghcr.io`, `quay.io`, `gcr.io`, `registry.k8s.io`, `registry.npmjs.org`, `pypi.org`, `rubygems.org`, `crates.io`. Blocks everything else.
   - **Registries + GitHub** — above plus `*.github.com`, `api.github.com`, `objects.githubusercontent.com`.
   - **Lockdown** — only loopback + same-stack network. External = 0.
   - **Custom** — textarea of hostnames (one per line), optional wildcards (`*.example.com`).
   - **Audit-only** — log denied attempts but don't block (for migration).
3. **Review & apply** — shows a dry-run summary: which container(s) will get the filter, whether restart is needed, rollback window.

## 2. What the system guarantees

Post-apply, for every container covered by the policy:

- **Hostnames not on the list: blocked.** No TCP connect, no UDP (DNS via sidecar only).
- **IMDS endpoints (`169.254.169.254`, `metadata.google.internal`): blocked**, regardless of policy.
- **RFC1918 same-stack traffic: allowed.** Containers on the same compose-project network can still talk.
- **Loopback + Docker DNS (`127.0.0.11`): allowed.** Never broken.
- **Existing inbound (published ports): untouched.** This is an egress filter only.
- **Emergency disable:** a single UI button *and* a daemonless CLI command (`dd-egress disable <container>`) remove the filter in <5s without touching the container.

## 3. Visible surfaces

| Surface | Where | Purpose |
|---|---|---|
| **Enable filter** button | System → Egress row action | Entry point |
| **Policy editor modal** | Modal, 3-step | Configure + apply |
| **Policy badge** on Egress row | System → Egress table | `filter: registry-only (audit)` |
| **Block log viewer** | Expanded row in Egress table OR dedicated sub-tab | Last 100 denied attempts with hostname + port + timestamp |
| **Emergency disable** | Red button on any row with active filter | One-click remove |
| **Policy Management** page | New sub-route `#/system/egress` (optional — else sub-tab) | List all active policies + bulk disable |

## 4. Explicitly out-of-scope for v6.7

- **HTTPS content inspection / MITM.** We only gate connection establishment, not payload. No TLS-breaking cert rewriting. Ever.
- **Per-process filtering inside a container.** One policy per container.
- **Multi-host policy sync.** SSH-tunneled hosts get their own per-host policies. No fleet mode.
- **Time-based policies** (e.g. "only on weekdays"). Static allowlists only.
- **External SIEM integration.** Block logs are local SQLite; retention 30 days.
- **Network-layer observability for allowed traffic.** We log denies, not allows (volume would explode).
- **IPv6.** Scope v6.7 to IPv4 only. IPv6 support tracked in BACKLOG for v6.8+.
- **Swarm mode.** Filter applies to single-node Docker. Swarm services routed through the overlay are untouched in v6.7.

## 5. Measurable acceptance criteria

1. User on a fresh install can apply "Registry-only" to a running `node:20` container in ≤60 seconds from clicking Enable to seeing "active" badge.
2. From inside the filtered container, `curl -m 3 https://registry.npmjs.org` succeeds; `curl -m 3 https://example.com` fails with connection-refused; `curl -m 3 http://169.254.169.254` fails.
3. Emergency disable button removes the filter in <5s. The container continues running; no restart required.
4. Block log shows the failed attempts with hostname + port + timestamp, within 2s of the attempt.
5. If the sidecar crashes, the default behavior is **fail-closed** (container loses outbound) *not* fail-open (container bypasses filter). User is alerted via toast on next page load.
6. Applying policy to a compose stack (3 services) updates all 3 in one atomic operation or rolls back entirely.

## 6. Non-goals (things we'll hear from users but won't build)

- *"Can you block outbound for the whole Docker Dash app too?"* — no, Docker Dash itself is explicitly opt-in (same UI, same policy engine, but the user must apply it to themselves). We don't ship a default lockdown-on-itself.
- *"Can you forward denied traffic to a logging server?"* — no, local SQLite only for v6.7.
- *"Can you alert via email / Slack on high deny rates?"* — integrates with existing notifications infra (already in BACKLOG), not net-new for this milestone.
- *"Can you auto-suggest a whitelist from traffic the container has made so far?"* — candidate for v6.8 "policy learning mode". Not v6.7.

## 7. Dependencies + prerequisites

- **v6.6.2 Egress Audit** (shipped): provides the per-container context used by the wizard entry points.
- **v6.6.0 Remediation Wizard** (shipped): the 3-step modal UX pattern is reused verbatim.
- **v6.5 Caddy + admin socket** (shipped): demonstrates the sidecar + shared-volume pattern we're reusing.
- **No new npm dependencies** expected — all logic is Docker API calls + SQLite + existing pattern.
- **Does require** a new Docker image built and published (`docker-dash-egress-filter`). Analogous to `docker-dash-caddy` pattern.

## 8. Migration from v6.6.2 audit

v6.6.2 Egress Audit stays — it's the discovery surface. v6.7 adds the enforcement controls on top of it. Users who upgrade see the same audit table with one additional column ("Filter") and a new action button per row. No breaking change to the audit API or data shape.

## 9. Decision needed before build

**One strategic decision only** — everything else is implementation detail covered in the deep-spec:

> **Does Docker Dash ship its own sidecar image (`docker-dash-egress-filter`) or layer iptables rules via a `NET_ADMIN`-privileged helper container per filtered container?**

This trade-off is worked out in `02-deep-spec.md §1`. Quick read: sidecar = more moving parts but cleaner UX, supports hostname policies. iptables-helper = simpler but IP-only, harder to explain. Recommendation is **sidecar**, but the decision belongs to the product owner.
