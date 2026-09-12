# feedback-loop

**Scope boundary:** close the loop from completed runs back into the plan.
Covers: automatic re-anchoring when a qualifying race is logged, threshold-pace
self-correction from work-interval heart rate, and flagging when actuals diverge
from plan far enough to matter. Explicitly does NOT cover: changing ratified
weekly volume, which is the athlete's decision and carries a written reversal
condition.

**References:** `src/domain/paces.ts` (`anchorRejection`, `thresholdVerdict`);
`src/lib/actuals.ts`; `config/training.ts` PACE_ANCHOR;
`docs/decisions.md` 2026-09-12.

**Alternative rejected:** re-anchoring on any fast run rather than a qualifying
race. Rejected for the reason `PACE_ANCHOR.excludedEfforts` exists -- the
2026-07-26 run looks like a personal best and carries 17:27 of stopped time, and
anchoring on it would have set every pace in the block about 6 s/km too fast.

**Interface touched:** the daily pass gains an anchor check; `PACE_ANCHOR`
becomes writable state rather than a hand-edited constant.

**Acceptance criteria:**

- A logged race that passes `anchorRejection` re-anchors the block without a
  human editing config, and the change is recorded with its evidence.
- A threshold session whose work-interval mean heart rate exceeds
  `HR_ZONES.thresholdPaceTooFastAbove` slows the derived threshold by 5 s/km, as
  `thresholdVerdict` already computes but nothing consumes.
- Two consecutive weeks missing target by more than 15 % raises the reversal
  condition ratified on 2026-09-09, rather than passing silently.
- Nothing auto-changes weekly volume. It surfaces; the athlete decides.

**Assumptions:**

- Moving the anchor is safe to automate because its guard already exists and is
  tested; moving VOLUME is not, because that was ratified against contrary
  evidence with a named exit.

---

## Checklist

- [ ] anchor state moves out of a hand-edited constant
- [ ] auto re-anchor on a qualifying race, with an audit record
- [ ] `thresholdVerdict` consumed
- [ ] reversal-condition trigger on sustained shortfall

## Commits

(populated as work lands)
