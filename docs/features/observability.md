# Observability Stack — Prometheus + Grafana

**Introduced:** v7.1.0
**Optional — opt-in via `docker compose --profile observability up -d`**
**Works in both standalone and HA mode.**

Docker Dash ships an opt-in observability stack that deploys Prometheus (scraping `/api/metrics`) + Grafana (with a pre-provisioned dashboard) alongside the app. Zero UI configuration required — after `docker compose --profile observability up -d`, open Grafana and the dashboard is already populated.

For operators who already run Prometheus or Grafana: skip this profile and integrate manually — [see §5 below](#5-integrating-with-an-existing-prometheusgrafana).

---

## 1. What's in the stack

| Service | Image | Purpose | Exposed |
|---------|-------|---------|:-------:|
| `prometheus` | `prom/prometheus:v3.0.1` | Scrapes `/api/metrics` every 15s, 7-day retention | No (internal only) |
| `grafana` | `grafana/grafana:11.3.0` | Queries Prometheus, serves the pre-provisioned dashboard | Yes (`:3001` by default) |

Both services run with `no-new-privileges:true`. Data persists across restarts via named Docker volumes (`docker-dash-prometheus-data`, `docker-dash-grafana-data`).

## 2. Enabling

```bash
# Minimum — adds Prometheus + Grafana, default passwords
docker compose --profile observability up -d

# With custom Grafana admin credentials (set before first boot)
GRAFANA_ADMIN_USER=ops GRAFANA_ADMIN_PASSWORD=<strong-password> \
  docker compose --profile observability up -d

# With custom Grafana port (default 3001 to avoid clash with app's 8101 + common :3000)
GRAFANA_PORT=4000 docker compose --profile observability up -d
```

Open Grafana at `http://<host>:3001` (or your `GRAFANA_PORT`). Log in with `admin / admin` (or your custom credentials). Grafana **forces a password change** on first login.

Dashboard: **Docker Dash → Docker Dash — Overview**. Populates within 30s of first scrape.

## 3. What the dashboard shows

Eight panels on a single grid. Panels are designed to work whether you're in standalone or HA mode — HA-specific panels show 0 / N/A in standalone.

| Panel | Metric(s) | Why it matters |
|-------|-----------|----------------|
| **Cluster role** | `docker_dash_cluster_role` | See each replica's current role. Standalone shows `standalone`; HA shows `leader` or `reader` per node. |
| **Redis (HA only)** | `docker_dash_cluster_redis_connected` | Binary gauge — red if HA mode can't reach Redis; green otherwise. Standalone shows "down / N/A" (intentional). |
| **Active WebSocket connections** | `sum(docker_dash_ws_connections_active)` | Live users. Drops to zero = everyone disconnected; sustained high = capacity check. |
| **Containers managed** | `docker_dash_containers_total` | Stat card. From Docker Dash's own stats aggregator. |
| **HTTP request rate** | `sum by(method, status) (rate(docker_dash_http_requests_total[5m]))` | Per HTTP method × status class (2xx/3xx/4xx/5xx). 5xx spikes → investigate errors panel. |
| **Avg HTTP latency** | `sum(rate(...duration_ms)) / sum(rate(...requests_total))` | Time-series, ms. Thresholds at 500ms (amber) and 2000ms (red). |
| **Background job runs** | `sum by(job) (rate(docker_dash_background_job_runs_total[15m]))` | Flat line = job stopped running. In HA mode indicates leader election issue; in standalone = cron misconfig. |
| **HTTP errors (by status)** | `sum by(status) (rate(docker_dash_http_errors_total[5m]))` | Stacked. 429 = rate limiter firing; 5xx = investigate logs. |

Dashboard uses `docker-dash-prom` data source UID. If you copy the JSON to your own Grafana, update the UID or re-point via data source variables.

## 4. Recommended alerts

Copy these into Grafana's Alerting → Alert rules (or your Alertmanager config). All reference metrics from Docker Dash's `/api/metrics`:

```yaml
# 1. No leader elected (HA)
sum(docker_dash_cluster_role == 1) != 1
# for: 30s
# severity: critical — split-brain or no leader

# 2. Redis down (HA)
docker_dash_cluster_redis_connected == 0
# for: 10s
# severity: critical — HA mode degraded

# 3. Stalled leader heartbeat
docker_dash_cluster_heartbeat_age_seconds > 15
# for: 30s
# severity: warning — leader overload or partition

# 4. 5xx spike
sum(rate(docker_dash_http_errors_total{status=~"5.."}[5m])) > 0.5
# for: 2m
# severity: warning — >0.5 err/sec sustained

# 5. Slow requests
sum(rate(docker_dash_http_request_duration_ms[5m])) / sum(rate(docker_dash_http_requests_total[5m])) > 2000
# for: 5m
# severity: warning — avg latency >2s

# 6. Background jobs stalled
rate(docker_dash_background_job_runs_total{job="stats-aggregate-1m"}[10m]) == 0
# for: 5m
# severity: warning — stats aggregation stopped
```

Only #1 and #2 are HA-specific. The rest apply to both modes.

## 5. Integrating with an existing Prometheus / Grafana

If you already run Prometheus and Grafana elsewhere, you don't need the `observability` profile. Two integration paths:

### 5.1 Add Docker Dash as a scrape target in your existing Prometheus

Append to your `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: docker-dash
    metrics_path: /api/metrics
    static_configs:
      - targets: ['docker-dash-host:8101']      # DNS name or IP
        labels:
          service: docker-dash

  # If HA mode with N replicas, list each replica:
  # - targets: ['dd-replica-1:8101', 'dd-replica-2:8101', 'dd-replica-3:8101']
```

Reload Prometheus (`curl -X POST http://prometheus:9090/-/reload` if `--web.enable-lifecycle` is set, or SIGHUP the process).

### 5.2 Import the dashboard into your existing Grafana

```bash
# Grab the dashboard JSON
curl -O https://raw.githubusercontent.com/bogdanpricop/docker-dash/main/docker/observability/grafana/dashboards/docker-dash-overview.json

# Import via Grafana UI: Dashboards → New → Import → Upload JSON
# OR via API:
curl -X POST https://<grafana>/api/dashboards/db \
  -H "Authorization: Bearer <grafana-service-account-token>" \
  -H "Content-Type: application/json" \
  -d @docker-dash-overview.json
```

**Important**: after import, update the dashboard's data source to point at your Prometheus instance (Grafana will prompt automatically).

## 6. Security hardening checklist

Before exposing Grafana beyond your trusted network:

- [ ] **Change default Grafana password**. If using `GRAFANA_ADMIN_PASSWORD=...` in `.env`, use a strong value; it's baked in at first boot.
- [ ] **Do NOT expose Prometheus externally.** The default compose config binds Prometheus to the internal network only. Leave it that way unless you have an explicit reason.
- [ ] **Put Grafana behind HTTPS**. Grafana has its own HTTPS config (`GF_SERVER_PROTOCOL=https`), or terminate TLS at a reverse proxy (Caddy/Traefik). Same-host setup can reuse the `--profile tls` Caddy.
- [ ] **Disable anonymous access** (default). We set `GF_AUTH_ANONYMOUS_ENABLED=false`.
- [ ] **Disable user sign-up** (default). `GF_USERS_ALLOW_SIGN_UP=false` means only admin can create users.
- [ ] **Consider SSO**. Grafana supports OAuth / LDAP / OIDC. See [Grafana authentication docs](https://grafana.com/docs/grafana/latest/setup-grafana/configure-security/configure-authentication/).
- [ ] **Review data-source access**. Ours is `access: proxy` (Grafana proxies queries — the browser never hits Prometheus directly), which is the safer default.

## 7. Common-sense deployment recommendations

If you're deploying Prometheus + Grafana from scratch (not just using ours):

### Persistent storage

Use named volumes or bind mounts for `/prometheus` and `/var/lib/grafana`. Our compose profile does this:
- `docker-dash-prometheus-data` → `/prometheus` (7-day retention default; ~200MB-1GB depending on scrape density)
- `docker-dash-grafana-data` → `/var/lib/grafana` (includes dashboards you create in the UI, not the auto-provisioned ones)

### Resource limits

Under normal Docker Dash load (`~10 req/s`, few containers, few WS clients), Prometheus + Grafana consume:
- Prometheus: ~80-150MB RAM, <1% CPU
- Grafana: ~120-180MB RAM, <1% CPU

Under load, set Docker resource limits:
```yaml
# In docker-compose.yml, under each service:
deploy:
  resources:
    limits:
      memory: 512M
      cpus: '0.5'
```

### Retention vs disk

Default Prometheus retention: **7 days**. For longer retention, edit the compose profile's `--storage.tsdb.retention.time=30d` (or whatever). Each additional day typically adds ~50-200MB depending on scrape density.

For **long-term metrics storage** (months/years), offload to a remote-write target like [Thanos](https://thanos.io/), [Cortex](https://cortexmetrics.io/), or [Victoria Metrics](https://victoriametrics.com/). Scope out of this doc — Docker Dash's metrics are operational, not long-term historical.

### Scaling considerations

- **Prometheus is single-instance.** Our profile uses one. For redundancy, run a second one with the same scrape config. Grafana can failover between them via data-source config.
- **Grafana is stateless for dashboards** (when provisioned from files). Your existing Grafana deployment will work if you just add the Docker Dash dashboard JSON.

### Connectivity for HA mode deploys

If you run Docker Dash in HA mode with N replicas, Prometheus needs to scrape each replica independently. Options:

**Option 1 — Static targets** (N known replicas):
```yaml
scrape_configs:
  - job_name: docker-dash
    metrics_path: /api/metrics
    static_configs:
      - targets: ['dd-1:8101', 'dd-2:8101', 'dd-3:8101']
        labels:
          service: docker-dash
```

**Option 2 — Docker SD** (auto-discover running containers matching a label):
```yaml
scrape_configs:
  - job_name: docker-dash
    metrics_path: /api/metrics
    docker_sd_configs:
      - host: unix:///var/run/docker.sock
        refresh_interval: 30s
    relabel_configs:
      # Match containers with the docker-dash label
      - source_labels: [__meta_docker_container_label_com_docker_compose_service]
        regex: 'app'
        action: keep
      # Set target to container port 8101
      - source_labels: [__meta_docker_container_name]
        regex: '/(.+)'
        target_label: instance
        replacement: '${1}'
      - source_labels: [__address__]
        target_label: __address__
        replacement: '${1}:8101'
```

Docker SD requires Prometheus to have access to the Docker socket (mount it read-only). Works well in Docker Swarm; adapt to `kubernetes_sd_configs` for K8s.

## 8. Teardown

```bash
# Stop + remove Prometheus + Grafana containers, KEEP data volumes
docker compose --profile observability down

# Stop + remove containers AND drop data volumes (nuclear option)
docker compose --profile observability down -v
```

The main Docker Dash app is unaffected — it keeps running.

## 9. Known limitations

- **No histograms** — Docker Dash exports counters and gauges only. Latency is "average over window", not p50/p95/p99. If you need percentiles, add a Prometheus histogram via a separate exporter (out of scope — would require instrumentation).
- **No container-per-container metrics rollup** — per-container CPU/memory is exposed as a gauge series, but Prometheus cardinality can explode on long-lived named containers. If you manage hundreds of containers, consider a separate cAdvisor deployment for per-container time series.
- **Per-replica scrape in HA** — with N replicas, you get N series per metric. Prometheus handles this fine up to ~100 replicas. Beyond that, add remote-write offload.

## 10. See also

- Source:
  - [`docker/observability/prometheus.yml`](../../docker/observability/prometheus.yml)
  - [`docker/observability/grafana/`](../../docker/observability/grafana/)
  - [`src/services/metrics.js`](../../src/services/metrics.js) — the metric producer
  - [`src/routes/misc.js`](../../src/routes/misc.js) — the `/api/metrics` endpoint
- Related docs:
  - [HA Mode](ha-mode.md) — when cluster metrics are meaningful
  - [HA Failover Runbook](ha-failover-runbook.md) — what the cluster alerts protect against
  - [Prometheus Metrics Reference](prometheus-metrics.md) — the full metric catalog
