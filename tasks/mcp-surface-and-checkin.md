# mcp-surface-and-checkin

**Scope boundary:** the MCP tool surface Luis actually talks to, and the PWA
check-in screen that is its thirty-second counterpart. Covers: the
`/api/mcp/[transport]` route on the DoHardThings-proven stack with a static
bearer, six `rocket_`-prefixed tools (`get_status`, `daily_checkin`,
`log_activity`, `replan`, `adjust_session`, `add_note`), the shared write
envelope, a whole-window guardrail evaluator over `config/training.ts`, a
subjective readiness score, the store seam both the tools and the page write
through, and a single `/checkin` page. Explicitly does NOT cover: the
deterministic planner that authors session rows (Stage 6, so the rolling window
is whatever is already in `sessions` and is empty today), the load engine
(ATL/CTL/TSB, Stage 9), the trailing-14-day trend, OAuth (post-race, option A),
Garmin or Strava ingest, `rocket_get_week`, `rocket_get_calendar`,
`rocket_get_load_history`, `rocket_set_availability`, `rocket_propose_route`,
`rocket_sync_now`, and any service worker or offline behaviour.

**References:** `docs/specs/04-mcp-surface.md` in full — tool list, the write
contract's five-field envelope, and "validation scope is the whole rolling
window on every write". `docs/specs/02-load-engine.md:19-24` and
`config/training.ts` `READINESS` for the subjective score.
`docs/plans/PLAN-2026-001-m1-core-loop.md:509-543` (Stage 4) for the stack and
its pins. `docs/reviews/2026-09-07-response-ledger.md` F22 (the stack) and F27 /
S6.3 (`notes` + `rocket_add_note`, the gap `docs/reviews/2026-09-07-verification.md`
G2 records as undelivered). `REDLINES.md` rules 1, 2, 4 and 8.
`DoHardThings/app/api/mcp/[transport]/route.ts` and `lib/mcp-tools.ts:52-74` for
the mounting and the `ok()`/`fail()`/`reason()` conventions copied here.

**Alternative rejected:** (a) `mcp-handler@2.1.1` + `@modelcontextprotocol/server@2`,
which npm confirms is current — rejected because v2 requires `inputSchema` as a
complete Standard Schema (`z.object(...)`) rather than raw zod shapes, so the
DoHardThings tool layer stops porting verbatim, which was the entire reason for
porting it; revisit after 2026-10-24 (ledger F22). (b) A `replan` that re-places
sessions — rejected because the deterministic planner does not exist and
REDLINES rule 8 reserves session authorship to it; inventing a placer inside an
MCP tool is the precise violation that rule names. (c) Validating
`rocket_adjust_session` against the session alone — rejected by the spec, which
says the scope is the one half that cannot be retrofitted. (d) Driving the tools
by calling handler functions directly, as DoHardThings' own test does —
rejected because it exercises neither schema generation nor result wrapping;
tests go through `tools/call` over an in-memory transport instead.

**Interface touched:** new `src/app/api/mcp/[transport]/route.ts`,
`src/mcp/*`, `src/domain/*`, `src/app/checkin/*`. Existing: `package.json`
(three pinned dependencies), `.env.example` (`MCP_BEARER_TOKEN`, name only),
`config/training.ts` (one addition: `READINESS.inputScales`, the 0-1
normalisation the weights have always implied and nothing has ever stated),
`docs/ci-gates.md`, `docs/decisions.md`.

**Acceptance criteria:**

1. `tools/list` over a real MCP client returns exactly six tools, every name
   `rocket_`-prefixed.
2. A malformed argument (`rpe: 99`) returns `isError: true` carrying the field
   name, and the transport stays up — asserted by a following successful call
   on the same connection.
3. `rocket_daily_checkin` persists a row and returns a readiness band whose text
   states its own insufficiency while history is under `LOAD.ctlWarmUpDays`
   (REDLINES rule 4).
4. `rocket_log_activity` persists an activity with no integration configured
   (invariant 2) and its returned envelope carries `applied: true`.
5. `rocket_adjust_session` refuses a change that breaks a _different_ week of
   the window than the one edited, returning `applied: false`, the violated rule
   id, and a non-null `compliant_alternative`.
6. Every write tool returns all five envelope fields, and `violated_rules` is a
   subset of `applied_rules`.
7. `POST /api/mcp/mcp` without a bearer is 401; the same request with it is 200.
   The 401 assertion runs unconditionally.
8. `/checkin` submits without JavaScript, writes the same row through the same
   domain function as the MCP tool, and renders correctly at 390 px — verified
   by a screenshot, not by the suite.
9. `npm run test` stays green with no `DATABASE_URL` present.

**Assumptions:**

- **Readiness input scales are undefined everywhere.** `READINESS.subjectiveWeights`
  weights four inputs and no document says what range any of them is on;
  `check_ins.sleep` is a bare `real`. Assumed and recorded in config as
  PROVISIONAL: RPE 1-10 (higher worse), soreness severity 0-5 (higher worse,
  0 meaning none), sleep in hours against a 9-hour full mark, motivation 1-5.
  Flagged rather than papered over: these are the numbers a calibration pass
  will change first.
- **`rocket_replan` cannot re-place sessions in this task.** No planner exists,
  so it records the reason as a `notes` row, evaluates the whole window, and
  returns the envelope with `applied: false` and a summary naming
  `rocket_adjust_session` as the typed path that can change something. It does
  not dead-end and it does not pretend. The name is claimed now because names
  freeze when the connector is added.
- **The rolling window is empty in the live database.** `src/db/seed.mts`
  deliberately does not write `sessions`. Window-scoped behaviour is therefore
  exercised against the store seam in tests and will be exercised against real
  rows the moment Stage 6 writes any.
- **Single-session-spike violations do not block.** `GUARDRAILS.singleSessionSpikePct`
  documents itself as advisory-never-a-blocker, so it is reported in
  `violated_rules` without forcing `applied: false`. Every other rule blocks.
- Staleness is reported from the newest `activities.ingested_at` against
  `SYNC.staleAfterHours`. With no sync built, `rocket_get_status` says so
  loudly rather than omitting the field (REDLINES rule 3).

**Header amendment, 2026-09-07** (recorded rather than silently rewritten, per
`tasks/README.md`). Two things in the header above did not survive contact:

1. _Interface touched_ listed a `src/domain/guardrails.ts` of my own. It was
   written and then DELETED the same hour: `tasks/deterministic-planner.md`
   produced `src/domain/planner/guardrails.ts` in parallel, expressing the same
   rules better (each result carries `ruleId`, `threshold`, `observed`,
   `coverage`). Two implementations of one guardrail is the drift this repo
   exists to prevent, so this task now consumes theirs and expresses no rule of
   its own. `src/mcp/window.ts` is the adapter between the `sessions` row and
   the planner's vocabulary.
2. _Ownership of `src/mcp/tools.ts` and `src/mcp/tools.test.ts` transferred to
   the planner task_ at 17:12, ratified by the coordinator. I wrote both; the
   planner agent extended them onto `propose()` from `negotiate.ts`, and the
   tool layer is now thin narration over logic that lives there. Everything
   below those two lines is still mine.

The _Assumptions_ about `rocket_replan` is therefore superseded too: with
`propose()`/`replan()` landing in the planner, `rocket_replan` is no longer the
record-and-decline stub the header describes.

---

## Checklist

- [x] Pin `mcp-handler@1.1.0`, `@modelcontextprotocol/sdk@1.29.0`, `zod@4.4.3`,
      exact, plus the `overrides` entry the unmet peer needs
- [x] `READINESS.inputScales` in `config/training.ts`
- [x] `src/domain/readiness.ts` + `readiness.test.ts` (13 tests)
- [~] ~~`src/domain/guardrails.ts`~~ -- written, then deleted in favour of
  `src/domain/planner/guardrails.ts`. See the header amendment.
- [x] `src/domain/checkin.ts` (shared write path, soreness locations, form
      parsing) + `checkin.test.ts` (8 tests)
- [x] `src/domain/types.ts`, `store.ts`, `store-memory.ts`, including
      `completedRuns()` so guardrail baselines are measured runs, not the plan
- [x] `src/mcp/result.ts` (`ok`/`fail`/`reason`) and `src/mcp/window.ts`
      (row/planner adapter, the five-field envelope, `keepAsIs`)
- [~] `src/mcp/tools.ts` (six tools) -- written here, ownership transferred
- [x] `src/app/api/mcp/[transport]/route.ts` + bearer gate (`src/mcp/auth.ts`)
- [~] `src/mcp/tools.test.ts` driving `tools/call` -- written here, transferred
- [x] `src/app/api/mcp/route.test.ts` (7 tests, 401 assertions unconditional)
- [x] `/checkin` page + server action, JavaScript-free
- [x] Playwright at 390 px -- caught a real clipping bug (ten 44 px pills do not
      fit 390 px), fixed, re-measured `scrollWidth === clientWidth`
- [x] `.env.example`, `docs/ci-gates.md` (three rows), `docs/decisions.md`
      (three entries)
- [x] Gates green on the files this task owns

## Commits

1d8fd5d feat(mcp): the rocket_ tool surface, its bearer gate, and the daily check-in
