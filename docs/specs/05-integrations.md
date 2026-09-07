# 05 — Integrations

## Garmin (primary; unofficial; treat as hostile-weather dependency)

Context as of Aug 2026, corrected 2026-08-18 against the library source and live
registries. Garmin's March 2026 auth change killed `garth` (final release 0.8.0,
2026-03-28, deprecation notice on the README). The break was primarily a
**per-account 429 rate-limit keyed on clientId plus account email**, not TLS
fingerprinting: 2 of `python-garminconnect`'s 5 login strategies still use plain
`requests` and are retained as working fallbacks. `python-garminconnect` broke
too -- 0.2.x depended on `garth` -- and the fix **shipped as 0.3.0**, 16 days
later, rebuilding native auth on a mobile SSO flow with curl_cffi TLS
impersonation. It is healthy now (0.3.10, 2026-08-11; zero open issues) and is
effectively the only credible client: the one TLS-capable TypeScript library has
3 stars and is stale since April.

There is **no official self-serve route for one person**. The Connect Developer
Program is documented business-use-only, and its access-request form has been a
"System Maintenance" block since 2026-03-25 (verified live 2026-08-18).

**Device: Fenix 8** (confirmed 2026-08-18). Top capability tier -- HRV status and
baseline, Body Battery, sleep staging and sleep score, Training Readiness,
Training Status, and native running dynamics all available. Every overnight
metric is gated on the watch being **worn asleep**, not on the model.

**Strategy: pull into our own store; never serve an MCP tool live from Garmin.**

- **Decided 2026-09-07: the partner bridge is primary.** intervals.icu holds
  genuine Garmin partner OAuth and issues a self-serve personal API key; it
  relays the wellness metrics within minutes of a sync and carries the outbound
  watch push. `python-garminconnect` is retained as a **manual fallback** for
  deep pulls and backfill — it is the only route to Garmin's own Training
  Readiness factors and its acute/chronic load pair, but its per-account 429
  locks the account for 48-72 hours and it cannot run on Vercel. Choosing the
  bridge removes Python from production entirely. See `docs/decisions.md`
  2026-09-07.
- **Still unverified, and gating:** the bridge's wellness field coverage. The G1
  probe in `07-wiring-todo.md` must run and be recorded before any schema leans
  on a bridge-supplied field.
- Store Garmin's own `dailyTrainingLoadAcute` / `dailyTrainingLoadChronic` and
  Training Readiness alongside our computed values. They are a free independent
  oracle; disagreement is the signal calibration needs.
- **Never retry against Garmin auth.** The 429 is per-account and inescapable by
  changing IP or headers, lasting 48-72+ hours with no recovery process. Fail
  closed, alert, wait. Any interactive MFA bootstrap happens on the laptop.
- Tokens live in Postgres, not on disk -- there is no durable volume in this
  architecture.
- Staleness is a visible flag in `rocket_get_status`, and the system runs fully on
  manual logs + check-ins during outages (invariant #2).

## The daily pass (the only scheduled job)

One cron, once a day, four steps in order, then the outbound write below.

1. **Ingest** — pull yesterday's activities and wellness from the bridge. Store the raw payload losslessly alongside the mapped rows.
2. **Recompute** — score stress for anything new, then ATL/CTL/TSB and the trailing-14-day trend, by code over the full series with the coverage window stated. Never by reading a list.
3. **Evaluate replan triggers** — the five in `03-planner.md`. A trigger that fires runs the deterministic planner over the rolling window; nothing else writes sessions.
4. **Write a coach note** — one dated line saying what the pass found and what it changed, stored as a note rather than sent anywhere. It is waiting in `rocket_get_status` when the next conversation opens. Web push stays deferred (decision of 2026-09-06): that deferral covers the delivery channel, not this computation, which earns its keep with no push at all.

**Failure is loud, because the interesting failure is silence.** The cron runs at most once a day, within about an hour of its slot, is never retried, and a missed run leaves no log — so the alert cannot be raised by the job. A dead-man's switch (healthchecks.io) is pinged only at the end of a successful pass, and the absence of that ping is the alarm. A pass that runs and fails still writes its coach note saying so, and staleness stays a visible flag in `rocket_get_status` (invariant #2).

## Outbound: the plan on the wrist

One direction, one call, no compiler. The last step of the daily pass writes today's planned session to intervals.icu as an **event** (`POST /api/v1/athlete/{id}/events`), on the same personal API key the ingest leg already holds; intervals.icu syncs it to Garmin Connect, which surfaces it on the Fenix 8. The prescription travels as words in the name and description — "Easy 12 km, conversational, road trainer" — not as compiled steps.

It exists because a plan that adapts daily and a watch that still shows yesterday's session make the adaptation decorative: at 06:00 the athlete follows the watch. One POST on a job that has to exist anyway closes that, so it is a step of the daily pass rather than its own milestone, its own stage or an MCP tool.

Out of scope until after 2026-10-24: structured workout steps, pace or HR targets compiled into a workout file, Garmin-direct workout upload via `python-garminconnect`, and any notion of the watch writing back. This block is easy volume with one quality session and one long run a week, which a Fenix 8 user runs to pace or to feel; a compiled workout buys nothing and costs a compiler. If the direct library ever becomes primary, the endpoint changes and this section changes with it.

## DoHardThings (already available via MCP)
Race source of truth. Sync races in range; map to Race entities; assign roles in our store (roles are our concept, not theirs). Attendance ("going") marks which races are mine.

## routr (planned; MCP interface exists)
Downstream of session prescription: planner emits distance + terrain profile + intensity + start point; routr returns a Strava route. Wire after core loop works.

## Work calendar
v1: AvailabilityRule pattern (Mon–Fri 09:00–18:00/19:00, 45-min commute each way) + manual overrides via `rocket_set_availability`. ICS feed integration is a later nice-to-have; don't block on it.

## Strava — API withdrawn, MCP only
**rocket does not use the Strava API.** Strava's API Policy section 5.3, effective
2026-06-01, prohibits using Strava API materials or data "directly or indirectly, in
connection with the development, training, evaluation, or operation of any AI
Application". rocket is one. `tools/strava_probe/` and `docs/STRAVA_SETUP.md` were
deleted on 2026-09-07 and rocket holds no Strava API credentials.

Claude reads Strava through the **official Strava MCP connector**, which is the
subscriber carve-out for reading one's own data. That path is unaffected and needs
nothing from rocket. Nothing in the plan depends on Strava: Garmin covers activities
and wellness, and the routr-publishing idea the old note referred to was never
possible — Strava has no route-creation endpoint.
