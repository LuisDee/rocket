/**
 * Every training threshold, in one place.
 *
 * REDLINES.md rule 1: no hardcoded training threshold anywhere else. If the
 * planner, the load engine, or a guardrail check needs a number, it reads it
 * from here at evaluation time.
 *
 * Why this file exists: an adaptive planner IS a pile of thresholds. Scattered
 * as literals across route handlers they cannot be audited, tuned mid-block, or
 * explained back to the athlete -- and docs/specs/02-load-engine.md:27 requires
 * the model stay inspectable enough that the LLM can read and justify every
 * number it used.
 *
 * Every value here was chosen before there was data to choose it from. Each one
 * carries a PROVISIONAL entry in docs/decisions.md naming what would settle it.
 */

/** The block this configuration describes. All dates Europe/London. */
export const BLOCK = {
  goalRace: 'Battersea Park Marathon',
  goalRaceDate: '2026-10-24',
  /** Monday of week 1. docs/specs/06-training-block.md */
  blockStart: '2026-08-10',
} as const;

/**
 * Guardrails. docs/specs/03-planner.md:22-28.
 *
 * These are negotiated, never silently broken: state the rule, quantify the
 * cost of breaking it, offer the closest compliant alternative. The athlete may
 * explicitly override everything except the taper and injury gates, and every
 * override is logged.
 */
export const GUARDRAILS = {
  /** Weekly run km may rise at most this much week-over-week. */
  rampCapPct: 15,

  /**
   * A week returning from forced rest measures its rise against the pre-rest
   * baseline rather than the rest week itself.
   *
   * PROVISIONAL -- and it does not yet reconcile the seed block. The seed goes
   * 20 km (forced recovery) -> 40 km (rebuild) against a 30 km pre-rest
   * baseline, which is +33%, over this cap as well as over rampCapPct.
   * docs/specs/06-training-block.md:25 asserts 40 is "within tolerance" without
   * naming a number that makes it so. Open question for Luis; see
   * docs/decisions.md 2026-08-15 -- ramp cap contradiction.
   */
  returningFromRestRampCapPct: 35,

  /** Minimum full rest or swim-only days per week. */
  minRestOrSwimOnlyDaysPerWeek: 1,

  /** Max quality (intensity) sessions per week during the build phase. */
  maxQualitySessionsPerWeekBuild: 1,

  /** Quality sessions never fall on consecutive days. */
  minDaysBetweenQualitySessions: 2,

  /** The final N weeks are protected: nothing may be added above target. */
  protectedTaperWeeks: 2,
} as const;

/**
 * Load model. docs/specs/02-load-engine.md:15-18.
 *
 * Stress is tracked as TWO components -- cardio and musculoskeletal -- not one
 * number. That is what lets swim volume continue untouched through a
 * run-recovery week: real cardio stress, near-zero impact cost.
 */
export const LOAD = {
  /** Acute load: exponentially-weighted average over this many days. */
  atlDays: 7,
  /** Chronic load: exponentially-weighted average over this many days. */
  ctlDays: 42,

  /**
   * Below this many days of history, CTL has not had one time constant to
   * settle and any readiness verdict built on it must say so (REDLINES.md
   * rule 4). Equal to ctlDays deliberately.
   */
  ctlWarmUpDays: 42,
} as const;

/**
 * Context multipliers. docs/specs/02-load-engine.md:9-13.
 *
 * The lived case these exist for: a 33 km/600 m trail run scored similar
 * pace-stress to a flat 30 km road run that felt easy, and wrecked the athlete
 * for a week. Three novel stressors at once -- eccentric descent, new shoe,
 * uneven surface. The model must separate them.
 *
 * PROVISIONAL, all of them. These are the values calibration exists to correct
 * (docs/specs/02-load-engine.md:26), fitted against accumulated
 * prediction-vs-outcome pairs.
 */
export const MULTIPLIERS = {
  /** Musculoskeletal stress multiplier by running surface. */
  surface: {
    road: 1.0,
    path: 1.0,
    gravel: 1.15,
    trail: 1.3,
  },

  /** Extra musculoskeletal stress per 100 m of descent, as a fraction. */
  descentPer100m: 0.08,

  /**
   * Footwear novelty: multiplier applied on the Nth use of a shoe, decaying
   * toward 1.0 as uses accumulate. Index 0 is the first run in them.
   */
  shoeNovelty: [1.25, 1.15, 1.08, 1.03],

  /** Swim: real cardio cost, near-zero impact cost. */
  swimMusculoskeletal: 0.05,
} as const;

/**
 * Readiness. docs/specs/02-load-engine.md:19-24.
 *
 * Soreness is the dominant term: severe DOMS gates all quality regardless of
 * anything else. Objective terms apply only when Garmin data is present, and
 * weights renormalize when it is not -- a missing HRV reading must not distort
 * the score.
 *
 * INCOMPLETE: the specs do not define how the musculoskeletal load component
 * enters this score, and docs/specs/07-wiring-todo.md:23 says "start:
 * total-load only", which contradicts the two-component design. Open question
 * for Luis; see docs/decisions.md 2026-08-15 -- readiness formula gap.
 */
export const READINESS = {
  /** Subjective weights, used alone when no wellness snapshot exists. */
  subjectiveWeights: {
    soreness: 0.45,
    sleep: 0.2,
    motivation: 0.15,
    rpeYesterday: 0.2,
  },

  /** Objective weights, blended in when Garmin data is present. */
  objectiveWeights: {
    hrvVsBaseline: 0.4,
    restingHrVsBaseline: 0.3,
    sleepScore: 0.2,
    bodyBattery: 0.1,
  },

  /** Share of the final score taken from objective terms when available. */
  objectiveShareWhenAvailable: 0.4,

  /** Score at or above this is green; at or above amberFloor is amber. */
  greenFloor: 0.7,
  amberFloor: 0.45,

  /** Soreness at or above this severity (1-5) blocks all quality work. */
  sorenessBlocksQuality: 3,
} as const;

/** Shoe policy. docs/specs/06-training-block.md:30-31. */
export const SHOES = {
  /** Long runs at or above this distance use carbons, as do all races. */
  carbonMinDistanceKm: 28,
  /** First trail exposures are distance-capped until adapted. */
  trailAdaptationCapKm: 12,
} as const;

/**
 * Replan triggers. docs/specs/03-planner.md:13-18.
 */
export const REPLAN = {
  /** An ad-hoc activity deviating from plan by more than this triggers a replan. */
  spannerDeviationPct: 20,
  /** The micro-planner holds this many days of concrete sessions. */
  rollingWindowDays: { min: 7, max: 10 },
} as const;

/**
 * Integration health. docs/specs/05-integrations.md:10, REDLINES.md rule 3.
 *
 * A sync that dies quietly during taper is the worst outcome this system has.
 */
export const SYNC = {
  /** No successful Garmin pull in this long raises a visible staleness flag. */
  staleAfterHours: 36,
} as const;

/**
 * The seed macro layer. docs/specs/06-training-block.md:11-23.
 *
 * Weekly run-km targets by phase, anchored backward from the goal race. Week 1
 * is the forced-recovery week following the 2026-08-09 trail run.
 */
export const SEED_WEEKS = [
  { week: 1, monday: '2026-08-10', phase: 'forced-recovery', targetKm: 20 },
  { week: 2, monday: '2026-08-17', phase: 'rebuild', targetKm: 40 },
  { week: 3, monday: '2026-08-24', phase: 'build', targetKm: 45 },
  { week: 4, monday: '2026-08-31', phase: 'build', targetKm: 50 },
  { week: 5, monday: '2026-09-07', phase: 'build', targetKm: 55 },
  { week: 6, monday: '2026-09-14', phase: 'build', targetKm: 60 },
  { week: 7, monday: '2026-09-21', phase: 'peak', targetKm: 65 },
  { week: 8, monday: '2026-09-28', phase: 'race-prep', targetKm: 50 },
  { week: 9, monday: '2026-10-05', phase: 'taper', targetKm: 40 },
  { week: 10, monday: '2026-10-12', phase: 'taper', targetKm: 30 },
  { week: 11, monday: '2026-10-19', phase: 'race', targetKm: null },
] as const;

/**
 * Weekly volume in the four weeks before the block, used as the pre-rest
 * baseline when week 1 is a forced-recovery reset.
 * docs/specs/06-training-block.md:6.
 */
export const PRE_BLOCK_BASELINE_KM = 30;
