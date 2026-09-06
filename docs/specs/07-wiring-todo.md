# 07 — Wiring todo (external dependencies, in order)

## Build order (each milestone independently useful)
1. **M1 — Core loop, zero integrations.** Domain model + load engine + planner + MCP tools, manual `log_activity` and `daily_checkin` only. Seed with 06-training-block. *This is already a usable coach.*
2. **M2 — PWA.** Calendar view + 30-second check-in + one-tap context tags. iOS home-screen install.
3. **M3 — Garmin sync.** Source decided by probe. If the bridge carries the
   wellness fields this is roughly a day: webhook plus reconcile-on-read plus the
   staleness flag, no Python and no token persistence. If it does not, it is
   `python-garminconnect` on a scheduled runner with the token row in Postgres.
   Wellness data upgrades readiness scoring. **The historical backfill does not
   wait for this** — it is decoupled and lands in M1.
4. **M4 — DoHardThings sync.** Races auto-import; roles assigned locally.
5. **M5 — routr.** `propose_route` wired to routr MCP.
6. **M6 — Calibration.** Prediction-vs-outcome tuning of stress multipliers from accumulated data.

## External tasks on Luis (not code)
- [x] Garmin: confirm watch model -- **Fenix 8** (2026-08-18). Top tier; every
      wellness field exists, gated on wearing it asleep rather than on the model.
- [ ] Garmin: run the source probe (bridge vs direct library) before any schema.
- [ ] Garmin: request the bulk account export -- 24-48h turnaround, the only
      sanctioned complete-history source. Blocks the backfill, so request early.
- [ ] Garmin: confirm whether the watch is worn asleep, and for how long
      continuously (HRV status/baseline stay null until ~3 weeks of nights).
- [ ] Garmin: confirm whether a chest strap or running pod is owned (ground
      contact balance needs one on every device ever made).
- [ ] Decide run-commute participation (full ~15km / partial / no) — gates M1 volume placement.
- [ ] Confirm or move Friday Immerse lesson slot vs 18/19:00 work finish.
- [x] Buy road daily trainer (Ride/Triumph class); log shoe inventory. **Done 2026-09-06** -- trainer bought and in use, carbons ready for the Battersea Half on 12 Sep. Inventory recorded in `config/training.ts` `SHOES.inventory`. This was a prerequisite for the volume ramp: 45-58 km weeks on carbons or trail shoes was a named injury risk, now retired. Note the trainer is NEW, so its early runs carry the novelty multiplier.
- [ ] routr: expose its MCP endpoint to this server; document its tool contract.
- [ ] DoHardThings: confirm attendee email used for "going" matching.
- [ ] (Deferred) Strava OAuth only when routr publishing needs it.

## Open questions carried into build
- Lincoln Half result → goal MP derivation formula (planner needs the rule, e.g. HM pace + 15–20s/km at current fitness curve).
- Whether swim load should influence run readiness gating or only total-load accounting (start: total-load only; revisit with data).
- ICS work-calendar feed: later, only if manual availability proves annoying.
