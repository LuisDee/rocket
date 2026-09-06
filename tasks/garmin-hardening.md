# garmin-hardening

**Scope boundary:** make a Garmin account lockout structurally impossible rather
than merely unlikely. Covers: rescuing the two-bucket rate-limit guard out of a
temp directory into the repo, wiring it into every Garmin call path, disabling
the library's credential-retry cascade, and proving each safety property fails
when removed. Explicitly does NOT cover: the scheduled sync, the backfill
checkpoint table, any production storage decision, or any real call to Garmin.

**References:** `docs/specs/05-integrations.md` (Garmin as a hostile-weather
dependency); `REDLINES.md` rule 3 (the daily sync fails loudly); `AGENTS.md`
section 4 (prove the gate fails); the rescued guard's own module docstring; the
installed `garminconnect` source at
`tools/garmin_probe/.venv/lib/python3.12/site-packages/garminconnect/`.

**Alternative rejected:** rewriting the guard rather than adapting the rescued
one — it is already self-tested and its two-bucket split is derived from field
reports we cannot reproduce cheaply. Also rejected: making the guard sleep
through a breaker or a daily cap. Waiting out a 72-hour breaker inside a process
is indistinguishable from a hang; only the spacing deficit is safe to sleep on.

**Interface touched:** `tools/garmin_probe/garmin.py` (`connect`, `probe`, CLI),
new `tools/garmin_probe/garmin_guard.py`, `tools/garmin_probe/test_garmin.py`,
`docs/ci-gates.md`.

**Acceptance criteria:**

- Every Garmin request in this repo passes through a guard reservation; there is
  no code path that calls the network without one.
- The library's credential cascade is unreachable from the token path, asserted
  rather than assumed.
- Each of the five safety properties has a test that fails when the property is
  removed, and the ledger row records what was broken to prove it.
- `guard status` reports remaining budget and breaker state without making a
  call.
- No real Garmin request is made at any point in this task.
- All seven repo gates green.

**Assumptions:**

- The guard's numbers (login 2/day at 900s spacing; data 20/min, 600/day at 2s)
  are safety margins derived from field reports, not published thresholds. No
  one has published Garmin's actual limits. A 429 is new information about the
  threshold, never something to probe deliberately.
- `retry_attempts=0` is free for 429 protection because `_is_retryable` already
  excludes 429 and auth errors — verified in source, not assumed.

---

## Checklist

- [x] Rescue the guard from `/tmp` into `tools/garmin_probe/`, selftest passing
- [x] Verify the credential-cascade guard condition against library source
- [x] Wire the guard into `connect()` (login bucket) and `probe()` (data bucket)
- [x] Assert no credentials on the token path
- [x] `retry_attempts=0`
- [x] 429 aborts the sweep instead of continuing into a limited endpoint
- [x] Re-persist the token after the sweep
- [x] `guard status` subcommand
- [x] Five properties, five tests, each proven by removal
- [x] Gate-ledger row with what was broken

## Commits

- `758a2dc` -- this task's entire diff (guard, wiring, tests, ledger row,
  parser fix) landed inside a concurrently-running agent's commit, which
  staged with `git add -A` while these files were staged and unread. The
  commit message describes macro-block work only; the code is correct and
  gate-verified, but its provenance is wrong. Recorded rather than rebased:
  rewriting a branch other agents are actively committing onto would risk
  losing their work to fix a cosmetic attribution problem.
