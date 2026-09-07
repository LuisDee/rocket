# daily-sync-and-watch-push

**Scope boundary:** the intervals.icu bridge and the one scheduled job that uses
it. Covers: a bridge client with an injected transport; the G1 field-coverage
probe as a single command that writes its result into the repo; the daily pass
(ingest -> recompute -> evaluate replan triggers -> coach note) with a
`sync_runs` heartbeat row and a dead-man's-switch ping; the outbound leg that
writes one intervals.icu event per planned session; a seeded ATL/CTL/TSB
computation warm-started from Garmin's own measured pair. Explicitly does NOT
cover: any Garmin HTTP call (`tools/garmin_probe/` stays a manual fallback and
is not touched); typed wellness columns of any kind (Decision gate G1 forbids
them until the probe returns); structured workout steps, pace/HR targets or
workout-file upload (`05-integrations.md` puts them out of scope until after
2026-10-24); the readiness objective block; web push; the PWA.

**References:** `docs/specs/05-integrations.md` -- "The daily pass (the only
scheduled job)", "Outbound: the plan on the wrist", and the 2026-09-07 decision
that the partner bridge is primary; `REDLINES.md` rules 1 (no threshold outside
`config/training.ts`), 2 (append-only history), 3 (the sync fails loudly), 4
(a verdict under one CTL time constant states its insufficiency), 7 (aggregates
computed from the full series and returned with their window);
`docs/plans/PLAN-2026-001-m1-core-loop.md` Decision gate G1 (lines 295-309), the
three-layer degradation design (line 783) and the cut line at line 472 that
names `dailyTrainingLoadChronic = 287` / `dailyTrainingLoadAcute = 296`;
`docs/specs/02-load-engine.md` ("Rolling load state"); `docs/specs/03-planner.md`
("Replan triggers", the five); `docs/ci-gates.md` row "Garmin sync heartbeat".

**Alternative rejected:**

- _Designing a typed `wellness_snapshots` table now._ Decision gate G1 forbids
  it in terms: "Do not design the wellness schema before it returns." The pass
  still has to ingest wellness or it is not the pass the spec describes, so
  wellness lands in `wellness_raw` as `(local_date, raw jsonb)` with no typed
  column -- lossless, leaning on no bridge-supplied field, and the thing a
  typed migration will be derived FROM once the probe has run.
- _Blocking on the API key._ The key may not exist yet. The transport is a
  constructor argument, so every path is driven end to end in `npm run test`
  against a fake; the only thing the key adds is a real socket.
- _A second `garmin_probe`-style Python tool for the G1 probe._ The probe reads
  a third-party JSON API with a personal key. It is `curl` with a report
  attached, and it must share the exact client the job uses or it proves
  nothing about the job.
- _Computing CTL cold from a filling 42-day window._ A mean over a window that
  is still filling ramps upward as a pure artefact and produces false-red during
  exactly the weeks a block is established. Seeded from Garmin's own measured
  pair instead, which is also the plan's own stated cut line.
- _Deleting and re-creating the calendar events each day._ A delete-by-range
  removes events this system did not write. The upsert key is the session id in
  `external_id`, so a re-push of an unchanged plan is a no-op upstream.
- _Failing the pass open when the bridge is unreachable._ REDLINES rule 3. A
  failed pass still writes its `sync_runs` row and its coach note, and
  deliberately does NOT ping the dead-man's switch.

**Interface touched:** `config/training.ts` (`LOAD.seed`, `SYNC.watchPushDays`,
`SYNC.ingestLookbackDays` -- additive); `src/db/schema.ts` (two new tables,
`sync_runs` and `wellness_raw`; no existing table altered); a new migration
`0003_sync_and_wellness.sql`; `src/domain/store.ts` and `store-memory.ts` (four
new methods, no existing signature changed); `docs/ci-gates.md` (the heartbeat
row moves off `NOT IMPLEMENTED`, plus new rows); `docs/decisions.md` (appended);
`.env.example` (names only). New: `src/integrations/intervals.ts`,
`src/domain/load.ts`, `src/jobs/daily-pass.ts`,
`src/app/api/cron/daily/route.ts`, `scripts/probe-g1.mts`, `vercel.json`.

**Acceptance criteria:**

- `npm run probe:g1` is one command. Given `INTERVALS_API_KEY` and
  `INTERVALS_ATHLETE_ID` it fetches seven days of wellness and writes
  `docs/G1-BRIDGE-PROBE.md` recording, per day, whether `hrv`, `restingHR`,
  `sleepScore` and `bodyBattery` are present-and-non-null, whether `ctl`/`atl`
  are exposed, and the full observed key set. Without the key it exits non-zero
  saying which variable is missing -- it never writes a report it did not
  measure.
- The report names the branch the coverage implies (A or B) rather than leaving
  a reader to apply the gate by hand.
- One daily pass over a fake transport: ingests activities idempotently (a
  second run inserts nothing new), stores wellness verbatim, recomputes
  ATL/CTL/TSB from the full series with the coverage window returned alongside,
  evaluates the five replan triggers and names the ones a cron structurally
  cannot see, writes exactly one dated coach note, writes one `sync_runs` row,
  and pushes one event per planned session.
- A pass whose bridge throws still writes a `sync_runs` row with `ok=false` and
  the reason, still writes a coach note saying so, and does NOT ping the
  dead-man's switch. Asserted, not asserted-about.
- CTL is seeded from `LOAD.seed` (287/296 as of 2026-09-06) and a series shorter
  than `LOAD.ctlWarmUpDays` comes back with `warmingUp: true` and a caveat
  naming the days it has (REDLINES rule 4).
- No literal threshold in any file this task adds: the ingest lookback, the push
  horizon, the staleness hours and the seed pair all read from
  `config/training.ts` at evaluation time.
- The cron route refuses an unauthenticated request, fail-closed, tested first.
- `docs/ci-gates.md` heartbeat row cites a resolvable enforcer and records the
  deliberate violation used to prove it fails.
- All gates green: `npm run format`, then typecheck, lint, format:check, test,
  `check_gate_ledger.py`, `test_guards.py`,
  `check_task_trace.py --range main..HEAD`.

**Assumptions:**

- **The intervals.icu request shapes are UNVERIFIED against a live account** --
  they come from the vendor's forum guide (basic auth as `API_KEY:<key>`,
  `GET /api/v1/athlete/{id}/wellness?oldest&newest`,
  `GET .../activities?oldest&newest`,
  `POST .../events/bulk?upsert=true` with `external_id`), not from a response we
  have seen. This is the same class of gap G1 exists to close, and it is why the
  probe reports the observed key set rather than asserting a schema: the first
  real call is allowed to disagree with this file.
- Wellness field NAMES are assumed only inside the probe's report, never in a
  column. If the bridge calls resting heart rate something else, the probe says
  "absent" for `restingHR` and lists the real key beside it.
- The bridge's activity ids are stable and unique per athlete, so
  `icu:<id>` as the primary key makes ingest idempotent. If they are not, the
  duplicate shows up as a second row rather than as a corrupted one.
- Replan triggers 3 (availability change) and 4 (user asks via MCP) are not
  detectable from a cron and are reported as `not-observable-by-cron` rather
  than silently omitted.
- The dead-man's switch URL is an env name only. Unset means no ping, which is
  correct in development and is itself surfaced in the pass result rather than
  swallowed.

---

## Checklist

- [x] `config/training.ts`: `LOAD.seed`, `SYNC.watchPushDays`, `SYNC.ingestLookbackDays`
- [x] `src/integrations/intervals.ts` + tests over a fake transport
- [x] `scripts/probe-g1.mts` + `npm run probe:g1`
- [x] `src/domain/load.ts` (seeded EWMA, coverage window, warm-up flag) + tests
- [x] `src/db/schema.ts` two tables + `0003` migration
- [x] store methods (postgres + memory)
- [x] `src/jobs/daily-pass.ts` + tests, including the loud-failure path
- [x] `src/app/api/cron/daily/route.ts` + auth test, `vercel.json`
- [x] `rocket_get_status` staleness reads the heartbeat, not just the last ingest
      -- added because `lastIngestAt` alone cannot tell a failed pull from a rest
      day, which is the sync that dies quietly during taper (REDLINES rule 3)
- [x] `.env.example`, `docs/ci-gates.md`, `docs/decisions.md`, `07-wiring-todo.md`
- [x] four deliberate violations run and reverted, each recorded in its ledger row
- [x] all gates green, committed

## Divergences from the header

- **The rolling-window refill runs BEFORE the replan repairs**, not after. The
  header did not specify an order; a test caught that the obvious one silently
  undid a soreness downgrade. Recorded in `docs/decisions.md` 2026-09-07.
- **`rocket_get_status` was touched**, which the header's "interface touched"
  did not list. It is where REDLINES rule 3 says a stale or failed pull must
  surface, and the heartbeat row it needed did not exist until this task.

## Commits

- `44c7265 feat(sync): the daily pass, the plan on the wrist, and the G1 probe`
