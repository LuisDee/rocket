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
- Ramp rate = week-over-week CTL change; the guardrail input (see 03).

## Readiness score (daily)
Computed each morning after check-in:
- Subjective: soreness (dominant term — severe DOMS gates all quality regardless of anything else), sleep, motivation, yesterday-RPE.
- Objective when available: HRV vs baseline, resting HR vs baseline, body battery, sleep score.
- Output: `green | amber | red` + short rationale string surfaced to the user.
- Red ⇒ today becomes easy/swim/rest, replan triggers. Amber ⇒ intensity capped. Missing Garmin data must not distort the score — weights renormalize.

## Calibration
Start with defaults, then fit against lived pairs the system accumulates ("felt like butter" vs "tumble dryer" outcomes at known loads). Store prediction-vs-outcome so multipliers can be tuned. Keep the model inspectable — the LLM should be able to read and explain every number.
