# volume-block

**Scope boundary:** replace the conservative macro block with the aggressive
60/80/100/80/60 volume block Luis chose, encode the first per-day session layer,
raise the ramp cap to the mode actually in force, and correct the availability
model now that swimming is known to be 1x/week rather than five evenings.
Covers `config/training.ts`, its test, the decision log, the affected spec
lines, and the home-screen page if the config shape changed. Explicitly does
NOT cover: per-day authoring for weeks 3-7 (only week 2 is populated), any
planner or load-engine code, the Garmin harness, the Strava pipeline, or the
race list in `01-domain-model.md`.

**References:** Luis's instruction of 2026-09-06 ("lets go 60 80 100 80 60",
"WE NEED THE VOLUME if we get it in early we can taper right down"); deeper
Garmin history pulled through the rate-limit guard showing a spring block
(57.1 km week w/c 4 May with a 42.7 km long run); `docs/specs/03-planner.md:22-28`
for the guardrail-negotiation rule; `docs/decisions.md` 2026-09-06 for the
superseded 35/45/52/58 block.

**Alternative rejected:** the previous pass's 35/45/52/58 ramp peaking at
58 km, and the intermediate 42/58/75 proposal. Both rejected by Luis on the
grounds that his recorded ceiling reflects a light summer rather than his
capacity, and that volume is the thing this block is short of. Also rejected:
leaving `rampCapPct` at 15 % and marking every week as an exemption -- a
guardrail overridden every week is repealed in practice, and trains the athlete
to click through the one warning that might matter.

**Interface touched:** `BLOCK_WEEKS` gains `days` (the per-day layer) and
`minRunDays`; `GUARDRAILS` gains `aggressiveRampCapPct`, `rampMode`,
`highVolumeThresholdKm` and `minRunDaysAtHighVolume`; new exported
`ACTIVE_RAMP_CAP_PCT`, `CHECK_IN_GATES` and `AVAILABILITY`; `MEASURED_BASE`
gains the spring-block series. Consumers are `config/training.test.ts`,
`src/lib/block.ts` and `src/app/page.tsx`.

**Acceptance criteria:** the block reads 20/60/80/100/80/60 with long runs
20/30/35/26/18; exactly the steps exceeding `ACTIVE_RAMP_CAP_PCT` carry a
non-null `rampExemption` and no others; week 2's per-day distribution sums to
its weekly target; no week's long run exceeds its weekly total; every week at
or above `highVolumeThresholdKm` declares at least `minRunDaysAtHighVolume`
running days; the swim-frequency claim reads 1x/week in every spec that states
it; all seven gates green; the home-screen page still renders.

**Assumptions:** the directive's week-2 table row (long run 22 km) and its
per-day distribution (Sat 19 = 20 km, summing exactly to 60) conflict. Taken
the per-day figure as authoritative because it is internally consistent with
the weekly total, and flagged. Evening slots are now free four nights a week,
which makes 100 km materially more achievable, but availability is modelled by
the planner rather than this config, so the freed evenings are recorded as a
note and a constant rather than as a slot schedule.

---

## Checklist

- [x] task file written and frozen before work starts
- [x] `GUARDRAILS` gains the aggressive cap, mode, and high-volume day rule
- [x] `BLOCK_WEEKS` replaced with 20/60/80/100/80/60 plus long runs
- [x] week 2 per-day distribution encoded, summing to 60
- [x] `MEASURED_BASE` gains the spring block that justifies the ramp
- [x] `CHECK_IN_GATES` records the post-week-2 decision point as data
- [x] `AVAILABILITY` corrects swim frequency and records no cycling
- [x] spec swim-frequency claims corrected in four files
- [x] tests updated and each new assertion proven by deliberate breakage
- [x] decision-log entries appended, none edited
- [x] home-screen page renders the new shape (400 km planned, the 100 km week,
      and the RATIFIED exemption, confirmed against a running dev server)
- [x] six gates green; `format:check` red only on `tasks/dht-calendar-push.md`,
      a concurrent agent's uncommitted file. Every file in this commit passes
      `prettier --check` individually; not formatted under a live editor.

## Commits

(populated as work lands)
