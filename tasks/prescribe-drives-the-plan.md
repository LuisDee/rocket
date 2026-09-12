# prescribe-drives-the-plan

**Scope boundary:** make `prescribeBlock()` the single source of today's session,
consumed by the daily pass, the MCP surface and the home screen. Covers: wiring
the generator into `daily-pass.ts` and `page.tsx`, reconciling it with the
existing `placement.planWeek` path, and deleting whichever of the two loses.
Explicitly does NOT cover: readiness acting on sessions (its own task), doubles,
fuelling, or any change to the ratified weekly volumes.

**References:** `src/domain/planner/prescribe.ts`; `src/jobs/daily-pass.ts`;
`src/app/page.tsx`; `docs/specs/03-planner.md`.

**Alternative rejected:** keeping both paths and having the generator feed only
the MCP tools. Rejected because two planners that disagree is worse than either
alone -- the athlete would see one session on the phone and another from the
assistant, and there would be no fact of the matter about which he was meant to
run.

**Interface touched:** `daily-pass.ts` (session source), `page.tsx` (today's
card), `placement.ts` (probably deleted).

**Acceptance criteria:**

- `grep -rl "prescribe" src --include='*.ts' | grep -v test` names the daily pass
  and the home page.
- The home screen shows today's session WITH its pace band and structure, not
  just a distance and a `kind`.
- Exactly one planner remains. The loser is deleted, not left dormant.
- A test asserts today's session is identical whether read through the page, the
  daily pass or the MCP tool.

**Assumptions:**

- ~~`placement.planWeek` is the one to go~~ **WRONG, and the check caught it.**
  `planWeek` handles the mandatory rest day, rest-day choice against the
  PREVIOUS week's hard session, quality spacing, distribution by slot capacity
  (which is where doubles come from), and a race being additional to the weekly
  target rather than inside it. My generator got the last of those wrong -- race
  week came out with a negative easy budget. Deleting `planWeek` would have lost
  real capability to make a rewrite look justified.

  Resolved the other way: `planWeek` places, `prescribe` describes. The
  generator's placement logic is deleted; its prescription logic is kept.

---

## Checklist

- [x] read both paths and decide which survives, in writing -- see Assumptions
- [x] `prescribe` rewritten as a decorator over `planWeek`, placement logic deleted
- [x] home screen renders zone, pace band, HR band, structure, purpose and gym
- [x] 13 tests, 6 deliberate breakages all caught
- [ ] consumed by `daily-pass.ts` (the page is done; the cron is not)
- [ ] cross-surface consistency test

## Commits

(populated as work lands)
