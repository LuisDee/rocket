# rocket — adaptive marathon training planner

Personal training-planning system for Luis. Goal race: **Battersea Park Marathon, 24 Oct 2026**. The goal is a time _range_, held in `config/training.ts` `PACE_ESTIMATES.planningBandSeconds` and settled by the Battersea Park Half of 12 Sep 2026 -- not a single target, and not "as fast as possible", which was retired as a planning input on 2026-09-07. MCP-first: the primary interface is conversation with Claude, which reads/writes plan state through MCP tools. A thin PWA (saved to iOS home screen) renders the calendar and daily check-in. Architecture is deliberately simple: one web server, one datastore, MCP endpoint, PWA frontend. Do not gold-plate infrastructure.

## Read these before writing any code

- `docs/specs/00-overview.md` — system concept and principles
- `docs/specs/01-domain-model.md` — entities and state
- `docs/specs/02-load-engine.md` — training stress, ATL/CTL/TSB, readiness
- `docs/specs/03-planner.md` — macro/micro planning, replan triggers, guardrails
- `docs/specs/04-mcp-surface.md` — tool contracts (the product's real API)
- `docs/specs/05-integrations.md` — Garmin, DoHardThings, routr, work calendar
- `docs/specs/06-training-block.md` — the actual Battersea block (business logic fixture)
- `docs/specs/07-wiring-todo.md` — external dependencies to wire, in order

## Non-negotiable invariants

1. **Guardrails beat enthusiasm.** User requests that violate ramp-rate, recovery, or taper rules are negotiated, never silently executed. The planner may propose a compliant alternative.
2. **Degrade gracefully.** Garmin sync is unofficial and will break without warning. Every feature must function on cached data + manual check-ins alone.
3. **The plan is a rolling window.** Only ~7–10 days of concrete sessions exist at any time. Macro layer holds weekly load targets only. Replanning must be cheap.
4. **Every actual activity updates load state**, whether it arrived via Garmin sync or manual log, and whether it was planned or a spanner.
5. **Context tags matter.** Surface, elevation, and footwear materially change training stress for the same distance/pace. Never score on distance alone.

## Conventions

- Specs in `docs/specs/` are the source of truth. If implementation must diverge, update the spec in the same MR.
- Prefer boring, readable code over clever code. This is a single-user system.
- All dates/times Europe/London.
