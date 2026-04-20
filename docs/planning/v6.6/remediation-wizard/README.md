# Container Remediation Wizard — v6.6 Planning

> **Status:** Research done — brainstorm + feature spec pending (not yet started)
> **Target release:** v6.6
> **Prompted by:** user request 2026-04-20

Planning pipeline (per CLAUDE.md):

1. ✅ **Research** — `00-research.md` (~3500 words; competitive landscape, remediation catalog with 20 issues, UI pattern recommendation, scope decision, automation level, risk register, integration plan, v1 effort estimate)
2. ⏳ **Brainstorm** — to be written
3. ⏳ **Feature spec**
4. ⏳ **Deep spec** (if gnarly bits surface)
5. ⏳ **Assumption audit**
6. ⏳ **Preflight checklist + execution**
7. ⏳ **Implementation** (~16 solo days / ~9 parallelized)

## TL;DR from research

- 3-step wizard modal (scope → preview diff → apply or PR)
- Two entry points: container (from audit finding row) + stack (from stacks page)
- Automation Level 3+4 (dry-run + apply) with Level 2 (artifact) as escape hatch
- Git-PR mode first-class for git-backed stacks (reuses existing integration)
- 20-entry remediation catalog; only 4 are live-updatable (memory, CPU, pids, restart) — rest require container recreation
- Differentiator: nobody in OSS ships the full "scan → diff → apply or PR → verify → audit" loop

## Steal-from list (UI patterns)

- **Azure Defender "Fix" button** on each finding row
- **Snyk `/fix` slash-command** for bulk-apply
- **Docker Scout side-panel** with Recommended + Quick fixes hierarchy
- **Kubescape compatibility pre-check** before generating fix
- **Wiz workflow skeleton** (finding → plan → approve → apply → verify → log)

## Next step

Write `01-brainstorm.md` when ready to start. Until then, research report is the canonical source.
