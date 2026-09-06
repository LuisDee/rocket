# Strava setup

Strava needs an API application registered under your own account. There is no way to
automate this — it is a form on their site.

## Register the application (5 min)

1. Go to <https://www.strava.com/settings/api> while signed in.
2. Fill the form:
   - **Application Name**: `rocket`
   - **Category**: `Training`
   - **Website**: anything you own; it is not verified
   - **Authorization Callback Domain**: `localhost`

   Strava validates the callback **domain**, not the full URL, so `localhost` is
   sufficient for the one-time local exchange. Change it to the real domain when rocket
   deploys and needs the webhook.

3. Save. You now have a **Client ID** and a **Client Secret**.

## Store the credentials (1 min)

```
pass insert strava/client-id
pass insert strava/client-secret
```

## Authorise (3 min)

```
cd tools/strava_probe
uv run python strava.py url          # prints the URL — open it
uv run python strava.py exchange <code-from-the-redirect>
```

The browser will fail to load `localhost` after you approve. That is expected; the
`code=` value in the address bar is still valid.

**Tick every box on the consent screen.** Strava presents scopes as individual
checkboxes the athlete can decline. Without `activity:read_all` every read silently
omits private activities — no error, just missing runs. `exchange` verifies the granted
scope with an exact-token match and refuses a downgraded grant rather than letting you
discover it months later.

## Why Strava at all, given Garmin is the source

Garmin is the richer source and stays primary — Strava strips HRV, Body Battery, sleep
staging and Training Readiness. Strava earns its place as:

- a **fallback activity feed** if the unofficial Garmin client breaks mid-block, which
  it has done twice in the last twelve months;
- the publishing target when routr generates a route later.

## What ports from DoHardThings

`~/dev/DoHardThings` already has a working Strava integration. Verified against source:

| File                        | Lines | Ports?                                                                              |
| --------------------------- | ----- | ----------------------------------------------------------------------------------- |
| `lib/strava-crypto.ts`      | 44    | Yes — AES-256-GCM token encryption, domain-free                                     |
| `lib/strava-token.ts`       | 75    | Yes — refresh-on-use seam, persists rotated tokens                                  |
| `lib/strava-oauth.ts`       | 88    | Yes, with the callback URL changed                                                  |
| `lib/strava-day.ts`         | 25    | Yes — local-timezone day-key derivation, tested against the 23:30-run and DST cases |
| `lib/strava-scope.ts`       | 23    | Yes — the exact-token scope check, same trap as above                               |
| `lib/strava-store-types.ts` | 42    | Shape only — rocket persists to Postgres, not Upstash                               |
| `lib/strava-ingest.ts`      | 37    | Shape only — DHT projects to a calendar entry; rocket needs the full activity       |
| `lib/strava-webhook.ts`     | —     | Later, once rocket has a public URL                                                 |

Its env var names, read from source: `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`,
`STRAVA_TOKEN_ENC_KEY`, `STRAVA_WEBHOOK_VERIFY_TOKEN`. Note these are absent from DHT's
`.env.example` — that file is stale, so read the source rather than the example.

**Do not port** `lib/strava-format.ts`, `strava-views.ts`, `strava-push.ts` or
`strava-map.ts`: all render DoHardThings' own UI.
