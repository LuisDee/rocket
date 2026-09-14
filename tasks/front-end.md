# front-end

**Scope boundary:** turn the web front end from a block-table viewer into a
daily tool. Covers: a Today landing page, the current week rendered as real days
via `planWeek()`, planned-versus-actual kilometres, the block view moved to its
own route, and a fitness/fatigue surface that renders honestly when the series
is empty. Explicitly does NOT cover: the Strava upload or the approval screen
(`strava-ship` owns `src/lib/strava.ts`, `src/app/api/ship/`,
`approval-view.tsx`, `check_no_strava_api.py`), the check-in form itself, any
change to the planner or readiness domain code, and any new training number.

**References:** `src/domain/planner/placement.ts` (`planWeek`, `WeekPlan`,
shortfall and notes), `src/domain/readiness.ts` (`scoreReadiness`,
`insufficientHistory`, `caveat`), `src/domain/store.ts` (`Store.window`,
`completedRuns`, `latestCheckIn`, `activityHistoryDays`), `src/lib/block.ts`
(date handling, `todayInLondon`, formatters), `config/training.ts` (`BLOCK`,
`BLOCK_WEEKS`, `RACES`). Adversarial review F32: marathonApp was a static plan
viewer and rocket had repeated it.

**Alternative rejected:** hardcoding per-day sessions into `config/training.ts`
so every week has days like week 2 does. Rejected because it duplicates what
`planWeek()` already derives from `AVAILABILITY.runSlots`, and a static day list
cannot reflect a guardrail or report a shortfall. Also rejected: a charting
dependency for the fitness curve, when there is no series to plot yet.

**Interface touched:** `src/app/page.tsx` becomes Today; the block table moves
to `src/app/block/page.tsx`. New `src/lib/actuals.ts` for planned-versus-actual
aggregation. No schema change, no config change, no domain change.

**Acceptance criteria:**

- `/` answers, above the fold at 390 px: today's session, yesterday's planned
  versus actual, readiness or a prompt to check in, and days to the next race
  and the marathon.
- Readiness renders its `caveat` and the terms it actually used whenever
  `insufficientHistory` is true. A thin verdict reads as thin (REDLINES rule 4).
- The current week renders as seven days from `planWeek()`, not a single
  target number, and any `shortfallKm` or planner note is shown rather than
  hidden.
- Planned-versus-actual shows per-week and cumulative kilometres with the
  difference, sourced from the database rather than a JSON snapshot.
- `/block` still carries the full seven-week table.
- Every screen verified in a browser at 390x844 with
  `scrollWidth === clientWidth`, not merely passing its gates.
- Tests cover the today-selection boundary when today IS a Monday, and
  planned-versus-actual for a week with no activities.

**Assumptions:**

- `activities` is empty and is fed by the intervals.icu sync, which has not run;
  the five real runs live in `ingested_activities` from the crop pipeline. The
  page reads `activities` as the source of truth and supplements from the
  ingest queue where it has nothing, clearly marked, so today's screen shows
  real runs rather than zeroes. Flagged for a proper fix: the ingest should
  write to `activities`.
- `sessions` is empty (REDLINES rule 8 reserves those rows to the planner), so
  the week is derived by calling `planWeek()` per request rather than read back.

---

## Checklist

- [x] Read the existing front end, planner, readiness and store interfaces
- [x] `src/lib/actuals.ts` — planned-versus-actual aggregation, with tests
- [x] Today page at `/`
- [x] Current week as days via `planWeek()`
- [x] Block table moved to `/block`
- [x] Fitness/fatigue surface, honest when empty
- [x] Verified every screen at 390x844 in a real browser
- [x] Tests bite (proved by deliberate breakage)
- [x] All gates green for this branch's files: typecheck, lint, format:check,
      test (267 passing), check_gate_ledger.py, test_guards.py (12/12).
      `check_no_strava_api.py` is RED, entirely on strava-ship's files
      (`src/lib/strava.ts`, `scripts/strava-auth.mts`, `approval-view.tsx`,
      `src/db/ingest-schema.ts`) — nothing in this task touches them. Raised
      it; the answer is that the red is expected. Luis read Strava API Policy
      5.3 and overrode it knowingly on 2026-09-07, superseding the earlier
      prohibition, and strava-ship's final step repurposes that guard so the
      sanctioned upload module passes while a Strava call anywhere else still
      fails. Not this branch's to resolve; the red clears when that lands.

### 2026-09-14 follow-up: navigation and the hidden session content

Reported by Luis from the installed app: today showed "7.6" with no sign of the
strides, and there was no way back from a page.

- [x] Fixed tab bar on every page (Today / Check in / Block / Runs). The app
      installs standalone, so there is no browser back button; `/checkin` linked
      nowhere, and the Runs page's back link read "Block" while going to Today.
- [x] Week rows show a one-line summary (`Described.summary`) and expand on tap
      to the full session, reason and gym slot.
- [x] "What's a stride?" explainer on today's card when strides are prescribed.
- [x] Viewport gate extended: an audit with every disclosure open (a closed
      `<details>` has no layout, so the old sweep measured nothing inside it --
      proved by an overflow the closed sweep passed), and a tab-bar check on
      every route. Both mutations caught.

## Commits

- `5fd85fe` — feat: make Today the landing page, with planned versus actual from the database
- `695fc1c` — docs: track the dual-source run bridge and the missing viewport sweep as gates
- `PENDING` feat(app): a tab bar on every page, and every day's session one tap away
