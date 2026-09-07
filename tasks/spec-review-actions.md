# spec-review-actions

**Scope boundary:** the nine spec-side actions the 2026-09-07 response ledger
assigns to `docs/specs/*.md` and `CLAUDE.md`, and nothing else. In: the write-tool
return contract and whole-window validation scope (F28/S6.4), the `rocket_` tool
prefix (F26), the goal-as-a-range corrections (F5/S6.6), the TSB/CTL trend-display
paragraph and the ramp-axis fix (F14), the 20:30 swim rule recorded as inert
(F13), the outbound intervals.icu event (F19/S6.2), the daily pass (S6.5), and
the trailing-14-day trend surfaced in `rocket_get_status` (S6.10). Explicitly NOT
in: `config/training.ts`, `docs/plans/PLAN-2026-001-m1-core-loop.md`,
`docs/decisions.md`, `REDLINES.md`, `docs/ci-gates.md`, `src/`, `tasks/` other
than this file -- every one of those is another agent's partition in this
worktree, and the ledger's own do-now table assigns them elsewhere. Where an item
has a spec half and a config half (F5's `planningBandSeconds` re-derivation, F14's
plan-line withdrawal, S6.10's Stage 6 implementation), only the spec half lands
here and the other half is reported as an instruction.

**References:** `docs/reviews/2026-09-07-response-ledger.md` -- the "Do now" table
rows F28/S6.4, F26, F5/S6.6, F14, F13, F19/S6.2, S6.5, S6.10, and each finding's
detail section including its "other side". The ledger is authoritative over
`docs/reviews/2026-09-06-adversarial-review.md` where they differ, because it
verified against the branch and the review did not. Also
`docs/specs/03-planner.md:23-29` for the negotiate-never-break pattern the write
contract has to serialise, and `config/training.ts` `PACE_ESTIMATES` and `RACES`
for the live goal band and the settling event.

**Alternative rejected:** writing the write-tool contract as prose beside the
existing "tools never dead-end" line rather than as a typed envelope. Rejected
because prose is not assertable: a refused write and a write that changed nothing
serialise to the same diff, and the failure mode is a model narrating that
ambiguity as success. A boolean fails a test; a sentence does not. Also rejected:
renaming the eleven tools only in `04-mcp-surface.md` as the ledger words it --
`03-planner.md` and `05-integrations.md` name four of them too, and a half-renamed
surface is worse than either state.

**Interface touched:** `docs/specs/04-mcp-surface.md` (all eleven tool names gain
`rocket_`; new write-contract and trend sections), `docs/specs/02-load-engine.md`
(ramp-axis line, trend-display paragraph, swim paragraph),
`docs/specs/05-integrations.md` (two new sections: the daily pass, outbound),
`docs/specs/06-training-block.md` (goal line, banner scope, athlete-baseline
band), `docs/specs/03-planner.md` and `07-wiring-todo.md` (tool-name references
only), `CLAUDE.md` (goal line). No code, no config, no schema. Nothing in `src/`
reads any of it yet, so every edit is free today and expensive after Stage 4.

**Acceptance criteria:**

- `04-mcp-surface.md` names eleven tools, all prefixed `rocket_`, and no
  unprefixed tool name survives anywhere in `docs/specs/` or `CLAUDE.md`.
- The write contract states the four return fields by name and states that
  validation scope is the whole rolling window on every write, `rocket_adjust_session`
  included, with the ten-locally-valid-calls failure named.
- `rocket_get_status` returns the goal band and the trailing-14-day trend.
- `02-load-engine.md` says the ramp guardrail input is weekly run km, matching
  `03-planner.md:24`, and says in terms that ATL/CTL/TSB gate nothing.
- `06-training-block.md` carries no goal number of its own: line 3 and the
  athlete-baseline line both point at `PACE_ESTIMATES.planningBandSeconds`, and
  Battersea 12 Sep -- not Lincoln -- is named as the settling event.
- `CLAUDE.md` no longer says "as fast as possible".
- `05-integrations.md` specifies the daily pass as four steps plus the outbound
  write, with the dead-man's switch, and bounds the outbound leg to one event.
- All seven gates green.

**Assumptions:** (1) the ledger's `06-training-block.md:3` and `:16` line numbers
predate the main merge -- the stale band is now at `:22`, inside the athlete
baseline, and `:16` is the second supersession banner. Corrected to the content
the ledger describes rather than the line numbers it cites. (2) `rocket_sync_now`
is treated as a write tool for the envelope's purposes, because an ingested
activity can fire the spanner trigger and move the window. (3) The outbound leg
assumes intervals.icu is the bridge, per the 2026-09-07 decision; if the direct
library ever becomes primary the endpoint changes and the section says so.

---

## Checklist

- [x] `rocket_` prefix across `04-mcp-surface.md` and every spec that names a tool
- [x] Write contract and whole-window validation scope in `04-mcp-surface.md`
- [x] Goal band and trailing-14-day trend on `rocket_get_status`
- [x] `02-load-engine.md`: ramp axis fixed, trend-display paragraph, swim paragraph
- [x] `05-integrations.md`: the daily pass and the outbound event
- [x] `06-training-block.md` and `CLAUDE.md` goal lines
- [x] Gates green

## Commits

- `4d456bb` docs(specs): write-tool contract, rocket_ prefix, and the goal as a range
