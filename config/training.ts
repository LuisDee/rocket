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
  /**
   * Standard weekly ramp cap: run km may rise at most this much week-over-week.
   * Retained as the conservative default a normal block would run under.
   */
  rampCapPct: 15,

  /**
   * The cap in force during a deliberate aggressive rebuild.
   *
   * Raised from 15 % on 2026-09-06 at Luis's explicit instruction, not to make
   * an inconvenient plan pass. The 15 % cap would have been breached by every
   * single week of this block, and a guardrail overridden every week is
   * repealed in practice -- worse than absent, because it trains the athlete to
   * click through the one warning that eventually matters. 35 % still fires on
   * a genuine spike: the 20 -> 60 step into week 2 is +72 % and is caught.
   */
  aggressiveRampCapPct: 35,

  /** Which cap this block runs under. See ACTIVE_RAMP_CAP_PCT. */
  rampMode: 'aggressive',

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

  /**
   * Above this weekly volume, the week must be spread across at least
   * `minRunDaysAtHighVolume` running days.
   *
   * 100 km over five days is 20 km a day; over seven it is 14. Same weekly
   * total, materially different per-session tissue load -- and tissue load is
   * what breaks in a ramp this steep. Without this the planner is free to
   * satisfy a 100 km week with five 20 km runs, which is the shape that
   * produces the injury this block cannot absorb.
   */
  highVolumeThresholdKm: 80,
  minRunDaysAtHighVolume: 6,

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
 * The ramp cap actually in force. Everything that checks a ramp reads this
 * rather than picking a cap itself, so the mode cannot be honoured in one place
 * and ignored in another.
 */
export const ACTIVE_RAMP_CAP_PCT: number =
  GUARDRAILS.rampMode === 'aggressive'
    ? GUARDRAILS.aggressiveRampCapPct
    : GUARDRAILS.rampCapPct;

/**
 * What the athlete's week actually contains, corrected 2026-09-06.
 *
 * The spec pack assumed swimming five evenings a week plus a lesson, and the
 * original feasibility arithmetic concluded from that that weekday running was
 * confined to early mornings. Both premises were wrong: swimming is a single
 * two-hour session per week, and there is no cycling at all.
 *
 * This is load-bearing for the block above rather than a detail. Four freed
 * evenings mean evening runs and AM/PM doubles are available, which is the
 * difference between a 100 km week being a 05:30 alarm every weekday and being
 * comfortably spread. The volume plan is more feasible than the availability
 * model implied, not less.
 *
 * Slots themselves are the planner's job against AvailabilityRule data; this
 * records only the facts the block depends on.
 */
export const AVAILABILITY = {
  /** One session, roughly two hours. Not five evenings. */
  swimSessionsPerWeek: 1,
  swimSessionHours: 2,

  /** Evenings not taken by swimming, and therefore available for running. */
  freeEveningsPerWeek: 6,

  /** No cycling. Not modelled for availability or load. */
  cycles: false,
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
   * which retires a named prerequisite for this block: ramping to 100 km weeks
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

/** One planned day. `km: 0` is a rest day; `kind` says what it is for. */
export type DayPlan = {
  readonly date: string;
  readonly km: number;
  readonly kind: 'easy' | 'long' | 'quality' | 'rest';
  readonly note?: string;
};

/**
 * The macro layer, re-cut 2026-09-06 to the aggressive volume block Luis chose:
 * 60 / 80 / 100 / 80 / 60, peaking at 100 km in the week of 28 September.
 *
 * Why this shape rather than the 35/45/52/58 it replaces. The recent eleven-week
 * window that produced those numbers caught a trough -- a light summer and a
 * holiday -- not a ceiling. Deeper history shows a real spring block: 45.8, 48.0
 * and 57.1 km weeks in April and May, the last of them carrying a 42.7 km long
 * run. Luis further states he has run 60 km weeks comfortably and that some
 * history never reached Garmin. That is stipulated, not re-litigated.
 *
 * Peak volume AND the peak long run both land in the week of 28 Sep, leaving
 * three full taper weeks. That was deliberate over putting 100 km in the week of
 * 5 Oct, which would have left only two -- his own framing was "get it in early
 * and taper right down".
 *
 * `rampExemption` is non-null exactly when the step INTO that week exceeds
 * ACTIVE_RAMP_CAP_PCT. Under the 35 % aggressive cap exactly one step does, and
 * it is the one that deserves the attention: the return from a race taper into
 * a 60 km week. The 80 (+33 %) and 100 (+25 %) steps sit inside the cap.
 *
 * The honest risk, recorded because docs/specs/03-planner.md:28 requires a
 * breach to be named and costed rather than silently executed: 100 km is
 * roughly 75 % above anything in the recorded history, reached in three weeks,
 * in a new shoe. The destination is not the hazard; the slope is. The
 * mitigations that carry the weight are `minRunDaysAtHighVolume` (spreading the
 * load rather than concentrating it), keeping nearly all of it easy, and the
 * week-2 check-in gate in CHECK_IN_GATES.
 */
export const BLOCK_WEEKS = [
  {
    week: 1,
    monday: '2026-09-07',
    phase: 'race-taper',
    targetKm: 20,
    longRunKm: null,
    minRunDays: 4,
    rampExemption: null,
    days: null,
    note: 'Taper into the Battersea Half, Sat 12 Sep. Not a training week, and not a valid ramp baseline.',
  },
  {
    week: 2,
    monday: '2026-09-14',
    phase: 'rebuild',
    targetKm: 60,
    longRunKm: 20,
    minRunDays: 6,
    rampExemption:
      '+72.4% on MEASURED_BASE.preTaperBaselineKm (34.8 km, w/c 17 Aug), over the 35% aggressive ' +
      'cap. RATIFIED by Luis 2026-09-06, explicitly and after the cost was stated. Grounds: the ' +
      'spring block reached 57.1 km with a 42.7 km long run, and he stipulates 60 km weeks are ' +
      'comfortable for him. This is the one step in the block the guardrail catches, and it is ' +
      'the one that matters -- it begins two days after racing a half.',
    days: [
      {
        date: '2026-09-14',
        km: 6,
        kind: 'easy',
        note: 'Rest instead if the half left anything sore. Two days post-race.',
      },
      { date: '2026-09-15', km: 8, kind: 'easy' },
      { date: '2026-09-16', km: 10, kind: 'easy' },
      { date: '2026-09-17', km: 10, kind: 'easy' },
      {
        date: '2026-09-18',
        km: 6,
        kind: 'easy',
        note: 'Short shakeout before the long run.',
      },
      { date: '2026-09-19', km: 20, kind: 'long' },
      {
        date: '2026-09-20',
        km: 0,
        kind: 'rest',
        note: 'Rest or swim. Swim carries no impact load.',
      },
    ],
    note: 'Two to four genuinely easy days after the half before this starts. The sharpest risk in the whole block is here, not at the 100.',
  },
  {
    week: 3,
    monday: '2026-09-21',
    phase: 'build',
    targetKm: 80,
    longRunKm: 30,
    minRunDays: 6,
    rampExemption: null,
    days: null,
    note: '+33.3%, inside the aggressive cap. Six running days: freed evenings make AM/PM doubles available if a morning is missed.',
  },
  {
    week: 4,
    monday: '2026-09-28',
    phase: 'peak',
    targetKm: 100,
    longRunKm: 35,
    minRunDays: 7,
    rampExemption: null,
    days: null,
    note: 'Peak volume and peak long run together, 26 days out. +25%, inside the cap. Seven running days: 100 km over five would be 20 km a day.',
  },
  {
    week: 5,
    monday: '2026-10-05',
    phase: 'taper',
    targetKm: 80,
    longRunKm: 26,
    minRunDays: 6,
    rampExemption: null,
    days: null,
    note: 'First taper step. Volume comes off before the long run does.',
  },
  {
    week: 6,
    monday: '2026-10-12',
    phase: 'taper',
    targetKm: 60,
    longRunKm: 18,
    minRunDays: 5,
    rampExemption: null,
    days: null,
    note: 'Protected. Nothing added above target.',
  },
  {
    week: 7,
    monday: '2026-10-19',
    phase: 'race',
    targetKm: null,
    longRunKm: null,
    minRunDays: 3,
    rampExemption: null,
    days: null,
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
   * The spring block, pulled from deeper Garmin history on 2026-09-06 through
   * the rate-limit guard. This is the evidence the aggressive ramp rests on:
   * the eleven-week window above caught a light summer, not a ceiling.
   */
  springWeeklyKm: {
    '2026-03-23': 29.7,
    '2026-03-30': 17.0,
    '2026-04-06': 45.8,
    '2026-04-13': 20.8,
    '2026-04-20': 48.0,
    '2026-04-27': 20.5,
    '2026-05-04': 57.1,
  },

  /** Highest recorded week, w/c 2026-05-04. */
  peakRecordedWeekKm: 57.1,

  /** Longest recorded run, in that same week: marathon distance. */
  longestRecordedRunKm: 42.7,

  /**
   * Luis states he has run 60 km weeks comfortably and that some history never
   * reached Garmin or Strava. He instructed that this be stipulated rather than
   * argued from the recorded data, and it is: the recorded series is a floor on
   * his capacity, not a measure of it.
   */
  stipulatedComfortableWeekKm: 60,

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

/**
 * Points where the block stops and asks before continuing.
 *
 * Luis asked for this explicitly -- "lets go 60 from 14 sep can check in after
 * that" -- and it is the mechanism that makes an aggressive ramp defensible
 * rather than reckless: the 80 and the 100 are earned by the weeks before them,
 * not assumed at authoring time.
 *
 * Structured rather than prose so the planner can actually evaluate it. A gate
 * expressed as a paragraph in a note is a gate nobody applies.
 */
export const CHECK_IN_GATES = [
  {
    /** Evaluated once this week is complete. */
    afterWeekMonday: '2026-09-14',
    decides: 'week 3 target, provisionally 80 km',
    criteria: [
      {
        id: 'soreness',
        question: 'Any soreness beyond normal training stiffness?',
        holdIf: 'Anything localised, sharp, or lasting more than 48 hours.',
      },
      {
        id: 'days-hit',
        question: 'Were all six planned running days completed?',
        holdIf:
          'Two or more missed. A week short of its day count did not deliver its load, ' +
          'so the next step up is measured from what happened rather than what was planned.',
      },
      {
        id: 'acute-chronic-trend',
        question: "Which way is Garmin's acute:chronic ratio moving?",
        holdIf:
          'Rising steeply. Treat as a TREND SIGNAL, never a threshold rule: the ' +
          'acute:chronic ratio has been statistically dismantled as a predictor ' +
          '(Lolli 2019 on mathematical coupling; Impellizzeri 2020, where an ' +
          'acute-to-RANDOM ratio predicted injury as well as acute-to-chronic). ' +
          'It is useful as a direction of travel and worthless as a line to cross.',
      },
    ],
    /** Baseline for the trend above: MEASURED_BASE.garmin.acuteChronicRatio on 2026-09-06. */
    ratioAtAuthoring: 1.0,
  },
] as const;
