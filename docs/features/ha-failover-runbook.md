# HA Failover Runbook

**Applies to:** v7.0.0+
**Audience:** Operators running Docker Dash in multi-replica HA mode.
**Companion doc:** [HA Mode reference](ha-mode.md) — read that first for architecture + when-not-to-use.

---

## TL;DR

| Event | What happens | Operator action |
|-------|--------------|-----------------|
| Leader dies ungracefully | TTL expires in ≤30s. A reader acquires via `SET NX PX`. | **None required.** Observe metrics. |
| Leader is drained/stopped gracefully | Leader releases lock immediately via Lua `DEL-if-owned`. A reader acquires in milliseconds. | **None required.** Rolling restart is safe. |
| Redis dies | Rate limiter fails open (warn log). Leader election stalls — all replicas degrade to "unknown" role. Cron stops on current leader. WS pub/sub stops. | **Restore Redis.** Replicas auto-recover within 10s heartbeat cycle. |
| Split brain (network partition between replicas) | Each partition elects its own leader when its TTL expires. Both run cron until the partition heals. | **Prevent via shared Redis + network design.** See §5. |
| All replicas dead | Service unavailable. | Standard recovery — restart via orchestrator. |

---

## 1. Normal operation

```
                          ┌─────────────────────────────┐
                          │  Sticky-session             │
                          │  Load Balancer              │
                          └──────────────┬──────────────┘
                                         │
                           ┌─────────────┼─────────────┐
                           │             │             │
                     ┌─────▼─────┐ ┌─────▼─────┐ ┌─────▼─────┐
                     │ replica A │ │ replica B │ │ replica C │
                     │ ROLE=     │ │ ROLE=     │ │ ROLE=     │
                     │ leader    │ │ reader    │ │ reader    │
                     └─────┬─────┘ └─────┬─────┘ └─────┬─────┘
                           │             │             │
                           └─────────────┼─────────────┘
                                         │
                                   ┌─────▼─────┐
                                   │   Redis   │
                                   │ leader=A  │
                                   └───────────┘
```

- **One replica is "leader"** — runs the 13 cron jobs, owns the Docker event stream, owns git polling. Writes to SQLite.
- **N-1 replicas are "readers"** — serve HTTP reads (list containers, inspect, logs, stats). Receive WS events via Redis pub/sub from whichever replica broadcast them. Do NOT run cron.
- **Every replica runs** the rate limiter (Redis-backed, shared), the WS server, the SSH tunnels (readers need them for HTTP reads).
- **Sticky sessions** ensure a user's WebSocket connection sticks to one replica (reconnecting elsewhere works but drops subscriptions momentarily — minor UX hiccup, not data loss).

### Observability

Expose these paths to your monitoring:

**`GET /api/cluster/status`** (authenticated; shape stable):
```json
{
  "mode": "ha",
  "nodeId": "a3f2c-...",
  "role": "leader",
  "leaderSinceMs": 12345678,
  "heartbeatAgeMs": 4521,
  "leaderLockTtlMs": 30000,
  "heartbeatIntervalMs": 10000,
  "redisConnected": true
}
```

**`GET /api/health`** (unauthenticated, for load balancers):
```json
{ "status": "ok", "version": "7.0.0", "mode": "ha", "role": "leader", "nodeId": "a3f2c-..." }
```

**Prometheus metrics at `GET /api/metrics`:**
```
docker_dash_cluster_role{mode="ha",nodeId="..."} 1         # 1=leader, 2=reader
docker_dash_cluster_leader_age_seconds 12345
docker_dash_cluster_heartbeat_age_seconds 4
docker_dash_cluster_redis_connected 1
```

**Grafana alerts we recommend:**
- `docker_dash_cluster_heartbeat_age_seconds > 15` for 30s — leader hasn't heartbeated recently; partition or overload
- `docker_dash_cluster_redis_connected == 0` for 10s — Redis unreachable
- `sum(docker_dash_cluster_role == 1)` should always be `1` when your replica count ≥ 1 — **0 means no leader (split brain or partition), ≥2 means split brain**

---

## 2. Scenario: Leader crashes ungracefully

**What happens:**
1. Leader replica dies (OOM, node failure, `kill -9`).
2. Leader lock in Redis stays for up to `LEADER_TTL_MS = 30000` (30s).
3. Readers poll every `LEADER_HEARTBEAT_MS = 10000` (10s) — next poll after TTL expiry calls `SET NX PX` and wins.
4. New leader fires `onBecomeLeader` callbacks:
   - Starts Docker event streams
   - Starts git polling
   - Next cron tick runs on this replica (cron framework itself was running silently on all replicas; leader gate gates execution inside the wrapper)

**Worst-case failover time: ~30s + next cron tick.**

**Operator action:** None. Observe:
```
docker_dash_cluster_leader_age_seconds 0     # just elected
docker_dash_cluster_heartbeat_age_seconds 2  # should drop below 15
```

**What's lost during the ~30s window:**
- Cron jobs that were mid-flight on the dead leader (most are idempotent — next run fixes state)
- In-progress Docker events (replayed from Docker on next event-stream subscribe — Docker retains event history briefly)
- WS broadcasts originated by the dead leader (not retried by design — acceptable for notifications)

**What's not lost:**
- User sessions (DB-backed, visible to all replicas)
- HTTP requests (readers serve them)
- Rate-limit counters (Redis-backed)

---

## 3. Scenario: Rolling restart (planned)

**Goal:** Upgrade Docker Dash or restart replicas for maintenance without downtime.

**Procedure:**
1. Drain one replica at a time from the load balancer (stop sending new connections).
2. Wait for active WS sessions to close (or force-close after a grace period — users reconnect to another replica).
3. Stop the container. If it was the leader, it calls `cluster.shutdown()` which:
   - Cancels the leader-election heartbeat timer
   - Runs the Lua `DEL-if-owned` script → lock released immediately
   - Closes Redis subscriber + publisher connections
4. Another replica polls within 10s (usually much sooner — heartbeat interval is 10s, but any request that touches `isLeader()` forces a re-poll), acquires the lock, transitions to leader.
5. Start the new container with the updated image. It joins as reader.
6. Repeat for the next replica.

**Failover time during graceful shutdown: milliseconds to a few seconds.**

**Operator action:** Standard orchestrator drain (Kubernetes `preStop` hook, Docker Swarm `stop_grace_period: 30s`, etc.). Let `shutdown()` complete before `SIGKILL`.

**Recommended `preStop` / `stop_grace_period`:** 15 seconds. Gives the app time to release the lock + flush Redis subscriber queues.

---

## 4. Scenario: Redis dies

**What happens:**
1. Leader heartbeat fails → logs `Redis subscriber error` / `Redis error`.
2. Leader can't extend its lock → TTL expires after 30s → leader transitions to reader.
3. All replicas are now readers. **No cron runs.** Docker event streams stopped.
4. Rate limiter fails open (requests allowed with a warn log).
5. WS broadcasts are in-process-only (pub/sub offline).

**Degraded state — service still responds** but automation halts.

**Operator action:**
1. Restore Redis (restart, fix network, whatever's needed).
2. Replicas reconnect on next poll (within 10s of Redis being back).
3. One replica acquires the leader lock → `onBecomeLeader` fires → cron + event streams resume.

**Metrics to watch:**
```
docker_dash_cluster_redis_connected == 0       # triggers alert
docker_dash_cluster_heartbeat_age_seconds > 30 # heartbeat stalled
```

---

## 5. Scenario: Split-brain (network partition)

**What happens:**
A network partition isolates replicas from each other AND from Redis. If replicas are split such that ONE group can reach a Redis and the other group can reach a DIFFERENT Redis (misconfigured, rare but catastrophic), both halves elect leaders, both run cron independently, potentially corrupting shared state.

**Why this is our worst case:** SQLite is on a shared volume. Two leaders running `VACUUM` concurrently = DB corruption.

**Prevention (do NOT rely on post-hoc detection):**
- **Single Redis instance** (or Sentinel-backed with quorum) — never allow two replica groups to talk to different Redis writers.
- **Shared volume for SQLite** — every replica mounts the same Docker volume. Readers read, leader writes. A network partition can't split the volume without killing the underlying storage first (at which point the data is gone anyway).
- **Network design** — put all replicas + Redis in the same L2 or same AZ. Don't stretch HA mode across regions. For geographic HA, you need Postgres + read replicas, not Docker Dash's SQLite single-writer model.

**Detection (if it happens anyway):**
- Grafana alert `sum(docker_dash_cluster_role == 1) >= 2` for 30s — more than one leader.
- Audit log will show `leader-only` actions from multiple `nodeId`s within the same time window.

**Recovery:**
- Identify the "real" leader (the one that held the lock before the partition).
- Stop the rogue replica's container (`docker stop <container>`).
- It will re-acquire reader role when restarted.
- Audit SQLite for corruption: `sqlite3 /data/docker-dash.db "PRAGMA integrity_check"` (should return `ok`).

---

## 6. Scenario: Stuck leader (alive but unresponsive)

**What happens:**
A replica is still heartbeating to Redis but is otherwise broken (event loop stuck, DB locked, SSH tunnel pool exhausted). `SET XX PX` succeeds → lock stays. Readers never get a chance to take over.

**Detection:**
- `docker_dash_http_request_duration_ms / docker_dash_http_requests_total` ratio spikes on the leader node.
- HTTP health check passes (returns 200 with `role=leader`) but actual work doesn't progress — container list stays stale.
- Alerts: slow-request log (`> 2s`), cron job runs count stops incrementing.

**Operator action (manual failover):**
1. Confirm the leader is unresponsive (symptoms above).
2. `docker stop <leader-container>` — triggers graceful shutdown. Lock released.
3. Next reader poll (within 10s) acquires. Service recovers.
4. Alternatively, kill the leader lock directly from Redis:
   ```bash
   docker compose exec redis redis-cli DEL leader
   ```
   The stuck leader will NOT detect this (its `SET XX` at next heartbeat succeeds because it re-creates the key — but wait, the **current leader** still thinks it owns it; any other replica that reaches the NX path first between the DEL and the stuck leader's next heartbeat wins). This is a race. Prefer `docker stop`.

**Prevention:** 
- Set reasonable `preStop` grace period so SIGTERM → graceful shutdown is clean.
- Monitor DB lock contention (`sqlite3 <db> "PRAGMA busy_timeout"`).
- Long-running cron jobs (backup, VACUUM) should yield periodically — our current implementation does, but keep an eye on metrics.

---

## 7. Recovery checklist

After any failover event, verify:

- [ ] **Exactly one leader** — `curl $app/api/metrics | grep cluster_role` shows one `role 1`, rest `role 2`.
- [ ] **Heartbeat fresh** — `heartbeat_age_seconds < 15` on the leader.
- [ ] **Redis connected** — `redis_connected 1` on all replicas.
- [ ] **Last cron run recent** — check `docker_dash_background_job_runs_total{job="stats-aggregate-1m"}` should increment every 2 min.
- [ ] **SQLite integrity** — `sqlite3 /data/docker-dash.db "PRAGMA integrity_check"` returns `ok`.
- [ ] **No duplicate data** — spot-check `audit_log` for duplicate entries in the last hour (if split-brain occurred).
- [ ] **WS delivery verified** — open the UI on different replicas (via different sticky-session paths), perform an action on replica A, confirm replica B receives the WS event.

---

## 8. What NOT to do

- **Don't run multiple Redis instances without Sentinel/coordination.** Multiple Redis = multiple leader locks = multiple leaders = data corruption.
- **Don't bypass the load balancer** by hitting replicas directly for UI traffic. WS reconnects to a different replica on each connect break — confusing session state.
- **Don't mount different SQLite volumes per replica.** Shared volume (Docker named volume, NFS with locking disabled, or K8s `ReadWriteMany` with a compliant driver) is required. Different data per replica = you're not running HA, you're running N independent instances.
- **Don't scale up/down during active cron runs** (daily backup at 02:00, VACUUM at 03:30). Failover mid-VACUUM is safe (cron is killed, next leader re-runs), but unnecessary chaos.
- **Don't enable HA mode just because you can.** For self-hosted homelab / single-office deploys, standalone is the right default. HA adds operational complexity (Redis to monitor, LB to configure, failover procedures to rehearse).

---

## 9. Testing your HA setup before prod

Before going live:

1. Deploy on staging with `--profile ha` + `--scale app=3`.
2. Verify `/api/metrics` shows exactly one leader across the 3 replicas.
3. `docker stop <leader>` — watch a reader acquire within 30s (`heartbeat_age_seconds 0` on the new leader).
4. Start the stopped container — it rejoins as reader (`role 2`).
5. Repeat with each replica to verify symmetric behavior.
6. `docker stop redis` — watch cluster degrade to all readers + `redis_connected 0` alerts.
7. Start Redis — watch cluster recover within 10s.
8. Run a destructive test: force-kill the leader mid-cron (e.g. while `stats-aggregate-1m` is running). Verify the DB is intact and the next run on the new leader succeeds.

---

## See also

- [HA Mode reference](ha-mode.md) — architecture, trade-offs, when NOT to use
- [Sticky-session LB configs](ha-lb-configs.md) — Caddy, Traefik, HAProxy, nginx
- [Research](../../plans/research-ha-mode-optional.md) — original scoping + positioning
- [Deep-spec](../../plans/deep-spec-ha-mode.md) — architecture + phasing
