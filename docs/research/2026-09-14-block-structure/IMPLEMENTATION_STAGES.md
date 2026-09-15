## Stage 1: 0. Task file, decision records and Luis's answers. No code. Review gate (AGENTS.md rule 3)

**Files:** tasks/role-based-week-generator.md (new). Its header freezes: the six-week table; the declined-answer variants from variants.py; the pseudo-code in design section 4; Q1-Q6 answers under Assumptions. docs/decisions.md entries: even-split distribution replaced by role sizing; Daniels chosen over Higdon for post-race recovery; paces re-anchored on the official distance (MP 5:08-5:15, T 4:34-4:38, MP ceiling 168); week-2 'days' retired (planner-authored 2026-09-06, never ratified); taper long sessions 20/13 with MP moved to Thu 15 Oct; macro layer stays in config (Option A); V1 set to 1.4 from measured plan data. Create worktree .worktrees/role-based-weeks on branch feat/role-based-weeks

**Tests first:** none; human review gate

**Verification:** Luis answers Q1-Q6 and the header is frozen before stage 2 writes any literal. If he declines a question, the header's declined variant becomes the stage 4-5 literal. Stages 1-8 merge together; stage 2 may merge alone

## Stage 2: 1. Persistence and the plan reader carry doubles and roles (before anything generates them)

**Files:** src/db/schema.ts + migration 0006 (sessions.role text null; sessions.generator_version integer null; delete planned rows duplicating a non-planned row on date + time_slot; unique index on (date, time_slot) where time_slot is not null); src/domain/store.ts (replaceWindow in one transaction keyed by date|slot, occupied-slot rule, toSession and plannedValues map role and generator_version); src/domain/store-memory.ts (same keying, one id per session); src/domain/types.ts (SessionRow.role, generatorVersion); src/domain/planner/types.ts (PlannedSession.role optional, SessionRole union, SessionChange.field adds 'role'); src/domain/planner/negotiate.ts (diffWindows keyed by date|slot, reports role; demoteQualityFrom sets role general-aerobic); src/lib/plan.ts toPlanned and src/mcp/window.ts toPlannerSession (map role; null role inferred from kind with a note) + their KINDS equality test

**Tests first:** FAIL FIRST, all driving call sites, not inlined expressions:
- store-memory and guards.integration: 'replaceWindow twice over a window holding a 10 + 7 double keeps two rows with distinct ids and 17 km'.
- 'a planned morning session colliding with a done morning row on the same date neither throws nor duplicates'.
- 'role round-trips store -> planForDate for a recovery double and a dress rehearsal'.
- 'a stored row with a null role reads as the role its kind implies, with a note'.
- negotiate: 'diffWindows reports a slot move inside a double day'

**Verification:** npx vitest run src/domain src/lib src/mcp; npm run test:integration against the Docker/Neon test database; npm run typecheck. Before the fix, confirm the date-keyed Map fails the double test (store.ts:158 and store-memory.ts:90-94)

## Stage 3: 2. Config: ratified values and the new data

**Files:** config/training.ts:
- RACES[].effort ('raced' / 'marathon-pace').
- New consts: POST_RACE; SESSION_LIBRARY (recovery, recoveryDouble, dressRehearsal, shakeout, taperMpSession, mediumLongMinKm); WEEK_STRUCTURE (qualityDayShare, band, gaLadderRatio, overflowLadder, maxDoublesPerWeek, doubleBannedDaysBeforeKey, minNonLongSpreadRatio).
- STRENGTH.legsKeySessionGapDays and legsMaintenance; AVAILABILITY.runSlots[].startLocal.
- PRESCRIPTION: thresholdMinutesByPhase, thresholdRepMinutes, qualityTypeByPhase, strides.daysPerWeek; longRunMpFraction build 0.37, taper 0.
- PACE_ANCHOR 281.5 s/km (official distance); PACE_MULTIPLIERS marathon 1.108 + marathonBandSecPerKm 3.5, threshold 0.981 with band 2; HR_ZONES.marathonCeiling 168.
- BLOCK_WEEKS: week 2 minRunDays 5 and 'days' removed (Q1); week 5 longRunKm 20 (Q3); week 6 longRunKm 13 (Q2). CHECK_IN_GATES days-hit wording (five days).
- GUARDRAIL_RULE_IDS adds 'week-structure' and 'post-race-recovery', with the satisfies type widened to WEEK_STRUCTURE and POST_RACE keys.
src/domain/paces.ts (marathon band from config, removes the +/-4 literal); config/training.test.ts (field-claim tests at 489-515 widened; days tests at 191-214 replaced); src/domain/paces.test.ts (literals at 49-66); src/db/seed.mts (extra.days dropped) and seed.integration.test.ts:108

**Tests first:** FAIL FIRST:
- Widened field-claim test fails until both new ids claim their fields.
- 'no ratified weekly targetKm changed': snapshot 28/60/80/100/80/60/32.
- paces: 'threshold centre 4:36, band 4:34-4:38' and 'marathon 5:08-5:15 with ceiling 168', replacing the 4:29 / 5:03 / 170 literals.
- 'every live race declares an effort'.
- 'the long sessions on 11 and 18 Oct are 20 and 13 km'

**Verification:** npx vitest run config src/domain/paces.test.ts; npm run typecheck. Delete one field claim, watch the claim test fail, restore (AGENTS.md rule 4)

## Stage 4: 3. Week-structure check: advisory rule plus generator self-test

**Files:** src/domain/planner/structure.ts (new: V1-V4 per anchor), structure.test.ts (new); src/domain/planner/guardrails.ts (weekStructureRule advisory; post-race-recovery emits a result on every call); src/domain/planner/placement.test.ts (self-test over every macro week)

**Tests first:** FAIL FIRST:
- 'flags the evenly spread 7.6 x5 week: spread 1.00 and a threshold day under 14% of the week'.
- 'passes Pfitzinger 18/70 week 11, Pfitzinger 18/55 week 11 and Hansons Advanced week 15' (km from the verified transcriptions).
- 'every generated macro week passes V1-V4': RED on the current planner, weeks 3-6 score 1.00.
- scenarios.test.ts:61-73 'evaluates every rule' needs no edit but stays red until both new ids emit.
No monotony test: nothing computes monotony, so such a test could not fail first

**Verification:** npx vitest run src/domain/planner. Set minNonLongSpreadRatio to 1.0, confirm the flat-week test fails, restore

## Stage 5: 4. Role assignment

**Files:** src/domain/planner/placement.ts (assignRoles: L+1 rest, L-1 recovery or shakeout, race-2 recovery for raced efforts, first run after a raced effort, dress rehearsal; quality day with post-race windows; rest order L+1 -> Q+1 -> earliest; legs day with the gap rule and earliest-slot cap; medium tie-breaks); placement.test.ts

**Tests first:** FAIL FIRST, literal roles:
- week of 14 Sep: Mon rest, Tue recovery, Wed medium, Thu general-aerobic, Fri recovery, Sat long + legs, Sun rest; note text 'No day this week clears the quality spacing rule and the post-race window, so the week is all easy.'
- week of 21 Sep: quality Wed 23 with legs, rest Thu 24, medium Mon 21.
- week of 28 Sep: legs Wed 30, medium Thu 1, recovery Sat 3.
- week of 5 Oct: legs Wed 7, recovery Fri 9 and Sat 10.
- week of 12 Oct: quality Thu 15 (Tue 13-Wed 14 inside the 10K window), recovery Tue 13, rest Fri 16 before reopening.
- week of 19 Oct: dress rehearsal Tue 20, recovery Thu 22, shakeout Fri 23.
- 'never rests the day before a long run when a run day is available'

**Verification:** npx vitest run src/domain/planner/placement.test.ts. Remove the post-race window filter and confirm the week-of-12-Oct test fails (quality moves to Wed 14). Restore

## Stage 6: 5. Sizing, overflow ladder and slot splits (replaces distribute)

**Files:** src/domain/planner/placement.ts (sizeRoles: capped proportional fill; ladder of raise recovery -> reopen rest -> one double -> shortfall; 0.5 km rounding with residual order; toSessions honours role split and earliest slot; distribute deleted after grepping callers, only planWeek uses it); placement.test.ts ('does not reshape the weeks the run-in does not reach' rewritten: its 12.8 x5 literal encodes the defect, say so in the commit); prescribe.test.ts 'keeps the doubles planWeek produced' kept

**Tests first:** FAIL FIRST:
- Literal Mon-Sun km for all six weeks, exactly the design table.
- 'exactly one double in the block: Tue 29 Sep, 10 km weekday-morning + 7 km evening'.
- 'no double on the two days before a race or MP long session'.
- 'evening slot never exceeds 6 runs a week'.
- Existing tests stay green: 'reports a shortfall when four days lose every slot'; 'steps the run-in 11/9/7/5'.
- Parameterised declined variants: Q1 six days -> V1 advisory note; Q2 18 km; Q3 16 km -> Tue 6 Oct double 10 + 8

**Verification:** npx vitest run src/domain/planner; test literals equal gen2.py and variants.py output; npm test green

## Stage 7: 6. Descriptions and strength by role

**Files:** src/domain/planner/prescribe.ts (role-driven text; threshold minutes from PRESCRIPTION with km from derivePaces, removing the 205 literal at lines 140-147; MP zeroed inside post-race windows; taper MP session; dress rehearsal; shakeout strides; stride add-on selection; placeStrength with the new candidate order, gap rule, maintenance text and a note when legs moves off its first candidate); prescribe.test.ts; today.test.ts

**Tests first:** FAIL FIRST:
- 'strides on Wed 16 + Thu 17, Mon 21 + Fri 25, Wed 30 + Thu 1, Wed 7 + Thu 8, Fri 16 only, Thu 22 + the shakeout'.
- 'Sat 19 Sep long run has 0 km at marathon pace'.
- 'Sun 27 Sep reads 17 km easy then 10 km at marathon pace'.
- 'Thu 15 Oct reads 6 km at marathon pace inside 10.5 km'.
- 'Tue 20 Oct reads dress rehearsal, 3.2 km at MP'.
- 'legs on Sat 19, Wed 23, Wed 30, Wed 7, maintenance, none from week 6'.
- Rewritten, with the reason recorded: 'legs on hardest NON-race day' (185-196), 'keeps legs in peak week' (212-217, now 2026-09-30), 'threshold km 6 / 6.5' (101-114)

**Verification:** npx vitest run src/domain/planner. Remove the key-session gap check and confirm the Wed 30 and Wed 7 legs tests fail. Restore

## Stage 8: 7. Guardrails for the new rules

**Files:** src/domain/planner/guardrails.ts (post-race-recovery: blocking and overridable, quality or MP inside an easy-only window, races and ratified long sessions exempt; quality budget ignores the dress rehearsal; Daniels long-run and MP advisories; race-run-in exempts a race-carrying session only up to the race distance, matching the 2026-09-07 spike narrowing); src/domain/planner/negotiate.ts (absorbSpanner give-back skips recovery days and the day before a long session); guardrails.test.ts; scenarios.test.ts

**Tests first:** FAIL FIRST:
- 'threshold on day 4 after a raced half breaches post-race-recovery'.
- 'the 10K on 11 Oct is not a breach of Lincoln's window'.
- 'dress rehearsal in race week does not breach quality-session-budget'.
- 'Lincoln reports the Daniels MP 21.1% advisory, non-blocking'.
- 'Sun 11 Oct 20 km reports a run-in advisory against 13 km'.
- 'spanner give-back never shortens Sat 26 Sep'

**Verification:** npx vitest run src/domain/planner. Manual delete-and-rerun: empty the post-race rule body, confirm its tests fail, restore (the invariant sweep script lives in routr, not rocket)

## Stage 9: 8. Regenerate the stored window

**Files:** src/domain/planner/placement.ts (GENERATOR_VERSION = 2 stamped on planned sessions); src/domain/store.ts (plannedValues writes generator_version); src/jobs/daily-pass.ts (rollover also fires when a planned row in the window has an older or null version; sync-run detail lists the regenerated dates); daily-pass.test.ts; src/db/guards.integration.test.ts

**Tests first:** FAIL FIRST:
- Integration: 'a window written by the old generator (null version) is regenerated by the pass. Its planned rows match the new table and carry version 2; a done row inserted on one of those dates is untouched'.
- Unit: 'a window already at the current version is not regenerated'

**Verification:** npm test && npm run test:integration. Run the pass against a copy of the Neon schema and diff the window. Merge stages 1-8 to main only now

## Stage 10: 9. Adaptation and proposals (after 24 Oct unless Luis pulls it forward)

**Files:** src/db/schema.ts plan_proposals + migration; src/domain/planner/adapt.ts (new: compliance, missed-days ladder, trend -> proposal, post-Lincoln pace proposal); src/domain/store.ts; src/mcp/tools.ts (rocket_get_status lists pending proposals; typed rocket_decide_proposal accept/decline, REDLINES rule 8); src/jobs/daily-pass.ts (emit proposals, never apply)

**Tests first:** FAIL FIRST:
- 'week delivered at 80% proposes holding next week at delivered km and changes no session'.
- '9 consecutive missed days yields a repeat-phase proposal'.
- 'accepting a volume proposal writes no weeks row and returns the config patch text'.
- 'a pace proposal changes no session km, date or slot'.
- Existing 'over-performance never raises a target' stays green

**Verification:** npm test; tools.test.ts envelope test unchanged for existing tools

## Stage 11: 10. Next block (after 24 Oct)

**Files:** config/training.ts (BLOCKS array keeping every block, season-unique week numbers, goal race per block); planner placement/guardrails/prescribe/today/negotiate, src/domain/store.ts, src/lib/block.ts, src/lib/plan.ts, src/lib/actuals.ts, src/app/page.tsx, src/app/block/page.tsx, src/mcp/tools.ts, src/jobs/daily-pass.ts read the block containing a date; src/db/seed.mts never deletes a week that sessions reference; src/domain/planner/block.ts (proposeBlock, postMarathonRecovery)

**Tests first:** FAIL FIRST:
- 'raceRunInCeilingKm uses the goal race of the block containing the date'.
- 'seeding a second block keeps week rows referenced by sessions'.
- 'proposeBlock for a 12-week marathon yields a 79/61/40 taper and a deload every 3rd week'.
- 'post-marathon proposal starts with 3 no-run days and weeks at 32/48/62% of peak'.
- 'no block becomes active without a ratified config commit'

**Verification:** npm test && npm run test:integration against a migrated copy of the Neon schema; never against production without approval
