# the-stored-plan-is-real

**Scope boundary:** make the `sessions` table actually hold a plan, and hold the
right one. Covers: the bridge no longer gating the only writer of session rows,
the spanner repair being given a window that contains the day it repairs, and the
weekly rollover carrying the standing readiness gate. Explicitly does NOT cover:
making the app read those rows -- that is the other half of the same problem and
is its own task, because it needs a fallback path and a cross-surface test.

**References:** the 2026-09-13 planner audit, confirmed findings
`bridge-null-blocks-the-only-writer-of-sessions` (high),
`spanner-repaired-outside-its-own-window` (high) and
`rollover-silently-restores-a-downgraded-quality-session` (medium);
`docs/specs/05-integrations.md:49`; REDLINES.md rules 3 and 8.

**Alternative rejected:** seeding the `sessions` table. `src/db/seed.mts:15` says
outright that sessions are deliberately not seeded, and it is right -- REDLINES
rule 8 admits only the deterministic planner as an author of a session row. The
fix is to let the planner run, not to write rows around it.

**Interface touched:** `runDailyPass` control flow; `evaluateTriggers` return
shape; `applyTriggers` signature.

**Acceptance criteria:**

- With no bridge key at all, the pass still writes the rolling window, and still
  reports a failed pass with the ping withheld.
- A bridge outage mid-ingest does not suspend the planner either.
- The spanner give-back is proportional to the OVERSHOOT, and leaves exactly one
  row for the day it repaired.
- A gated quality session is not handed back by a rollover on a later pass.

**Assumptions:**

- A failed pass that nonetheless planned is still a failed pass. The alarm is
  about the integration, and degrading loudly while continuing to work is what
  spec invariant 2 asks for -- not going quiet.

---

## Checklist

- [x] bridge guard wraps only ingest and the watch push
- [x] repair span widened to the earliest date the trigger is about
- [x] rollover regenerates with the standing gate
- [x] 6 tests, 5 deliberate breakages all caught -- two survived the first pass
      and are why the next-day rollover test and the ordering mutation exist
- [ ] the app still reads none of this. Its own task.

## Commits

- `59cbe9a` fix(cron): let the planner write a plan, and repair the day it means to

---

## Follow-on, same session

The other half landed too: every surface now reads the stored plan through one
reader (`src/lib/plan.ts`), and the soreness rule stopped having two
implementations.

- [x] `prescribeWeek` takes stored rows and prefers them, config as fallback
- [x] `src/lib/plan.ts` -- one composition, read by `page.tsx` and
      `rocket_get_status`
- [x] `rocket_get_status` reports the prescription rather than bare rows
- [x] `demoteQualityFrom` is the single soreness rule;
      `PlacementOptions.soreness` deleted
- [x] cross-surface consistency test over a real MCP client
- [x] 11 tests, 5 deliberate breakages all caught

- `PENDING2` refactor(plan): one reader for every surface, one soreness rule
