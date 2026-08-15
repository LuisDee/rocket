# 07 — Wiring todo (external dependencies, in order)

## Build order (each milestone independently useful)
1. **M1 — Core loop, zero integrations.** Domain model + load engine + planner + MCP tools, manual `log_activity` and `daily_checkin` only. Seed with 06-training-block. *This is already a usable coach.*
2. **M2 — PWA.** Calendar view + 30-second check-in + one-tap context tags. iOS home-screen install.
3. **M3 — Garmin sync.** python-garminconnect 0.3.x (pinned), daily pull job, token persistence, staleness flag. Wellness data upgrades readiness scoring.
4. **M4 — DoHardThings sync.** Races auto-import; roles assigned locally.
5. **M5 — routr.** `propose_route` wired to routr MCP.
6. **M6 — Calibration.** Prediction-vs-outcome tuning of stress multipliers from accumulated data.

## External tasks on Luis (not code)
- [ ] Garmin: confirm watch model (determines available wellness fields).
- [ ] Garmin: one-time interactive auth (MFA) on the server; durable token volume.
- [ ] Decide run-commute participation (full ~15km / partial / no) — gates M1 volume placement.
- [ ] Confirm or move Friday Immerse lesson slot vs 18/19:00 work finish.
- [ ] Buy road daily trainer (Ride/Triumph class); log shoe inventory.
- [ ] routr: expose its MCP endpoint to this server; document its tool contract.
- [ ] DoHardThings: confirm attendee email used for "going" matching.
- [ ] (Deferred) Strava OAuth only when routr publishing needs it.

## Open questions carried into build
- Lincoln Half result → goal MP derivation formula (planner needs the rule, e.g. HM pace + 15–20s/km at current fitness curve).
- Whether swim load should influence run readiness gating or only total-load accounting (start: total-load only; revisit with data).
- ICS work-calendar feed: later, only if manual availability proves annoying.
