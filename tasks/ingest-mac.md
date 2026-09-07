# ingest-mac

**Scope boundary:** the Mac-side half of the crop pipeline — poll Garmin for new
activities, download the original FIT, crop it via routr, inspect it via routr,
and store both files with a crop summary in `ingested_activities` at status
`pending`. Also the missing migration for that table. Explicitly does NOT cover:
the approval screen or the queue pages (built, `6278a0e`), any Strava upload
(prohibited — `scripts/check_no_strava_api.py` is a CI gate), the intervals.icu
sync (built, `44c7265`), or any change to `~/dev/routr`, which is read-only.

**References:** `src/db/ingest-schema.ts` for the table and the
`pending | reviewed | shipped | failed` vocabulary; `src/lib/crop.ts` for the
`CropSummary` shape the approval screen already renders;
`~/dev/routr/.claude/agents/fit-cropper.md` for the two behaviours that exist
only as agent prose; `tools/garmin_probe/{garmin,garmin_guard}.py` for the token
path and the rate-limit guard; `docs/decisions.md` 2026-09-07 for the Strava
prohibition.

**Alternative rejected:** writing a FIT parser in this tool to derive elapsed,
moving time and distance. Rejected because `crop_fit_pauses.analyse()` already
returns exactly those three as a `Summary`, and parsing the cropper's
human-readable stdout was rejected separately — it prints elapsed and timer time
but never distance, so the `CropSummary` contract could not be filled from it.
A short script run under routr's own interpreter reuses their parser and keeps
routr read-only. Also rejected: gating ingestion on the forensic report, which
deliberately carries no verdict field.

**Interface touched:** new table `ingested_activities` (migration `0004`), new
`tools/ingest/`, `drizzle.config.ts` (its `schema` key saw only `schema.ts`,
which is precisely why the table had no migration).

**Acceptance criteria:**

- `ingested_activities` exists on Neon, is mutable by `app_rw` (INSERT, SELECT,
  UPDATE — `0001`'s `ALTER DEFAULT PRIVILEGES` grants future tables only SELECT
  and INSERT, so an explicit UPDATE grant is required or the status can never
  advance past `pending`), and does NOT carry the append-only triggers.
- A zip-wrapped download is unwrapped and asserted to be real FIT bytes.
- A zero-pause run yields a byte-identical copy at the correct path with
  `cropApplied: false`, and is NOT treated as an error.
- The output filename is `<name>-<date>-<distance>.fit` with the distance to
  exactly two decimals.
- An already-ingested activity id is skipped without a second download.
- A guard refusal aborts before any partial row is written.
- A heartbeat row is written on every run, success or failure.
- All gates green including `check_no_strava_api.py`.
- One live run against the real account produces a row the approval screen
  renders.

**Assumptions:** routr stays at its current checkout and its `.venv` remains
usable; `crop_fit_pauses.analyse()` keeps returning `total_elapsed_s`,
`total_timer_s` and `total_distance_m` (asserted at runtime, not assumed);
Garmin's `activityName` is an acceptable source for the filename's name
component, which the agent prose sources from the FIT session title — the same
value, and already in hand from the activity list.

---

## Checklist

- [x] `drizzle.config.ts` sees `ingest-schema.ts`
- [x] migration `0004` created, with the explicit UPDATE grant
- [x] migration applied to Neon (also applies the unapplied `0003`)
- [x] `tools/ingest/` poller: poll, download, crop, inspect, store
- [x] zip unwrap, filename convention, zero-pause copy — each with a test
- [x] heartbeat and guard-refusal paths
- [x] operator guide and the launchd plist (written, not installed)
- [x] gate-ledger rows with their deliberate violations recorded
- [x] one live run, verified in the approval screen

- [x] Unicode-safe slug: "Sóller Running" produced "s-ller-running" on the first
      live backlog run; folded to ASCII before slugging. Proven by reverting the
      fold and watching the test go red.
- [x] Running-only filter: a hike reached the queue and was cropped by a
      run-cropper and judged by run heuristics. `is_run()` now gates ingestion.

## Commits

- `1a5c8b2` feat(ingest): pull, crop and inspect a Garmin run into the review queue
- `98b28eb` fix(ingest): fold accents before slugging, and ingest runs only
- `ee32071` fix(ingest): stop tracking activity files, and ignore them everywhere
