<p align="center">
  <h1 align="center">🐳 Docker Dash</h1>
  <p align="center">
    A lightweight, full-featured Docker management dashboard.<br>
    Self-hosted alternative to Portainer — built with Node.js, vanilla JavaScript, and SQLite.
  </p>
  <p align="center">
    <a href="https://github.com/bogdanpricop/docker-dash/actions/workflows/ci.yml"><img src="https://github.com/bogdanpricop/docker-dash/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
    <a href="https://github.com/bogdanpricop/docker-dash/releases/latest"><img src="https://img.shields.io/github/v/release/bogdanpricop/docker-dash?color=blue" alt="Release"></a>
    <a href="LICENSE"><img src="https://img.shields.io/github/license/bogdanpricop/docker-dash" alt="License"></a>
    <a href="https://github.com/bogdanpricop/docker-dash/actions/workflows/ci.yml"><img src="https://img.shields.io/badge/tests-879%20passing%20(100%25)-brightgreen" alt="Tests"></a>
    <img src="https://img.shields.io/badge/version-7.0.0-blue" alt="Version">
    <a href="SECURITY.md#security-audit-history"><img src="https://img.shields.io/badge/production%20readiness-9.8%2F10-brightgreen" alt="Production Readiness"></a>
    <a href="SECURITY.md"><img src="https://img.shields.io/badge/security-audited-brightgreen" alt="Security Audited"></a>
    <img src="https://img.shields.io/badge/Docker-~80MB-blue" alt="Image Size">
    <img src="https://img.shields.io/badge/RAM-~50MB-blue" alt="RAM Usage">
  </p>
  <p align="center">
    <a href="#where-to-start"><strong>Where to start</strong></a> &bull;
    <a href="#quick-start">Quick Start</a> &bull;
    <a href="#features">Features</a> &bull;
    <a href="#screenshots">Screenshots</a> &bull;
    <a href="#comparison">Comparison</a> &bull;
    <a href="#multi-host">Multi-Host</a> &bull;
    <a href="#contributing">Contributing</a>
  </p>
</p>

**Zero dependencies to deploy** — just Docker. No external database, no Redis, no build step. Current version: **v7.0.0**

**HA mode production-ready in v7.0.0** (standalone default unchanged):
- **v6.17.0** — cluster abstraction + Redis-backed rate limiter
- **v6.17.1** — cross-replica WebSocket broadcasts via Redis pub/sub
- **v6.17.2** — cron + Docker event stream + git polling leader election via Redis `SET NX PX`
- **v7.0.0** — cluster observability (`/api/cluster/status`, `/api/health` exposes `role`, 4 new Prometheus gauges), operator runbook, production-grade LB configs (Caddy + Traefik + HAProxy + nginx)

See [HA Mode](docs/features/ha-mode.md) · [Failover runbook](docs/features/ha-failover-runbook.md) · [LB configs](docs/features/ha-lb-configs.md).

## Screenshots

<table>
  <tr>
    <td align="center"><strong>Dashboard (Dark)</strong><br><img src="docs/screenshots/dashboard.png" alt="Dashboard" width="400"></td>
    <td align="center"><strong>Dashboard (Light)</strong><br><img src="docs/screenshots/dashboard-light.png" alt="Dashboard Light" width="400"></td>
  </tr>
  <tr>
    <td align="center"><strong>Containers</strong><br><img src="docs/screenshots/containers.png" alt="Containers" width="400"></td>
    <td align="center"><strong>Container Detail</strong><br><img src="docs/screenshots/container-detail.png" alt="Container Detail" width="400"></td>
  </tr>
  <tr>
    <td align="center"><strong>Terminal (xterm.js)</strong><br><img src="docs/screenshots/terminal.png" alt="Terminal" width="400"></td>
    <td align="center"><strong>Images</strong><br><img src="docs/screenshots/images.png" alt="Images" width="400"></td>
  </tr>
  <tr>
    <td align="center"><strong>Volumes</strong><br><img src="docs/screenshots/volumes.png" alt="Volumes" width="400"></td>
    <td align="center"><strong>Networks</strong><br><img src="docs/screenshots/networks.png" alt="Networks" width="400"></td>
  </tr>
  <tr>
    <td align="center"><strong>Multi-Host Overview</strong><br><img src="docs/screenshots/multi-host.png" alt="Multi-Host" width="400"></td>
    <td align="center"><strong>Stacks</strong><br><img src="docs/screenshots/stacks.png" alt="Stacks" width="400"></td>
  </tr>
  <tr>
    <td align="center"><strong>Security Scanning</strong><br><img src="docs/screenshots/security.png" alt="Security" width="400"></td>
    <td align="center"><strong>Log Explorer</strong><br><img src="docs/screenshots/log-explorer.png" alt="Log Explorer" width="400"></td>
  </tr>
  <tr>
    <td align="center"><strong>Event Timeline</strong><br><img src="docs/screenshots/timeline.png" alt="Timeline" width="400"></td>
    <td align="center"><strong>Network Topology</strong><br><img src="docs/screenshots/topology.png" alt="Network Topology" width="400"></td>
  </tr>
  <tr>
    <td align="center"><strong>Dependency Map</strong><br><img src="docs/screenshots/dependency-map.png" alt="Dependency Map" width="400"></td>
    <td align="center"><strong>Cost Optimizer</strong><br><img src="docs/screenshots/cost-optimizer.png" alt="Cost Optimizer" width="400"></td>
  </tr>
  <tr>
    <td align="center"><strong>Insights</strong><br><img src="docs/screenshots/insights.png" alt="Insights" width="400"></td>
    <td align="center"><strong>Alerts</strong><br><img src="docs/screenshots/alerts.png" alt="Alerts" width="400"></td>
  </tr>
  <tr>
    <td align="center"><strong>System Tools</strong><br><img src="docs/screenshots/system-tools.png" alt="System Tools" width="400"></td>
    <td align="center"><strong>How-To Guides</strong><br><img src="docs/screenshots/howto.png" alt="How-To" width="400"></td>
  </tr>
  <tr>
    <td align="center"><strong>Feature Comparison</strong><br><img src="docs/screenshots/compare.png" alt="Compare" width="400"></td>
    <td align="center"><strong>Enterprise Mode</strong><br><img src="docs/screenshots/enterprise.png" alt="Enterprise" width="400"></td>
  </tr>
  <tr>
    <td align="center"><strong>API Playground</strong><br><img src="docs/screenshots/api-playground.png" alt="API Playground" width="400"></td>
    <td align="center"><strong>What's New</strong><br><img src="docs/screenshots/whatsnew.png" alt="What's New" width="400"></td>
  </tr>
</table>

## Features

### Core
- **Container Management** — Start, stop, restart, pause, kill, remove, clone, rename, update/recreate
- **Image Management** — Pull with streaming progress, remove, tag, import/export, build from Dockerfile
- **Volume Management** — Create, remove, inspect with real disk usage sizes
- **Network Management** — Create, remove, connect/disconnect containers, inspect IPAM config
- **Bulk Actions** — Checkbox selection + floating bar for batch start/stop/restart/remove
- **One-click Port Access** — Each exposed TCP port shows a clickable link to open `http://host:port` directly
- **Keyboard Navigation** — Arrow keys to navigate container rows, `r` to restart, `s` to stop/start, `Enter` to open detail, `l` for logs
- **Live CPU/RAM Mini-bars** — Two 4px color-coded progress bars per running container, updated every 5 seconds
- **Container File Browser** — Navigate, view, upload, and download files inside running containers
- **Container Diff** — See filesystem changes vs base image with color-coded entries
- **Image Picker** — Browse 20 popular images (nginx, postgres, redis, etc.) when creating containers
- **CIS Hardened Creation** — One-click CIS benchmark hardening: cap_drop ALL, read-only rootfs, no-new-privileges, resource limits
- **Log Time Filter** — Filter container logs by time range: last 1h, 6h, 24h, 7 days

### Monitoring & Intelligence
- **Real-time Dashboard** — Customizable live CPU/memory charts (WebSocket, 10s interval, toggle widgets)
- **Container Health Score** — Composite 0-100 score with color dots in list view + summary bar
- **Resource Trends & Forecasting** — 7-day linear regression with 24h CPU/memory projection
- **Memory Exhaustion Prediction** — "will exceed limit in N hours" warning
- **Plain-English Status** — Exit codes mapped to messages (137=OOM, 143=SIGTERM, etc.)
- **Network Topology** — Interactive canvas map with drag, zoom, pan, hover highlighting
- **Dependency Map** — Interactive graph showing container relationships (env vars, networks, links)
- **Uptime Reports** — Per-container uptime %, restart count, first/last seen
- **Cost Optimizer** — Per-container cost breakdown, idle detection, savings recommendations
- **Image Freshness Dashboard** — Freshness score based on age + vulnerability count
- **Audit Log Analytics** — Top users, top actions, activity heatmap by hour/day
- **Notifications Center** — Dedicated page with filters, pagination, bulk mark-read/delete

### Security
- **Vulnerability Scanning** — Trivy + Grype + Docker Scout with automatic detection and fallback
- **Safe-Pull Updates** — Pull new image → scan for vulns → only swap if clean (blocks critical CVEs)
- **Deployment Pipelines** — Staged pull → scan → swap → verify → notify with full history
- **Security Dashboard** — Scan history, per-image status, AI-assisted remediation prompts
- **AI Container Doctor** — Diagnostics + 30 log pattern matchers + Ask AI (OpenAI/Ollama) directly from modal
- **Guided Troubleshooting** — 8-step diagnostic wizard (state, health, logs, ports, volumes, resources)
- **Container Rollback** — One-click revert to previous image with version history
- **First-login Setup Wizard** — Forces password change, recommends disabling default admin
- **Outbound Network Filter** (v6.7) — Per-container egress policy sidecar with TLS-SNI + HTTP-Host peek. Allowlist-based, blocks IMDS by default, logs denied connections. No TLS decryption
- **Per-container Security tab** (v6.10) — 2×2 grid combining Secrets score, Egress reachability + filter state, CIS findings, and Image Vulnerabilities on every container's detail page
- **Stack-level Security Audits** (v6.9.3) — One-click Secrets Audit + Egress Audit buttons on every stack, matching Security Scan + CIS Benchmark. Drill down to Fix via Remediation Wizard
- **Remediation Wizard drill-down** (v6.9.4) — Image-centric security findings now link to running containers using that image, then open Fix scoped to the container
- **Error-response sanitization** (v6.14.1) — Central error middleware scrubs `/home/` and `/data/` paths, redacts URL credentials, replaces raw error messages with `"Internal server error"` on 5xx. Closes an accidental info-leak from the pre-Express-5 try/catch pattern

### Git Integration (GitOps)
- **Deploy from Git** — Clone repos, select branch, compose file path, deploy with one click
- **Auto-Deploy** — Webhook receiver (GitHub, GitLab, Gitea, Bitbucket) + polling-based updates
- **Deployment History** — Full audit trail with commit hash, trigger type, duration, rollback
- **Diff View** — See exactly what changed before redeploying
- **Push to Git** — Edit compose in UI, commit and push back to repository
- **Git Credentials** — Token, basic auth, SSH key (AES-256-GCM encrypted)
- **Multi-file Compose** — Multiple YAML override files per stack
- **Environment Overrides** — Per-stack env vars with sensitive value encryption

### Multi-Host
- **TCP + TLS** — Connect remote Docker hosts over the network with mutual TLS
- **SSH Tunnel** — Secure tunnel via SSH (no need to expose Docker API). v6.8 adds a full exec / fileExists / readFile / writeFile channel so the Remediation Wizard Apply mode works end-to-end on remote hosts
- **Docker Desktop** — Connect to Windows/Mac Docker Desktop instances
- **Podman Compatible** — Works with Podman via Docker-compatible API socket
- **Host Selector** — Switch between hosts from the sidebar dropdown
- **NAS support** (v6.12) — Auto-detects Synology DSM, Unraid, TrueNAS SCALE, QNAP QTS/QuTS hero, OpenMediaVault from `docker info`. No SSH probes, no SDKs. Dedicated per-platform How-To guides cover the platform-specific quirks (Container Manager socket, User Home Service, ix-* managed containers, variable QTS socket path, omv-extras Docker plugin, etc.)
- **Cloud vendor badges** (v6.12.1) — Optional DMI probe (`/sys/class/dmi/id/sys_vendor` + `product_name`) identifies AWS EC2, Google Cloud, Azure VM, DigitalOcean, Hetzner, Linode, Vultr, Oracle Cloud, Scaleway, OVHcloud, plus on-prem hypervisors (VMware, VirtualBox, KVM/QEMU, Xen, Parallels). Renders as a second colored pill on the Multi-Host card

### Operations
- **Stacks Page** — Unified Compose + Git stacks management with actions (up/down/restart/pull)
- **Docker Swarm Mode** — Full UI for Nodes, Services, Tasks; init/leave swarm, scale services, drain nodes, join tokens
- **Docker Compose Editor** — Edit, validate, save & deploy compose configs inline
- **Terminal** — Full xterm.js terminal with shell selection (`sh`, `bash`, `zsh`, `ash`)
- **Alerts** — CPU/memory threshold rules with 7 notification channels
- **Notifications** — Discord, Slack, Telegram, Ntfy, Gotify, Email (SMTP), Custom Webhook
- **Workflow Automation** — IF-THEN rules (CPU high → restart, container crash → notify, etc.)
- **Scheduled Actions** — Cron-based container actions with presets, history, run-now, enable/disable
- **Maintenance Windows** — Scheduled pull/scan/update with block-on-critical
- **Firewall** — View and manage UFW rules (Linux)
- **Container Groups** — User-defined grouping with colors, beyond Docker Compose projects

### Sandbox Mode
- **Ephemeral Sandbox** — Launch a container with auto-delete on stop + optional TTL (30m / 1h / 4h); perfect for testing images risk-free
- **Persistent Sandbox** — Isolated container with resource limits that survives stop/restart
- **Project Source (GitHub)** — Paste a GitHub repo URL; Docker Dash downloads the tarball, auto-detects the tech stack (Node/Python/Go/Ruby/static), installs dependencies, and starts the app
- **Project Source (Upload)** — Upload a .tar/.tar.gz archive; same auto-detect + auto-run flow
- **Auto-detect Stack** — Recognizes package.json, requirements.txt, go.mod, Gemfile, index.html and selects the right base image (node:20-alpine, python:3.12-alpine, etc.)
- **Security Defaults** — Sandbox containers run with `no-new-privileges`, dedicated internal `dd-sandbox` network, resource limits, restart: no
- **TTL Auto-cleanup** — Background timer removes expired sandboxes every 30 seconds with WebSocket notification
- **Visual Badges** — `EPHEMERAL` (red + countdown) or `SANDBOX` (yellow) badges in containers list, detail card with Extend +1h / Remove buttons

### Developer Tools
- **API Playground** — Browse and test all 230+ API endpoints from the UI with response viewer
- **docker run → Compose** — Paste any docker run command, get docker-compose YAML
- **Dual AI Provider** — Container Doctor supports OpenAI API and local Ollama; provider/model/key selector + inline response
- **AI Log Analysis** — Generate diagnostic prompts for ChatGPT/Claude from container logs
- **Generate Compose from GitHub** — Paste a public repo URL, AI (OpenAI or Ollama) generates a production-ready docker-compose.yml
- **Traefik/Caddy Labels** — Generate reverse proxy labels from domain + port
- **App Templates** — 33 built-in + custom templates with CRUD, preview, Template Configurator and modification tracking
- **Image Layer Visualization** — View all layers of any image with command, size, and relative-size bar per layer
- **Deploy Preview** — Check for image updates via digest comparison before pulling
- **Resource Limits Editor** — Visual sliders with presets for CPU and memory
- **Resource Recommendations** — Smart advice: over-provisioned, memory pressure, idle containers

### Security & Compliance
- **Enterprise Security Mode** — `SECURITY_MODE=strict`: cookie-only auth, 8h sessions, password expiry, WS query-string auth disabled
- **TOTP / MFA** — Two-factor auth with RFC 6238 TOTP, encrypted secrets, 10 recovery codes
- **LDAP / Active Directory** — Two-bind authentication, group filter, attribute mapping, auto-provision local accounts
- **CIS Docker Benchmark** — 18 automated checks (daemon + container), scored report with remediation guidance
- **Immutable Audit Log** — SHA-256 hash-chained, tamper detection, JSON/CSV/Syslog export
- **Security Alerts** — 5 default rules (brute force, admin created, MFA disabled), threshold detection

### Knowledge Base
- **How-To Guides** — 63 built-in bilingual guides (EN + RO) covering Docker basics, Linux, networking, security, Compose, Swarm, troubleshooting, backup, performance — plus dedicated platform setups for Synology DSM, Unraid, TrueNAS SCALE, QNAP, OpenMediaVault, Generic VPS (Hetzner/DO/EC2/GCE/Azure/Linode/Vultr), and a canonical SSH key auth guide with per-platform public-key placement instructions
- **Guide Editor** — Admins can create, edit, and delete custom guides with HTML content in both languages
- **Search & Categories** — Filter by 9 categories, difficulty level, and free-text search across all guides

### Platform
- **Multi-user** — Admin, operator, viewer roles with session management
- **SSO Authentication** — Authelia, Authentik, Caddy forward_auth, Traefik (header-based)
- **SSL Zero-Config** — Caddy sidecar auto-reload via shared volume; enable HTTPS from UI with one click
- **Audit Log** — Every action logged with user, timestamp, IP address
- **Public Status Page** — Unauthenticated status page for selected services
- **Container Metadata** — Custom labels, descriptions, links, categories, owner, notes
- **Dark/Light Theme** — Per-user sync across devices, system-aware toggle, mobile responsive
- **i18n** — 11 languages: English, Romanian, German, Italian, French, Spanish, Portuguese, Chinese, Japanese, Korean, Klingon ([add yours](public/js/i18n/README.md))
- **Translations tab** (v6.11) — Built-in Google Translate + DeepL integration for the 25% of keys missing in non-EN locales. Per-provider monthly quota tracking (500k chars each free tier), auto-accept toggle, chunked batch with progress bar + cancel, runtime DB overrides applied on login (no file download / git commit / container rebuild). AES-GCM encrypted API keys, hash-chained audit trail
- **Klingon Easter Egg** — Full activation animation with sound, dagger cursor, red theme
- **Command Palette** — Ctrl+K quick navigation with keyboard shortcuts
- **Watchtower Detection** — Auto-detect and migrate from Watchtower to native safe-pull
- **Prometheus Metrics** — `/api/metrics` endpoint for Grafana integration
- **Self-Reporting Footprint** — Docker Dash memory, uptime, DB size at `/api/footprint`
- **Let's Encrypt Wizard** — 3-step UI for issuing certs via DNS-01 (Cloudflare, Route53, DigitalOcean, Hetzner, Linode) or HTTP-01. Encrypted credential vault, auto-renewal via Caddy, hash-chained audit trail. Open source — no other Docker UI ships this
- **Container Remediation Wizard** — 3-step UI that turns Secrets Audit + CIS Benchmark findings into actionable fixes. 20-entry catalog, 4 live-updatable (zero downtime), 16 with compose-recreate + auto-rollback. Git-PR mode for git-backed stacks. No other OSS Docker UI ships this
- **866 Tests** — 57 test suites covering auth, RBAC, security, CRUD, services, ACME + remediation orchestrators, platform detection, DMI cloud detection, translations, Prometheus metrics, permissions RBAC, settings CRUD, security alert rule evaluation, event notifier dispatch, cluster abstraction (HA mode), rate-limiter memory + Redis paths (100% passing)

### Feature Reference

Dedicated reference docs for the deeper features, in [docs/features/](docs/features/):

- **[Prometheus Metrics](docs/features/prometheus-metrics.md)** — `/api/metrics` endpoint reference, metric names + types + labels, sample Grafana queries, cardinality notes
- **[Platform Detection](docs/features/platform-detection.md)** — NAS + cloud + hypervisor detection logic; complete signature list; how to extend
- **[Translations Tooling](docs/features/translations-tooling.md)** — Google Translate + DeepL integration, quota tracking, review workflow, runtime DB overrides
- **[HA Mode](docs/features/ha-mode.md)** — optional Redis-backed redundancy (production-ready in v7.0.0); architecture, trade-offs, when NOT to use it
- **[HA Failover Runbook](docs/features/ha-failover-runbook.md)** — operator procedures: leader death, rolling restart, Redis failure, split-brain detection, recovery checklist
- **[HA Load Balancer Configs](docs/features/ha-lb-configs.md)** — copy-paste examples for Caddy + Traefik + HAProxy + nginx with sticky-session + WS upgrade + health checks

## Where to start

Two short reads, each tailored to a different background. Pick the one that matches you and skim before installing.

<table>
  <tr>
    <td width="50%" valign="top">
      <h3>🚀 New to Docker?</h3>
      <p>The recipe-and-kitchen metaphor, why containers fix <em>"works on my machine"</em>, what you see in the first 30 seconds of opening Docker Dash, and what you can do in your first hour. No jargon.</p>
      <p><strong><a href="docs/guides/why-docker-dash-beginners.md">Read: Why Docker &amp; Docker Dash — Beginner's Guide →</a></strong></p>
    </td>
    <td width="50%" valign="top">
      <h3>⎇ Developer using Git?</h3>
      <p>The git → Docker mental bridge (<code>commit</code> = image, <code>package.json</code> = compose), the 5 places dev-with-git gets stuck, and how Docker Dash compares against Portainer / Dockge / bash scripts. With a GitOps workflow.</p>
      <p><strong><a href="docs/guides/why-docker-dash-developers.md">Read: Docker Dash for Developers Using Git →</a></strong></p>
    </td>
  </tr>
</table>

> Both guides are also available inside the app under <strong>How-To Guides</strong> with bilingual EN/RO content and surfaced as buttons in the page header.

## Quick Start

### One-Line Install (recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/bogdanpricop/docker-dash/main/install.sh | bash
```

This will detect your OS, check Docker, generate secure secrets, and start Docker Dash. Works on Ubuntu, Debian, CentOS, Fedora, and macOS (amd64/arm64).

Set a custom install directory: `DOCKER_DASH_DIR=/opt/docker-dash curl -fsSL ... | bash`

### Manual Install

```bash
# Clone the repository
git clone https://github.com/bogdanpricop/docker-dash.git
cd docker-dash

# Copy and configure environment
cp .env.example .env
# Edit .env — at minimum change APP_SECRET and ADMIN_PASSWORD

# Start with Docker Compose
docker compose up -d

# Open in browser
open http://localhost:8101
```

Default credentials: `admin` / `admin` — on first login, a **security setup wizard** will require you to change the password.

## Requirements

- Docker Engine 20.10+ (or Docker Desktop 4.x+)
- Docker Compose v2
- ~50MB RAM, minimal CPU

## Architecture

```
┌─────────────────┐     ┌───────────────────┐
│   Browser SPA   │────▸│  Node.js/Express  │
│  (vanilla JS)   │◂────│   REST + WebSocket│
└─────────────────┘     └────────┬──────────┘
                                 │
                    ┌────────────┼────────────┐
                    │            │            │
              ┌─────┴──────┐ ┌───┴────┐ ┌─────┴─────┐
              │  SQLite    │ │ Docker │ │  Docker   │
              │ (embedded) │ │ Local  │ │  Remote   │
              │ WAL mode   │ │ Socket │ │ TCP/SSH   │
              └────────────┘ └────────┘ └───────────┘
```

| Layer | Technology |
|-------|-----------|
| Backend | Node.js 20, Express 5, dockerode, better-sqlite3, ws, ssh2, ldapts |
| Frontend | Vanilla JavaScript SPA, Chart.js, xterm.js, Font Awesome (CDN) |
| Database | SQLite with WAL mode, auto-aggregation, configurable retention |
| Security | bcrypt, Helmet CSP, rate limiting, session-based auth, Bearer token fallback |
| Scanning | Trivy (OSS), Grype (Anchore), Docker Scout (SARIF format) |

**Zero build step** — no webpack, no bundler, no transpiler. Frontend files are served as-is.

## Multi-Host

Docker Dash can manage multiple Docker hosts from a single instance:

| Method | Use Case | Requirements |
|--------|----------|-------------|
| **TCP + TLS** | Remote Linux servers | Docker API exposed on port 2376 + TLS certificates |
| **Docker Desktop** | Windows / Mac | "Expose daemon on TCP" enabled in DD Settings |
| **SSH Tunnel** | Secure remote (no API exposure) | SSH access + `socat` installed + user in `docker` group |
| **SSH to NAS** | Synology / Unraid / TrueNAS SCALE / QNAP / OMV | SSH access + admin in `docker` group. Platform auto-detected from `docker info` — dedicated How-To guide per platform |
| **Unix Socket** | Local (default) | Docker socket mounted (automatic) |

The app includes a **built-in setup guide** (Hosts page) with step-by-step instructions for each method, including TLS certificate generation, per-OS `socat` installation commands, SSH key authentication setup, and a 9-item Synology DSM 7.x security hardening checklist (added in v6.14.3).

## Podman Support

Docker Dash works with **Podman** via its Docker-compatible API. No code changes needed.

```bash
# 1. Enable the Podman socket
systemctl --user enable --now podman.socket    # rootless
# or
sudo systemctl enable --now podman.socket      # rootful

# 2. Set the socket path in .env
echo 'DOCKER_SOCKET=/run/podman/podman.sock' >> .env   # rootful
# or
echo 'DOCKER_SOCKET=/run/user/1000/podman/podman.sock' >> .env  # rootless

# 3. Start Docker Dash
docker compose up -d   # or podman-compose up -d
```

**Known differences:** Podman lacks Docker Compose labels (`com.docker.compose.project`), so containers won't auto-group into stacks. Use Docker Dash's Container Groups feature instead.

## Configuration

All config via environment variables. See [`.env.example`](.env.example) for the full list.

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_PORT` | `8101` | HTTP port |
| `APP_SECRET` | — | **Required.** Session signing key |
| `ADMIN_PASSWORD` | `admin` | Initial admin password (first launch only) |
| `ENCRYPTION_KEY` | — | Encrypt registry credentials at rest |
| `STATS_INTERVAL_MS` | `10000` | Stats collection interval (ms) |
| `STATS_RAW_RETENTION_HOURS` | `24` | Keep raw stats for N hours |
| `EVENT_RETENTION_DAYS` | `7` | Keep Docker events for N days |
| `ENABLE_EXEC` | `true` | Allow terminal exec into containers |
| `READ_ONLY_MODE` | `false` | Disable all write operations |

## Development

```bash
# Install dependencies
npm install

# Start in development mode (auto-reload on file changes)
npm run dev

# Open http://localhost:8101
```

No build step needed. Edit any `.js` or `.css` file and refresh the browser.

## Adding a Language

Docker Dash uses a modular i18n system. To add a new language:

1. Copy `public/js/i18n/TEMPLATE.js` to `public/js/i18n/{code}.js`
2. Translate the values (keys stay in English)
3. Add one `<script>` tag in `index.html`

That's it — the language appears automatically in the selector. See [`public/js/i18n/README.md`](public/js/i18n/README.md) for full instructions.

Currently supported: **English**, **Romanian**, **German**, **Italian**, **French**, **Spanish**, **Portuguese**, **Chinese**, **Japanese**, **Korean**, **Klingon** (11 languages).

## Project Structure

```
docker-dash/
├── src/
│   ├── config/          # Environment-based configuration
│   ├── db/              # SQLite setup + 60 auto-migrations
│   ├── middleware/       # Auth, rate limiting, hostId extraction
│   ├── routes/          # REST API (containers, images, volumes, networks, swarm, hosts, ...)
│   ├── services/        # Business logic (docker, stats, alerts, ssh-tunnel, registry, ldap, cis-benchmark, ssl)
│   ├── ws/              # WebSocket server (exec, live logs, live stats)
│   └── utils/           # Logger, helpers
├── public/
│   ├── js/
│   │   ├── i18n/        # Language files (11 languages + TEMPLATE.js)
│   │   ├── pages/       # SPA pages (dashboard, containers, images, security, swarm, hosts, ...)
│   │   ├── components/  # Reusable UI (modal, toast, data table)
│   │   ├── api.js       # HTTP client with auto host-context
│   │   ├── ws.js        # WebSocket client with reconnect
│   │   └── app.js       # Router, auth, sidebar, command palette
│   └── css/app.css      # Single stylesheet, CSS variables, dark/light themes
├── docs/
│   └── screenshots/     # UI screenshots for README
├── Dockerfile           # Multi-stage: base → deps → production
├── docker-compose.yml   # Production-ready with health check
└── .env.example         # All variables documented
```

## Comparison

**60 features compared across 8 tools.** See the interactive comparison at `#/compare` in the app, or via `GET /api/compare`.

| Feature | **Docker Dash** | Portainer CE | Portainer BE | Coolify | Yacht | Rancher | Dockge | Dockhand |
|---------|:-----------:|:------------:|:------------:|:-------:|:-----:|:-------:|:------:|:--------:|
| Container CRUD | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Compose only | ✅ |
| Image / Volume / Network | ✅ | ✅ | ✅ | ✅ | partial | ✅ | No | ✅ |
| **Network Topology** | ✅ | — | — | — | — | — | — | — |
| **Dependency Map** | ✅ | — | — | — | — | — | — | — |
| Real-time Stats | ✅ | ✅ | ✅ | ✅ | basic | ✅ | basic | ✅ |
| Terminal (xterm.js) | ✅ | ✅ | ✅ | ✅ | — | ✅ | ✅ | ✅ |
| Vulnerability Scanning | Trivy + Grype + Scout | — | — | — | — | NeuVector | — | Grype + Trivy |
| **Safe-Pull + Pipeline** | **5-stage** | — | — | — | — | — | — | basic |
| **Container Rollback** | ✅ | — | — | ✅ | — | ✅ | — | — |
| Multi-Host (agentless) | ✅ | agent req. | agent req. | agent | — | ✅ | agent | ✅ |
| Git Integration | ✅ | BE only | ✅ | ✅ | — | Fleet | — | — |
| Webhooks + Polling | ✅ | BE only | ✅ | ✅ | — | ✅ | — | — |
| **Docker Swarm Mode** | ✅ | ✅ | ✅ | — | — | K8s focus | — | — |
| Audit Log | ✅ | BE only | ✅ | basic | — | ✅ | — | — |
| **Alerts (7 channels)** | ✅ | BE only | ✅ | ✅ | — | ✅ | — | — |
| SSO / LDAP / OAuth | ✅ | BE only | ✅ | ✅ | — | ✅ | — | — |
| **CIS Docker Benchmark** | ✅ | — | — | — | — | partial | — | — |
| **Health Score (0-100)** | ✅ | — | — | — | — | — | — | — |
| **AI Container Doctor** | ✅ | — | — | — | — | — | — | — |
| **Resource Forecasting** | ✅ | — | — | — | — | basic | — | — |
| **Cost Optimizer** | ✅ | — | — | — | — | basic | — | — |
| **Insights Dashboard** | ✅ | — | — | — | — | basic | — | — |
| **Workflow Automation** | ✅ | — | — | — | — | — | — | — |
| **Scheduled Actions** | ✅ | — | — | — | — | — | — | — |
| **Cross-Host Migration** | zero-downtime | — | — | — | — | ✅ | — | — |
| **Public Status Page** | ✅ | — | — | ✅ | — | — | — | — |
| **Maintenance Windows** | ✅ | — | — | — | — | — | — | — |
| **API Playground** | ✅ | Swagger ($) | ✅ | ✅ | — | ✅ | — | — |
| App Templates | 33 + custom | 500+ community | 500+ | many | basic | Helm | — | — |
| i18n | **11 languages** | partial | partial | partial | — | ✅ | — | — |
| Command Palette | ✅ | — | — | — | — | — | — | — |
| Mobile Responsive | ✅ | ✅ | ✅ | ✅ | ✅ | partial | ✅ | ✅ |
| Build Step | **None** | Angular | Angular | required | none | none | required | required |
| Container Size | **~80MB** | ~250MB | ~250MB | ~200MB | ~100MB | ~500MB+ | ~100MB | ~80MB |
| RAM Usage | **~50MB** | ~200MB | ~200MB | ~150MB | ~50MB | ~500MB+ | ~50MB | ~60MB |
| License | **MIT** | Zlib | commercial | Apache 2.0 | MIT | Apache 2.0 | MIT | BSL 1.1 |

> ✅ **30+ features exclusive to Docker Dash** (no other free tool has them).
> Features Portainer Business locks behind paid license are **free** in Docker Dash.
> Rancher / K3s targets Kubernetes clusters; Docker Dash targets single-host and small multi-host Docker deployments.

## License

[MIT](LICENSE) — free for personal and commercial use.

## Security

Docker Dash takes security seriously. See [SECURITY.md](SECURITY.md) for our full security policy.

### Docker Socket Access

Docker Dash requires access to the Docker socket (`/var/run/docker.sock`). This is **equivalent to root access** on the host. This is the same requirement as Portainer, Dockge, and all other Docker management UIs.

**Mitigations in place:**
- Socket mounted **read-only** (`:ro`) in production docker-compose
- `no-new-privileges` security option enabled
- Role-based access control (admin/operator/viewer)
- Feature flags to disable dangerous operations (`ENABLE_EXEC=false`, `READ_ONLY_MODE=true`)
- Audit log for every action with user, timestamp, and IP
- Rate limiting on all API endpoints
- Session-based auth with bcrypt + SHA-256 hashed tokens

**Recommendations for production:**
- Deploy behind HTTPS reverse proxy (Caddy config included)
- Set strong `APP_SECRET` and `ENCRYPTION_KEY` (app refuses to start without them)
- Set `COOKIE_SECURE=true` when behind HTTPS
- Disable exec terminal if not needed (`ENABLE_EXEC=false`)
- Use read-only mode for monitoring-only deployments (`READ_ONLY_MODE=true`)
- Restrict network access to trusted IPs
- Consider [docker-socket-proxy](https://github.com/Tecnativa/docker-socket-proxy) to limit API access (allow only read operations)
- Review [SECURITY.md](SECURITY.md) for responsible disclosure process

### Security Audit Results

| Audit | Date | Score | Critical Issues |
|-------|------|-------|----------------|
| Tech Debt Scan | 2026-03-27 | 33 items found | All 4 CRITICAL fixed |
| Production Readiness v5 | 2026-03-28 | 8.05/10 weighted (claimed 9.2) | All P0+P1 resolved |
| Shell Injection | 2026-03-28 | 0 vectors | All execSync eliminated |
| Production Readiness v6.15.1 | 2026-04-22 | 9.1/10 (defensible weighted) | v5 gaps closed: error-response sanitization on all 500s (v6.14.1), expanded Prometheus metrics with job counters populated (v6.15.0–v6.15.1), setInterval leak fixed, CI test count dynamic, X-Frame-Options: DENY + Permissions-Policy, 0 lint warnings |
| Production Readiness v6.16.0 | 2026-04-22 | 9.5/10 | Phase 2 shipped: `containers.js` (5774 lines, largest JS file) split into list-eager (3226 lines) + detail-lazy (2595 lines loaded on first `/containers/:id` navigation via script injection). Performance category 7 → 9, initial JS payload −45% for users not visiting a container detail page. 757 tests unchanged |
| Production Readiness v6.16.1 | 2026-04-22 | **9.7/10** | Testing 8.5 → 9.5 (+86 tests across 4 previously-untested services: permissions RBAC, settings CRUD, security-alerts rule evaluation, event-notifier dispatch). Documentation 9 → 9.5 (3 new feature reference docs under `docs/features/`: Prometheus metrics, platform detection, translations tooling). Residual: Docker-in-Docker integration tests (v7), Redis HA mode (v7), external 3rd-party audit (v7) — 10/10 requires all three |
| Production Readiness v7.0.0 | 2026-04-22 | **9.8/10** | HA mode production-ready: opt-in `DD_MODE=ha` + Redis. 4-phase rollout (v6.17.0 rate limiter, v6.17.1 WS pub/sub, v6.17.2 leader election, v7.0.0 observability + operator runbook + LB configs). Standalone default unchanged. Staging soak verified: 3-replica deploy with lock acquire, graceful leader handover, Redis restart recovery. `/api/cluster/status` + 4 Prometheus gauges. BACKLOG F30 closed. Residual gap to 10: external 3rd-party security audit (budget + vendor coordination) |

### Known Security Tradeoffs

These are conscious design decisions documented in [SECURITY.md](SECURITY.md):

1. **CSP allows `unsafe-eval`** (but NOT `unsafe-inline`) — `unsafe-eval` required by Chart.js. All 67 inline handlers were converted to addEventListener in v5.0. XSS mitigated by output escaping on all user content (400+ `escapeHtml()` calls).
2. **WebSocket accepts token via query string** — fallback for browsers that block cookies (Edge Tracking Prevention). Cookie-based auth is always preferred. Usage is logged.
3. **Mixed auth model (cookie + Bearer + API key)** — cookies for browser UI, Bearer for API/CLI, API keys for integrations. All validate against the same session store.

### Test Coverage

- **843 tests** across **55 test suites** (100% passing — 4 skipped are live-CF integration tests gated on a CI secret)
- Unit tests: crypto, helpers, validation, git patterns, platform detection, DMI cloud detection, translations, filter escape, metrics rendering
- Integration tests: auth flow, API endpoints, RBAC, security, ACME + remediation orchestrators
- Service tests (v6.16.1): permissions RBAC filtering, settings key-value CRUD, security alert rule evaluation (threshold + windowed), event notifier dispatch + cooldown
- CI runs on every push via GitHub Actions (pinned to Node 24 actions as of v6.13.1, clearing the June 2026 deprecation; test count reported dynamically in the CI summary as of v6.15.0)

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for:
- Development setup
- Architecture principles (no build step, no framework)
- How to add pages, API endpoints, database migrations
- How to add a language translation
- Pull request checklist

## Acknowledgments

Built with:
- [dockerode](https://github.com/apocas/dockerode) — Docker API client
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) — SQLite driver
- [xterm.js](https://xtermjs.org/) — Terminal emulator
- [Chart.js](https://www.chartjs.org/) — Charts
- [Trivy](https://trivy.dev/) — Vulnerability scanner
- [Grype](https://github.com/anchore/grype) — Vulnerability scanner by Anchore
- [ssh2](https://github.com/mscdex/ssh2) — SSH client
- [Font Awesome](https://fontawesome.com/) — Icons
