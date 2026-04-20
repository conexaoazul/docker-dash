# Assumption Audit — Container Remediation Wizard

**Status:** Draft v1 · 2026-04-20
**Companion:** `00-research.md` · `01-feature-spec.md` · `02-deep-spec.md`

Load-bearing assumptions in the plan, with cheap validations. Same discipline as the v6.5 LE Wizard preflight — catch surprises BEFORE code starts.

---

## A1. `yaml` npm package preserves comments + style through parse/modify/stringify ⚠ BLOCKER

**Claim:** `YAML.parseDocument(text)` → mutate AST → `String(doc)` produces output where only the lines we touched changed.

**Risk if wrong:** Every compose diff rewrites the whole file (reformats quotes, removes comments, renormalizes indentation). Output diff becomes "200 lines changed" instead of "3 lines changed". Catastrophic UX.

**Validation (15 min):**
Test against a real-world compose file with comments, mixed quote styles, anchors/aliases, and multi-line strings. Parse → modify one key → stringify → diff vs original. Should show only the modified lines.

**Fallback if wrong:** Use naive text-based line patching (regex find/replace on `  key:` patterns). Works for trivial cases but breaks on complex YAML. Scope-down v1 to "simple compose files only" with a warning badge.

---

## A2. `docker update --memory` / `--cpus` / `--pids-limit` / `--restart` are live (zero downtime) and reliable on our supported platforms ⚠

**Claim:** These 4 docker update flags change container config without restart.

**Risk if wrong:** "Live-updatable" category collapses to empty; every fix requires recreation. UX still works but the "zero downtime" selling point evaporates.

**Validation (30 min):**
On staging, pick a running container. Run each of the 4 commands with values different from current; verify:
- Command exits 0
- `docker inspect` reflects new value
- Container `State.Running === true` before AND after (no restart)
- `uptime` inside the container unchanged (no PID 1 restart)

**Fallback if wrong (per-command):** Mark that fix as `liveUpdatable: false` → falls through to recreate path. No spec change.

---

## A3. `docker inspect` with compose labels reliably identifies stack + service

**Claim:** Every compose-managed container has:
- `Config.Labels['com.docker.compose.project']` → stack name
- `Config.Labels['com.docker.compose.service']` → service name
- `Config.Labels['com.docker.compose.project.working_dir']` → directory with compose file
- `Config.Labels['com.docker.compose.project.config_files']` → comma-separated list of compose files

**Risk if wrong:** Can't locate the compose file to diff. Wizard falls back to "orphan mode" even for compose-managed containers.

**Validation (10 min):**
On staging: `docker inspect <compose-managed-container> | jq '.Config.Labels | with_entries(select(.key | startswith("com.docker.compose")))'`

Verify all 4 labels present. If `config_files` is missing, check how compose < v2.0 labels containers (might use single `config_file`).

**Fallback if wrong:** Ask user to point at the compose file via UI; slower flow but works.

---

## A4. The existing `services/git.js` has primitives we can extend for push + PR creation

**Claim:** `simple-git` (v3.27.0) is already in deps and supports branch/commit/push. GitHub/GitLab/Gitea APIs are callable via existing `https` module.

**Risk if wrong:** Git-PR mode needs more infra than estimated; Session 5 slips.

**Validation (20 min):**
- `grep "simple-git" src/services/git.js` — confirm it's imported and used
- Check `git_credentials` schema — does it have a `provider_type` field (GitHub/GitLab/Gitea)?
- Test PR creation against a personal Gitea instance (or skip for v1 — just push branch, let user open PR)

**Fallback if wrong:** v1 ships "push branch only"; PR creation is a v2 enhancement.

---

## A5. Container health-check wait is reliable across our supported image universe

**Claim:** Most production images define `HEALTHCHECK` in their Dockerfile OR we can fall back to `State.Running` + RestartCount delta check.

**Risk if wrong:** Auto-rollback triggers false positives (container is actually healthy, we just didn't wait long enough) → user frustration.

**Validation (30 min):**
- Sample 20 popular Docker Hub images (nginx, postgres, redis, mysql, mongo, node, python, php, ruby, wordpress, nextcloud, plex, jellyfin, vaultwarden, grafana, prometheus, traefik, caddy, portainer, uptime-kuma)
- Check if they have `HEALTHCHECK` defined
- Compute coverage %

**Fallback:** If <50% have healthchecks, reduce our "health OK" confidence → extend wait window to 60s (from 30s) before declaring unhealthy. Also offer opt-in "apply without auto-rollback" mode for advanced users.

---

## A6. Compose file paths in container labels are absolute paths from the Docker daemon's perspective, NOT from Docker Dash's

**Claim:** `com.docker.compose.project.working_dir` is the daemon's view. For LOCAL hostId=0 this is the same as ours. For SSH-tunneled remote hosts, paths refer to the REMOTE filesystem.

**Risk if wrong:** We read/write a compose file at `/home/user/app/docker-compose.yml` but on remote host the file is elsewhere → fail or (worse) modify wrong file.

**Validation (15 min):**
On a remote SSH host, spin up a test compose stack in `/tmp/test-stack/`, inspect → verify label points to `/tmp/test-stack/` (the remote path, not local).

**Fallback:** For remote hosts, read/write compose files over SSH (reuse `ssh-tunnel.js` to `cat` / `echo` the files). More complex but correct. Spec already has this path (apply-ssh mode).

---

## A7. `docker compose up -d --no-deps <service>` recreates ONLY that service without touching dependencies

**Claim:** `--no-deps` = "Don't start linked services". Used in recreate loop to control order.

**Risk if wrong:** Compose recreates the whole stack anyway → our topo sort is meaningless → unpredictable order.

**Validation (15 min):**
On staging: test stack with `web depends_on [api, db]`. Run `docker compose up -d --no-deps web` → verify `api` and `db` containers are untouched (same container IDs before and after).

**Fallback:** Use `docker container rm -f + docker container run` directly, bypassing compose. Maintains order but loses compose semantics (env vars, networks recomputed).

---

## A8. Compose file is the source of truth for git-backed stacks — we never write it for them

**Claim:** For stacks with `git_repo_id IS NOT NULL`, the compose file on disk is a cached pull; the next webhook auto-pull will overwrite any local edit.

**Risk if wrong:** User applies locally, the fix works, then auto-pull 5 minutes later silently reverts the fix. Silent regression.

**Validation (none — logical, not empirical):** Grep `services/gitPolling.js` for pull semantics. Confirm it does `git pull` (fast-forward) → local commits get rebased away.

**Spec consequence:** For git-backed stacks, the "Apply local + recreate" mode shows a BLOCKING warning: "This stack is managed from Git. Your local change will be overwritten by the next webhook pull. Use 'Open PR' mode instead."

---

## A9. Our 20-entry catalog covers >80% of findings in a typical deploy

**Claim:** The catalog entries map to the CIS Docker Benchmark's container-runtime items (C-1 through C-12) plus the top Secrets Audit findings. Together they cover 80%+ of what users will actually remediate.

**Risk if wrong:** Users hit "no catalog entry for this finding" too often → feels incomplete.

**Validation (15 min):**
On staging: run CIS + Secrets Audit on all ~30+ running containers. Count:
- Total findings
- Findings with a matching catalog `code`
- Coverage %

**Fallback:** Expand catalog. Each entry is ~30 LOC.

---

## A10. Multi-host SSH tunnel supports file read/write, not just Docker API

**Claim:** For remote-host compose files, we can read/write them via the SSH tunnel's `exec` channel (e.g., `cat /path/to/compose.yml` + `cat > /path/to/compose.yml`).

**Risk if wrong:** Git-backed stacks on remote hosts are unusable for Apply mode (only Git-PR mode works).

**Validation (15 min):**
`grep "exec" src/services/ssh-tunnel.js` — confirm it has an exec channel, not just a TCP forward for the Docker socket.

**Fallback:** Restrict "Apply local + recreate" to hostId=0 (local only). Remote hosts only get Git-PR + artifact modes. Acceptable limitation.

---

## A11. Rollback snapshot + SQLite TEXT column: no size issues

**Claim:** Gzipped `docker inspect` JSON is <50KB per container. Stored in `remediation_jobs.pre_apply_snapshot` (SQLite TEXT). For a stack of 20 containers, 20 × 50KB = 1MB. Fine.

**Risk if wrong:** DB bloat.

**Validation (5 min):** Inspect a busy container; gzip the JSON; measure.

**Fallback:** Store snapshots on disk in `/data/remediation-snapshots/<jobId>/<container>.json.gz`; only reference path in DB.

---

## A12. User's existing compose files parse cleanly with `yaml` npm package

**Claim:** Real-world compose files (v2, v3, v3.8+, extensions) all parse without errors.

**Risk if wrong:** Some valid compose syntax trips our parser → can't remediate those stacks.

**Validation (15 min):**
Collect 10 compose files from public projects (awesome-compose, linuxserver, nextcloud-docker, etc.). Parse each with `YAML.parseDocument()`. Count failures.

**Fallback:** For un-parseable files, skip compose-based fixes; offer live updates + artifact download only.

---

## Summary — validation priorities

| Assumption | Effort | Blocker if false? | Priority |
|---|---|---|---|
| **A1** — `yaml` preserves style | 15m | **YES** (architecture) | 🔴 P0 |
| **A2** — `docker update` is live | 30m | NO (falls back to recreate) | 🟡 P1 |
| **A6** — Remote compose paths | 15m | Partial (limits remote stacks) | 🟡 P1 |
| **A8** — Git stacks auto-pull semantics | 5m (logical) | Documentation only | 🟢 P2 |
| A3, A4, A5, A7, A9, A10, A11, A12 | ~2h total | Various mitigations | 🟢 P2 |

**Total preflight time: ~4-5 hours.** Run A1, A2, A6 first — they're the ones that could force scope changes.

---

## Go/no-go decision

✅ **GO** if A1 passes (YAML round-trip works) AND A2 passes for ≥2 of the 4 live-update commands.
⚠ **GO with scope reduction** if A1 fails — switch to text-patching, restrict catalog to fixes that don't require style preservation.
❌ **NO-GO** if A1 AND A6 both fail — spec needs re-design, likely shift to pure artifact-download mode for v1.
