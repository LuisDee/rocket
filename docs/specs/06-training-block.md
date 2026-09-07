# 06 — The Battersea block (seed data / business fixture)

Goal: Battersea Park Marathon, 2026-10-24. The goal time is a **range**, not a
target, and the live value is `config/training.ts` `PACE_ESTIMATES.planningBandSeconds`
-- derived from a rehearsal result rather than chosen in advance. "As fast as
possible" was retired as a planning input on 2026-09-07: it is not something a
planner can place sessions against.

> **SUPERSEDED 2026-09-06 as to dates, volumes and the athlete baseline.** The block below was
> authored against a 2026-08-10 start and a training history that did not
> happen -- a holiday interrupted weeks commencing 24 and 31 Aug. The live
> macro layer is `config/training.ts` `BLOCK_WEEKS`, re-derived from measured
> Garmin history: a 2026-09-07 start, 48 days to race day, a tune-up half on
> 2026-09-12, four build weeks and two taper weeks. The *intent* below still
> holds -- phases, guardrails, shoe policy, and deriving marathon pace from a
> rehearsal result rather than guessing it. See docs/decisions.md 2026-09-06.
>
> **Further superseded 2026-09-07 as to races and the goal.** Dorney is dropped;
> Lincoln and LDNX stand and now carry their weeks' long sessions rather than
> competing with them. The goal band below (~3:25-3:35) is retired: the band is
> `PACE_ESTIMATES.planningBandSeconds` and it settles on the **Battersea Park
> Half of 2026-09-12**, not on Lincoln. Live race data is `config/training.ts`
> `RACES`.

## Athlete baseline (2026-08-10)
- Recent weekly volume ~30km (relaxed, out of a previous block). Longest recent: 33km trail/600m on 2026-08-09 → severe DOMS (eccentric downhill load + new Peregrines + uneven surface; three novel stressors). Prior week: 30km road @5:00/km in carbons, felt easy.
- Goal band: `config/training.ts` `PACE_ESTIMATES.planningBandSeconds`. The settling event is the **Battersea Park Half on 2026-09-12**, not Lincoln -- Lincoln's role has changed twice and it is now a marathon-pace rehearsal, while the September half took the pace-setting job. Re-derive the band from that result with the 2.11-2.15 recreational half-to-marathon multiplier rather than the Garmin-implied 1.135 Riegel exponent, and record it as a decision. The planner reads the band; it never reads a number written here.
- Rarely injured historically. Swim: learning front crawl, one 2-hour session per week. No cycling.

## Phase plan (macro layer seed)
| Wk | Dates (Mon) | Phase | Run km target | Notes |
|----|-------------|-------|---------------|-------|
| 1 | 10 Aug | forced recovery | ~20 easy | DOMS week. Easy-or-nothing; swim freely; quality gated on stairs-test. |
| 2 | 17 Aug | rebuild | ~40 | Re-establish rhythm; no quality yet. |
| 3 | 24 Aug | build | ~45 | 1 quality + 1 long. |
| 4 | 31 Aug | build | ~50 | |
| 5 | 7 Sep | build | ~55 | |
| 6 | 14 Sep | build | ~60 | |
| 7 | 21 Sep | peak | ~65 | Long run 32–34km (one already banked pre-block). |
| 8 | 28 Sep | race-prep | ~50 | Sat 3 Oct Dorney tri (easy), Sun 4 Oct Lincoln Half **at MP** — the rehearsal. Goal pace locked after this. |
| 9 | 5 Oct | taper 1 | ~40 | Sun 11 Oct LDNX 10K = the only intensity (sharpener). |
| 10 | 12 Oct | taper 2 | ~30 | Protected. Nothing added. |
| R | 19 Oct | race week | — | Sat 24 Oct: Battersea. Carbons. |

Ramp exceeds the +15% cap on paper at wk2→3 only because wk1 is a recovery reset; guardrail uses pre-rest baseline (30) → 40 is within tolerance for a returning-from-rest week. All later steps ≤ ~+10%.

## Standing weekly shape (build phase)
SUPERSEDED — the live shape is `config/training.ts` `BLOCK_WEEKS[].days`. Swimming is one 2-hour session a week, not three, so the standing shape is six running days with the swim placed on an easy day. Exact placement is the micro-planner's job against availability.

## Shoe policy
Carbons: races + long runs ≥28km. Road daily trainer (**bought 2026-09-06**): all other road mileage. Peregrine 16: trail only, distance-capped until adapted.
