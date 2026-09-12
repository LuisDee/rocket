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

- `placement.planWeek` is the one to go: it distributes kilometres into
  availability slots but has no concept of a session's content, which is the
  thing that was missing. Its slot logic may need lifting into the generator
  first -- check before deleting.

---

## Checklist

- [ ] read both paths and decide which survives, in writing
- [ ] generator consumed by `daily-pass.ts`
- [ ] home screen renders pace band + structure
- [ ] one planner deleted
- [ ] cross-surface consistency test

## Commits

(populated as work lands)
