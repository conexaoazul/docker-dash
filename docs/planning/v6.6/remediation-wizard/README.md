# Container Remediation Wizard — v6.6 Planning

> **Status:** Planning complete — preflight pending → implementation
> **Target release:** v6.6.0
> **Prompted by:** user request 2026-04-20
> **Research-driven:** single Opus research agent informed all specs

## Planning pipeline (per CLAUDE.md)

| # | File | Status |
|---|---|---|
| 1 | [00-research.md](00-research.md) | ✅ done — ~3500 words, competitive landscape + 20-entry catalog + decisions |
| 2 | [01-feature-spec.md](01-feature-spec.md) | ✅ done — implementation contract |
| 3 | [02-deep-spec.md](02-deep-spec.md) | ✅ done — YAML round-trip, recreate ordering, rollback |
| 4 | [03-assumption-audit.md](03-assumption-audit.md) | ✅ done — 12 risky assumptions, 4 marked as blockers |
| 5 | [04-preflight.md](04-preflight.md) | ✅ done — 4-5h validation plan |
| 6 | Preflight execution | ⏳ next |
| 7 | Session 1: catalog + service skeletons | ⏳ |
| 8 | Session 2: routes + WebSocket progress | ⏳ |
| 9 | Session 3: wizard UI + diff renderer | ⏳ |
| 10 | Session 4: Git-PR mode + tests + docs + release | ⏳ |

## TL;DR

3-step modal wizard in System / Security / Stacks pages. User picks findings → sees YAML diff + CLI commands → chooses **apply live+recreate** / **open Git PR** / **download artifact**. 20-entry catalog covers all current CIS findings + top Secrets Audit findings. Only 4 of 20 fixes are live-updatable; rest require recreation with `depends_on` order + health check + 60s auto-rollback window.

## Key decisions (ratified in research)

| Decision | Value |
|---|---|
| Scope | Unified wizard, 2 entry points (container or stack) |
| Automation level | L3 (preview) + L4 (apply with confirm); L2 (artifact) escape hatch |
| Bonus tier | Git-PR mode first-class for git-backed stacks |
| UI pattern | 3-step modal (reuses Secrets/LE Wizard convention) |
| Catalog size | 20 entries in v1 |
| YAML library | `yaml` (eemeli/yaml) — preserves comments/style |
| Rollback window | 60s after apply → "Rollback" button visible |
| Snapshot storage | Full `docker inspect` gzipped, in SQLite TEXT |

## Effort estimate (from feature-spec §11)

**~19 days solo / ~11 parallelized** (catalog + service vs UI + routes tracks)

## Risk register (ranked)

From `03-assumption-audit.md`:

| # | Risk | Blocker? |
|---|---|---|
| A1 | YAML round-trip doesn't preserve style → diff is noisy | YES |
| A2 | `docker update` not actually live | Partial |
| A6 | Remote compose paths unusable | Partial |
| A1+A6 | Both fail together | Forces re-architecture |

## Next steps

1. Execute Phase 1 of `04-preflight.md` (~2 hours on staging)
2. Update this README with preflight results
3. Apply any spec amendments from findings
4. Start Session 1 (migration 051 + catalog + service skeletons)

## Steal-from list (UI patterns from research)

- **Azure Defender "Fix" button** on each finding row
- **Snyk `/fix` slash-command** for bulk-apply
- **Docker Scout side-panel** with Recommended + Quick fixes hierarchy
- **Kubescape compatibility pre-check** before generating fix
- **Wiz workflow skeleton** (finding → plan → approve → apply → verify → log)
