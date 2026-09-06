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

  /**
   * Tune-up race in the SAME PARK as the goal marathon, so it doubles as a
   * course rehearsal. Its result settles PACE_ESTIMATES -- goal marathon pace
   * is derived from this, not chosen in advance.
   */
  tuneUpRace: 'Battersea Park Half Marathon',
  tuneUpRaceDate: '2026-09-12',

  /**
   * Monday of week 1 of the RE-DERIVED block. The original 2026-08-10 start
   * came from docs/specs/06-training-block.md and is superseded: it was
   * authored against a training history that did not happen.
   * See docs/decisions.md 2026-09-06 -- macro layer re-derived from Garmin.
   */
  blockStart: '2026-09-07',
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
   * A week whose predecessor is not a valid ramp baseline -- forced rest, or a
   * race taper -- measures its rise against the last normal training week
   * instead (MEASURED_BASE.preTaperBaselineKm).
   *
   * PROVISIONAL. The original seed-block contradiction this documented is gone
   * with the re-derived block, but the number itself was never ratified.
   * See docs/decisions.md 2026-08-15 and 2026-09-06.
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

  /**
   * The actual inventory, resolved 2026-09-06. The daily trainer was bought,
   * which retires a named prerequisite for this block: ramping to 58 km weeks
   * on carbons or trail shoes was called out as an injury risk, and is no
   * longer the plan.
   *
   * The trainer is NEW, so its early runs carry the MULTIPLIERS.shoeNovelty
   * penalty. That is a real signal, not bookkeeping: a new shoe during a
   * volume ramp is two novel stressors at once, and the 2026-08-09 run that
   * wrecked the athlete stacked three (new Peregrines, trail, 600 m descent).
   */
  inventory: [
    {
      id: 'daily-trainer',
      role: 'all everyday road mileage',
      surface: 'road',
      carbon: false,
      /** Bought 2026-09-06 -- novelty multiplier applies to its first uses. */
      isNew: true,
    },
    {
      id: 'carbons',
      role: 'races, and long runs at or above carbonMinDistanceKm',
      surface: 'road',
      carbon: true,
      /** Ready for the Battersea Half on 2026-09-12, not only the marathon. */
      isNew: false,
    },
    {
      id: 'peregrine-16',
      role: 'trail only, capped at trailAdaptationCapKm until adapted',
      surface: 'trail',
      carbon: false,
      isNew: false,
    },
  ],
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
 * The macro layer, re-derived 2026-09-06 from measured Garmin history rather
 * than from the spec's assumed block. Weekly run-km targets and the long run
 * that anchors each week.
 *
 * Structure: this week tapers into the Battersea Half (Sat 12 Sep), then four
 * build weeks, then two taper weeks into the marathon (Sat 24 Oct). 48 days
 * from re-derivation to race day.
 *
 * The long runs are the binding constraint, not the weekly totals -- only four
 * fit before the taper, against the six to eight a normal block would carry,
 * and long-run durability is what the closing 10 km is made of. The longest
 * lands Sun 4 Oct, 20 days out, with a deliberate cut-back the Sunday after.
 *
 * `rampExemption` is non-null exactly when the step INTO that week exceeds
 * GUARDRAILS.rampCapPct. Three steps do. They are recorded here rather than
 * absorbed by quietly raising the cap, because docs/specs/03-planner.md:28
 * requires a guardrail breach to be named and costed, never silently executed.
 * Two of the three are UNRATIFIED and need Luis's explicit override.
 */
export const BLOCK_WEEKS = [
  {
    week: 1,
    monday: '2026-09-07',
    phase: 'race-taper',
    targetKm: 20,
    longRunKm: null,
    rampExemption: null,
    note: 'Taper into the Battersea Half, Sat 12 Sep. Not a training week, and not a valid ramp baseline.',
  },
  {
    week: 2,
    monday: '2026-09-14',
    phase: 'rebuild',
    targetKm: 35,
    longRunKm: 22,
    rampExemption:
      '+75.0% on paper, but the prior week is a race taper rather than a training baseline. ' +
      'Measured against MEASURED_BASE.preTaperBaselineKm (34.8 km, w/c 17 Aug) this is +0.6%. ' +
      'RATIFIED by the returning-from-rest rule.',
    note: 'Two to four genuinely easy days after the half first. Long run Sun 20 Sep, 8 days post-race.',
  },
  {
    week: 3,
    monday: '2026-09-21',
    phase: 'build',
    targetKm: 45,
    longRunKm: 26,
    rampExemption:
      '+28.6%, over the 15% cap. Returning to established base rather than exceeding it -- the ' +
      'ten-week base averaged ~30 km and peaked at 42.3 km (w/c 13 Jul). UNRATIFIED: needs an ' +
      'explicit override per docs/specs/03-planner.md:28.',
    note: 'Long run Sun 27 Sep.',
  },
  {
    week: 4,
    monday: '2026-09-28',
    phase: 'build',
    targetKm: 52,
    longRunKm: 32,
    rampExemption:
      '+15.6%, marginally over the 15% cap. UNRATIFIED. Carries the longest run of the block, so ' +
      'the week is harder than its total suggests.',
    note: 'Long run Sun 4 Oct, 20 days out. The one that matters most.',
  },
  {
    week: 5,
    monday: '2026-10-05',
    phase: 'peak',
    targetKm: 58,
    longRunKm: 24,
    rampExemption: null,
    note: 'Peak weekly volume, +11.5% and inside the cap. Cut-back long run Sun 11 Oct, 13 days out.',
  },
  {
    week: 6,
    monday: '2026-10-12',
    phase: 'taper',
    targetKm: 38,
    longRunKm: null,
    rampExemption: null,
    note: 'Protected. Nothing added above target.',
  },
  {
    week: 7,
    monday: '2026-10-19',
    phase: 'race',
    targetKm: null,
    longRunKm: null,
    rampExemption: null,
    note: 'Race week. Battersea Park Marathon, Sat 24 Oct. Carbons.',
  },
] as const;

/**
 * The athlete's real recent training, measured from Garmin on 2026-09-06.
 *
 * This replaces the guessed 30 km `PRE_BLOCK_BASELINE_KM`: the base is
 * observed, not assumed. It matters because an earlier revision of the plan
 * read a truncated activity list and described the block as having collapsed.
 * It had not -- see docs/decisions.md 2026-09-06.
 */
export const MEASURED_BASE = {
  /** Weekly running km by week-commencing Monday. */
  weeklyKm: {
    '2026-06-22': 21.3,
    '2026-06-29': 38.4,
    '2026-07-06': 25.1,
    '2026-07-13': 42.3,
    '2026-07-20': 24.2,
    '2026-07-27': 39.7,
    '2026-08-03': 39.5,
    '2026-08-10': 27.2,
    '2026-08-17': 34.8,
    /** Holiday. */
    '2026-08-24': 0,
    '2026-08-31': 14.8,
  },

  /**
   * Last normal training week before the holiday. This is the ramp baseline
   * for any week whose predecessor is a taper or a forced rest.
   */
  preTaperBaselineKm: 34.8,

  /** Longest run in the legs: 2026-08-09, trail, ~600 m descent. */
  longestRecentKm: 31.5,

  /**
   * Garmin's own load model on 2026-09-06 -- an independent cross-check on
   * ours, and free. A ratio of 1.00 is balanced: neither detrained nor
   * overreached. Store ours alongside these and reconcile; disagreement is
   * exactly the signal calibration needs.
   */
  garmin: {
    acuteLoad: 296,
    chronicLoad: 287,
    acuteChronicRatio: 1.0,
    trainingReadiness: 63,
  },
} as const;

/**
 * Pace estimates, all PROVISIONAL pending the Battersea Half on 2026-09-12.
 *
 * DO NOT treat any of these as a goal pace. Saturday is a real maximal effort
 * on the goal-race course and settles this empirically in six days;
 * docs/specs/06-training-block.md:8 already requires marathon pace to be
 * derived from a rehearsal result rather than guessed.
 */
export const PACE_ESTIMATES = {
  /** Garmin's predictions on 2026-09-06, in seconds. */
  garminPredictionSeconds: {
    fiveK: 1211,
    tenK: 2609,
    half: 5892,
    marathon: 12940,
  },

  /**
   * Luis's own assessment, 2026-09-06: Garmin's 1:38:12 half is too ambitious.
   * He would love 1:40:00; he thinks 1:45:00 is realistic.
   */
  athleteHalfAspirationSeconds: 6000,
  athleteHalfRealisticSeconds: 6300,

  /**
   * Garmin's implied half-to-marathon ratio, 12940 / 5892. A Riegel-style
   * exponent of about 1.135 -- more conservative than the classic 1.06.
   */
  halfToMarathonRatio: 12940 / 5892,

  /**
   * Applying that ratio to the athlete's own estimates: 1:45 half implies
   * ~3:50:35, 1:40 implies ~3:39:36. With only four long runs banked the back
   * half degrades more than any formula predicts, so the honest planning band
   * off a 1:45 half is 3:50-4:00.
   */
  planningBandSeconds: { fast: 13800, slow: 14400 },
} as const;
