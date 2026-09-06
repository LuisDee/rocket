# integration-harness

**Scope boundary:** build the local harness that proves Garmin and Strava access and
captures the full shape of the available data. Covers: a `uv`-managed Python probe for
Garmin Connect (one-time login, token capture, full endpoint enumeration, a committed
field catalogue), a Strava OAuth exchange script, and the single access-setup page Luis
follows. Explicitly does NOT cover: the database schema, any ingest into Postgres, the
scheduled sync job, or reading the data into the domain. Those depend on the catalogue
this task produces.

**References:** `docs/specs/05-integrations.md`; `docs/plans/PLAN-2026-001-m1-core-loop.md`
Stage 0 and the Garmin decision gate; `~/dev/DoHardThings/lib/strava-*.ts` as the port
source for the eventual TypeScript ingest.

**Alternative rejected:** the intervals.icu bridge. Luis directed on 2026-08-18 that the
MVP must have a foundation accommodating ALL available data even where the first release
does not read it; the bridge relays an unverified subset and cannot expose Training
Readiness factors or Garmin's own acute/chronic pair. Recorded in `docs/decisions.md`.

**Interface touched:** none. New `tools/` tree; no application code, no schema.

**Acceptance criteria:**

- `uv run` resolves and both scripts respond to `--help` without credentials present.
- The MFA callback and token round-trip are exercised by a test with a fake, and that
  test fails if the wiring breaks.
- No credential, token, or health value is ever written to a tracked file. Raw probe
  output is gitignored; only the field catalogue (names and shapes, no values) is
  committed.
- A failed Garmin login exits non-zero without a retry.
- All seven repo gates green.

**Assumptions:**

- The Garmin account has MFA enabled. The harness supports both the MFA and no-MFA paths
  and reports which it took.
- Luis's Garmin data is on the account tied to the email stored at `pass garmin/email`;
  those entries do not exist yet and are his to create.

---

## Checklist

- [x] Verify the real library API from installed source rather than the brief
- [x] `tools/garmin_probe/` — bootstrap + probe, single entry point
- [x] Runnable check for MFA wiring and token round-trip
- [x] `tools/strava_probe/` — OAuth exchange
- [x] `docs/STRAVA_SETUP.md` and `docs/STARTUP_ACCESS.md`
- [x] Gitignore raw output; commit the catalogue only
- [x] All gates green

- [x] MFA reader waits for the code instead of checking once (the code only arrives
      after the login fires, so a single check loses the race and burns the one attempt)
- [x] Bootstrap run against the real account: MFA accepted, token persisted 0600
- [x] Probe run: 40/40 endpoints, `CATALOGUE.md` generated (1,832 lines, no values)

## Commits

- `cffd93b` feat(tools): harness that wires Garmin and Strava in
