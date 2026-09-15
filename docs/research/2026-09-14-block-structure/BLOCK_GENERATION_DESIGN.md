# Rocket block generator v2: role-based weeks, block management and adaptation

This is the final design, revised after the coach review and the engineering review of the 14 Sep draft. I worked in INVESTIGATE mode: I read the rocket worktree at `/Users/luisdeburnay/dev/rocket/.worktrees/m1-core-loop` and wrote nothing to it.

Scratch files for verification only (none are repo files). All are in `/private/tmp/claude-501/-Users-luisdeburnay-dev-routr/0f6602a3-b43a-46c6-b392-056cf6dbcf31/scratchpad/`:
- `gen2.py` implements the section 4 algorithm. The six-week table is its output, not hand-written.
- `variants.py` shows the week each "no" answer to the athlete questions would produce.
- `spread_probe.py` measures day-to-day variety in the five verified plan transcriptions: Pfitzinger 18/55, 18/70 and 12/70, Hansons Advanced and Higdon Intermediate 2. That is 79 weeks without a race.
- `vdot.py` holds the Daniels-Gilbert pace equations.
- `taper_peek.py` prints the last four weeks of each transcribed plan.

Written 15 Sep 2026, so Monday 14 Sep has already passed.

## What changed from the draft

| Area | Draft (14 Sep) | Final |
|---|---|---|
| Marathon pace (MP) | 5:03/km; HR ceilings of 170 and 172 | 5:08-5:15/km; one HR ceiling, 168 |
| Threshold pace | 4:29/km | 4:34-4:38/km |
| MP km per week, 14 Sep to race week | 0 / 8 / 21.1 / 0 / 0 / 3.2 | 0 / 10 / 21.1 / 0 / 6 / 3.2 |
| Longest run in the 20 days before the marathon | 16 km | 20 km, Sun 11 Oct |
| Doubles in the block | 3 | 1 (Tue 29 Sep) |
| Heavy legs sessions | Wed 30 Sep and Wed 7 Oct at full dose; the draft's own legs rule was overridden without a note | Same two days, now chosen by a stated rule (at least 3 days after, 4 days before any race or MP long run), at maintenance dose |
| Variety check | Blocking; longest non-long day at least 1.5x shortest | Advisory rule plus a generator self-test, at least 1.4x |
| Worked table | Hand-written; week 4 did not follow its own formula | Output of the stated algorithm |
| Persistence | Doubles fixed after the stage that generates them | Fixed first; roles stored; stale stored rows regenerated |
| Next block | New `blocks` table and database-owned weeks | Macro layer stays in config |

## 0. What the current generator does (measured, code unchanged)

| Week | Current output (Mon to Sun, km) | What is wrong |
|---|---|---|
| 14 Sep (60) | 7.6 / 7.6 threshold / 7.6 / 7.6 / 7.6 / 22 long with 5.1 MP / rest | Threshold 3 days after a maximal half, on the smallest day; strides every easy day |
| 21 Sep (80) | 10.6 x5 with threshold Wed / rest Sat / 27 long | Rest the day before the long run; equal days |
| 28 Sep (100) | rest / 13.4 x5 (Sat included) / Lincoln 33 | Flat; 13.4 km the day before Lincoln |
| 5 Oct (80) | rest / 12.8 x5 / 10K | Flat (pinned by `placement.test.ts:183-196`) |
| 12 Oct (60) | rest / 10.5 / threshold 10.5 Wed / 10.5 / 10.5 / rest / 18 long with 7.9 MP | Threshold inside the post-10K window; hard long run 6 days out |
| 19 Oct (32) | rest / 11 / 9 / 7 / 5 / marathon | Distances fine; strides every day |

Root causes in code:
1. `placement.distribute()` splits the leftover km evenly across open days.
2. `chooseRestDates()` prefers a rest day before a hard session.
3. `describeWeek()` puts strides on every easy day.
4. Nothing models recovery after a race.
5. **Stored rows win.** `today.prescribeWeek` (lines 102-103) and `lib/plan.ts` prefer stored rows, and the daily pass replans only missing days (`daily-pass.ts:463-483`). A new generator would therefore never reach the roughly 10 days already stored.
6. **Doubles are lost on re-plan.** `store.ts replaceWindow` keys editable rows by date (line 158), so both sessions of a double update one row. `store-memory.ts` does the same and gives both sessions one id.
   - Correction to the draft: `diffWindows` does not lose doubles. It sums a day's sessions, which merges them and hides a slot move.
   - `toPlanned` maps row by row and loses nothing.
   - Nothing in `src` writes `status = 'done'` or `'skipped'` today, so every stored session is `planned`.
7. **The week-2 `days` list is dead data.** `BLOCK_WEEKS` week 2 carries `days` (6/8/10/8/6/22/0), but no planner code reads it. Only these do: `config/training.test.ts:191-214`, `qualitySessionCount()`, and the seeder's `weeks.extra`. The planner wrote it on 2026-09-06 (decisions.md, "the first per-day session layer"); Luis never ratified it.

## 1. Paces (both coach pace issues accepted)

**Anchor.** Battersea Half official result: 1:38:58 over 21.0975 km = 4:41.5/km, i.e. 281.5 s/km.
- Config today scales the GPS distance (21.275 km) down, which gives 4:38.9.
- GPS reads long on a looped park course, so the official figure is the conservative anchor (judgement).

| Zone | Pace | Heart rate | Derivation |
|---|---|---|---|
| Threshold | 4:34-4:38 (centre 4:36) | work-interval mean 172-177 | See below |
| Marathon pace | 5:08-5:15 | ceiling 168 everywhere | See below |
| Easy | 5:49-6:23 | 150 or lower (governs) | Existing multipliers 1.24-1.36 |
| Recovery | 6:23-6:48 | 138 or lower (governs) | Existing multipliers 1.36-1.45 |

**Threshold, 4:34-4:38.**
- The Daniels-Gilbert equations on the official time give a VDOT (Daniels' fitness score) of 45.7. His 60-minute race pace, which is Daniels' threshold, is 4:32.
- I add 1.5% because the half was run in carbon shoes. Hoogkamer et al. 2018 (Sports Med 48:1009-1019, verified this pass) found carbon shoes cut the energy cost of running by 4.0-4.2%. How much of that becomes pace is a judgement.
- This supersedes 4:52 (the July anchor, decisions.md 10 Sep). It also supersedes 4:29, which was the GPS-normalised Battersea pace times a 0.965 multiplier fitted to his July form (12 Sep).
- The self-correction loop stays: if the work-interval mean HR is above 180, slow threshold by 5 s/km.

**Marathon pace, 5:08-5:15.**
- Fast end: his own measured half-to-marathon decay (Riegel exponent 1.1315, from the July half and the May marathon; n=2) applied to the official time. That predicts 3:36:48.
- Slow end: +2.3% for training in daily trainers, and for the half having been carbon-shod and carb-loaded (judgement).
- The current multiplier (x1.085) already assumes half of the durability gain the block is meant to produce.
- His May marathon (5:31/km, VDOT 39.3) predates a 7% half-marathon improvement since July. It bounds the band but does not set it.

**One MP heart-rate ceiling: 168.** This is the top of config's existing 158-168 band. It replaces both the 170 ceiling and the 172 Lincoln trigger.
- Known risk: on 12 Sep a fixed HR gate from July would have slowed him wrongly.
- Here 168 is a slow-down trigger on a run about 10% slower than half pace, where drift is exactly what it should catch.

**Lincoln pacing.**
- First 13.1 km of the half at 5:12-5:15.
- Last 8 km towards 5:05-5:08 only if HR stays under 165.
- Above 168 for 2 km in a row: slow by 10 s/km.
- Afterwards the MP band is re-derived from Lincoln's mean HR and drift and offered as a pace proposal Luis accepts or declines (the Runna Pace Insights pattern).

**Config changes:**
- `PACE_ANCHOR.normalisedPaceSecPerKm` to 281.5, on the official distance.
- `PACE_MULTIPLIERS.marathon` to 1.108, plus a new `marathonBandSecPerKm: 3.5`. This replaces the +/-4 literal in `paces.ts:177-178`.
- `PACE_MULTIPLIERS.threshold` to 0.981, `thresholdBandSecPerKm` to 2.
- `HR_ZONES.marathonCeiling` to 168.
- The athlete is asked in Q6.

## 2. Session library (`SESSION_LIBRARY`, config data)

| Role | Dose | Zone | Placement |
|---|---|---|---|
| rest | 0 km, swim allowed | none | Day after every long session or race, then day after quality, then the earliest free day |
| recovery | 8 km default, 6-10 km | recovery | Day before every long session or race; first run after a raced effort; 2 days before a raced effort |
| recovery-double | 10 km morning + the rest in the evening (at least 25 min, at least 5 h later) | recovery | Overflow ladder only, at most 1 a week. Never on the legs day, the first run after a raced effort, or the 2 days before a race or MP long run |
| general-aerobic | 2/3 of the medium day's share of the remainder | easy | Remaining run days |
| medium | Largest share of the remainder | easy | General-aerobic day furthest from hard sessions |
| long | Macro layer km | easy | Macro date |
| long-mp | Long km x phase fraction (build 0.37); zero inside a post-race window | easy then MP | As long |
| threshold | 20 min (rebuild) or 24 min (build) as 4 x 6 min, 90 s jog; at most 10% of the week and 6.5 km | threshold | Quality day, rebuild and build |
| taper-mp | 6 km at MP inside the quality day | easy + MP | Quality day, taper |
| dress-rehearsal | 11 km with 3.2 km at MP | easy + MP | Goal race minus 4 days; does not spend the quality budget |
| shakeout | 5 km (25-30 min) + 4-6 x 80-100 m | easy | Goal race minus 1 day; counts as one of the week's two stride days |
| race (raced) | Warm-up + race + cool-down | race | Macro; spends the quality budget; 1 easy-only day per 3 km raced |
| race at MP (Lincoln) | The long session | MP | Macro; spends the quality budget; 4 easy-only days after |
| strides (add-on) | 6 x 20 s on up to 2 days | strides | Easy, medium or recovery days. Never the day before quality, long, race or dress rehearsal. Never the first run after a raced effort. Blocked by soreness 3 or more |

- Hill sprints and VO2max intervals stay off in this block (judgement: novel stimulus on a thin base; the raced 10K supplies the supra-threshold work).
- The medium-long run is not a role in this block. `SESSION_LIBRARY.mediumLongMinKm` (17.7) exists only to print the note "no medium-long run: the largest weekday slot (14 km) is under 17.7 km".

## 3. Week rules

### 3.1 Anchors, post-race windows, fixed roles

**Hard sessions:**
- the long session (a race carrying it counts as one session);
- other live races, which are additional to the weekly target;
- the quality session;
- the dress rehearsal.

**Post-race windows** (`POST_RACE`, keyed by a new `RACES[].effort`):
- Raced: 1 easy-only day per 3 km raced (Daniels).
- Marathon-pace rehearsal: 4 easy-only days (Canova).
- Race day is day 0. Days 1 to N are easy-only; quality or MP work is allowed from day N+1.
- Races and ratified long sessions are exempt from the rule, but their MP content is zeroed inside a window.
- This block: Battersea Half Sun 13 to Sat 19 Sep; Lincoln Mon 5 to Thu 8 Oct; 10K Mon 12 to Wed 14 Oct. The 10K sits outside Lincoln's window.

**Fixed roles:**
- Rest on the day after every long session or race (L+1, where L is the long session or race day), whether that session is in this week or the previous one. Pfitzinger does this in 48 of 48 weeks.
- Recovery on the day before it (L-1); the goal race gets a shakeout instead.
- Recovery on the first run after a raced effort.
- Recovery 2 days before a raced effort. All three Pfitzinger tune-up weeks, parsed this pass, put recovery or rest there.
- Race week: dress rehearsal 4 days out, shakeout the day before.

### 3.2 Quality day

- **Budget:** the existing `PRESCRIPTION.qualityPerWeek` minus races in the week. New: the dress rehearsal does not count.
- **Which day:** not a fixed-role day, not easy-only, at least 2 days from every hard anchor. Take the largest minimum gap; ties go to the earliest (existing `chooseQualityDate`, plus the window filter).
- **Type:** threshold in rebuild and build weeks; marathon pace in taper weeks (new, from the coach review).
- **Size:** 17.5% of the week, clamped to 14-25% (Pfitzinger, CORRECTED), capped by the day's slot.

### 3.3 Rest count

- Rest days = 7 - min(minRunDays, 6).
- Preference order: L+1, then Q+1 (the day after quality), then the earliest free day.
- The Pfitzinger run-days-by-volume table is deleted. Every week's `minRunDays` already sits at or above it, so it was dead data (engineer). The tiers remain the rationale for the config values.
- The overflow ladder only reopens rest days added by preference, never an L+1 rest, so it cannot break V4 (section 3.7).

### 3.4 Legs day

- **When chosen:** before sizing.
- **Candidates, in order:** the quality day, then the non-race long day, then general-aerobic days in the section 3.5 order.
- **Skipped:**
  - race day and race eve (existing);
  - any day fewer than 3 days after, or fewer than 4 days before, a race or an MP long session (about 72 h, assuming a morning session and an evening lift; coach review);
  - recovery, dress-rehearsal and shakeout days;
  - weeks 6 and 7.
- **The run on a legs day** goes in that day's earliest slot and is capped at it: 12 km on weekdays. `AVAILABILITY.runSlots` gains `startLocal` for this.
- **Precedence:** if the day's role minimum does not fit that slot, legs moves to the next candidate. If nothing fits, there is no legs session that week, with a note. The note also names any week where legs is not on its first candidate, so no override is silent.
- **Dose:** maintenance in any week with a race, an MP long session or a post-race window day. That is 2-3 sets x 3-5 reps, 2 reps in reserve, no plyometrics, no eccentric emphasis. In this block all four legs sessions are maintenance.

### 3.5 Medium day

- The general-aerobic day (not the legs day) with the largest minimum distance to hard sessions.
- Tie: prefer the larger distance to the next hard session. Pfitzinger 18/70 puts the medium-long run after quality in 7 of 12 cases, not before.
- Then earliest.

### 3.6 Strides

- Up to 2 days a week (`PRESCRIPTION.strides.daysPerWeek`), on eligible days (section 2), picked in the section 3.5 order.
- The shakeout's own strides count as one of the two.
- The soreness gate is unchanged.

### 3.7 Variety: rule id `week-structure`

- **V1.** The longest non-long run day is at least 1.4x the shortest (when there are 3 or more such days).
  - Measured this pass over 79 verified non-race weeks: Pfitzinger never goes below 1.6 (45 weeks); Higdon Intermediate 2 step-back weeks reach 1.2; Hansons Advanced base weeks run 1.0-1.33; the bottom tenth is 1.43.
  - The draft's claim that the lowest confirmed non-Daniels template is 1.52 was wrong.
  - 1.4 rejects uniform weeks (rocket's scores 1.00) without forcing a double Pfitzinger would not use. The week of 5 Oct sits exactly at 1.40.
  - The bound is a judgement.
- **V2.** The quality day is at least the median non-long day and at least 14% of the week.
- **V3.** Every L-1 is rest or at most `recovery.maxKm`, checked per anchor.
- **V4.** Every L+1 is rest, checked per anchor.
- **Advisory, not blocking,** in `evaluateGuardrails`: athlete edits and repairs get a named advisory and are never refused. It is enforced only as the generator's self-test over every macro week.
- `evaluateGuardrails` must emit a result for `week-structure` and `post-race-recovery` on every call. `scenarios.test.ts:61-73` compares `applied_rules` with `Object.keys(GUARDRAIL_RULE_IDS)`, so it needs no edit but fails until both ids emit.
- **Monotony is not used.** Km monotony is not a rule: the flat week scores 1.41 against Pfitzinger's 1.49-1.94. The session-RPE monotony diagnostic from the draft is dropped, since nothing consumes it.

## 4. Generation algorithm (replaces `distribute`, reproduced by `gen2.py`)

`planWeek(week, options)` keeps its parameters. `PlannedSession` gains `role`, which is additive; the draft wrongly said the signature was unchanged.

1. Collect anchors and post-race windows (3.1).
2. Assign fixed roles: L+1 rest, L-1 recovery or shakeout, race-2 recovery, dress rehearsal.
3. Choose the quality day (3.2).
4. Set the rest count and add extra rest days: Q+1, then the earliest free day (3.3).
5. Make the first run after a raced effort a recovery run, if it is not already a role.
6. Choose the legs day (3.4), then the medium day (3.5).
7. Set day caps:
   - legs day: its earliest slot;
   - recovery roles: 10 km;
   - everything else: the roomiest slot;
   - every non-hard day: also `raceRunInCeilingKm(date)` (existing).
8. Set fixed sizes:
   - long or race: macro km;
   - quality: 17.5% of the week, clamped to 14-25% and capped;
   - recovery 8, dress rehearsal 11, shakeout 5, all capped.
9. Remainder R = target minus fixed km. Races that do not carry the long session are excluded, as today.
10. Fill general-aerobic days in proportion, weight 1 for medium and 2/3 for the others. A day that would exceed its cap is fixed at the cap, and the ratio is re-applied to the rest.
11. If R is left over, climb this ladder in order, stopping when R = 0:
    a. Raise recovery days, in date order, to 10 km (within the run-in ceiling).
    b. Reopen the most recently added extra rest day as general-aerobic, then restart at step 6.
    c. Add one recovery double, on the earliest day that meets all of these:
       - it is general-aerobic or recovery;
       - it is not the legs day or the first run after a raced effort;
       - it is not either of the 2 days before a race or an MP long session;
       - it has two slots.
       The double is 10 km in the morning and the rest in the evening. The day stays at or below 24 km and the run-in ceiling.
    d. Report what is still left as shortfall debt (existing behaviour).
12. Round every day to 0.5 km. The rounding residual goes to the medium day, then other general-aerobic days with headroom (date order), then recovery days.
13. Place sessions in slots:
    - single runs take the roomiest slot (existing);
    - the legs day takes its earliest slot;
    - a double takes the earliest slot for the morning run and the latest for the evening run (`toSessions` honours the role's split).
14. Describe the week by role, then validate: V1-V4, the existing guardrails, and `post-race-recovery`.

- Readiness demotion stays after generation. `demoteQualityFrom` now also sets role `general-aerobic`.
- Why week 4 needs a double: single runs cannot hold 100 km. The most they reach is 33 + 10 + 3x14 + 12 = 97 km, or 99 km even without the legs-day cap.

## 5. The block

| Week | km | Long session | MP km | Threshold | Doubles | Runs | Legs |
|---|---|---|---|---|---|---|---|
| 14 Sep | 60 | 22 easy | 0 (window) | 0 (window) | 0 | 5 | Sat 19 |
| 21 Sep | 80 | 27 with 10 MP | 10 | 24 min (5.2 km) | 0 | 6 | Wed 23 |
| 28 Sep | 100 | Lincoln 33 | 21.1 | 0 (Lincoln spends it) | 1 | 7 | Wed 30 |
| 5 Oct | 80 | 10K day 20 | 0 | 0 (10K spends it) | 0 | 6 | Wed 7 |
| 12 Oct | 60 | 13 easy | 6 (Thu 15) | 0 | 0 | 6 | none |
| 19 Oct | 32 + race | marathon | 3.2 (Tue 20) | 0 | 0 | 4 + race | none |

**Long sessions: 22, 27, 33, 20, 13, then the race.**
- The two taper sessions are 60% and 40% of the 33 km peak (Higdon Intermediate 1: 20, 12, 8 mi).
- Pfitzinger runs more: 17 mi 14 days out, the day after a tune-up race, and 13 mi 7 days out (verified in the transcriptions).
- Rocket's own "nothing over 13 km in the last 14 days" ceiling is not a finding of Bosquet 2007 or Smyth & Lawlor 2021. Rocket's research elsewhere even recommends 26-28 km on 11 Oct. So the ceiling stays advisory, and 20 km on 11 Oct is a named breach.
- Pfitzinger's tune-up race days total 9-13 mi, so 20 km (12.4 mi) sits inside that range.

**MP ladder: 0, 10, 21.1, 0, 6, 3.2, then the race.**
- Still steeper than Pfitzinger's 8/10/12/14 mi over 11 weeks. 10 km sits under his first 12-week MP run (8 mi).
- Rejected options, both from the coach review:
  - an MP touch on Wed 7 Oct (inside the 4 easy days after Lincoln);
  - a steady finish on Wed 16 Sep (inside the 7 easy days after the half).

**Threshold: one session (23 Sep) plus the raced 10K.**
- The coach flagged this. It is kept because config's `racesCountAsQualitySessions` docstring deliberately makes Lincoln spend the peak week's budget: threshold on top of a 100 km week is exactly the stacking it prevents.
- Named as a risk choice.

**Frequency:** 5, 6, 7, 6, 6 and 5 runs a week against a recorded maximum of 4. Not ratified; asked in Q1.

**Medium-long run:** still impossible under the 14 km weekday slot; asked in Q4.

## 6. Persistence, the plan reader, regeneration

**Schema.** New nullable columns `sessions.role` (text) and `sessions.generator_version` (integer).

**Writes: `replaceWindow`.**
- Runs in one transaction, keyed by date|slot.
- If a non-planned row already holds a planned session's (date, slot), the session takes the day's other free slot or is dropped with a note.
- The migration deletes planned rows that duplicate a non-planned row on (date, time_slot). It then adds a unique index on (date, time_slot) where time_slot is not null.

**Roles through the reader:**
- `PlannedSession.role` is optional in the type; `planWeek` always sets it. `SessionRow.role` is added.
- `toSession`, `plannedValues`, `store-memory`, `toPlanned` and `toPlannerSession` all map it. Both `KINDS` maps stay asserted equal.
- A null role reads as the role its kind implies (quality to threshold, long to long, race to race, easy to general-aerobic, rest to rest), with a note.
- `diffWindows` compares date|slot and reports role changes; `SessionChange.field` gains `role`.

**Repairs keep roles.**
- `demoteQualityFrom` sets role `general-aerobic`.
- `absorbSpanner`'s give-back never shortens recovery days or the day before a long session.

**Regeneration.**
- `planWeek` stamps `GENERATOR_VERSION = 2`.
- The daily pass's rollover also fires when any planned row in the window has an older or null version.
- This discards earlier repairs to future planned rows once. The sync-run detail lists the regenerated dates.
- Done and skipped rows are never touched (REDLINES rules 2 and 8).

**Dropped:** the draft's `sessions.prescription` jsonb. Descriptions come from role plus config at read time, one source.

**Ship order.** Stages 1-8 run on a feature branch and merge together once stage 8 is green, so the daily cron never writes a half-built week. Stage 2 (config) may merge alone.

## 7. Block and multi-block management

**Decision (engineer blocker 2): the macro layer stays in config.**
- REDLINES rule 1 makes config the registry.
- `seed.mts` already treats `weeks` as a projection of config.
- Every planner path reads `BLOCK_WEEKS`, `BLOCK` or `RACES`.

**Next block:**
- Config keeps every block (a `BLOCKS` array), and week numbers continue across the season (8, 9, ...). The `weeks` primary key and the `sessions` foreign key then hold.
- The seeder never deletes a week that sessions reference.
- `raceRunInCeilingKm`, `placeStrength` and the taper rule take the goal race of the block containing the date.
- Call sites that change (stage 10): `config/training.ts`, `planner/{placement,guardrails,prescribe,today,negotiate}.ts`, `domain/store.ts`, `lib/{block,plan,actuals}.ts`, `app/page.tsx`, `app/block/page.tsx`, `mcp/tools.ts`, `jobs/daily-pass.ts`, `db/seed.mts`.
- No REDLINES note is needed: no ratified target lives outside config.

**Proposals.** Accepting a volume or block proposal records the decision and produces a config patch for a reviewed commit. Nothing writes `weeks` rows at runtime.

**Persisted versus derived:**

| Persisted | Derived at read time |
|---|---|
| `sessions` + `role`, `generator_version`, unique (date, time_slot) | Paces, descriptions |
| `plan_proposals` (stage 9): kind, before/after, rationale, rule ids, status | Compliance, CTL/ATL/TSB from actual sessions only |
| `races` via config `effort` | Post-race windows, trailing 30-day longest, structure checks |
| Append-only history, unchanged | Projection beyond the rolling window |

**`proposeBlock` template** (future blocks):
- Taper at 79/61/40% of peak (Pfitzinger 18/70).
- Deload every 3rd-4th week by 15-25%.
- Entry week at most about 20% above the trailing 4-week mean.
- Long-run steps flagged above 110%.
- Taper long sessions at 60%/40% of peak, rounded down to the run-in ceiling.
- The output is a proposal; volume stays athlete-ratified.

**After 24 Oct:**
- Recovery weeks at 32/48/62% of peak (Pfitzinger's between-marathons plan: 21/32/41 of 66 mi), starting with 3 no-run days (Higdon).
- No quality until the second recovery week ends.
- Then a new block if an A race is entered, otherwise maintenance.

## 8. Adaptation: automatic versus proposed

**Automatic.** These stay inside the ratified weekly target and return as a diff plus rationale:
- A single missed session is skipped, not made up (Stryd; Runna).
- An unplanned run triggers spanner absorption; the give-back now protects recovery days.
- Soreness of 3 or more demotes quality and strides.
- Post-race windows block quality and MP.
- Lost availability re-places the week.
- The overflow ladder fills what doesn't fit.
- A threshold work-interval mean above 180 slows threshold pace by 5 s/km.

**Proposed** (stage 9; nothing applies until Luis accepts):
- **Volume.** A week delivered under 85% proposes holding the next week at the delivered level. Missed-day gaps follow Stryd's ladder: 8-14 days repeats the phase, 15-28 goes back to base, 29 or more restarts. With a fixed race date, rebuild towards that date (a Runna option).
- **Paces.** Re-derived after Lincoln, from its mean HR and drift, or after a race result. The plan structure is kept.
- **Readiness.** Two readiness channels tripped for 7 days proposes -25% volume with quality removed. This rule comes from earlier rocket research and was not re-verified.
- **Always Luis's call:** frequency, long-run distance and race roles.
- **Over-performance** informs and never raises a target.

## 9. Check against published weeks, and named deviations

**Resemblances:**
- The week of 28 Sep resembles Pfitzinger 18/70 week 11: Monday rest, a recovery double two days after the long run, recovery the day before, long run about a third of the week.
- 21 Sep resembles Pfitzinger 18/55 week 11: midweek quality, rest after it, Saturday recovery, Sunday long.
- 5 Oct follows Pfitzinger 18/70 week 16's shape before its tune-up race: easy midweek, recovery 2 days and 1 day out.
- 19 Oct matches Pfitzinger 18/70 week 18.

**Named deviations:**
- Long run above Daniels' 25% of the week in weeks 2-4, and above 150 min on 27 Sep (about 155) and 4 Oct (about 182).
- Lincoln's MP is 21.1% of its week (Daniels caps MP at 20%) and 108-111 min (his cap is 110).
- 20 km on 11 Oct, inside the 13 km run-in ceiling's fortnight.
- No medium-long run.
- The block's only double lands in the peak week.
- One threshold session.
- Run frequency above his record.

## 10. Questions for Luis

**Q1. This week (starting Mon 14 Sep): five running days instead of six?**
- Rocket's settings ask for six running days this week. With a 22 km long run on Saturday, the other 38 km over five days makes every run 6.5-9 km. The easy days then come out shorter than the recovery days: 8/9/6.5/6.5/8/22/0, the flat week you objected to.
- Your most in any recorded week is four runs, so even five is a step up.
- (a) **Five runs:** rest Mon, 8 Tue, 13 Wed, 9 Thu, 8 Fri, 22 Sat, rest Sun. Monday has passed, so this applies from today.
- (b) **Four runs:** rest Mon, 10 Tue, 14 Wed, 14 Thu, rest Fri, 22 Sat, rest Sun. Fewest runs, but two 14 km days on days 4-5 after the half and no short run the day before the long run. Rocket would need an exception to its "short run the day before the long run" rule.
- (c) **Keep six:** rocket shows the week with a "too uniform" warning.

**Q2. Sun 18 Oct: 13 km easy instead of 18 km with about 8 km at marathon pace?**
- Six days before the marathon, the marathon-pace part is the heavy bit. Pfitzinger's plans do run 21 km a week out, but all easy.
- This design uses Higdon's taper shape: 40% of your 33 km Lincoln day, 13 km. It moves marathon pace to Thu 15 Oct (6 km inside a 10.5 km run) and Tue 20 Oct (3.2 km). The week stays 60 km.
- **Yes:** 0/8/8/10.5/12.5/8/13.
- **No (18 km, all easy):** 0/10/13/10.5/0/8.5/18. Rocket flags the 18 km as over its 13 km last-fortnight guideline.

**Q3. Sun 11 Oct, ASICS 10K day: 20 km instead of 16?**
- After Lincoln nothing is longer than 16 km for the 20 days before the marathon.
- A 4 km warm-up, the race, then a 6 km easy cool-down gives one 20 km day 13 days out, close to Higdon's taper (about 60% of peak two weeks out).
- It also cuts Fri 9 Oct from 14 km to 10 km two days before the race, and removes a double run that week.
- **Yes:** 0/14/12/14/10/10/20.
- **No:** 0/18 (10 km morning + 8 km evening)/12/14/10/10/16.
- The catch: 20 km inside the last fortnight is over rocket's own 13 km guideline and is shown as an accepted exception.

**Q4. Could one weekday evening hold an 18 km easy run (about 1 h 45)?**
- Weekday evenings are capped at 14 km. So rocket cannot schedule a mid-week medium-long run (Pfitzinger's shortest is 18 km).
- The 100 km week also needs Tue 29 Sep as two runs (10 km morning + 7 km evening), because single runs top out at 97 km.
- **Yes:** 28 Sep becomes 0/14/12/18/14/9/33 with no double, and 5 Oct gets an 18 km Thursday.
- **No:** the plan stays as written and says why.

**Q5. Which evening is your swim, and do you lift in the morning or the evening?**
- Rocket doesn't know the swim evening, so it only caps evening runs at six a week. Knowing the day lets it keep that evening free.
- On a leg day rocket puts the run in the morning so the lift can come at least 6 h later. If you lift in the morning instead, that order has to flip.

**Q6. Paces: marathon pace 5:08-5:15/km and threshold 4:34-4:38/km?**
- The app currently shows 5:03 and 4:29. Those come from your half at the GPS distance, using multipliers fitted to your July form.
- The new numbers use three things: the official distance; your own half-to-marathon slowdown (July half against May marathon); and an allowance for a half run in carbon shoes after a carb-load.
- The biggest effect is Lincoln: the first 13 km at 5:12-5:15, finishing towards 5:05-5:08 only if heart rate stays under 165. After Lincoln, rocket proposes updated paces from its heart-rate data.
- **Yes:** switch now.
- **No:** keep 5:03 and 4:29. The 23 Sep threshold session would then be faster than the Daniels 60-minute race pace from your half (4:32).
