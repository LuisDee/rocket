# 01 — Domain model

## Entities

**Athlete** (singleton) — profile: threshold/goal paces (provisional until Lincoln Half confirms), shoe inventory (carbons = race + key long runs; road trainer = daily mileage; Peregrine 16 = trail only), swim status (learning front crawl, one 2-hour session per week), injury notes. No cycling.

**Race** — date, name, distance, **role** (`goal | tune-up | rehearsal | sharpener | easy | dropped`), droppable. Live set is `config/training.ts` `RACES`; this list is an extract. Ratified 2026-09-07:
- 2026-09-12 Battersea Park Half — tune-up (same park as the goal; its result sets goal pace)
- 2026-10-04 Lincoln Half — rehearsal (marathon pace, carries week 4's long session)
- 2026-10-11 ASICS LDNX 10K — sharpener (carries week 5's long session)
- 2026-10-24 Battersea Park Marathon — **goal**

A race on a date is visible to session placement: a long or quality session may not
land on a live race date unless that week names the race as carrying it. Nothing
enforced this before 2026-09-07 and the peak long run was scheduled on Lincoln day.

**Attendance is not derivable.** DoHardThings records "going" in Google Calendar
`extendedProperties`, which the Calendar connector does not return, so `RACES` is
ratified by hand until a `rocket_import_race` seam exists.

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
