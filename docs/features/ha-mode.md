# HA Mode — Optional Redis-backed High Availability

**Introduced:** v6.17.0 (foundation — rate limiter + cluster abstraction)
**Feature-complete:** v6.17.2 (pub/sub + leader election)
**Production-grade:** v7.0.0 stable (planned — failover runbook + staging multi-replica soak)
**Status:** v6.17.2 ships **multi-replica safe HA**. Safe to run 2-3 replicas behind a sticky-session load balancer. Full production-grade promotion (with automated failover docs + soak test results) comes in v7.0.0.

---

## Why this exists

Docker Dash's default is **single-instance deployment — zero external dependencies, zero config**. For 99% of self-hosted users, that's the right default and will stay that way forever.

Some deployments need redundancy:

- **Corporate dashboards** where a 10-minute outage triggers a ticket
- **On-prem Kubernetes clusters** that mandate ≥2 replicas by policy
- **Always-on infrastructure panels** behind a load balancer

For those environments, v6.17.0 introduces **opt-in HA mode**: a designated "writer" replica + N read/serve replicas, sharing a Redis instance for hot state.

> **This is not Kubernetes-grade active-active scale-out.** It's "HA-ready with redundancy". True multi-writer horizontal scale requires a Postgres backend (out of scope for v6.x / v7.0 — tracked in BACKLOG F30 follow-up).

---

## What HA mode changes

| Subsystem | Standalone | HA mode (v6.17.2) |
|-----------|:----------:|:-----------------:|
| Rate limiter | In-memory sliding window | **Redis INCR fixed window** |
| WebSocket broadcasts | In-process | **Redis pub/sub on `ddash:pubsub` channel** (loop-safe via nodeId filter) |
| Cron jobs | Single process runs them | **Leader-only** (Redis SET NX PX, 30s TTL + 10s heartbeat) |
| Docker event stream | Per-process | **Leader-only** (start on become-leader, stop on become-reader) |
| Git polling | Single process | **Leader-only** |
| SSH tunnels | Per-process | **Per-replica** (readers need them to serve HTTP reads; documented acceptable cost) |
| Sessions | DB-backed | DB-backed (works across replicas) |
| DB | Local SQLite | Shared SQLite (single-writer — leader holds writes; readers proxy via internal API in v7.0) |

**v6.17.2 is multi-replica-safe.** Deploy 2-3 replicas behind a sticky-session LB. One replica holds the leader lock and runs all cron + Docker event stream + git polling. Readers serve HTTP, have WS events delivered via pub/sub. On leader death, a reader acquires the lock within ~30s (TTL). Graceful shutdown releases the lock immediately (Lua DEL-if-owned).

---

## Enabling HA mode

### 1. Deploy Redis + set mode

```bash
# Enable the ha profile to bring up Redis alongside Docker Dash
docker compose --profile ha up -d

# In .env:
DD_MODE=ha
REDIS_URL=redis://redis:6379
```

### 2. Verify

```bash
# App reports HA mode in the health response
curl http://localhost:8101/api/health
# → { "status": "ok", "version": "6.17.0", ... }

# Redis is reachable from the app container
docker compose exec app sh -c 'echo PING | redis-cli -h redis'
# → PONG

# Prometheus metrics still work (rate-limit keys now live in Redis)
curl http://localhost:8101/api/metrics | grep docker_dash
```

### 3. Disable HA mode

```bash
# Unset DD_MODE in .env:
# DD_MODE=standalone   (or just remove the line)

# Optionally stop Redis:
docker compose --profile ha stop redis

# Restart the app
docker compose up -d app
```

All HA state in Redis is ignored by standalone mode. No cleanup needed.

---

## Architecture

### `src/services/cluster.js`

Central abstraction. Every HA-aware subsystem imports this module:

```js
const cluster = require('./services/cluster');

cluster.isHa();              // → false in standalone, true in HA mode
cluster.nodeId();            // → 'standalone' or UUID (unique per HA replica)
await cluster.redis();       // → null in standalone, ioredis client in HA
await cluster.rateLimitTick(key, maxReqs, windowMs);
  // → { allowed, remaining, retryAfterSec }

// Phase 3 (v7.0.0-alpha.1) — currently no-ops in v6.17.0:
await cluster.publish(channel, payload);
cluster.subscribe(channel, handler);

// Phase 4 (v7.0.0-rc.1) — currently returns true for every node in v6.17.0:
await cluster.isLeader();
```

See [src/services/cluster.js](../../src/services/cluster.js) for full implementation.

### Rate-limiter semantics

Standalone mode uses **sliding window** (timestamp list per key, trimmed on every tick — stricter):
- A 10-req-per-minute limit allows exactly 10 in any rolling 60-second window.

HA mode uses **fixed window** via Redis `INCR` + `PEXPIRE` (simpler, faster, 2× looser at bucket boundaries):
- Same 10-req-per-minute limit allows up to 20 in the worst case — 10 in the last second of window N + 10 in the first second of window N+1.

For Docker Dash's workload, the looser HA enforcement is acceptable. If you need exact sliding-window in HA, that's a v7.1+ addition (would need Redis sorted sets, more expensive per tick).

### Redis keys

```
rl:<route>:<ip>:<bucketEpoch>    # rate-limit counter, TTL=windowMs+1s
```

Low cardinality — each route × client IP × time bucket. Bounded by request rate, cleaned automatically by TTL.

Future HA keys (v7.0.0):
```
leader                            # SET NX PX — current leader nodeId
leader:heartbeat                  # leader's last heartbeat timestamp
broadcast:<channel>               # pub/sub channels for WS broadcasts
```

---

## Operational concerns

### Memory footprint

- Standalone: unchanged.
- HA mode: Redis 7-alpine ~30MB image, ~5-15MB RAM idle, bounded at 128MB via `--maxmemory` with LRU eviction.

### Rate-limit failure mode (fail-open)

If Redis becomes unreachable mid-request:

```
[warn] Rate limiter failure, allowing request { message: "Redis connection lost" }
```

Docker Dash chooses **availability over strict rate enforcement**. The request proceeds. Consider this when sizing DDoS protection — the rate limiter is a fair-use tool, not a security boundary.

### Persistence

The compose `redis` service is configured with:
```
--save 60 1000 --maxmemory 128mb --maxmemory-policy allkeys-lru
```

Translations: snapshot to `/data/dump.rdb` every 60s if ≥1000 writes. Survives container restart. Rate-limit counters persist (not ideal but harmless — TTL cleans them up quickly).

### Monitoring

Prometheus metrics still work — they're per-replica (intentional, since Prometheus scrapes each replica separately):

```
docker_dash_uptime_seconds
docker_dash_http_requests_total{method,status}
docker_dash_ws_connections_active
...
```

Redis itself doesn't expose its internal metrics via the app endpoint. Scrape Redis separately with [redis_exporter](https://github.com/oliver006/redis_exporter) if you want Grafana dashboards on Redis.

### Failover (v6.17.0)

**Not automatic.** If the app process dies, Docker's restart policy brings it back. If Redis dies, the rate limiter fails open (warn log, requests allowed). No leader election means nothing to fail over — every replica is equal.

Full failover story lands in v7.0.0.

---

## When NOT to use HA mode

- **Self-hosted homelab.** Default standalone is better. Zero moving parts.
- **Single-node production** where a 1-minute restart is acceptable. Same — stay standalone.
- **Geographic distribution.** HA mode is same-datacenter. For cross-region, you need Postgres replication + full multi-writer support (not shipping in v6.x).

---

## Rollback

Single-commit revert on the v6.17.0 release tag. `ioredis` becomes an unused `optionalDependencies` entry (harmless). `docker-compose --profile ha` becomes a no-op profile (no `redis` service defined yet).

---

## See also

- **[Failover runbook](ha-failover-runbook.md)** — operator procedures for leader death, rolling restart, Redis failure, split-brain detection
- **[Load balancer configs](ha-lb-configs.md)** — copy-paste ready examples for Caddy, Traefik, HAProxy, nginx
- Research: [`plans/research-ha-mode-optional.md`](../../plans/research-ha-mode-optional.md) — background on why this is opt-in, trade-offs, positioning
- Deep-spec: [`plans/deep-spec-ha-mode.md`](../../plans/deep-spec-ha-mode.md) — architecture, release phasing, code details
- Source: [`src/services/cluster.js`](../../src/services/cluster.js), [`src/services/rate-limiter-memory.js`](../../src/services/rate-limiter-memory.js), [`src/middleware/rateLimit.js`](../../src/middleware/rateLimit.js)
- BACKLOG: F30 — Distributed rate limiter (this covers it; full HA tracked in [`BACKLOG.md`](../../BACKLOG.md))
