# Preflight Checklist — Container Remediation Wizard

**Status:** Draft v1 · 2026-04-20
**Companion:** `03-assumption-audit.md`

Gate between "we have a plan" and "we can write production code". Same pattern as v6.5 LE Wizard preflight.

**Estimated total time:** 4-5 hours.

---

## Phase 0 — environment readiness (~10 min)

- [ ] Staging server (`192.168.13.20`) accessible over SSH
- [ ] Test compose stacks running (at least one with `depends_on` for topo-order validation)
- [ ] `docker-dash` container running v6.5.0 (baseline to test against)
- [ ] Temp workspace `/tmp/remediation-preflight/` writable

---

## Phase 1 — load-bearing validations (~2 hours)

### ⚠ A1 — `yaml` npm round-trip preserves comments + style (15 min) [BLOCKER]

```bash
cd /tmp/remediation-preflight
cat > sample-compose.yml <<'EOF'
# Production stack for myapp
version: "3.8"

services:
  # API service
  api:
    image: myapp/api:1.2.3   # pinned version
    privileged: true
    environment:
      - DB_HOST=db
      - 'DB_PASS=plaintext-bad'
    depends_on:
      - db

  db:
    image: postgres:16-alpine
    # No resource limits for now
    volumes:
      - db-data:/var/lib/postgresql/data

volumes:
  db-data:
EOF

cat > test-yaml.js <<'EOF'
const fs = require('fs');
const YAML = require('yaml');
const src = fs.readFileSync('sample-compose.yml', 'utf8');
const doc = YAML.parseDocument(src);
// Mutation: remove privileged from api service
const api = doc.get(['services', 'api']);
api.delete('privileged');
// Mutation: add mem_limit to db
doc.get(['services', 'db']).set('mem_limit', '512m');
const out = String(doc);
fs.writeFileSync('sample-compose.modified.yml', out);
console.log(out);
EOF

npm install yaml --no-save
node test-yaml.js
diff sample-compose.yml sample-compose.modified.yml
```

**Pass criteria:** Only 3 lines different:
- `privileged: true` removed
- `mem_limit: 512m` added near db service
- Comments, quotes, and blank lines preserved

**Fail = architecture change** — see `03-assumption-audit.md` fallback.

---

### ⚠ A2 — `docker update` is truly live for all 4 flags (30 min)

```bash
# Spin up test container
ssh localadmin-a@192.168.13.20 "docker run -d --name rem-preflight-a2 nginx:alpine sleep 3600"

# Record pre-values
ssh localadmin-a@192.168.13.20 "docker inspect rem-preflight-a2 --format '{{.Id}} {{.State.StartedAt}} {{.HostConfig.Memory}} {{.HostConfig.NanoCpus}} {{.HostConfig.PidsLimit}} {{.HostConfig.RestartPolicy.Name}}'"

# Apply all 4 live updates
ssh localadmin-a@192.168.13.20 "docker update --memory 256m --memory-swap 256m --cpus 0.5 --pids-limit 100 --restart unless-stopped rem-preflight-a2"

# Verify: StartedAt unchanged (no restart), values updated
ssh localadmin-a@192.168.13.20 "docker inspect rem-preflight-a2 --format '{{.Id}} {{.State.StartedAt}} {{.HostConfig.Memory}} {{.HostConfig.NanoCpus}} {{.HostConfig.PidsLimit}} {{.HostConfig.RestartPolicy.Name}}'"

# Cleanup
ssh localadmin-a@192.168.13.20 "docker rm -f rem-preflight-a2"
```

**Pass criteria:** `StartedAt` same BEFORE and AFTER. All 4 values reflect the new limits.

**Per-flag fallback:** if any flag triggers restart, mark that catalog entry as `liveUpdatable: false`.

---

### A3 — compose labels identify stack + service + file path (15 min)

```bash
ssh localadmin-a@192.168.13.20 "docker ps --filter label=com.docker.compose.project --format '{{.Names}}' | head -1 | xargs -I {} docker inspect {} --format '{{json .Config.Labels}}' | python -m json.tool | grep -i compose"
```

**Pass criteria:** Output includes:
- `com.docker.compose.project`
- `com.docker.compose.service`
- `com.docker.compose.project.working_dir`
- `com.docker.compose.project.config_files`

---

### ⚠ A6 — remote compose paths are from daemon's perspective (15 min)

On a remote host (e.g., host 2 or 4 on staging's multi-host setup):

```bash
# Deploy a tiny test stack
ssh <remote> "mkdir -p /tmp/rem-a6 && cat > /tmp/rem-a6/docker-compose.yml <<EOF
services:
  nginx:
    image: nginx:alpine
EOF
cd /tmp/rem-a6 && docker compose up -d"

# From Docker Dash's local perspective, inspect via multi-host tunnel
# (Use the docker-dash UI or `docker --context`)
ssh localadmin-a@192.168.13.20 "docker --context remote-host inspect rem-a6-nginx-1 --format '{{index .Config.Labels \"com.docker.compose.project.working_dir\"}}'"
```

**Pass criteria:** Output = `/tmp/rem-a6` (the remote path). Confirms labels are from daemon's perspective.

**If pass:** for remote stacks, we must read/write compose files OVER SSH (A10 validation).

---

### A10 — SSH tunnel supports exec channel for file ops (15 min)

```bash
# In Docker Dash codebase, verify ssh-tunnel.js has exec:
grep -n "client.exec\|\\.exec(" src/services/ssh-tunnel.js

# Manually test if we can cat/echo a file via existing SSH infra
# (Requires looking at how ssh-tunnel.js exposes this — may need to extend)
```

**Pass criteria:** `ssh-tunnel.js` has an exec channel or we can extend it trivially with `ssh2`'s `conn.exec()`.

**Fallback:** Restrict Apply mode to local host (hostId=0). Remote hosts get Git-PR + artifact only.

---

### A5 — healthcheck coverage in popular images (30 min)

```bash
for img in nginx:alpine postgres:16 redis:7 mysql:8 mongo:7 node:20-alpine python:3.12-alpine php:8-apache ruby:3-alpine wordpress grafana/grafana prom/prometheus traefik:3 caddy:2-alpine; do
  docker pull -q $img >/dev/null 2>&1
  hc=$(docker image inspect $img --format '{{.Config.Healthcheck}}')
  echo "$img: ${hc:-NONE}"
done
```

**Measure:** count how many have healthcheck defined. Target ≥50%.

**Fallback:** Extend wait window to 60s + use `State.Running` + RestartCount delta when healthcheck absent.

---

### A7 — `--no-deps` isolates service recreation (15 min)

```bash
ssh localadmin-a@192.168.13.20 "mkdir -p /tmp/rem-a7 && cat > /tmp/rem-a7/docker-compose.yml <<EOF
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_PASSWORD: test
  web:
    image: nginx:alpine
    depends_on: [db]
EOF
cd /tmp/rem-a7 && docker compose up -d && sleep 3 && \
echo '=== BEFORE ===' && docker inspect rem-a7-db-1 --format 'db-id={{.Id}}' && docker inspect rem-a7-web-1 --format 'web-id={{.Id}}' && \
echo '=== Recreating web with --no-deps ===' && docker compose up -d --no-deps --force-recreate web && sleep 2 && \
echo '=== AFTER ===' && docker inspect rem-a7-db-1 --format 'db-id={{.Id}}' && docker inspect rem-a7-web-1 --format 'web-id={{.Id}}' && \
cd / && rm -rf /tmp/rem-a7 && docker rm -f rem-a7-db-1 rem-a7-web-1 2>/dev/null"
```

**Pass criteria:** `db-id` IDENTICAL before + after. `web-id` DIFFERENT. Proves `--no-deps` isolates.

---

## Phase 2 — non-blocking investigations (~1.5 hours)

### A8 — git auto-pull semantics (documentation check, 5 min)

```bash
grep -A 20 "pull\|pullRepository" src/services/gitPolling.js | head -30
```

Confirm it's fast-forward pull (`git pull --ff-only` or equivalent) → local commits would be overwritten.

### A9 — catalog coverage on real staging data (15 min)

```bash
# After implementing catalog, run against staging CIS + secrets-audit output
curl -s http://localhost:8101/api/system/cis-benchmark -H "Authorization: Bearer $TOKEN" | jq '.findings[] | .code // .id // .msg'
curl -s http://localhost:8101/api/system/secrets-audit -H "Authorization: Bearer $TOKEN" | jq '.containers[] | .issues[] | .message'

# Count how many have a catalog entry (manual or via JS script)
```

Target: ≥80% coverage.

### A11 — snapshot size (5 min)

```bash
ssh localadmin-a@192.168.13.20 "docker inspect docker-dash | gzip -c | wc -c"
```

Target: <50KB gzipped. Fits in SQLite TEXT easily.

### A12 — YAML parse on diverse compose files (15 min)

Collect 10 compose files from: awesome-compose, linuxserver, nextcloud-docker, vaultwarden, plex, traefik-example, portainer-compose, grafana, nginx-proxy-manager, uptime-kuma. Parse each:

```bash
for f in compose-*.yml; do
  node -e "require('yaml').parseDocument(require('fs').readFileSync('$f', 'utf8'))" && echo "$f: OK" || echo "$f: FAIL"
done
```

---

## Phase 3 — spec sign-off (~30 min)

After Phase 1 + Phase 2 done:

- [ ] Update `03-assumption-audit.md` with findings (pass/fail per assumption)
- [ ] Update `01-feature-spec.md` if any spec changes resulting from preflight
- [ ] Update `02-deep-spec.md` if implementation details changed
- [ ] Self-review spec for consistency
- [ ] Commit all planning updates

---

## Phase 4 — working environment setup (~30 min)

- [ ] Branch `feat/remediation-wizard` cut from main
- [ ] Add `yaml` to `package.json` dependencies
- [ ] `npm install` + verify build
- [ ] Calendar block for Session 1 (Migration 051 + catalog + service skeletons)

---

## Phase 5 — kickoff

Once all above green:

- Session 1 start: `05-session-1-catalog.md` (check off as we go)
- Or jump straight into code with this spec as the contract

---

## Decision gate

✅ **GO** — all P0 validations pass (A1 + A2 in particular); P1s pass or have documented fallbacks
⚠ **GO with scope cut** — A1 fails → switch to text-patching, catalog restricted
❌ **NO-GO** — A1 AND A6 both fail → re-architect; consider "artifact only" v1

---

## Stop conditions (mid-implementation)

Halt and re-plan if any of these become true during coding:

- `yaml` library behaves differently at scale than in A1 sample
- `docker update` triggers restart on our test containers despite A2 passing (e.g., on older Docker versions)
- `--no-deps` doesn't actually isolate (compose version matters)
- Rollback snapshot size blows past 500KB for real containers
- Estimated effort balloons >50% past plan (currently 11-19 days)
