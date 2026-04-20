# Preflight Results — Phase 1 Execution

**Date:** 2026-04-20
**Environment:** staging `192.168.13.20`, isolated containers `rem-preflight-*`
**Total time:** ~15 minutes
**Verdict:** 🟢 **GO for implementation**

---

## Summary

| Assumption | Status | Notes |
|---|---|---|
| **A1** — yaml round-trip preserves style | ⚠ PASS WITH CAVEAT | Modifying a service block reformats its inline comments (3 spaces → 1 space); non-modified blocks fully preserved. Acceptable — UI can de-emphasize whitespace-only diffs. |
| **A2** — `docker update` is live for all 4 flags | ✅ PASS | `StartedAt` identical before+after. PID 1 unchanged. Memory/CPU/PidsLimit/Restart all applied without restart. |
| **A3** — compose labels identify stack + service + file | ✅ PASS | All 4 expected labels present: `project`, `service`, `project.working_dir`, `project.config_files`. |
| **A7** — `--no-deps` isolates service recreation | ✅ PASS | DB container ID unchanged; web container ID changed. `depends_on` topo sort is viable. |
| **A5** — healthcheck coverage in popular images | ⏳ DEFERRED (non-blocker) | Test running in background; if low coverage, extend wait window to 60s. |
| A6, A10 — remote compose paths + SSH exec | 🕒 DEFER until remote host scenario | Not blocking local-first v1. Document restriction. |

---

## A1 — YAML round-trip (BLOCKER) — 15 min

**Test:** parse compose file with comments/mixed quotes → delete `privileged` from api → add `mem_limit` to db → stringify → diff.

**Result:** PASS with caveat.

```diff
- image: myapp/api:1.2.3   # pinned version      (3-space prefix)
- privileged: true
+ image: myapp/api:1.2.3 # pinned version        (1-space prefix — reformat)
  ...
+ mem_limit: 512m
```

The `privileged: true` deletion works cleanly. The `mem_limit` addition is clean. The **side effect**: the inline comment on the `api.image` line has its preceding whitespace normalized from 3 spaces to 1 space — the YAML library canonicalizes when re-serializing the parent (api) service block.

**Impact:** diff looks slightly noisier than hand-crafted. Acceptable for v1 — we'll de-emphasize whitespace-only hunks in the UI.

**Spec amendments:** none needed. Deep-spec `§2` already notes round-trip guarantees. Add a note that inline-comment spacing may normalize.

---

## A2 — `docker update` is live — 5 min

**Test:**
```bash
docker run -d --name rem-a2 nginx:alpine sleep 3600
docker update --memory 256m --memory-swap 256m --cpus 0.5 --pids-limit 100 --restart unless-stopped rem-a2
```

**Result:** PASS perfectly.
- `StartedAt` identical before and after
- `Memory`: 0 → 268435456 (256 MiB)
- `NanoCpus`: 0 → 500000000 (0.5 CPU)
- `PidsLimit`: none → 100
- `RestartPolicy`: `no` → `unless-stopped`
- PID 1 starttime unchanged

All 4 flags are genuinely live. Zero-downtime category in the catalog is safe.

---

## A3 — compose labels — 3 min

**Test:** inspect a live compose-managed container.

**Result:** PASS. Labels found:
```
com.docker.compose.project = rfq-manager-pro
com.docker.compose.service = frontend
com.docker.compose.project.working_dir = /home/localadmin-a/rfq-manager-pro
com.docker.compose.project.config_files = /home/localadmin-a/rfq-manager-pro/docker-compose.yml
```

`config_files` gives us the absolute path to the compose file directly — no need to resolve by combining working_dir + convention.

---

## A7 — `--no-deps` isolation — 5 min

**Test:** 2-service stack with `web depends_on [db]`. Recreate only `web` with `--no-deps`.

**Result:** PASS.
- `db` container ID: e843276a0f0d BEFORE = e843276a0f0d AFTER → UNTOUCHED ✓
- `web` container ID: b7dc636d2296 BEFORE ≠ 44efd46e1724 AFTER → RECREATED ✓

`docker compose up -d --no-deps --force-recreate <service>` isolates correctly. Topo-sort approach in `docker-runner.js` is sound.

---

## What's deferred (acceptable)

### A5 — healthcheck coverage in popular images

Test was started in background (pulling 10 images takes time). Non-blocker because:
- If coverage ≥50%: use healthcheck; fall back to `State.Running` check when missing
- If coverage <50%: extend wait window to 60s + add RestartCount delta check
- Either way, the rollback path still works

Will record actual coverage when the test completes and adjust the wait window in catalog entry metadata.

### A6 — remote compose paths (daemon's perspective)

Deferred to when we build the "Apply remote" mode. For v1, document:

> **v1 limitation:** Apply local + recreate mode only works for hostId=0 (local Docker). Remote hosts (multi-host via SSH) can use Git-PR mode + artifact download mode only.

If this becomes a user complaint, we extend `ssh-tunnel.js` with a file-read/write exec channel in v6.6.1.

### A10 — SSH exec channel

Same as A6 — not needed for local-first v1.

---

## Spec amendments

1. **`02-deep-spec.md §2`** — add note that inline-comment whitespace may normalize when modifying a service block. UI mitigation: render whitespace-only diff hunks in gray.
2. **`01-feature-spec.md §1`** — add non-goal: "Remote-host Apply mode (SSH-managed compose files) is v1.5+. v1 supports local host + Git-PR + artifact only."
3. **`01-feature-spec.md §10`** — adjust acceptance criterion #5: "Recreate fix triggers controlled restart with `depends_on` order honored" — test against a 2-service stack before expanding to complex cases.

---

## Effort delta

Original: ~19 days solo / ~11 parallelized.

Adjustments:
- Remote-host Apply deferred → **−3 days** (no SSH file ops needed for v1)
- YAML caveat UI work → **+0.5 days** (de-emphasize whitespace diffs)

**New estimate: ~16.5 days solo / ~9.5 parallelized.**

---

## Decision

🟢 **GO.** Start Session 1 (Migration 051 + catalog + service skeletons).

Architectural assumptions sound. Two blockers cleared (A1, A2). Remote-host limitation documented. Implementation can proceed as specced with the 3 minor amendments above.
