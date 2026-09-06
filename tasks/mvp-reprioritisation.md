# mvp-reprioritisation

**Scope boundary:** reorder the M1 stages so guardrail negotiation ships before
the load engine, and record the MVP explicitly. Covers: moving the planner and
replan stages ahead of the stress cascade and load-state stages in
`docs/plans/PLAN-2026-001-m1-core-loop.md`, adding an MVP section naming the
two-component load model as a deliberate deferral, cutting the first schema to
five tables, adding the two hard deadlines, and recording the currently-absent
Garmin and Strava access. Explicitly does NOT cover: any code, schema,
migration, or the G1 probe itself. Documents only.

**References:** `docs/specs/00-overview.md` (the two acceptance loops),
`03-planner.md:22-28` (the hard guardrails), `06-training-block.md` and
`config/training.ts` `SEED_WEEKS` (the macro layer, already authored),
`docs/decisions.md` 2026-08-18 (the Garmin entries this builds on).

**Alternative rejected:** leaving the load engine ahead of the guardrails, on
the assumption that guardrails need load state. They do not: three of the four
hard guardrails read distance and the schedule only, and the fourth reads the
check-in. Keeping the original order would have put the project's actual
differentiator — a coach that argues back — behind three stages of unvalidated
load modelling, against a 67-day clock. Also rejected: deleting the
two-component model outright rather than deferring it with a named revisit
trigger; it is the spec's stated intent and the divergence data that would
justify or kill it does not exist yet.

**Interface touched:** none. `docs/plans/PLAN-2026-001-m1-core-loop.md`,
`docs/decisions.md`, and this task file. No source, no schema.

**Acceptance criteria:**

- Stages read 6 = planner/guardrails, 7 = replan/negotiation, 8 = stress
  cascade, 9 = load state; every `Depends on` points backwards and no stage
  references a higher-numbered one except as an explicit forward deferral.
- No dangling stage cross-reference anywhere in the file, including the skills
  table, assumptions, pre-mortem, checklist and Phase 4 todos.
- The MVP is stated in one sentence, and the two-component deferral carries a
  named trigger for revisiting rather than reading as scope-cutting.
- Stage 1 creates five tables, with append-only guards on `activities` and
  `check_ins` in the first migration.
- All seven gates green on the committed state.

**Assumptions:**

- Open question 3 (the returning-from-rest ramp rule) still blocks the planner
  stage; moving it earlier makes that answer more urgent, not less.
- Garmin's own readiness and acute/chronic pair are an adequate stand-in while
  the two-component model is deferred. Unverified until G1 returns — if the
  probe takes Branch A and the bridge does not relay them, this assumption
  fails and the deferral should be revisited sooner.

---

## Checklist

- [x] Reorder the four stage blocks
- [x] Fix every stage cross-reference
- [x] Add the MVP and deferral section
- [x] Cut Stage 1 to five tables
- [x] Add the two hard deadlines to the clock line
- [x] Record the absent Garmin/Strava access
- [x] Append the decision entry
- [x] Gates green, committed

## Commits

(populated as work lands)
