# macro-replan

**Scope boundary:** replace the seed macro layer with one re-derived from
measured Garmin history, and record the shoe inventory now that the daily
trainer is bought. Covers `config/training.ts`, its test, the decision log, and
the stale dates in the plan and the training-block spec. Explicitly does NOT
cover: per-day session authoring (the config holds weekly totals and long runs
only), any load-engine or planner code, the Garmin harness, or the Strava
pipeline.

**References:** Garmin probe output of 2026-09-06 (`tools/garmin_probe/out/`,
gitignored); `docs/specs/03-planner.md:22-28` for the guardrails;
`docs/specs/06-training-block.md` for the superseded block;
`docs/decisions.md` 2026-08-15 for the original ramp-cap contradiction.

**Alternative rejected:** keeping the seed block and adjusting only its dates.
Rejected because its 65 km peak is unreachable inside the ramp cap from a
2026-09-07 start, and its week-1 premise (a forced-recovery week after a trail
run) describes a situation that has been overtaken by a holiday interruption.
Also rejected: raising `rampCapPct` so the new table passes cleanly -- that
hides three real breaches behind a changed threshold.

**Interface touched:** `SEED_WEEKS` renamed to `BLOCK_WEEKS` with two new
fields (`longRunKm`, `rampExemption`); `PRE_BLOCK_BASELINE_KM` replaced by
`MEASURED_BASE`; `SHOES` gains `inventory`; new `PACE_ESTIMATES`. Consumers are
`config/training.test.ts` and three references in
`docs/plans/PLAN-2026-001-m1-core-loop.md`.

**Acceptance criteria:** every week-over-week step that exceeds
`GUARDRAILS.rampCapPct` carries a non-null `rampExemption`, and no exemption
exists without a corresponding breach -- both directions asserted, both proven
to fail on a deliberate violation. All seven repo gates green. No file
belonging to another in-flight agent staged.

**Assumptions:** the weekly volumes were aggregated from Garmin's
recent-activities list and count running and treadmill running only, excluding
hiking. The 34.8 km pre-taper baseline is the last normal training week
(w/c 17 Aug) rather than a multi-week average, which the holiday would drag
down. Both are recorded in `MEASURED_BASE` so a future reader can disagree with
the choice rather than re-derive it.

---

## Checklist

- [x] Ramp arithmetic computed before writing anything; three breaches found
- [x] `BLOCK_WEEKS` written with long runs and explicit ramp exemptions
- [x] `MEASURED_BASE` and `PACE_ESTIMATES` added; guessed baseline removed
- [x] `SHOES.inventory` added; daily trainer flagged new for the novelty term
- [x] Tests rewritten; 25 pass
- [x] Three deliberate violations proven to fail the suite, then reverted
- [x] Four decision-log entries appended, including the correction entry
- [x] `07-wiring-todo.md` shoe item closed; `06-training-block.md` superseded
- [x] Plan clock corrected to 48 days and `BLOCK_WEEKS` renamed

## Commits

- `758a2dc` docs: re-derive the macro block from measured Garmin history
