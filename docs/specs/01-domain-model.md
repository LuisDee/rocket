# 01 — Domain model

## Entities

**Athlete** (singleton) — profile: threshold/goal paces (provisional until Lincoln Half confirms), shoe inventory (carbons = race + key long runs; road trainer = daily mileage; Peregrine 16 = trail only), swim status (learning front crawl, one 2-hour session per week), injury notes. No cycling.

**Race** — date, name, distance, **role** (`goal | rehearsal | sharpener | easy | absorbed`), droppable=false for all current entries. Synced from DoHardThings. Current set:
- 2026-10-03 Dorney Triathlon — easy (swim leg is the week's swim session)
- 2026-10-04 Lincoln Half — rehearsal (marathon pace, confirms goal pace)
- 2026-10-11 ASICS LDNX 10K — sharpener (inside taper)
- 2026-10-24 Battersea Park Marathon — **goal**

**Block / Week** — macro layer. Each week: target load, target km, phase (`rebuild | build | peak | race-prep | taper | race`), max quality sessions.

**Session** — micro layer, rolling 7–10 day window only. Type (`easy | steady | quality | long | swim | swim-lesson | rest | race`), planned distance/duration, intended intensity, prescribed shoe + surface, time slot, status (`planned | done | modified | skipped`), link to Activity when completed, optional routr route.

**Activity** — what actually happened. Source (`garmin | manual`), distance, duration, pace, HR data if present, elevation, **context tags** (shoe, surface — one-tap in PWA), computed stress score, subjective RPE.

**CheckIn** — daily: RPE of yesterday, soreness (location + severity scale that separates *tired* from *tumble-dryer*), sleep quality, motivation, free-text note. 30 seconds max to complete.

**AvailabilityRule** — recurring: weekday working hours, commute each side, one weekly 2-hour swim slot. Six evenings are free, so evening runs and AM/PM doubles are available — which is what makes a high-volume block feasible. Plus one-off overrides ("in Leeds Thursday", "half day Friday").

**WellnessSnapshot** — per day from Garmin when sync is alive: HRV, resting HR, sleep, body battery. Nullable throughout; readiness must compute without it.

## Key relationships
- Session → Activity (fulfilled-by), enabling planned-vs-actual variance.
- Activity + CheckIn + WellnessSnapshot → daily Readiness (see 02).
- Race roles constrain the Week phases around them (see 03).
