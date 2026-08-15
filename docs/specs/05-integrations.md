# 05 — Integrations

## Garmin (primary; unofficial; treat as hostile-weather dependency)
Context as of Aug 2026: Garmin's March 2026 auth change killed `garth` (deprecated) and added Cloudflare TLS fingerprinting blocking plain HTTP clients. **`python-garminconnect` 0.3.x survived** by rebuilding native auth (mobile SSO flow + curl_cffi TLS impersonation, Safari/Chrome/Edge fallback strategies, auto token refresh; sessions persist once logged in). The official developer program rejects personal-use applications — not an option.

**Strategy: library-in-our-server, not third-party MCP in the critical path.**
- Daily sync job (plus `sync_now`) pulls activities + wellness (HRV, resting HR, sleep, body battery) via `python-garminconnect` into our own store. All MCP tools serve from the store, never live from Garmin.
- Pin the library version; subscribe to its GitHub issues; expect breakage on Garmin's timetable, not ours.
- Persist OAuth tokens on a durable volume (re-login risks 429 rate-limit lockouts). MFA handled once interactively at setup.
- Staleness is a visible flag in `get_status`, and the system runs fully on manual logs + check-ins during outages (invariant #2).
- Reference implementation for tool ideas: Taxuspt/garmin_mcp (110+ tools incl. CTL/ATL/TSB over the same library) — steal patterns, don't depend on it.

## DoHardThings (already available via MCP)
Race source of truth. Sync races in range; map to Race entities; assign roles in our store (roles are our concept, not theirs). Attendance ("going") marks which races are mine.

## routr (planned; MCP interface exists)
Downstream of session prescription: planner emits distance + terrain profile + intensity + start point; routr returns a Strava route. Wire after core loop works.

## Work calendar
v1: AvailabilityRule pattern (Mon–Fri 09:00–18:00/19:00, 45-min commute each way) + manual overrides via `set_availability`. ICS feed integration is a later nice-to-have; don't block on it.

## Strava (optional, deferred)
Garmin covers activities + wellness. Strava adds only routr publishing and social. Wire only when routr needs it.
