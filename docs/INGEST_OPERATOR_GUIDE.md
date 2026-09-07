# Ingest operator guide

The Mac-side half of the crop pipeline. Polls Garmin for new activities, crops
each one through routr, runs the forensic inspector over the result, and queues
it at `pending` for review at `/activities`.

It stops there. rocket does not upload to Strava — their API policy 5.3
prohibits it (`docs/decisions.md`, 2026-09-07) — so the last step is you tapping
**Download cropped FIT** on the approval screen and uploading by hand.

## Running it

```bash
cd tools/ingest
uv run ingest.py --once      # one pass
uv run ingest.py --status    # what the rate-limit guard would allow right now
```

`--status` first if anything looks wrong. It reads the guard's on-disk ledger,
so it tells you about a breaker opened by a previous process, not just this one.

## Scheduling

`local.rocket.ingest.plist` runs a pass every 30 minutes. It is **not**
installed:

```bash
cp tools/ingest/local.rocket.ingest.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/local.rocket.ingest.plist
```

Unload with `launchctl unload`. Logs at `/tmp/rocket-ingest.{log,err}`.

The laptop has to be awake. A missed pass costs nothing — the next one picks up
whatever appeared, because activities are selected by "not already in the table"
rather than by a time window.

## What it will not do

**It will never log in with a password.** The token in
`tools/garmin_probe/out/token.json` refreshes itself; the credential path is
deliberately unreachable from here. Garmin's 429 is keyed to the _account_,
cannot be dodged by changing IP, and lasts 48–72 hours with no recovery process,
so the guard refuses rather than retries, and a refusal ends the pass.

If you see `guard refused`, do nothing. Wait it out and read `--status`.

## Reading the heartbeat

Every pass writes a `sync_runs` row under job `garmin-ingest`, success or
failure. Silence means the scheduler is not running — which looks identical to
a quiet week, and is the reason the row exists at all.

```sql
select ran_at, ok, detail from sync_runs
where job = 'garmin-ingest' order by ran_at desc limit 10;
```

## When an activity lands as `failed`

The queue shows it with the error. The most likely cause is the cropper
declining to vouch for its own output — it validates lap and record counts after
cropping and exits 2 if they moved, which is it working, not breaking. That file
needs looking at by hand; the pipeline deliberately carries on to the next
activity rather than stopping.

## The routr dependency

`ROUTR_PINNED_COMMIT` in `ingest.py` records the checkout the tests were run
against. routr is actively developed and read-only from here — nothing is ever
written into it. If the cropper changes, bump the pin deliberately and re-run
`uv run pytest test_ingest.py`, because a cropper change changes what lands in
your queue.

## Known gap

routr's clean fixtures contain **no file that crops successfully** — four have
zero timer pauses and the fifth fails the cropper's own metric validation. So
the successful-crop path is covered by live runs rather than by a fixture. If
you ever produce a cropped file you trust, it is worth committing as one.
