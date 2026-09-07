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
 * Every race in the block, whether or not it is still happening.
 *
 * This exists because it was missing, and its absence was a real bug rather
 * than an omission. The macro layer re-derived on 2026-09-06 placed the peak
 * 35 km long run on Sunday 4 October -- Lincoln Half day -- and a 26 km week
 * ending on Sunday 11 October, LDNX 10K day. Nothing caught it, because
 * `BLOCK` held only the goal and tune-up races and no other race existed
 * anywhere the planner could see. Found by the adversarial review, F6.
 *
 * A race on a date must therefore be visible to anything placing a session on
 * that date. `dropped` entries stay: a race that was entered and then dropped
 * is a decision, and deleting the row loses the fact that it was ever
 * considered.
 *
 * Discovery gap worth knowing: DoHardThings records attendance in Google
 * Calendar `extendedProperties`, which the Google Calendar connector does not
 * return. So this list cannot currently be derived -- it is ratified by hand.
 * That is the argument for a `rocket_import_race` seam (review F26).
 */
export const RACES = [
  {
    date: '2026-09-12',
    name: 'Battersea Park Half Marathon',
    distanceKm: 21.1,
    role: 'tune-up',
    droppable: false,
    note: 'Same park as the goal marathon, so it doubles as a course rehearsal. Its result settles PACE_ESTIMATES.',
  },
  {
    date: '2026-10-03',
    name: 'Dorney Triathlon',
    distanceKm: null,
    role: 'dropped',
    droppable: true,
    note: 'DROPPED. Ratified by Luis 2026-09-07 -- he is not attending. Retained rather than deleted so the record shows it was considered and released, not forgotten.',
  },
  {
    date: '2026-10-04',
    name: 'Lincoln Half Marathon',
    distanceKm: 21.1,
    role: 'rehearsal',
    droppable: false,
    note: 'Run at MARATHON PACE, not raced. Carries week 4 long session -- see that week for the construction and its reversal condition.',
  },
  {
    date: '2026-10-11',
    name: 'ASICS LDNX 10K',
    distanceKm: 10,
    role: 'sharpener',
    droppable: false,
    note: 'The only hard intensity of the taper. Carries week 5 long session.',
  },
  {
    date: '2026-10-24',
    name: 'Battersea Park Marathon',
    distanceKm: 42.195,
    role: 'goal',
    droppable: false,
    note: 'Carbons.',
  },
] as const;

/**
 * Race dates that still stand. A long session may land on one only if its week
 * names the race in `longRunOnRace` -- the race then carries the session rather
 * than competing with it. Silence is what is forbidden, not the collision.
 */
export const LIVE_RACE_DATES: readonly string[] = RACES.filter(
  (r) => r.role !== 'dropped',
).map((r) => r.date);

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
   * Single-session spike cap: a run reaches at most this percentage of the
   * longest COMPLETED run in the trailing 30 days.
   *
   * On the axis the evidence actually supports. Nielsen 2025 (BJSM 59:1203,
   * Garmin-RUNSAFE: 5,205 runners, ~600,000 sessions) finds injury hazard
   * rising once a single session passes ~110 % of the trailing-30-day longest
   * run, while week-to-week load ratios were not significant and ACWR was
   * inversely associated. The caps above guard the axis the largest prospective
   * dataset to date nulls; this one guards the axis it supports. Both stay --
   * a weekly cap is still how a block's slope gets negotiated.
   *
   * ADVISORY, NEVER A BLOCKER, and that is structural rather than lenient: the
   * goal marathon is 128 % of the longest run that can precede it under every
   * constructible version of this block, so a hard version refuses the race it
   * exists to serve. A breach is named and costed per
   * docs/specs/03-planner.md:28, and can always be overridden.
   *
   * A PURE race is exempt by declaration: the distance was chosen months ago and
   * is not a planner decision to smooth. A race the planner has wrapped extra
   * distance around is NOT exempt, and the whole session is measured -- week 4's
   * 33 km on Lincoln day is 21.1 km of race plus ~12 km the planner chose this
   * week and could change tomorrow. Netting the race out would score the 12 km
   * against a 27 km baseline, pass trivially, and hide the block's largest
   * single session from the rule built to see it. The tissue runs 33 km either
   * way. (Discovered 2026-09-07: the date-level exemption made the peak session
   * invisible to this guardrail.)
   *
   * PROVISIONAL -- 110 is the population inflection, not a value fitted to this
   * athlete. Note the hazard ratios are non-monotonic (1.64 at 10-30 %, 1.52 at
   * 30-100 %, 2.28 above 100 %), so only the binary over-or-under carries
   * signal. Do not read a smaller breach as proportionally safer.
   */
  singleSessionSpikePct: 110,

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

  /**
   * Max quality (intensity) sessions per week during the build phase.
   *
   * Held at 1 on 2026-09-07 against an argued case for 2 (review F15), and both
   * sides are recorded because the losing one is strong. FOR two: Filipas 2022
   * is a 60-runner RCT and the best-controlled citation in the appendix, a
   * 3:50-4:00 runner's limiter is marathon-pace durability, and one a week
   * yields about three structured sessions in the entire block. AGAINST, and
   * decisive here: Filipas measured ~1.5 % over 5 km in well-trained runners on
   * STABLE volume across 16 weeks, whereas this is three build weeks inside a
   * 35 -> 100 km ramp roughly 75 % above anything in MEASURED_BASE, in a new
   * shoe. Doherty 2020's meta-regression over 127 cohorts ties faster marathons
   * to weekly km, runs per week, longest run and the count of 32 km+ runs --
   * volume parameters, not quality count -- and a second interval session draws
   * on the same recovery budget as the easy kilometres that evidence rewards.
   * The block is also not short of intensity: RACES puts a maximal half on
   * 12 Sep, Lincoln at marathon pace on 4 Oct and a raced 10K on 11 Oct.
   */
  maxQualitySessionsPerWeekBuild: 1,

  /** Quality sessions never fall on consecutive days. */
  minDaysBetweenQualitySessions: 2,

  /**
   * A race spends the weekly quality budget.
   *
   * The ambiguity was worth more than the 1-versus-2 argument: nothing said
   * whether a race counted, so week 4 could legally hold Lincoln at marathon
   * pace AND a separate interval session on top of a 100 km peak -- the exact
   * stacking the cap exists to prevent. Marathon-pace segments INSIDE a long
   * run do NOT count separately; they are part of that long session, not a
   * second one. Computed by qualitySessionCount().
   */
  racesCountAsQualitySessions: true,

  /** The final N weeks are protected: nothing may be added above target. */
  protectedTaperWeeks: 2,
} as const;

/**
 * Stable rule ids, so a planner decision can name the rules it applied and the
 * ones it broke -- the `applied_rules[]` / `violated_rules[]` every write tool
 * returns (review S6.9, F28). Ids are a wire contract: add, never rename.
 *
 * A map rather than an `id` field on each threshold, because rules are not
 * one-to-one with fields: the weekly cap is three of them, the high-volume
 * spread rule is two. No rules table either -- this file already IS the
 * registry, and prose comments carry reasoning a `citation` column cannot. The
 * `satisfies` clause makes a guardrail added without an id a typecheck failure,
 * and the test asserts every field is claimed exactly once.
 */
export const GUARDRAIL_RULE_IDS = {
  'weekly-ramp-cap': ['rampCapPct', 'aggressiveRampCapPct', 'rampMode'],
  'single-session-spike': ['singleSessionSpikePct'],
  'high-volume-spread': ['highVolumeThresholdKm', 'minRunDaysAtHighVolume'],
  'weekly-recovery-days': ['minRestOrSwimOnlyDaysPerWeek'],
  'quality-session-budget': [
    'maxQualitySessionsPerWeekBuild',
    'minDaysBetweenQualitySessions',
    'racesCountAsQualitySessions',
  ],
  'protected-taper': ['protectedTaperWeeks'],

  /**
   * The injury gate. docs/specs/03-planner.md:24 makes "no quality session
   * while soreness is at or beyond moderate" a hard guardrail, but its
   * threshold has always lived in READINESS rather than GUARDRAILS -- so a
   * tumble-dryer refusal had a rule to enforce and no id to cite, which is
   * exactly the emission gap the ids exist to close (review S6.9).
   *
   * The id is added over the field where it already sits rather than moving the
   * field into GUARDRAILS: the constant is read elsewhere, and relocating a
   * threshold to tidy a registry is how a value silently changes meaning.
   * (Added 2026-09-07 by the planner task, which needed to name this rule in
   * `violated_rules[]` and found it nameless.)
   */
  'soreness-quality-gate': ['sorenessBlocksQuality'],
} as const satisfies Record<
  string,
  readonly (keyof typeof GUARDRAILS | keyof typeof READINESS)[]
>;

/**
 * The ramp cap actually in force. Everything that checks a ramp reads this
 * rather than picking a cap itself, so the mode cannot be honoured in one place
 * and ignored in another.
 */
export const ACTIVE_RAMP_CAP_PCT: number =
  GUARDRAILS.rampMode === 'aggressive'
    ? GUARDRAILS.aggressiveRampCapPct
    : GUARDRAILS.rampCapPct;

/** One run -- planned or completed -- as the spike check sees it. */
export type SpikeSession = {
  readonly date: string;
  readonly km: number;
};

/** A session that exceeded the single-session spike cap. */
export type SpikeBreach = {
  readonly ruleId: 'single-session-spike';
  readonly date: string;
  readonly km: number;
  /** Longest run inside the trailing window before `date` -- the denominator. */
  readonly baselineKm: number;
  readonly pctOfBaseline: number;
};

/**
 * Every session exceeding GUARDRAILS.singleSessionSpikePct of the longest run
 * in the preceding `windowDays`. Advisory: the caller states the breach and its
 * cost and may proceed. See the guardrail's own docstring for why never a
 * blocker.
 *
 * Takes the whole series and returns each figure with the baseline it was
 * measured against, rather than leaving a caller to eyeball a list of runs and
 * decide what the longest one was -- that failure has already happened once
 * here (docs/decisions.md 2026-09-06, the block that had not collapsed).
 *
 * Sessions on LIVE_RACE_DATES are skipped. A session with no run at all inside
 * its window has no baseline to spike against and is not a breach.
 *
 * At planning time the earlier planned sessions stand in for completed ones,
 * which is the only baseline that exists before a block is run; once it is
 * running the planner passes actual completed runs and gets the real figure.
 */
/**
 * Distance of the live race on `date`, or null when no race stands that day.
 * Dropped races do not count -- Dorney carries distanceKm: null and role
 * 'dropped', so it can never exempt anything.
 */
function raceDistanceOn(date: string): number | null {
  const race = RACES.find((r) => r.date === date && r.role !== 'dropped');
  return race?.distanceKm ?? null;
}

export function singleSessionSpikes(
  sessions: readonly SpikeSession[],
  windowDays = 30,
): SpikeBreach[] {
  const inDateOrder = [...sessions].sort((a, b) =>
    a.date.localeCompare(b.date),
  );

  return inDateOrder.flatMap((session, i) => {
    const raceKm = raceDistanceOn(session.date);
    if (raceKm !== null && session.km <= raceKm) return [];

    const windowStart = shiftIsoDate(session.date, -windowDays);
    const baselineKm = inDateOrder
      .slice(0, i)
      .filter((prior) => prior.date >= windowStart)
      .reduce((longest, prior) => Math.max(longest, prior.km), 0);
    if (baselineKm === 0) return [];

    const pctOfBaseline = (session.km / baselineKm) * 100;
    if (pctOfBaseline <= GUARDRAILS.singleSessionSpikePct) return [];

    return [
      {
        ruleId: 'single-session-spike' as const,
        date: session.date,
        km: session.km,
        baselineKm,
        pctOfBaseline,
      },
    ];
  });
}

/**
 * Quality sessions a week actually spends, races included when
 * GUARDRAILS.racesCountAsQualitySessions says they count.
 *
 * A week with no per-day plan counts its races only -- a null `days` means
 * unscheduled, not zero. A quality day that IS a race is one session, not two.
 */
export function qualitySessionCount(week: {
  readonly monday: string;
  readonly days:
    readonly { readonly date: string; readonly kind: string }[] | null;
}): number {
  const weekEnd = shiftIsoDate(week.monday, 7);
  const planned = (week.days ?? []).filter(
    (day) => day.kind === 'quality' && !LIVE_RACE_DATES.includes(day.date),
  ).length;
  const races = GUARDRAILS.racesCountAsQualitySessions
    ? LIVE_RACE_DATES.filter((date) => date >= week.monday && date < weekEnd)
        .length
    : 0;

  return planned + races;
}

/**
 * `YYYY-MM-DD` shifted by whole days. UTC arithmetic on purpose: these are
 * calendar dates with no time of day, and this block spans the October clock
 * change, where a local-midnight shift is off by an hour and can cross a day.
 */
function shiftIsoDate(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const at = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

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
/**
 * Named once and used twice: the free-evening count and the weekly cap on the
 * evening slot are the same fact, and two copies of a fact drift.
 */
const FREE_EVENINGS_PER_WEEK = 6;

export const AVAILABILITY = {
  /** One session, roughly two hours. Not five evenings. */
  swimSessionsPerWeek: 1,
  swimSessionHours: 2,

  /**
   * Where the swim actually sits in the evening. Captured, not modelled --
   * nothing reads these (review S6.7).
   *
   * The candidate use is the one the review proposed and the ledger rejected: a
   * swim finishing late compresses sleep, so the next morning's HRV and
   * sleep-score terms are suspect (Leota 2025, 14,689 people, 4 million
   * nights). That term is NOT implemented -- measured sleep beats inferred
   * sleep, and there is no measured overnight data to correct anyway. But the
   * end time is recorded nowhere, so without capturing it the question could
   * never be answered retrospectively even once the data arrives. One constant
   * buys the option.
   *
   * PROVISIONAL: 20:00 comes from PLAN-2026-001:158 ("swim evenings land
   * ~20:00"), a passage written under the superseded five-evenings premise; the
   * end is start plus swimSessionHours. The weekday is recorded nowhere and is
   * deliberately not guessed here.
   */
  swimSlotStartLocal: '20:00',
  swimSlotEndLocal: '22:00',

  /** Evenings not taken by swimming, and therefore available for running. */
  freeEveningsPerWeek: FREE_EVENINGS_PER_WEEK,

  /**
   * The slots a run can occupy, as DATA. The planner reads this list and knows
   * nothing else about the shape of a day -- deleting a slot here changes the
   * plan and changes no code, which is Luis's design instruction ("fully
   * data-driven, no slot shape baked in", PLAN-2026-001 Stage 6).
   *
   * `weekdays` is ISO: 1 = Monday through 7 = Sunday.
   *
   * `maxUsesPerWeek` is how the swim is modelled WITHOUT guessing its weekday,
   * which is recorded nowhere (see swimSlotStartLocal above, which says so).
   * Six of the seven evenings may carry a run; the seventh is the swim,
   * wherever it falls. Capacity, not a named day -- the only reading that uses
   * the numbers actually recorded.
   *
   * PROVISIONAL, all three ceilings, and they are new numbers rather than
   * derived ones: no session length is recorded anywhere in the specs. They
   * exist because without a ceiling a shortfall can never fire -- any weekly
   * total fits into one unbounded slot, and "reports a shortfall rather than
   * silently generating an unrunnable week" becomes untestable. What settles
   * them: a fortnight of real start and end times from Garmin, which is
   * already stored (`activities.start_time_local`, `duration_s`).
   */
  runSlots: [
    {
      id: 'weekday-morning',
      weekdays: [1, 2, 3, 4, 5],
      /** ~70 minutes before work at easy pace. The tightest slot in the week. */
      maxKm: 12,
      maxUsesPerWeek: null,
    },
    {
      id: 'evening',
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      maxKm: 14,
      maxUsesPerWeek: FREE_EVENINGS_PER_WEEK,
    },
    {
      id: 'weekend-daytime',
      weekdays: [6, 7],
      /**
       * Long runs and races live here. Above marathon distance on purpose: a
       * ceiling of 42 refuses the 42.195 km the whole block exists to reach,
       * which is the same failure the spike guardrail documents at length.
       */
      maxKm: 45,
      maxUsesPerWeek: null,
    },
  ],

  /** No cycling. Not modelled for availability or load. */
  cycles: false,
} as const;

/**
 * Load model. docs/specs/02-load-engine.md:15-18.
 *
 * Stress is DESIGNED as two components -- cardio and musculoskeletal -- not one
 * number. That is what would let swim volume continue untouched through a
 * run-recovery week: real cardio stress, near-zero impact cost.
 *
 * The first release scores TOTAL LOAD ONLY. The musculoskeletal component is
 * Stage 8, deferred past the 2026-10-24 race
 * (PLAN-2026-001-m1-core-loop.md:124-139, which calls it the weakest bet in the
 * project and names the revisit trigger). Stated in the designed rather than
 * the present tense because the present tense read as a description of working
 * code and contradicted docs/specs/07-wiring-todo.md:35, "start: total-load
 * only" (review F16).
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

  /**
   * Share of the final score taken from objective terms when available.
   *
   * Cut from 0.4 on 2026-09-07 (review F12). Renormalising over missing terms
   * does not protect the score, it CONCENTRATES it:
   * tools/garmin_probe/CATALOGUE.md:20-25 records hrv_day, hrv_range_7d and
   * sleep_daily_7d empty across a seven-day probe, and sleep_day's stage and
   * start-time fields null -- the watch is not worn asleep. With hrvVsBaseline
   * (0.4) and sleepScore (0.2) absent, the survivors renormalise to 0.75
   * restingHrVsBaseline and 0.25 bodyBattery, which at a 0.4 share puts a tenth
   * of the entire verdict on Body Battery, a Firstbeat composite with no
   * independent validation, and 30 % on one resting-HR reading. Declining
   * Garmin's own Training Readiness as the score (docs/decisions.md:245-247)
   * while sourcing 40 % of ours from the same sensor stack is that bet with an
   * extra step.
   *
   * Stage 9 must surface WHICH objective terms were present rather than
   * silently renormalising, so a thin day reads as thin instead of as fact.
   */
  objectiveShareWhenAvailable: 0.3,

  /**
   * Objective terms may only lower the score, never raise it:
   *
   *   score = min(subjective, (1 - share) * subjective + share * objective)
   *
   * One expression, veto-only by construction -- good watch numbers cannot lift
   * an amber morning to green, while a genuinely bad night still pulls the
   * verdict down. The asymmetry is the point: the subjective terms are reported
   * by the athlete, and the objective ones come from a sensor stack whose
   * weakest input has no published validation.
   */
  objectiveCanOnlyDowngrade: true,

  /**
   * How hrvVsBaseline is read when HRV data exists: a 7-day rolling mean
   * against a 60-day baseline, banded by half a standard deviation -- never a
   * raw daily RMSSD, whose day-to-day noise swamps the signal it is being asked
   * about.
   *
   * INERT TODAY: no HRV reaches either candidate source (see above).
   */
  hrv: {
    rollingMeanDays: 7,
    baselineDays: 60,
    swcBandSd: 0.5,
  },

  /** Score at or above this is green; at or above amberFloor is amber. */
  greenFloor: 0.7,
  amberFloor: 0.45,

  /** Soreness at or above this severity (1-5) blocks all quality work. */
  sorenessBlocksQuality: 3,

  /**
   * The ranges `subjectiveWeights` has always implied and nothing ever stated.
   *
   * Four inputs are weighted into a 0-1 score and no document says what scale
   * any of them is on -- `check_ins.sleep` is a bare `real`. Written down here
   * rather than inlined at the one call site because a scale IS a threshold
   * (REDLINES.md rule 1), and because the alternative was four magic numbers in
   * a normaliser.
   *
   * `worseIsHigh` says which direction is bad, so the normaliser has one
   * expression instead of a branch per field. Soreness starts at 0 -- "none" is
   * a real reading, and the 1-5 severity in `sorenessBlocksQuality` describes
   * soreness that exists.
   *
   * PROVISIONAL, all four. These are the first numbers a calibration pass
   * should move, and the sleep mark in particular is a guess at what a full
   * night is for this athlete rather than a measurement.
   */
  inputScales: {
    rpeYesterday: { min: 1, max: 10, worseIsHigh: true },
    soreness: { min: 0, max: 5, worseIsHigh: true },
    /** Hours. 9 is full marks, not a target. */
    sleep: { min: 0, max: 9, worseIsHigh: false },
    motivation: { min: 1, max: 5, worseIsHigh: false },
  },
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
 * Peak volume AND the peak long session both land in the week of 28 Sep, leaving
 * three full taper weeks. That was deliberate over putting 100 km in the week of
 * 5 Oct, which would have left only two -- his own framing was "get it in early
 * and taper right down".
 *
 * RESHAPED 2026-09-07 around the two races that survived ratification. The
 * previous cut placed a 35 km long run on Sunday 4 October and a 26 km week
 * ending Sunday 11 October, both of which are race days -- it could not see them
 * because no race data existed (see RACES). Rather than move the long runs to the
 * Saturdays before, which merely stacks a 30 km+ run the day before a race, the
 * two races now CARRY their weeks' long sessions:
 *
 *   - Sun 27 Sep, 27 km, is the last uninterrupted long run of the block.
 *   - Sun  4 Oct, Lincoln Half at marathon pace inside a ~33 km day.
 *   - Sun 11 Oct, LDNX 10K hard inside a ~16 km day.
 *
 * Every long session now carries `longRunDate`, and `longRunOnRace` names the
 * race when one carries it. A long session may not otherwise land on a live race
 * date -- asserted in the tests, because nothing asserted it before and that is
 * exactly how the collision reached a committed plan.
 *
 * `rampExemption` is non-null exactly when the step INTO that week exceeds
 * ACTIVE_RAMP_CAP_PCT. Under the 35 % aggressive cap exactly one step does, and
 * it is the one that deserves the attention: the return from a race taper into
 * a 60 km week. The 80 (+33 %) and 100 (+25 %) steps sit inside the cap.
 *
 * LONG-RUN LADDER RESHAPED 2026-09-07, from 20 / 30 / 35 to 22 / 27 / 33
 * (review F7). Every weekly total is unchanged; only the distribution inside
 * three weeks moved. The old 21.1 -> 30 km step on 27 September was 142 % of
 * the longest run in the preceding thirty days -- the block's one avoidable
 * single-session spike, and a larger one than either the peak long run (117 %)
 * or the marathon itself (121 %). The ladder now runs 104 % / 123 % / 122 %
 * with the marathon at 128 %, so nothing non-exempt sits above ~123 % and the
 * removal cost two kilometres off the longest run of the block. Computed by
 * singleSessionSpikes(); see GUARDRAILS.singleSessionSpikePct for why the rule
 * warns rather than blocks.
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
    // 21.1 of this is the race itself; the rest is taper shakeout. The earlier
    // 20 predated the half being counted as part of the week at all, which made
    // the week's own long session larger than its total.
    targetKm: 28,
    longRunKm: 21.1,
    longRunDate: '2026-09-12',
    longRunOnRace: 'Battersea Park Half Marathon',
    minRunDays: 4,
    rampExemption: null,
    days: null,
    note: 'Taper into the Battersea Half, Sat 12 Sep. The half IS the long session. Not a training week, and not a valid ramp baseline.',
  },
  {
    week: 2,
    monday: '2026-09-14',
    phase: 'rebuild',
    targetKm: 60,
    longRunKm: 22,
    longRunDate: '2026-09-19',
    longRunOnRace: null,
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
      // Two kilometres moved from here onto the long run, so the week still
      // totals 60 while the ladder starts at 22 rather than 20.
      { date: '2026-09-17', km: 8, kind: 'easy' },
      {
        date: '2026-09-18',
        km: 6,
        kind: 'easy',
        note: 'Short shakeout before the long run.',
      },
      { date: '2026-09-19', km: 22, kind: 'long' },
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
    longRunKm: 27,
    longRunDate: '2026-09-27',
    longRunOnRace: null,
    minRunDays: 6,
    rampExemption: null,
    days: null,
    note: '+33.3%, inside the aggressive cap. Six running days: freed evenings make AM/PM doubles available if a morning is missed. This is the LAST uninterrupted long run of the block -- both remaining long-session slots are races. Cut from 30 km to 27 on 2026-09-07: against a 22 km trailing-30-day longest, 30 was a 142% single-session spike and 27 is 123%, at no cost to the weekly 80.',
  },
  {
    week: 4,
    monday: '2026-09-28',
    phase: 'peak',
    targetKm: 100,
    longRunKm: 33,
    longRunDate: '2026-10-04',
    longRunOnRace: 'Lincoln Half Marathon',
    minRunDays: 7,
    rampExemption: null,
    days: null,
    note:
      'Peak volume and peak long session together, 20 days out. +25%, inside the cap. ' +
      'The long session IS Lincoln, built as ~8 km easy warm-up + 21.1 km AT MARATHON PACE + ~4 km easy = ~33 km. ' +
      'This turns a race that would otherwise have wrecked the peak week into the best marathon-specific session ' +
      'of the block: a long run with a large marathon-pace block inside it, on tired legs, three weeks out. ' +
      'CONDITION: it requires Lincoln run at marathon pace, not raced flat out. That was the role the original ' +
      'spec gave Lincoln ("rehearsal -- marathon pace, confirms goal pace"), so this restores intent rather than ' +
      'imposing a new constraint. REVERSIBLE: if Luis races it hard, this week loses its long session and the ' +
      '100 km target should come down. Seven running days: 100 km over five would be 20 km a day.',
  },
  {
    week: 5,
    monday: '2026-10-05',
    phase: 'taper',
    targetKm: 80,
    longRunKm: 16,
    longRunDate: '2026-10-11',
    longRunOnRace: 'ASICS LDNX 10K',
    minRunDays: 6,
    rampExemption: null,
    days: null,
    note:
      'First taper step. The long session IS the LDNX 10K: warm-up + 10 km hard + cool-down, ~16 km. ' +
      'Cut from the 26 km this week previously held, because a 10K raced hard is the intensity and a long run ' +
      'on top of it is not recoverable 13 days out. The weekly 80 km therefore sits in midweek volume rather ' +
      'than the weekend, which is the correct shape for a taper: keep frequency and intensity, cut volume.',
  },
  {
    week: 6,
    monday: '2026-10-12',
    phase: 'taper',
    targetKm: 60,
    longRunKm: 18,
    longRunDate: '2026-10-18',
    longRunOnRace: null,
    minRunDays: 5,
    rampExemption: null,
    days: null,
    note: 'Protected. Nothing added above target.',
  },
  {
    week: 7,
    monday: '2026-10-19',
    phase: 'race',
    // 32 km of easy running Mon-Fri, EXCLUDING the 42.195 of the race itself,
    // which lives in RACES for the same reason longRunKm below is null. Set on
    // 2026-09-07 (review F15): the taper was 100 -> 80 -> 60 -> null, and a
    // null is not a checkable number -- Bosquet 2007 wants a 41-60 % volume cut
    // held across the taper with frequency and intensity intact, which the last
    // week could silently violate while reading as planned.
    targetKm: 32,
    // The marathon is the goal, not a planned training session. It lives in
    // RACES. Counting it here would put 42.195 into every long-run aggregate
    // and make the block's peak long run read as the race itself.
    longRunKm: null,
    longRunDate: null,
    longRunOnRace: null,
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
