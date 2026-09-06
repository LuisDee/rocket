# Access setup

Everything below needs your hands. Nothing else in rocket can proceed without it, and
none of it can be automated. Total: about 25 minutes of attention plus a wait.

Do them in this order. Step 1 first because it runs on a clock.

## 1. Request the Garmin bulk export (2 min, then 24-48h wait)

Garmin Connect on the web -> Account Settings -> Data Management -> Export Your Data.

This is the historical backfill. Rocket's chronic-load figure is a 42-day rolling
average, so without history it starts at zero and climbs for six weeks purely because
the window is filling — producing false "you are overreaching" readings during exactly
the weeks the block is being established, and leaving taper decisions in early October
computed off a number that only became meaningful in mid-September.

It is free, it is Garmin's own sanctioned export, and it is the only route to the
complete wellness history. The wait is why it goes first.

## 2. Store your Garmin credentials (2 min)

```
pass insert garmin/email
pass insert garmin/password
```

Read at call time and never written to a file, argv, or shell history. If you would
rather not store the password at all, `export GARMIN_EMAIL=... GARMIN_PASSWORD=...` in
the shell for the single bootstrap run works too — the harness reports which source it
used.

## 3. Run the Garmin bootstrap (5 min, needs your MFA code)

```
cd tools/garmin_probe
uv run python garmin.py bootstrap
```

If your account has MFA it will ask for the code. To pass it without a prompt:

```
echo 123456 > /tmp/mfa && uv run python garmin.py bootstrap --mfa-file /tmp/mfa
```

**If it fails, stop.** Do not re-run it. Garmin's rate limit is keyed to your account,
cannot be escaped by changing network, and locks you out for 48-72 hours with no
recovery process. The harness never retries for this reason; tell me the error instead.

## 4. Run the probe (2 min, unattended)

```
uv run python garmin.py probe
```

Sweeps ~40 endpoints and writes `CATALOGUE.md` — the field names and shapes, no values.
That catalogue is what the database schema gets designed against, so the foundation
accommodates every field Garmin exposes even where the first release ignores it.

The raw JSON stays in `out/`, gitignored: it is your health data and a live refresh
token.

## 5. Create a Strava API application (10 min)

See [STRAVA_SETUP.md](STRAVA_SETUP.md) for the click-path. Summary: register the app,
store the two credentials, approve the consent screen with **every box ticked**, and
paste the code back.

## 6. Back up your FIT files (1 min)

`~/dev/routr/artifacts/fit_crop/` holds 18 files and 5.9 MB of your only local training
history, and it is gitignored — one `git clean` from gone. Copy it to iCloud Drive or
anywhere that is not that folder.

---

## What I do once you have done the above

Design the schema against the real catalogue, then wire ingest for both sources. Until
step 4 produces a catalogue, any schema I write is a guess.
