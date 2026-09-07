# training-config-guardrails

**Scope boundary:** the review-response edits that land inside
`config/training.ts` and its test — the single-session spike guardrail and the
long-run ladder reshape (F7, S6.1), deletion of the dead returning-from-rest cap
(F8), the readiness rebalance (F12), the quality-session budget and week 7 taper
number (F15), the designed-tense load docstring (F16), the swim slot times
(S6.7), and stable guardrail rule ids (S6.9). Does NOT cover: the mirrored spec
text in `docs/specs/02-load-engine.md` and `03-planner.md`, the
`docs/decisions.md` entries these changes owe, the `docs/ci-gates.md` rows, the
Stage 6 planner blocker in `PLAN-2026-001`, or any planner that will eventually
consume these values. Those live in other agents' partitions and are listed as
instructions in the handover.

**References:** `docs/reviews/2026-09-07-response-ledger.md` — the "Do now" table
and the detail sections for F7, F8, F12, F15, F16, S6.1, S6.7, S6.9; the ledger's
reasoning is authoritative over
`docs/reviews/2026-09-06-adversarial-review.md` where they differ, because it
verified against the branch and the review did not. Evidence relied on: Nielsen
2025 BJSM 59:1203 via Appendix B Q2 (trailing-30-day single-session axis),
Doherty 2020 and Filipas 2022 via Appendix B Q5 (quality-session count),
`tools/garmin_probe/CATALOGUE.md:20-25` (empty HRV and sleep over a seven-day
probe), `src/data/recent-activities.json` (30 runs, 2026-06-24 to 2026-09-05;
the 16.0 km of 22 August is the trailing-30-day longest at the 12 September
half), `docs/specs/03-planner.md:28` (negotiate-never-break).

**Alternative rejected:** (1) enforcing `singleSessionSpikePct` as a blocker —
rejected because the goal marathon is 128 % of the longest run that can precede
it under any constructible version of this block, so a hard cap refuses the race
it exists to serve; it is advisory, costed, overridable. (2) Reshaping the ladder
by cutting the peak long run instead of the 27 September step — rejected, F9
holds the longest run at ~32 km and the 21.1 → 30 km step is the larger breach
(142 % against the peak's 117 %). (3) Ratifying `returningFromRestRampCapPct`
rather than deleting it — rejected per the ledger: nothing reads it, the block's
one override already exceeds it, and asking Luis to ratify a number no code path
consumes spends a scarce decision on nothing. (4) A rules table for S6.9 —
rejected, the config already is the registry and a table is a second source of
truth plus a migration per number; the gap was emission, not storage. (5) An `id`
field on each guardrail — rejected because rules are not one-to-one with fields
(the weekly cap is three fields, the high-volume spread rule is two).

**Interface touched:** `config/training.ts` — `GUARDRAILS` loses
`returningFromRestRampCapPct` and gains `singleSessionSpikePct` and
`racesCountAsQualitySessions`; new exports `GUARDRAIL_RULE_IDS`,
`singleSessionSpikes()`, `qualitySessionCount()` and their types; `READINESS`
gains `objectiveCanOnlyDowngrade` and `hrv` and drops
`objectiveShareWhenAvailable` to 0.3; `AVAILABILITY` gains
`swimSlotStartLocal`/`swimSlotEndLocal`; `BLOCK_WEEKS` long runs go 20/30/35 →
22/27/33 with week 2's day plan re-summed to the same 60 km and week 7's
`targetKm` set. Consumers checked: `src/lib/block.ts` reads only `monday`,
`targetKm` and `week`; `src/app/page.tsx:137-144` reads `targetKm` and
`longRunKm`; `plannedTotalKm()` rises by week 7's new number, which is the
intended correction. No other file references the deleted or changed fields
(`rg 'returningFromRestRampCapPct|objectiveShareWhenAvailable' --type ts`).

**Acceptance criteria:**

- `GUARDRAILS.singleSessionSpikePct` is 110, documented as advisory-never-blocker
  with `LIVE_RACE_DATES` exempt, and `singleSessionSpikes()` computes it from the
  full series against the trailing-30-day longest.
- The gate is proven to bite: reintroducing the old 20/30/35 ladder flags
  27 September at 142 %, and the shipped 22/27/33 ladder flags it at ~123 %.
- Weekly totals are byte-identical before and after the reshape; week 2's day
  plan still sums to its 60 km target.
- `returningFromRestRampCapPct` is gone from the repo, and the week-2 override
  test asserts against `ACTIVE_RAMP_CAP_PCT` and the RATIFIED marker instead.
- `READINESS.objectiveShareWhenAvailable` is 0.3 with a test that fails above it;
  `objectiveCanOnlyDowngrade` is true and the `min()` formula is in the docstring.
- `qualitySessionCount()` counts a race against the budget; a synthetic peak week
  holding Lincoln plus a separate interval day exceeds
  `maxQualitySessionsPerWeekBuild`, and no real week does.
- Week 7 carries a `targetKm`, so the two-week taper is a checkable number.
- Every `GUARDRAILS` field is claimed by exactly one `GUARDRAIL_RULE_IDS` entry,
  asserted by test and by `satisfies`.
- All gates green: `npm run typecheck && npm run lint && npm run format:check &&
npm run test`, plus the three python guards.

**Assumptions:** (1) The ledger routes the spike threshold and the ladder reshape
to Luis under "Needs Luis" item 1; this task implements both at the
orchestrator's explicit direction, on the ledger's own recommendation, and the
values stay overridable — if Luis declines, the reshape reverts to 20/30/35 and
the guardrail keeps only its advisory role. (2) The swim slot's 20:00 start comes
from `PLAN-2026-001:158`, written under the superseded five-swim-evenings
premise; the end time is start + `swimSessionHours`. Both are marked PROVISIONAL
and the weekday is deliberately not guessed, because nothing records it.
(3) Week 7's 32 km excludes the 42.195 km race itself, consistent with its
`longRunKm: null` and the comment already there saying the marathon lives in
`RACES`.

---

## Checklist

- [x] `singleSessionSpikePct` plus `singleSessionSpikes()`, races exempt
- [x] Ladder reshaped to 22/27/33, weekly totals unchanged, week 2 days re-summed
- [x] Gate proven to bite on the reintroduced 142 % step
- [x] `returningFromRestRampCapPct` deleted, its test rewritten
- [x] Readiness: 0.3 share, veto-only flag with the formula, `hrv` shape block
- [x] Quality budget: races count, `qualitySessionCount()` plus test, week 7 target
- [x] `LOAD` docstring in the designed tense
- [x] Swim slot start and end captured in `AVAILABILITY`
- [x] `GUARDRAIL_RULE_IDS` with coverage enforced by `satisfies` and by test
- [x] All gates green

## Commits

- `fb2cb6f` fix(config): guardrail on the axis the evidence supports, and the spike it catches
