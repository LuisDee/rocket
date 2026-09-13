# race-week-taper-shape

**Scope boundary:** give the days before the goal marathon a shape. Covers: a
per-day ceiling on planner-chosen easy volume derived from proximity to race
day, `minRunDays` being read as the floor it is named as, and a guardrail that
catches a session breaching the run-in however it got there. Explicitly does NOT
cover: changing any ratified weekly volume or long-run distance in
`BLOCK_WEEKS`, nor tapering into the two tune-up races -- week 5 deliberately
carries 80 km of MIDWEEK volume and a ramp applied to every race would gut it.

**References:** `docs/research/training-evidence-quantified.json`
`ranking.rankedInterventions[3]` -- the taper, evidence grade A-, Bosquet 2007
(27 controlled studies) converging with Smyth & Lawlor 2021 (158,117
recreational marathoners). Two claims are load-bearing: "nothing longer than
~13 km inside the last 14 days", and "intensity and running frequency held".
`config/training.ts` GUARDRAILS, BLOCK_WEEKS week 7;
`src/domain/planner/placement.ts` `distribute`, `chooseRestDates`.

**Alternative rejected:** hand-writing week 7's `days` array, the way week 2
already does. Rejected twice over: `planWeek` never reads `days` (it is dead
config), and a hand-written week is the static plan Luis explicitly asked not to
be given -- "you set of 20+ agents i expected you to build the infrastructure
that dynamicslly makes training plans". A ceiling regenerates; a literal does
not.

**Interface touched:** `GUARDRAILS.raceRunIn` and `raceRunInCeilingKm()` in
`config/training.ts`; `distribute`/`planWeek` in `placement.ts`; a new
`race-run-in` rule id and its evaluator in `guardrails.ts`.

**Acceptance criteria:**

- No planner-chosen easy run inside the final fortnight exceeds the ceiling for
  its distance from race day, and the run-in descends day by day.
- The two days before the marathon carry runs rather than rest: frequency held.
- Weeks the run-in does not reach are byte-identical to before.
- The guardrail reports a breach it cannot prevent -- a ratified long run, or an
  athlete's own edit -- as advisory, named and costed, never as a blocker.

**Assumptions:**

- A long run or race distance chosen by the macro layer is not the planner's to
  shrink. Week 6's ratified 18 km on 2026-10-18 is six days out and over the
  fortnight ceiling; it is surfaced as an advisory breach rather than quietly
  cut. Flagged for Luis rather than decided here.

---

## Checklist

- [x] run-in ceilings in config, traced to the research claim they encode
- [x] `distribute` caps the DAY, not each slot -- a morning plus an evening is
      the same 16 km split in two
- [x] `minRunDays` read as a floor: the week opens days rather than cramming
- [x] `race-run-in` guardrail, advisory, with the marathon itself exempt
- [x] 9 tests, 7 deliberate breakages all caught
- [ ] put the week 6 / 18 km advisory breach to Luis

## Commits

- `297c641` fix(planner): give the run-in to the marathon a shape
