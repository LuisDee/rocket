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

- Two candidate sources, decided by a probe before any schema is designed (see
  the plan): a **partner bridge** (intervals.icu holds genuine Garmin partner
  OAuth and exposes a self-serve personal API key), or **`python-garminconnect`
  direct** on a scheduled runner. The bridge is less fragile; the direct library
  is the only route to Garmin's own Training Readiness factors and its
  acute/chronic load pair. Field coverage of the bridge is unverified.
- Store Garmin's own `dailyTrainingLoadAcute` / `dailyTrainingLoadChronic` and
  Training Readiness alongside our computed values. They are a free independent
  oracle; disagreement is the signal calibration needs.
- **Never retry against Garmin auth.** The 429 is per-account and inescapable by
  changing IP or headers, lasting 48-72+ hours with no recovery process. Fail
  closed, alert, wait. Any interactive MFA bootstrap happens on the laptop.
- Tokens live in Postgres, not on disk -- there is no durable volume in this
  architecture.
- Staleness is a visible flag in `get_status`, and the system runs fully on
  manual logs + check-ins during outages (invariant #2).

## DoHardThings (already available via MCP)
Race source of truth. Sync races in range; map to Race entities; assign roles in our store (roles are our concept, not theirs). Attendance ("going") marks which races are mine.

## routr (planned; MCP interface exists)
Downstream of session prescription: planner emits distance + terrain profile + intensity + start point; routr returns a Strava route. Wire after core loop works.

## Work calendar
v1: AvailabilityRule pattern (Mon–Fri 09:00–18:00/19:00, 45-min commute each way) + manual overrides via `set_availability`. ICS feed integration is a later nice-to-have; don't block on it.

## Strava (optional, deferred)
Garmin covers activities + wellness. Strava adds only routr publishing and social. Wire only when routr needs it.
