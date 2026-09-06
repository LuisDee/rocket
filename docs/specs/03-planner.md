# 03 — Planner

## Two-layer planning
- **Macro:** weekly load/km targets per phase, anchored backward from the goal race. Regenerated only when something structural changes (race added, injury week, target pace revision after Lincoln).
- **Micro:** concrete sessions for a rolling 7–10 days, placed into availability slots (work + commute + the weekly swim + Baker markers). Regenerated weekly and on any replan trigger.

## Session placement rules
- One long run per week (weekend default), one quality session max in build phase, never on consecutive days, never the day after a race or long run.
- The weekly swim coexists with an easy run on the same day; never with quality + long combined.
- Long runs and races: carbons. Daily mileage: road trainers. Trail sessions: Peregrines — and any *first* trail/elevation exposure gets a conservative distance cap (lesson learned 2026-08-09).
- Run-commute slots (Colindale→City ~15km, or partial) are the preferred vehicle for easy volume **if enabled** in availability — one lever among several. Six evenings are free — swimming takes only one — so evening runs and AM/PM doubles carry most of the volume.

## Replan triggers
1. Daily check-in red/amber readiness.
2. Ad-hoc activity logged that deviates >20% from plan (the spanner).
3. Availability change.
4. User asks via MCP (`replan` with free-text reason).
5. Weekly rollover.

Replans edit the rolling window only, keep weekly load target if achievable, otherwise adjust and log the debt/surplus against the macro layer. **Every replan returns a diff + plain-language rationale.**

## Hard guardrails (negotiate, never silently break)
- Ramp cap: weekly run km ≤ +15% week-over-week (rebuild weeks after forced rest may use the pre-rest baseline).
- ≥1 full rest or swim-only day per week.
- No quality session while soreness ≥ moderate or readiness red.
- Taper is protected: final 2 weeks, no session may be added that raises weekly load above taper targets; LDNX 10K is the only intensity in taper week 1.
- Race roles are enforced: Lincoln executed at marathon pace, not raced; Dorney easy.
- Guardrail conflict response pattern: state the rule, quantify the cost of breaking it, offer the closest compliant alternative, let the user explicitly override all but taper/injury gates (overrides are logged).

## Aggression policy
"Overly aggressive" is honored as: run every ramp week at the cap, maximize easy-volume density (run-commutes, doubles late in block), hold intensity to plan. It is **not** extra quality sessions or racing the rehearsals.
