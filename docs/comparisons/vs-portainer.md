# Docker Dash vs Portainer — honest comparison

## TL;DR

- **Portainer wins** if you manage Kubernetes, large Edge fleets, or need an enterprise vendor with paid support and SLA.
- **Docker Dash wins** if you manage one or a handful of Docker hosts and want features that Portainer locks behind its Business tier — for free, under MIT.
- Both can run side-by-side against the same Docker socket. Switching either way is low-friction.

## What Portainer does better

Portainer has been around since 2016 and earns its dominant position. Honest list of where it pulls ahead:

- **Kubernetes orchestration** — full K8s cluster management, namespaces, Helm. Docker Dash targets single-host and small multi-host Docker; it does not compete here.
- **Edge agent fleet at scale** — Portainer Edge handles thousands of remote agents with async polling, NAT traversal, and tunnel relays. Docker Dash supports multi-host (agentless over TLS or SSH) and has an HA mode in v7.0.0+, but it is not engineered for thousands of edge nodes.
- **Mature RBAC at the enterprise tier** — fine-grained team permissions, environment groups, OAuth providers all integrated and battle-tested in Business edition.
- **Established enterprise support** — paid SLA, professional services, training, certified partners. Docker Dash is community-supported, MIT.
- **Angular ecosystem familiarity** — if your frontend team already runs Angular, Portainer's codebase is easier to fork and extend.

## What Docker Dash does that Portainer either gates or doesn't ship

Most of these are present in Portainer Business (paid) or absent entirely in Portainer CE:

- **AI Audit Natural-Language Search** (v8.0.0) — query the audit log in plain English, BYOK, with a privacy redactor scored 100/100 on a hand-built corpus and a SHA-256 payload hash logged for compliance.
- **Registry hygiene pack** (v8.1.0) — provenance parsing + retention rules with a **dry-run mode** before any tag is deleted. No Portainer equivalent.
- **Let's Encrypt wizard with 9 DNS providers** — 3-step UI for DNS-01 (Cloudflare, Route53, DigitalOcean, Hetzner, Linode, and more) or HTTP-01, with encrypted credential vault and Caddy auto-reload. Portainer leaves you to wire up your own ACME flow.
- **CIS Docker Benchmark UI** — 18 automated daemon + container checks, scored, with remediation guidance. Portainer ships nothing comparable.
- **Container Remediation Wizard** — turns Secrets Audit and CIS findings into actionable fixes. 20-entry catalog, 4 live-updatable, 16 with compose-recreate + auto-rollback, plus Git-PR mode for git-backed stacks.
- **Hash-chained immutable audit log** — SHA-256 chained, tamper-evident, with monthly off-site dumps to pCloud (round-trip integrity tested). Portainer Business has an audit log; the chain + off-site dump is not standard.
- **pCloud backup target** (v8.2.0) — first-class off-site backup, encrypted, in the UI. Portainer expects you to BYO.
- **Outbound Network Filter sidecar** (v6.7) — per-container egress policy with TLS-SNI + HTTP-Host peek, IMDS blocked by default, no TLS decryption.
- **Bilingual How-To guides (84+)** — in-app, EN/RO, NAS-platform-aware (Synology, Unraid, TrueNAS, QNAP, OMV auto-detected).
- **Free TOTP/MFA, free LDAP, free SSO headers, free webhooks, free Git integration, free alerts on 7 channels** — all of these are Business-tier features in Portainer.

## License

| | Docker Dash | Portainer CE |
|---|---|---|
| License | MIT | BSL 1.1 (was zlib pre-2024) |
| OSI-approved | Yes | No |
| Commercial use as a service | Free, no restrictions | Restricted: BSL prohibits offering Portainer as a hosted service for >5 nodes commercially without a license |
| Source available | Yes | Yes |

Honest take: BSL 1.1 is fine for homelab and most internal-IT deployments. It bites if you want to embed Portainer in a commercial product or run it as a managed service. MIT (Docker Dash) has no such ceiling.

## Performance and footprint

| | Docker Dash | Portainer CE |
|---|---|---|
| Image size | ~180 MB (incl. Trivy + Grype + Scout) | ~250 MB |
| RAM (idle) | ~50 MB | ~200 MB |
| Default port | 3000 | 9000 / 9443 |
| Frontend build step | None — vanilla JS | Angular build |
| DB | SQLite (file) | BoltDB (file) |
| Stack | Node + Express + ws | Go + Angular |

These figures come from the README — neither side has been benchmarked head-to-head under load.

## Pick Portainer if…

1. You manage Kubernetes clusters or mixed K8s + Docker fleets.
2. You need to manage **hundreds or thousands of Edge agents** with NAT traversal and async polling.
3. You need a paid vendor relationship with SLA, training, and certified support partners.

## Pick Docker Dash if…

1. You run **one or a handful of Docker hosts** (homelab, single VPS, NAS, small swarm) and want depth over breadth.
2. You want features Portainer puts behind a paid tier (audit log, alerts, Git, webhooks, OAuth/LDAP, RBAC) for **zero cost under MIT**.
3. You care about **security tooling out of the box** — CIS scoring, vulnerability scanning with three engines, egress filtering, hash-chained audit, remediation wizard.

## Migration notes

There is no proprietary data format on either side. Both tools read the same `/var/run/docker.sock`, so your containers, volumes, networks, and Compose stacks are unchanged when you switch. Stop one, start the other, point it at the socket — the host-level state is the source of truth. The only things that don't migrate are tool-specific settings (users, teams, audit history, custom templates) which live in each app's own DB. Plan a fresh onboarding for those.

Or run both — they don't conflict.
