# integration-harness

**Scope boundary:** build the local harness that proves Garmin access and captures the
full shape of the available data. Covers: a `uv`-managed Python probe for Garmin Connect
(one-time login, token capture, full endpoint enumeration, a committed field catalogue)
and the single access-setup page Luis follows. Explicitly does NOT cover: the database schema, any ingest into Postgres, the
scheduled sync job, or reading the data into the domain. Those depend on the catalogue
this task produces.

**References:** `docs/specs/05-integrations.md`; `docs/plans/PLAN-2026-001-m1-core-loop.md`
Stage 0 and the Garmin decision gate.

**Header amended 2026-09-07 (the header is write-once, so the change is stated rather
than silently applied), on two grounds:**

1. **The Strava half is withdrawn on ToS grounds.** Strava API Policy section 5.3,
   effective 2026-06-01, prohibits Strava API materials or data in connection with the
   development, training, evaluation or operation of any AI application, grounding
   included. `tools/strava_probe/` and `docs/STRAVA_SETUP.md` are deleted and the
   DoHardThings `lib/strava-*.ts` port source is withdrawn as a reference with them.
   Claude reads Strava through the official Strava MCP under the policy's subscriber
   carve-out; rocket holds no Strava API credentials. See `docs/decisions.md`,
   2026-09-07, "the Strava API is withdrawn". Response-ledger finding F17.
2. **The rejected alternative below is superseded.** Luis ratified on 2026-09-07 that
   intervals.icu is the primary Garmin path with this probe retained as a manually-run
   deep pull -- the reverse of what the original header recorded. The reasoning it gives
   is still correct about field coverage and wrong about what matters: the deciding
   variable is which source runs unattended in production, and `python-garminconnect`
   cannot (no durable token disk on Vercel, and a per-account 429 costs 48-72 hours).
   Response-ledger finding F18, whose remaining actions belong to whoever owns the
   wellness schema, not to this task.

**Alternative rejected:** the intervals.icu bridge. Luis directed on 2026-08-18 that the
MVP must have a foundation accommodating ALL available data even where the first release
does not read it; the bridge relays an unverified subset and cannot expose Training
Readiness factors or Garmin's own acute/chronic pair. Recorded in `docs/decisions.md`.

**Interface touched:** none. New `tools/` tree; no application code, no schema.

**Acceptance criteria:**

- `uv run` resolves and the probe responds to `--help` without credentials present.
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
- [x] ~~`tools/strava_probe/` — OAuth exchange~~ withdrawn 2026-09-07, deleted (ToS)
- [x] ~~`docs/STRAVA_SETUP.md`~~ deleted with it; `docs/STARTUP_ACCESS.md` shipped
- [x] Gitignore raw output; commit the catalogue only
- [x] All gates green

- [x] MFA reader waits for the code instead of checking once (the code only arrives
      after the login fires, so a single check loses the race and burns the one attempt)
- [x] Bootstrap run against the real account: MFA accepted, token persisted 0600
- [x] Probe run: 40/40 endpoints, `CATALOGUE.md` generated (1,832 lines, no values)

## Commits

- `cffd93b` feat(tools): harness that wires Garmin and Strava in
- `454bb3d` fix(garmin): wait for the MFA code rather than checking once
- `6d4dd48` fix(strava): accept the space-delimited scope Strava actually returns
  (the file this fixed is deleted; the commit stays listed, history is not rewritten)
