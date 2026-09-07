# 02 — Load engine

## Stress scoring
Every Activity gets a training stress score (TSS-like). Inputs, best-available cascade:
1. HR-based (TRIMP-style) when Garmin HR data present.
2. Pace-vs-threshold when pace + athlete thresholds known.
3. RPE × duration (Foster session-RPE) as the floor — always computable from check-in/manual log.

**Context multipliers (mandatory):**
- Elevation: significant descent adds eccentric-load stress *beyond* what pace/HR shows. The 33km/600m trail run that wrecked the athlete scored similar pace-stress to a flat 30km road run that felt easy — the model must separate them.
- Surface: trail/uneven > road for musculoskeletal cost at equal cardio cost. Track cardio stress and musculoskeletal stress as **two components**, not one number.
- Footwear novelty: first/early uses of a shoe add musculoskeletal stress. Decay the multiplier as uses accumulate.
- Swim: real training stress (learning stroke is fatiguing) but near-zero musculoskeletal/impact component. This is why swim continues untouched during run-recovery weeks.

## Rolling load state
- **ATL** (acute, ~7-day EWMA) and **CTL** (chronic, ~42-day EWMA) per stress component; **TSB = CTL − ATL**.
- Ramp rate: the guardrail input is **weekly run km**, week-over-week, matching `03-planner.md` and `GUARDRAILS.rampCapPct`. Week-over-week CTL change is reported alongside it and enforces nothing.

**ATL, CTL and TSB are trend displays. No session is gated on a TSB or CTL value.** The 7- and 42-day constants are conventions rather than fitted parameters: they were never identified against outcome data (Hellard 2006), and where they have been fitted the values move with the load metric you feed them (Vermeire 2022). A threshold on TSB therefore thresholds a number with no calibrated meaning. That applies to a difference exactly as it does to a ratio — the repo already refuses acute:chronic ratio gating (Lolli 2019, Impellizzeri 2020), and TSB is the same pair of numbers subtracted instead of divided. Decisions come from the single-session cap, the weekly ramp cap, the soreness gate and the readiness verdict; the load curves are there to be read, explained and argued with.

## Readiness score (daily)
Computed each morning after check-in:
- Subjective: soreness (dominant term — severe DOMS gates all quality regardless of anything else), sleep, motivation, yesterday-RPE.
- Objective when available: HRV vs baseline, resting HR vs baseline, body battery, sleep score.
- Output: `green | amber | red` + short rationale string surfaced to the user.
- Red ⇒ today becomes easy/swim/rest, replan triggers. Amber ⇒ intensity capped. Missing Garmin data must not distort the score — weights renormalize.

**Late swims (recorded, inert).** A swim ending after 20:30 local flags the following morning's HRV and sleep-score terms as suspect: they drop out of the objective block for that day and the remaining objective weights renormalise. Exercise close to sleep suppresses overnight HRV and shortens sleep (Leota 2025, 14,689 people, ~4 million nights), and learning front crawl is breathless work, so the reading reflects last night's pool rather than accumulated training fatigue. Wall-clock cutoff rather than bedtime-relative because there is no bedtime source: check-ins carry sleep as a rating, and Garmin's `sleepStartTimestampLocal` comes back null. No new column and no new readiness term — swim end time is already start time plus duration.

The rule is **inert until the watch is worn asleep**. `hrv_day`, `hrv_range_7d` and `sleep_daily_7d` are empty across a full week of probe output, so there is currently nothing for it to exclude, and at one swim a week it can fire at most seven times in the whole block. It is written down so it is not rediscovered, and implemented with the readiness formula, not before.

## Calibration
Start with defaults, then fit against lived pairs the system accumulates ("felt like butter" vs "tumble dryer" outcomes at known loads). Store prediction-vs-outcome so multipliers can be tuned. Keep the model inspectable — the LLM should be able to read and explain every number.
