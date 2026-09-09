# garmin-export-backfill

**Scope boundary:** load the Garmin GDPR bulk export's activity history into
`activities`, and replace the warm-start seed with a cold start now that a real
series exists. Covers: the export's `summarizedActivities.json` only, its unit
conversions, dedupe against rows the intervals.icu bridge already wrote, and the
`LOAD.seed` change with the tests that assert the old contract. Explicitly does
NOT cover: the other nine domains in the export (daily wellness summaries, sleep,
readiness, running tolerance, race predictions, biometrics, courses, raw FIT
files, personal records) -- those were mined on 2026-09-08 and their findings are
recorded, but ingesting any of them is separate work. Also not covered: the
dual-source bridge that would stop intervals.icu and Garmin describing the same
run with two different load models.

**References:** `docs/specs/02-load-engine.md` (rolling load state);
`PLAN-2026-001-m1-core-loop.md:472`, which named 2026-09-14 as the cut line for
the seed if the export had not arrived; REDLINES.md rules 2 (append-only), 4 (CTL
warm-up disclosure) and 7 (coverage travels with the number).

**Alternative rejected:** keeping the warm start and merely correcting its
magnitude by dividing Garmin's pair by seven. Rejected because the divisor is an
empirical median (7.2 for acute, 8.9 for chronic, over 269 overlapping days), not
a defined conversion -- Garmin does not document either figure's window, and the
two ratios differing by 24 % is evidence they are not one rescaling. With 165
days of real history the seed is unnecessary rather than merely imprecise, and an
unnecessary borrowed number is one more thing to be wrong later.

Also rejected: deduping on `garmin_activity_id` alone. The bridge's rows carry
`icu:<id>` with that column NULL, so the clause would not have fired and
2026-09-05 would have been inserted twice.

**Interface touched:** `config/training.ts` (`LOAD.seed`), `src/domain/load.ts`
(the module contract and the `caveat` wording), the `activities` table (54 new
rows), and `package.json` (`db:backfill`). New: `src/lib/garmin-export.ts`,
`src/db/backfill-garmin.mts`.

**Acceptance criteria:**

- `npm run db:backfill -- <summarizedActivities.json>` is idempotent: a second
  run inserts nothing.
- No activity appears twice. `count(*) = count(distinct start_time_local)` on
  `activities`.
- `rollingLoad` over the live table returns `warmingUp: false` and a null caveat
  for today, with `coverage.days > 42`.
- Every unit conversion is proven by a deliberate breakage that the suite
  catches, recorded below.
- The tests that asserted the warm-start contract are rewritten to assert the
  cold-start one, not deleted.

**Assumptions:**

- `start_time_local` is unique per athlete. True across all 57 rows now in the
  table, and two activities cannot begin in the same second on one device.
- Garmin's `activityTrainingLoad` is a per-activity figure on a consistent scale
  across the whole export. Supported by the daily sums tracking
  `dailyTrainingLoadAcute` at a stable ratio; not independently documented.
- The two 2026-09-05 rows keep intervals.icu's load model (78 for the day against
  Garmin's 144.3) because `activities` is append-only and they were written
  first. Two days out of 165 carry a foreign basis. Recorded rather than fixed,
  because fixing it means the dual-source bridge.

---

## Checklist

- [x] export downloaded and unpacked (link expires 2026-09-11 21:50Z)
- [x] units established from the data, not from documentation: cm, ms, cm/ms
- [x] `garmin-export.ts` mapper plus 18 tests
- [x] 8 deliberate breakages, all caught (speed factor, distance, duration,
      elevation, cadence, null-defaulting, id prefix, unplaceable rows)
- [x] dedupe on `start_time_local`, 4 tests, both mutations caught
- [x] 54 of 56 activities backfilled; 2 correctly skipped as bridge duplicates
- [x] `LOAD.seed` cold-started; `load.ts` contract and caveat rewritten
- [x] `load.test.ts` and `daily-pass.test.ts` rewritten to the new contract
- [x] `docs/decisions.md` entry for the seed unit error, and a second for the two foreign-basis days
- [x] `docs/ci-gates.md` row, proven by restoring the old seed (1 test red on values alone, 2 with `asOf`)
- [x] `calories` is kilojoules -- mapper fixed, 2 tests, mutation caught; the 54
      rows already written keep kJ, recorded in docs/decisions.md
- [x] checked all 56 activities for distance overrides: exactly one
      (2026-09-05 treadmill, 10.00 km stored against 7.49 km measured), and the
      dedupe had already skipped it, so the backfill wrote no wrong distances

## Follow-up landed 2026-09-09

Luis's answers to the three questions the export could not settle: the 100 km
peak is ratified with a reversal condition, the half is raced flat out, and the
May gap was chosen rest. All three are now in `config/training.ts` rather than in
a chat log, because each one inverts an inference a reader would otherwise make
from the data alone.

## Follow-up landed 2026-09-09 (part two)

The dashboard showed five runs after 54 were backfilled, because `recentRuns`
read only the crop queue. Fixed, and fixing it surfaced a second import defect:
`start_time_local` is an hour late in every backfilled row. Both recorded in
`docs/decisions.md`; the mapper no longer does it.

## Commits

- `db32c7d` feat(load): backfill the Garmin history and cold-start CTL, fixing a 7x seed error
- `2d34007` fix(garmin): calories is kilojoules, and one treadmill distance is an override
- `73ee784` docs(config): record Luis's three calls -- 100 km stands, half is raced, May gap was chosen
- `37cf161` fix(dashboard): show every run once, from the training log rather than the crop queue
