# strength-is-race-aware

**Scope boundary:** stop the gym schedule colliding with the racing schedule, and
tell the athlete what the lift is. Covers: legs never on a race day or a day too
light to carry it, no gym on a race eve, race week honouring its own policy, and
the lift's scheme and movements reaching the screen. Explicitly does NOT cover:
letting the athlete record a lift he actually did, or moving one he missed --
there is no override path and that is its own gap.

**References:** `config/training.ts` STRENGTH (Lauersen 2018 BJSM, RR 0.338 for
overuse injury); `src/domain/planner/prescribe.ts` `placeStrength`.
Raised independently by two dimensions of the 2026-09-13 planner audit as
`legs-lift-on-race-days`, `legs-on-every-race-day`, `upper-body-on-race-eve`,
`legs-prescription-content-dead`, `legs-hours-inlined-in-ui`.

**Alternative rejected:** dropping legs from any week whose longest session is a
race. That is weeks 1, 4 and 5, and week 4 is the 100 km peak -- it would remove
the injury protection precisely where the volume is highest, which inverts the
reason the strength work exists.

**Interface touched:** `STRENGTH` gains `legsMinRunKmOnTheDay`,
`gymFreeDaysBeforeRace`, `raceWeek` and `upperBody`, and loses
`upperBodyUnconstrained`; `placeStrength` changes signature; `Described` gains
`gym`; `src/app/page.tsx` renders it.

**Acceptance criteria:**

- No race day in the block carries a lift. No race eve carries one either.
- Legs lands only on a day already carrying real running load, and peak week
  still gets it.
- Race week gets one upper-body session on the Monday and nothing else.
- The athlete is told the scheme, the movements and the separation, all read from
  config rather than written in the component.

**Assumptions:**

- `legsMinRunKmOnTheDay: 8` is a judgement, not a measurement. Nothing in the
  strength literature speaks to how hard a day must already be before a barbell
  belongs on it; 8 km is roughly three quarters of an hour at his easy pace,
  which is a day that is already a session. Marked PROVISIONAL in config.

---

## Checklist

- [x] legs excludes race days; race eves excluded for every lift
- [x] `legsMinRunKmOnTheDay` floor, so week 1's 2.3 km shakeout gets none
- [x] `raceWeek.lifts` replaces the prose `raceWeekPolicy` nothing could read
- [x] `upperBodyUnconstrained` deleted -- a boolean with no branch whose claim
      had become false
- [x] full lift prescription on the screen, every number from config
- [x] races injected into `placeStrength` so the mid-week tie-break is testable
- [x] 9 tests, 9 deliberate breakages all caught

## Commits

- `PENDING` fix(planner): keep the barbell off race days and tell him the lift
