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

## 5. Strava: nothing to do — withdrawn

**Do not create a Strava API application.** The step that used to live here was
withdrawn on 2026-09-07: Strava's API Policy section 5.3, effective 2026-06-01,
prohibits using Strava data "in connection with the development, training,
evaluation, or operation of any AI Application", and rocket is one. See
`docs/decisions.md`, "the Strava API is withdrawn".

Claude still reads Strava through the official Strava MCP connector, which is the
subscriber carve-out for reading your own data. That path is unaffected and needs
nothing from you.

Outstanding on you, whenever convenient: revoke the Strava API application at
strava.com/settings/api and remove the `strava/client-id` and
`strava/client-secret` entries from `pass`. Nothing breaks if you leave them; they
are simply credentials with no sanctioned use.

**Uploads too — settled 2026-09-07, and it changes a feature.** The open question
was whether rocket could upload a cropped FIT file for you, since the file is one
your own watch recorded and contains nothing of Strava's. It cannot. Policy
section 5.3 restricts the _API itself_, not only Strava's data: uploading needs a
registered developer application and its API token, and using that token to run
an AI application is the thing 5.3 forbids. Section 3.5 points every personal AI
use at the Strava MCP instead — which is the connector you already have, and
which exposes eleven tools, every one of them a read. No upload exists on it.

So the crop-and-ship pipeline ends at the preview. Rocket pulls the activity,
crops it, runs the forensic inspector and shows you what changed; **you tap
upload in Strava yourself, exactly as you do today.** The two useful thirds are
unaffected — the crop and the inspection were always the work, the upload was
always one tap. Reasoning and section quotes: `docs/decisions.md`, "Strava
uploads are prohibited; the pipeline ends at the preview". Enforced, not merely
written down, by `scripts/check_no_strava_api.py`.

## 6. Back up your FIT files — DONE 2026-09-07

`~/dev/routr/artifacts/fit_crop/` holds 31 files and 5.9 MB of your only local
training history, and it is gitignored — one `git clean` from gone.

Backed up 2026-09-07 to
`~/Library/Mobile Documents/com~apple~CloudDocs/fit-history-backup-2026-09-07`
(32 entries, 6.1 MB). Re-run the copy after any block of new activities; the source
is still the only working copy inside `~/dev`.

## 7. Add rocket as a connector on your phone (3 min, once it is deployed)

**Blocked until rocket is deployed.** There is no `rocket` project on your Vercel
account yet, so there is no URL to paste. Everything below is ready for the
moment there is one.

No sign-in flow is needed and nothing has to be built for this — the question of
whether rocket needed its own OAuth server was settled on 2026-09-07 and the
answer is no. The endpoint already accepts the shared secret two ways.

1. Generate the secret once, if you have not: `openssl rand -hex 32`, then
   `pass insert rocket/mcp-token`. Hex on purpose — a base64 secret containing
   `+` breaks when it travels in a URL, because `+` decodes to a space.
2. Set `MCP_BEARER_TOKEN` to that value in the Vercel project's environment
   variables, alongside `DATABASE_URL`. Until it is set, the endpoint
   authenticates nothing and is dormant, which is the safe default rather than
   an open one.
3. On the phone: Claude app → **Customize → Connectors → Add custom connector**.
4. Paste the URL **with the token on it**:

   ```
   https://<your-rocket-domain>/api/mcp/mcp?token=<the hex secret>
   ```

5. If a dialog asks for **Authentication**, choose **None**. That is not a
   security hole here — the token in the URL is the credential, and "None" only
   means Claude will not run a sign-in flow of its own. If your dialog has no
   Authentication selector at all, you have the older one-step version; just add
   it.
6. Name it `rocket`. Open a new chat, and check the tool list shows six tools,
   each prefixed `rocket_`. Ask it "what's my status" — `rocket_get_status` is
   built to open every conversation.

**If you see a `Request headers` section in that dialog**, prefer it: paste the
bare URL with no `?token=`, add header `authorization` with the value
`Bearer <the hex secret>` — including the word `Bearer` and the space, since
Claude sends the value exactly as typed — and choose **None** for
Authentication. That keeps the secret out of the URL, which is the better shape.
The section is a limited beta, so it may simply not be there; the URL form works
either way.

**To change the token later you must remove the connector and add it again.**
Authentication settings are frozen once a connector is added.

---

## What I do once you have done the above

Design the schema against the real catalogue, then wire ingest for both sources. Until
step 4 produces a catalogue, any schema I write is a guess.
