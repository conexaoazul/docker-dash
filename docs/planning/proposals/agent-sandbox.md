# Proposal — Agent Sandbox for Docker Dash

**Status:** Proposal · 2026-04-20
**Trigger:** [MS DevBlogs — GitHub Copilot + microVMs via Docker Sandbox](https://devblogs.microsoft.com/all-things-azure/best-of-both-worlds-for-agentic-refactoring-github-copilot-microvms-via-docker-sandbox/)
**Target release:** candidate for v6.6 or v6.7 (after v6.5 LE Wizard ships)
**Decision needed:** spec it or pass

---

## What Microsoft just shipped

`docker sandbox run copilot ~/my-app` spawns a **microVM** (hypervisor-isolated) with:
- A **private Docker daemon** (no host socket mount)
- **Bidirectional workspace sync** preserving absolute paths host↔guest
- **HTTP/HTTPS filtering proxy**: whitelist (npm, PyPI), deny-all for local network + cloud metadata endpoints (AWS IMDS, Azure IMDS)
- **GitHub Copilot agent** running in "YOLO mode" — no permission prompts, because the sandbox enforces the boundary

Use case: legacy refactoring at fleet scale. MS claims **~60% more PRs merged** by autonomous agents vs. ones requiring human approval.

---

## What we CAN'T replicate 1:1

| Their thing | Why we can't copy it |
|---|---|
| MicroVM isolation (Firecracker/Kata-class) | Requires specialized base image + KVM access on host. Out of scope for our small-Node-app architecture. |
| GitHub Copilot agent | Proprietary, paid Microsoft service. |
| Path-preserving bidirectional sync | This is mostly bind-mount magic — doable, but Windows host paths (`C:\...`) can't appear unchanged in a Linux guest. |
| `docker sandbox run` Docker subcommand | This is a Docker Engine extension, not OSS yet (preview/limited). |

If we tried to build microVM-grade isolation, we'd be **months** into infrastructure work for marginal gain. Wrong fight.

---

## What we CAN take — the IDEAS

The article exposes three valuable patterns that fit Docker Dash:

### 1. Agent-friendly sandbox primitive

A button in Docker Dash that says "Spawn a coding-agent sandbox" → user picks workspace (git repo URL or existing path), picks agent (Aider, OpenHands, GPT Engineer, Claude Code, custom), picks TTL, hits go.

We already have:
- ✅ **Sandbox containers with TTL** (existing feature, see `_renderSandboxes` in containers UI)
- ✅ **Stacks deploy from Git repos** (workspace cloning + auth)
- ✅ **WebSocket-based live output streaming** (used for logs, exec)
- ✅ **Hash-chained audit log** (records everything the sandbox does in Docker)
- ✅ **Templates system** (preset sandbox configs)
- ✅ **Secrets vault** (agent API keys: OpenAI, Anthropic, GH token)

What's NEW:
- 🆕 Docker-in-Docker (DinD) so agent has a private docker daemon (or a more secure approach: socket-proxy with restricted API surface)
- 🆕 Outbound network filter (whitelist registries, deny RFC1918 + IMDS endpoints)
- 🆕 Agent runner (Dockerfile templates for popular agents)
- 🆕 UI to choose agent + watch live

### 2. Outbound traffic filtering as a security feature

Useful even outside agents. Many users want "this container should only reach Docker Hub + GitHub + npm registry, nothing else." Common compliance ask.

Implementation:
- Sidecar `mitmproxy` or `squid` container per sandbox
- Container's `HTTP_PROXY`/`HTTPS_PROXY` env points at sidecar
- Iptables rule: drop direct outbound except to sidecar
- Whitelist configured in UI (textarea of allowed hostnames/regexes)
- Deny by default for: 169.254.169.254 (AWS/GCP IMDS), 100.100.100.200 (Alibaba IMDS), RFC1918 ranges except docker bridge

Could ship as **standalone feature** independently of Agent Sandbox.

### 3. Hash-chained audit log → Agent Action Log

Our hash-chained audit log already records every Docker action a user takes in our UI. Extend it: when a sandbox/agent runs, ALL container/image/network operations from inside the sandbox get streamed back and logged with the agent's identity.

Result: a human-auditable, cryptographically-verifiable record of "what did the agent do." Stronger compliance story than "we wrapped some prompts."

This is the **biggest differentiator** — MS describes their isolation model but doesn't talk about audit/replay. We have it built.

---

## Proposed feature: "Agent Sandbox" (codename `dd-asbx`)

### One-line pitch

> **A safe place to let AI coding agents loose on your code, with private Docker daemon, network filter, and a hash-chained audit log of every action they take — built on Docker Dash's existing sandbox infrastructure.**

### Scope (MVP)

**v0.1 — single agent, single workspace, basic isolation:**
1. New page: System → Tools → **Agent Sandbox**
2. Form: workspace (git URL or existing volume), agent (dropdown: Aider, OpenHands, custom Dockerfile), TTL, secrets to inject, optional Git push target
3. On submit: spawn 2 containers in a dedicated bridge network:
   - **agent**: Docker image with chosen agent runtime + workspace mounted + `DOCKER_HOST=tcp://dind:2375`
   - **dind**: `docker:dind` providing a private daemon ONLY accessible to `agent`
4. Optional 3rd container (toggleable): **net-filter** sidecar (mitmproxy with whitelist rules)
5. Live log panel via WebSocket (already implemented for container logs)
6. "Stop & cleanup" button + auto-cleanup on TTL expiry
7. Every Docker action from the inner daemon proxied through Docker Dash's audit logger

**v0.2 — fleet:**
- Spawn multiple agents in parallel against multiple repos
- Compare outputs (diff PRs)
- Aggregated audit view

**v0.3 — review workflow:**
- Agent's diffs surfaced in Docker Dash UI
- One-click "approve and PR" or "reject"
- Audit chain links agent action → human decision

### What this is NOT

- ❌ Not microVM-isolated (it's Docker-isolated; weaker than MS but still meaningful)
- ❌ Not a Copilot replacement (we BYO agent — Aider, OpenHands, Claude Code via API, etc.)
- ❌ Not a CI/CD system (just sandbox; integrate with existing CI separately)
- ❌ Not a multi-tenant SaaS (single Docker Dash instance, single org, like the rest of us)

### Differentiator matrix

| Capability | MS Docker Sandbox + Copilot | OpenHands cloud | Our proposal |
|---|---|---|---|
| Open source | ❌ | ✅ | ✅ |
| Self-hosted | ❌ | ⚠ (server avail) | ✅ |
| Agent choice (BYO) | ❌ Copilot only | Their stack | ✅ any container |
| MicroVM isolation | ✅ | ❌ | ❌ (Docker only) |
| Audit log of actions | ❌ | ❌ | ✅ hash-chained |
| Outbound network filter | ✅ | ❌ | ✅ |
| Free | ❌ | freemium | ✅ MIT |
| Single-container install | ❌ | ❌ | ✅ |

We win clearly on: **open + self-hosted + audit + multi-agent**. We lose on: **isolation grade**.

That's a defensible position. The audience that picks "isolation grade > everything else" was always going to use a microVM provider; we're not chasing them.

### Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| Docker-in-Docker is escapable in some configs | **HIGH** | Use rootless DinD, drop capabilities, no `--privileged`, verified seccomp profile, document the trade-off explicitly. Add later: optional opt-in to gVisor runtime if user has it installed. |
| Agent burns API credits in a runaway loop | MEDIUM | TTL + per-sandbox API call counter (intercept at proxy) + max-cost env var |
| Agent leaks repo credentials via outbound | MEDIUM | Network filter denies non-whitelisted hosts; secrets injected ephemerally, not persisted |
| "AI hype" perception alienates serious-ops users | LOW-MED | Position as "controlled execution sandbox," demo with a real refactor, not a chatbot demo |
| Maintenance burden if agent ecosystem moves fast | MED | Provide BASE Dockerfile + 3 reference agent images; community maintains the rest |
| Compliance teams reject DinD on principle | MED | Document that the inner daemon is isolated to the sandbox bridge network with no host access; offer socket-proxy alternative as opt-in |

### Effort estimate

If undertaken as a v6.6 or v6.7 feature, ballpark:

| Phase | Hours |
|---|---|
| Brainstorm + spec set (like LE Wizard) | 8 |
| Migration: `agent_sandboxes`, `sandbox_actions` tables | 2 |
| Backend: DinD spawn orchestrator + cleanup cron | 6 |
| Backend: net-filter sidecar (mitmproxy config templating) | 4 |
| Backend: agent action proxy → audit log integration | 6 |
| 3 reference agent Dockerfiles (Aider, OpenHands, custom) | 4 |
| UI: launcher form + live log + diff viewer | 10 |
| Tests | 4 |
| Docs (built-in How-To) | 3 |
| **Total** | **~47h base, ~60h with buffer** |

Larger than LE Wizard (45h), smaller than the Secrets Lifecycle suite (was ~37h × 4 phases).

---

## My recommendation: 3 options ordered by ambition

### Option A — Pass for now

LE Wizard (v6.5) just got specced and not yet implemented. v6.6 should focus on closing v6.4 audit P1 deferrals: ldapts migration, Redis-backed rate limit, retroactive migration `down()`s, i18n key gaps. Then revisit Agent Sandbox in v6.7+.

**Pros:** focus, no shiny-object syndrome
**Cons:** misses a market window where "agentic dev" is hot

### Option B — Ship the sub-features now, the agent veneer later

Build the **outbound network filter** (item #2 above) as a v6.6 feature on its own. Useful for compliance, no AI association needed. Then the Agent Sandbox in v6.7 reuses this as a building block.

**Pros:** smaller commits, builds toward Agent Sandbox without committing to it
**Cons:** moderate effort still, may get reordered

### Option C — Full Agent Sandbox spec for v6.7

Treat Agent Sandbox as a flagship v6.7 feature. Run the full pipeline (brainstorm → assumption audit → feature spec → deep spec → preflight) like we did for LE Wizard. Ships ~3 months out.

**Pros:** strongest differentiation, captures "AI ops" narrative
**Cons:** scope creep risk, requires LLM-API testing infra, may distract from hardening work

### My pick: B

**Reasons:**
1. v6.5 LE Wizard is the next thing to ship — keep that focused
2. v6.6 should be "boring hardening" (close P1 deferrals from v6.4 audit) + **one** new feature: outbound network filter
3. The network filter is useful on its own (compliance), works as a building block for agent sandbox later
4. v6.7 can then be the full Agent Sandbox if user demand is real
5. Avoids us looking like we chase every Microsoft launch

**If you'd rather Option C (full Agent Sandbox v6.7 spec):** I can write the brainstorm + assumption audit immediately. Same pipeline as LE Wizard.

---

## Quick win — Tactical addition to v6.5 LE Wizard

Independent of the Agent Sandbox decision, the article reminds me: the LE Wizard's **DNS-01 credential validation** flow could include a **whitelist-style network policy** for Caddy when issuing certs.

Specifically: if user provides a Cloudflare token, Caddy's outbound during ACME issuance should only need to reach `api.cloudflare.com` + `acme-v02.api.letsencrypt.org`. We could lock Caddy down with that whitelist while issuing.

Defer to v6.5.1 unless trivial. Just noting it.

---

## Decision request

**Pick one:**
- A (pass for now, revisit v6.7+)
- B (network filter as v6.6, full sandbox v6.7)  ← recommended
- C (full Agent Sandbox v6.7 spec starts now)

If B or C, I'll start the appropriate planning artifacts immediately.
