# rocket

An adaptive marathon training planner for one runner.

The primary interface is conversation: Claude reads and writes plan state through
MCP tools. A thin PWA renders the calendar and a 30-second daily check-in. The
system plans an aggressive but guarded block, absorbs real-world disruption, and
re-plans continuously from Garmin metrics plus subjective feedback.

## Non-negotiable invariants

1. **Guardrails beat enthusiasm.** Requests that violate ramp-rate, recovery or
   taper rules are negotiated, never silently executed.
2. **Degrade gracefully.** Every feature must work on cached data and manual
   check-ins alone. Garmin is an upgrade, not a dependency.
3. **The plan is a rolling window.** Only 7-10 days of concrete sessions exist at
   once; replanning must be cheap.
4. **Every actual activity updates load state**, however it arrived.
5. **Context tags matter.** Surface, elevation and footwear change training
   stress for the same distance. Never score on distance alone.

## Where to start

- `docs/specs/` — the source of truth, eight files
- `REDLINES.md` — non-negotiables, and what happens when one is violated
- `AGENTS.md` — operating rules for anyone, human or agent, working here
- `docs/decisions.md` — append-only decision log
- `docs/ci-gates.md` — every gate this project should have, built or not

## Engineering discipline

Adapted from [discipline-kit](https://github.com/LuisDee). Two ideas carry most
of the weight:

- **A gate you have not proven fails is a decoration.** When a gate is added, it
  is broken on purpose, watched to catch, reverted, and the violation recorded in
  its ledger row.
- **A gate you cannot build yet is a `NOT IMPLEMENTED` row, never a silence.**

Every commit carries a `Task: tasks/<slug>.md` trailer, enforced fails-closed on
pre-push. Nothing runs on `git commit`.

## Licence

MIT.
