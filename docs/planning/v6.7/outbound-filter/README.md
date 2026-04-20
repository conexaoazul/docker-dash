# v6.7 — Outbound Network Filter (enforcement)

**Status:** Planning · 2026-04-20
**Predecessor:** v6.6.2 Egress Audit (read-only) — `src/services/egress-audit.js`
**Source proposal:** [`docs/planning/proposals/agent-sandbox.md`](../../proposals/agent-sandbox.md)

## What this milestone ships

Turn the v6.6.2 audit from **visibility** into **enforcement**. Users pick a container or stack, define a hostname allowlist (e.g. `docker.io, registry.npmjs.org, *.github.com`), and Docker Dash ensures anything outside that allowlist is blocked — including implicit IMDS access at `169.254.169.254`.

## Why this, why now

- v6.6.2 tells users **what containers can reach** — the natural next question is *"can I stop this one from reaching that?"*
- One clear compliance win: **block IMDS by default**. Most cloud breakouts go through `169.254.169.254`.
- No OSS Docker-dashboard competitor ships this. It's a real differentiator.

## Documents in this folder

| File | Scope | Audience |
|---|---|---|
| `01-feature-spec.md` | Contract: what users do, what they see, out-of-scope | Product sign-off |
| `02-deep-spec.md` | Hard technical decisions with alternatives | Implementation |

Earlier pipeline stages (research, brainstorm) collapse into the feature-spec — the proposal already did the exploratory work.

## Rough effort estimate

**2-3 days** of implementation across 2-3 sessions:
- Session 1 (~6h): Sidecar image + iptables wiring + backend policy model + DB migration
- Session 2 (~6h): UI (whitelist editor, per-container attach, block-log viewer)
- Session 3 (~4h): Testing matrix, docs, How-To, release

## Decision gate before implementation

The **Mechanism** decision in `02-deep-spec.md` (§1) is the highest-stakes one. Read that first. If the choice there doesn't match the project's operational model, everything else changes.
