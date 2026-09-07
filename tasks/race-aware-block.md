# race-aware-block

**Scope boundary:** make races first-class data in `config/training.ts`, and
reshape the peak fortnight so no long or quality session lands on a live race
date. Covers `RACES`, long-session dates on every `BLOCK_WEEKS` entry, the
Lincoln and LDNX constructions, a regression test, the two stale specs, and a
decision entry. Does NOT cover: the planner that will eventually consume
`RACES`, the `rocket_import_race` seam, per-day plans for weeks other than the
one that already has them, or anything in `~/dev/DoHardThings`.

**References:** `docs/reviews/2026-09-06-adversarial-review.md` F6 (three races
missing from the re-derived macro layer) and its section 8 Q1; Luis's
ratification 2026-09-07 (Dorney dropped, Lincoln and LDNX still on, goal derived
from the 12 Sep half as a range); `docs/specs/01-domain-model.md:7-11` for the
original race roles; `docs/specs/03-planner.md:28` for the negotiate-never-break
guardrail pattern.

**Alternative rejected:** moving the long runs to the Saturdays before each race.
Rejected because it stacks a 30 km+ run the day before a half and the day before
a 10K, which is the same collision moved by 24 hours. Also rejected: dropping the
peak long run entirely, which would leave the block with no run over 30 km.

**Interface touched:** `BLOCK_WEEKS` gains `longRunDate` and `longRunOnRace`;
new exported `RACES`. Both additive — `src/lib/block.ts` reads only `monday`,
`targetKm` and `week`; `src/app/page.tsx:142` reads `longRunKm`. Neither breaks.

**Acceptance criteria:**

- `RACES` carries all four fixtures with date, name, distance, role and
  droppable, including Dorney as `dropped` with its ratification date.
- Every `BLOCK_WEEKS` entry with a long session carries the date of that session.
- No long or quality session falls on a live race date unless the week declares
  that race as the carrier of the session.
- A test proves the above and fails when a long run is placed on 4 October.
- `docs/specs/01-domain-model.md` no longer claims all four races are
  `droppable=false`; `06-training-block.md` is marked superseded.
- All seven gates green; the home-screen page still renders.

**Assumptions:** Lincoln is run at marathon pace rather than raced flat out —
this is the construction's load-bearing condition and is reversible. It restores
the role Luis's own spec originally gave Lincoln ("rehearsal — marathon pace,
confirms goal pace"), so it is a return to intent. If he races it hard, week 4's
structure changes and the 100 km target should come down; recorded as such.

---

## Checklist

- [ ] `RACES` added with all four fixtures
- [ ] Long-session dates on every week; weeks 4 and 5 reshaped onto the races
- [ ] Regression test proving no session lands on a live race date
- [ ] Specs corrected
- [ ] Decision entry appended, including the DoHardThings attendance gap
- [ ] Gates green, page renders

## Commits

(populated as work lands)
