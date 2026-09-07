# preview-and-ship

**Scope boundary:** the web half of the crop-and-ship pipeline — a list of
activities awaiting a decision, an approval screen showing what the crop
changed, and `POST /api/ship` uploading the approved file to Strava. Explicitly
does NOT cover: polling Garmin, downloading FIT files, running the cropper or
the forensic inspector, or writing rows into `ingested_activities` — all of that
is the ingest pipeline's half and runs on the MacBook. This half never talks to
Garmin and never modifies a FIT file; it reads a row, renders it, and on an
explicit tap forwards bytes to Strava.

**References:** the `ingested_activities` contract and `crop_summary` shape as
specified in the directive; Strava upload API (`POST /api/v3/uploads`,
`data_type=fit`, asynchronous, poll `GET /uploads/{id}`); `src/db/schema.ts` and
`src/db/client.ts` for the drizzle and pool conventions; `src/lib/block.ts` for
`formatDuration` / `formatPace` / `formatShortDate`; `src/app/page.tsx` for the
dark phone-first aesthetic.

**Alternative rejected:** uploading automatically once the forensic report looks
clean. Rejected because the report has no verdict field by design — the whole
point of the human gate is that "anomaly_score" is not a decision, and shipping
a modified file to a permanent public record is not reversible by us. Also
rejected: a dependency-injection container or a Strava client class. The seam
needed is one optional `fetch` parameter, and a class with one implementation is
an abstraction nobody asked for. Also rejected: testing against live Strava — an
accidental upload to a real account cannot be undone from a test.

**Interface touched:** adds `src/app/activities/**`, `src/app/api/ship/`,
`src/lib/crop.ts`, `src/lib/strava.ts`, `src/lib/ship.ts`,
`src/db/ingest-schema.ts`. Adds one link on `src/app/page.tsx`. Changes no
existing behaviour and no existing table.

**Acceptance criteria:**

- The approval screen renders distance before/after, elapsed before/after,
  moving before/after, and the removed pause segments, for a real-shaped
  `crop_summary`.
- A run with `cropApplied: false` is unmistakably marked as unchanged rather
  than silently rendering as a zero-delta crop.
- A distance delta beyond a threshold is surfaced as an anomaly, because a crop
  removes time and should barely move distance.
- Forensic findings render with severity and no invented pass/fail verdict.
- `POST /api/ship` moves a row `pending -> uploading -> uploaded`, records the
  Strava activity id, and on failure records the error and sets `failed`.
- A duplicate rejection from Strava surfaces as a readable message, not a stack
  trace or a generic 500.
- Polling gives up rather than hanging, and the give-up is recorded.
- An expired access token is refreshed once and the upload then proceeds.
- The ship button cannot be double-submitted.
- No test performs a network call to Strava.

**Assumptions:** the `ingested_activities` table did not exist when this work
started — the ingest pipeline had not created it — so it is defined here exactly
as the contract specifies, at `src/db/ingest-schema.ts` rather than the
directive's `db/ingest-schema.ts`, because the database layer actually landed
under `src/db/`. If the ingest pipeline creates the same table the definitions
must be identical and one copy deleted; the contract is fixed so the resolution
is mechanical. Assumed Strava returns `error` on the upload record for a
duplicate rather than an HTTP error status, since the upload itself is accepted
and only fails during processing.

---

## Checklist

- [x] `src/db/ingest-schema.ts` — the table, exactly to contract
- [x] `src/lib/crop.ts` — crop summary types and derived deltas
- [x] `src/lib/strava.ts` — upload + poll + token refresh, injectable fetch
- [x] `src/lib/ship.ts` — the state machine, injectable store and fetch
- [x] `src/app/activities/page.tsx` — the list
- [x] `src/app/activities/[id]/page.tsx` — the approval screen
- [x] `src/app/activities/[id]/ship-button.tsx` — client component, guarded
- [x] `src/app/api/ship/route.ts` — the endpoint
- [x] tests, each proven to bite by breaking the code and reverting
- [x] looked at the screen at 390px in a real browser
- [x] gate-ledger rows
- [x] all gates green

## Commits

(populated as work lands)
