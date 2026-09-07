# ingest-pipeline

**Scope boundary:** the Mac-side half of the crop-and-ship pipeline — notice a new
Garmin activity, download its original FIT, crop the pauses, run the forensic
inspector, and store both files plus a summary for later approval. Covers the
poller, the routr subprocess integration, the `ingested_activities` table and its
heartbeat, a launchd schedule, and the operator guide. Explicitly does NOT cover:
the approval screen, the Strava upload, or any change to routr or DoHardThings.
Those are `preview-and-ship` and are deliberately on the other side of the seam.

**References:** `~/dev/routr/backend/scripts/crop_fit_pauses.py`,
`inspect_fit.py`, `~/dev/routr/.claude/agents/fit-cropper.md` (the pipeline
contract), routr `CLAUDE.md` "Cleaned activity file naming convention",
`tools/garmin_probe/garmin_guard.py` and `garmin.py` (auth + rate limiting,
reused not reimplemented).

**Alternative rejected:** parsing the cropper's stdout for the before/after
metrics. `crop_fit_pauses.analyse()` and `extract_timer_pauses()` are both in the
module's `__all__` and return exactly the fields `crop_summary` needs, so the
summary is computed by importing them rather than scraping a human-readable
format that carries no compatibility promise. Also rejected: calling the
cropper's `main()` in-process — a subprocess keeps routr a black box at a pinned
commit and stops a crash in its byte-level rewriter taking this process with it.

**Interface touched:** none existing. Creates `ingested_activities` and
`ingest_heartbeat`, both new and both owned here. Does not touch `db/schema.ts`
(owned by `neon-persistence`) or `config/training.ts` (owned by `volume-block`).

**Acceptance criteria:**

- A new activity is downloaded, cropped, inspected and stored with
  `status='pending'` and a populated `crop_summary`.
- A zip-wrapped download is unwrapped to real FIT bytes (verified against the
  library source: ORIGINAL "will return the zip file content, up to user to
  extract it", `__init__.py:2845`).
- A run with no timer pauses stores the original unchanged with
  `cropApplied: false` — NOT an error. The cropper exits 1 having written
  nothing in that case.
- The output filename follows `<name>-<date>-<distance>.fit` with distance to
  2dp, not the cropper's own `<date>_<km>.fit` default.
- An already-ingested activity id is skipped without a Garmin call.
- Every run writes a heartbeat, success or failure.
- No live Garmin call in any test.

**Assumptions:**

- routr stays readable at `~/dev/routr` and its two scripts keep their exit-code
  contract (0 cropped, 1 no pauses, 2 failure). Pinned by commit in config, and a
  test asserts the contract rather than trusting it.
- `crop_fit_pauses` imports standalone from any venv — verified, it puts routr's
  backend on `sys.path` itself and `app.fit_forensics._fit_bytes` is stdlib-only.
- The table is created by this tool with `CREATE TABLE IF NOT EXISTS` rather than
  a Drizzle migration, because `neon-persistence` is still building `db/` and its
  migration tooling may not exist yet. `db/ingest-schema.ts` is the typed view for
  the web half and must stay in step.

---

## Checklist

- [ ] task file written and header frozen
- [ ] `tools/ingest/` with poller, downloader, cropper and inspector glue
- [ ] `db/ingest-schema.ts` for the web half
- [ ] tests against real fixtures, each proven to bite
- [ ] launchd plist and `docs/INGEST_OPERATOR_GUIDE.md`
- [ ] gate-ledger rows
- [ ] all gates green

## Commits

(populated as work lands)
