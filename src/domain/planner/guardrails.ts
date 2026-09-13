/**
 * Guardrail evaluation over the WHOLE rolling window.
 *
 * Two properties this file exists to hold:
 *
 * 1. **Every result is structured.** Id, threshold, observed value, breached,
 *    and the span the figures cover -- never a bare boolean. A caller has to
 *    state the rule, quantify the cost of breaking it and offer the closest
 *    compliant alternative (`docs/specs/03-planner.md:28`), and none of that is
 *    reconstructible from a `false`.
 * 2. **The scope is the window, not the session.** Ten individually-legal
 *    single-session edits can walk a compliant week past the ramp cap with
 *    every call truthfully reporting success (`04-mcp-surface.md:47`). Every
 *    entry point here takes the window.
 *
 * Every id in `GUARDRAIL_RULE_IDS` produces at least one result on every call,
 * even when it does not apply -- that is what makes `applied_rules[]` mean
 * "evaluated" rather than "happened to fire", and what lets a test prove a rule
 * in the config is not silently unenforced.
 *
 * No threshold is written here. Every number comes from `config/training.ts`
 * at evaluation time (REDLINES.md rule 1).
 */

import {
  ACTIVE_RAMP_CAP_PCT,
  BLOCK,
  BLOCK_WEEKS,
  GUARDRAILS,
  LIVE_RACE_DATES,
  MEASURED_BASE,
  READINESS,
  raceRunInCeilingKm,
  singleSessionSpikes,
} from '../../../config/training';
import { daysBetweenIso, mondayOf, shiftIso, weekDates } from './dates';
import type {
  CompletedRun,
  GuardrailResult,
  PlanWindow,
  PlannedSession,
} from './types';

export type SorenessReport = {
  /** Severity as the check-in records it: 0 is none, 5 is the tumble dryer. */
  readonly severity: number;
  /** The day it was reported. The gate applies from here forward. */
  readonly since: string;
};

export type GuardrailInput = {
  /** The whole rolling window. Never a single session. */
  readonly window: PlanWindow;
  /**
   * Runs already completed, before or inside the window. The ramp baseline and
   * the single-session spike baseline both come from here; without it the
   * planner falls back to the macro layer's own targets.
   */
  readonly history?: readonly CompletedRun[];
  /** The latest check-in. Null or absent means no reading, not "fine". */
  readonly soreness?: SorenessReport | null;
};

const EPSILON_KM = 0.05;

/** Every guardrail, evaluated over the whole window. */
export function evaluateGuardrails(
  input: GuardrailInput,
): readonly GuardrailResult[] {
  const weeks = weeksTouched(input.window);

  return [
    ...weeks.flatMap((monday) => weeklyRules(monday, input)),
    ...spikeRule(input),
    ...qualitySpacingRules(input.window),
    ...sorenessRule(input),
    ...raceRunInRule(input),
  ];
}

/* ------------------------------------------------------------- per week --- */

function weeklyRules(monday: string, input: GuardrailInput): GuardrailResult[] {
  const dates = weekDates(monday);
  const kmByDate = kilometresByDate(dates, input);
  const visibleDays = dates.filter((d) => kmByDate.get(d) !== undefined).length;
  const weekKm = round1(sum([...kmByDate.values()]));
  const runDays = dates.filter((d) => (kmByDate.get(d) ?? 0) > 0).length;
  const planned = BLOCK_WEEKS.find((w) => w.monday === monday);
  const coverage = {
    from: dates[0] as string,
    to: dates[6] as string,
    days: visibleDays,
  };
  const scope = `week of ${monday}`;

  return [
    rampRule({ scope, coverage, monday, weekKm, planned, input }),
    highVolumeRule({ scope, coverage, weekKm, runDays, visibleDays }),
    recoveryRule({ scope, coverage, runDays }),
    qualityBudgetRule({ scope, coverage, dates, window: input.window }),
    taperRule({
      scope,
      coverage,
      monday,
      weekKm: round1(weekKm - uncarriedRaceKm(dates, input.window)),
      planned,
    }),
  ];
}

/**
 * Kilometres in a week that belong to a race the week does not name as carrying
 * its long session -- the goal marathon in race week, and nothing else in this
 * block.
 *
 * Only the taper rule nets these out, and only because it compares against a
 * `targetKm` the config wrote to exclude them ("32 km of easy running Mon-Fri,
 * EXCLUDING the 42.195 of the race itself"). Counting them would make the goal
 * race breach the taper protection every time -- a rule refusing the race it
 * exists to serve. The ramp and spike rules keep counting the full distance:
 * the tissue runs it either way.
 */
function uncarriedRaceKm(dates: readonly string[], window: PlanWindow): number {
  const week = BLOCK_WEEKS.find((w) => w.monday === dates[0]);

  return sum(
    window
      .filter(
        (s) =>
          s.kind === 'race' &&
          dates.includes(s.date) &&
          s.date !== week?.longRunDate,
      )
      .map((s) => s.km),
  );
}

type WeekFacts = {
  readonly scope: string;
  readonly coverage: GuardrailResult['coverage'];
};

type PlannedWeek = (typeof BLOCK_WEEKS)[number] | undefined;

function rampRule(
  args: WeekFacts & {
    readonly monday: string;
    readonly weekKm: number;
    readonly planned: PlannedWeek;
    readonly input: GuardrailInput;
  },
): GuardrailResult {
  const previousMonday = shiftIso(args.monday, -7);
  const baselineKm = rampBaselineKm(previousMonday, args.input);
  const observed =
    baselineKm > 0
      ? round1(((args.weekKm - baselineKm) / baselineKm) * 100)
      : 0;
  const over = observed > ACTIVE_RAMP_CAP_PCT;

  // A ratified exemption is not a silent pass: the week declared the breach in
  // `config/training.ts` and Luis signed it off after the cost was stated. It
  // covers the week AS AUTHORED and no further -- add a kilometre above target
  // and the rule fires again, which is the whole point of measuring against
  // `targetKm` rather than trusting the presence of the string.
  const ratified =
    args.planned?.rampExemption != null &&
    args.weekKm <= (args.planned.targetKm ?? 0) + EPSILON_KM;

  return {
    ruleId: 'weekly-ramp-cap',
    scope: args.scope,
    threshold: ACTIVE_RAMP_CAP_PCT,
    observed,
    unit: 'pct',
    breached: over && !ratified,
    blocking: true,
    overridable: true,
    coverage: args.coverage,
    detail: over
      ? ratified
        ? `${args.weekKm} km is +${observed}% on ${baselineKm} km, over the ${ACTIVE_RAMP_CAP_PCT}% cap, under the exemption this week already carries.`
        : `${args.weekKm} km is +${observed}% on the ${baselineKm} km before it, over the ${ACTIVE_RAMP_CAP_PCT}% cap. The compliant ceiling is ${round1(baselineKm * (1 + ACTIVE_RAMP_CAP_PCT / 100))} km.`
      : `${args.weekKm} km is +${observed}% on ${baselineKm} km, inside the ${ACTIVE_RAMP_CAP_PCT}% cap.`,
  };
}

/**
 * Last week's kilometres: what was actually run if history says, otherwise what
 * the macro layer planned, otherwise the pre-taper baseline.
 *
 * The fallback order matters. A week with no completed runs is far more often a
 * week outside the recorded history than a week of genuine rest, and treating
 * it as zero makes the next week an infinite ramp.
 */
function rampBaselineKm(previousMonday: string, input: GuardrailInput): number {
  const dates = new Set(weekDates(previousMonday));
  const completed = sum(
    (input.history ?? []).filter((r) => dates.has(r.date)).map((r) => r.km),
  );
  if (completed > 0) return round1(completed);

  const planned = BLOCK_WEEKS.find((w) => w.monday === previousMonday);
  if (planned?.targetKm != null && planned.targetKm > 0)
    return planned.targetKm;

  return MEASURED_BASE.preTaperBaselineKm;
}

function highVolumeRule(
  args: WeekFacts & {
    readonly weekKm: number;
    readonly runDays: number;
    readonly visibleDays: number;
  },
): GuardrailResult {
  const applies = args.weekKm > GUARDRAILS.highVolumeThresholdKm;
  // Only a fully visible week can be short of running days -- a day the window
  // does not reach is unknown, not empty, and calling it empty would invent a
  // breach out of a partial view.
  const complete = args.visibleDays === 7;

  return {
    ruleId: 'high-volume-spread',
    scope: args.scope,
    threshold: GUARDRAILS.minRunDaysAtHighVolume,
    observed: args.runDays,
    unit: 'days',
    breached:
      applies && complete && args.runDays < GUARDRAILS.minRunDaysAtHighVolume,
    blocking: true,
    overridable: true,
    coverage: args.coverage,
    detail: applies
      ? `${args.weekKm} km is above the ${GUARDRAILS.highVolumeThresholdKm} km spread threshold, so it needs ${GUARDRAILS.minRunDaysAtHighVolume} running days; it has ${args.runDays}. Same weekly total over fewer days is ${round1(args.weekKm / Math.max(args.runDays, 1))} km a day against ${round1(args.weekKm / GUARDRAILS.minRunDaysAtHighVolume)}.`
      : `${args.weekKm} km is at or below the ${GUARDRAILS.highVolumeThresholdKm} km spread threshold; the rule does not bind this week.`,
  };
}

function recoveryRule(
  args: WeekFacts & { readonly runDays: number },
): GuardrailResult {
  const maxRunDays = 7 - GUARDRAILS.minRestOrSwimOnlyDaysPerWeek;

  return {
    ruleId: 'weekly-recovery-days',
    scope: args.scope,
    threshold: GUARDRAILS.minRestOrSwimOnlyDaysPerWeek,
    observed: 7 - args.runDays,
    unit: 'days',
    // Counted from running days rather than from rest rows, so a day the window
    // cannot see never reads as rest.
    breached: args.runDays > maxRunDays,
    blocking: true,
    overridable: true,
    coverage: args.coverage,
    detail:
      args.runDays > maxRunDays
        ? `${args.runDays} running days leaves no rest-or-swim-only day; the week needs at least ${GUARDRAILS.minRestOrSwimOnlyDaysPerWeek}.`
        : `${7 - args.runDays} rest-or-swim-only day(s), at or above the minimum of ${GUARDRAILS.minRestOrSwimOnlyDaysPerWeek}.`,
  };
}

function qualityBudgetRule(
  args: WeekFacts & {
    readonly dates: readonly string[];
    readonly window: PlanWindow;
  },
): GuardrailResult {
  const inWeek = args.window.filter((s) => args.dates.includes(s.date));
  const quality = inWeek.filter((s) => s.kind === 'quality').length;
  const races = GUARDRAILS.racesCountAsQualitySessions
    ? inWeek.filter((s) => s.kind === 'race').length
    : 0;
  const spent = quality + races;

  return {
    ruleId: 'quality-session-budget',
    scope: args.scope,
    threshold: GUARDRAILS.maxQualitySessionsPerWeekBuild,
    observed: spent,
    unit: 'sessions',
    breached: spent > GUARDRAILS.maxQualitySessionsPerWeekBuild,
    blocking: true,
    overridable: true,
    coverage: args.coverage,
    detail: `${spent} quality session(s) this week (${quality} planned, ${races} race) against a budget of ${GUARDRAILS.maxQualitySessionsPerWeekBuild}. A race spends the budget.`,
  };
}

function taperRule(
  args: WeekFacts & {
    readonly monday: string;
    readonly weekKm: number;
    readonly planned: PlannedWeek;
  },
): GuardrailResult {
  const protectedMondays: string[] = BLOCK_WEEKS.slice(
    -GUARDRAILS.protectedTaperWeeks,
  ).map((w) => w.monday);
  const isProtected = protectedMondays.includes(args.monday);
  const target = args.planned?.targetKm ?? null;
  const over =
    isProtected && target != null && args.weekKm > target + EPSILON_KM;

  return {
    ruleId: 'protected-taper',
    scope: args.scope,
    threshold: isProtected ? target : null,
    observed: args.weekKm,
    unit: 'km',
    breached: over,
    blocking: true,
    // The one rule the athlete may not override, with the injury gate
    // (`docs/specs/03-planner.md:28`). The taper cuts volume, not intensity --
    // this rule reads volume alone, so it never blocks the sharpener.
    overridable: false,
    coverage: args.coverage,
    detail: isProtected
      ? over
        ? `Protected taper week: ${args.weekKm} km is ${round1(args.weekKm - (target ?? 0))} km above the ${target} km target, and nothing may be added above target here.`
        : `Protected taper week, ${args.weekKm} km against a ${target ?? 0} km target.`
      : `Not one of the final ${GUARDRAILS.protectedTaperWeeks} weeks; the taper protection does not bind.`,
  };
}

/* ------------------------------------------------- window-wide rules --- */

/**
 * Single-session spikes. ADVISORY: named, costed, never a blocker -- the goal
 * marathon itself is 128 % of the longest run that can precede it, so a
 * blocking version refuses the race it exists to serve.
 */
function spikeRule(input: GuardrailInput): GuardrailResult[] {
  const runs: CompletedRun[] = [
    ...(input.history ?? []),
    ...input.window
      .filter((s) => s.km > 0)
      .map((s) => ({ date: s.date, km: s.km })),
  ];
  if (runs.length === 0) return [];

  const dates = runs.map((r) => r.date).sort((a, b) => a.localeCompare(b));
  const coverage = {
    from: dates[0] as string,
    to: dates[dates.length - 1] as string,
    days: dates.length,
  };
  const breaches = singleSessionSpikes(runs);

  if (breaches.length === 0) {
    return [
      {
        ruleId: 'single-session-spike',
        scope: 'window',
        threshold: GUARDRAILS.singleSessionSpikePct,
        observed: null,
        unit: 'pct',
        breached: false,
        blocking: false,
        overridable: true,
        coverage,
        detail: `No session exceeds ${GUARDRAILS.singleSessionSpikePct}% of the longest run in its preceding 30 days.`,
      },
    ];
  }

  return breaches.map((b) => ({
    ruleId: 'single-session-spike' as const,
    scope: b.date,
    threshold: GUARDRAILS.singleSessionSpikePct,
    observed: round1(b.pctOfBaseline),
    unit: 'pct' as const,
    breached: true,
    blocking: false,
    overridable: true,
    coverage,
    detail: `${b.km} km on ${b.date} is ${round1(b.pctOfBaseline)}% of the ${b.baselineKm} km longest run in the preceding 30 days, over the ${GUARDRAILS.singleSessionSpikePct}% mark. Advisory: the hazard ratios are non-monotonic, so read this as over-or-under, not as a dial.`,
  }));
}

/**
 * Two spacing rules under the quality-budget id: quality sessions never on
 * consecutive days, and never the day after a race or a long run.
 *
 * Both are window-wide rather than per-week on purpose -- a Sunday long run and
 * the Monday after it sit in different weeks, and a per-week check cannot see
 * the pair. That gap is the exact shape of the defect this repo already
 * shipped once with races.
 */
function qualitySpacingRules(window: PlanWindow): GuardrailResult[] {
  const hard = [...window]
    .filter((s) => s.kind === 'quality' || s.kind === 'race')
    .sort((a, b) => a.date.localeCompare(b.date));
  const coverage = windowCoverage(window);

  const gaps = hard
    .slice(1)
    .map((s, i) => daysBetweenIso(hard[i]?.date ?? s.date, s.date));
  const minGap = gaps.length > 0 ? Math.min(...gaps) : null;

  const anchors = new Set(
    window
      .filter((s) => s.kind === 'race' || s.kind === 'long')
      .map((s) => shiftIso(s.date, 1)),
  );
  const dayAfter = window.filter(
    (s) => s.kind === 'quality' && anchors.has(s.date),
  );

  return [
    {
      ruleId: 'quality-session-budget',
      scope: 'window: spacing',
      threshold: GUARDRAILS.minDaysBetweenQualitySessions,
      observed: minGap,
      unit: 'days',
      breached:
        minGap !== null && minGap < GUARDRAILS.minDaysBetweenQualitySessions,
      blocking: true,
      overridable: true,
      coverage,
      detail:
        minGap === null
          ? 'Fewer than two hard sessions in the window; spacing does not bind.'
          : `Closest pair of hard sessions is ${minGap} day(s) apart against a minimum of ${GUARDRAILS.minDaysBetweenQualitySessions}.`,
    },
    {
      ruleId: 'quality-session-budget',
      scope: 'window: day after a hard session',
      // Zero is the rule itself, not a tunable: "never the day after a race or
      // long run" (docs/specs/03-planner.md:7). There is no threshold in the
      // config to read because there is no dial here to turn.
      threshold: 0,
      observed: dayAfter.length,
      unit: 'sessions',
      breached: dayAfter.length > 0,
      blocking: true,
      overridable: true,
      coverage,
      detail:
        dayAfter.length > 0
          ? `Quality on ${dayAfter.map((s) => s.date).join(', ')}, the day after a race or long run.`
          : 'No quality session falls the day after a race or long run.',
    },
  ];
}

/**
 * The injury gate. Non-overridable, with the taper.
 *
 * Gates QUALITY only, not a race: a race is a fixture entered months ago and is
 * the athlete's call, exactly as `singleSessionSpikes()` treats a pure race as
 * exempt. Refusing to let a sore athlete start a race they have entered is a
 * decision this planner does not get to take.
 */
function sorenessRule(input: GuardrailInput): GuardrailResult[] {
  const coverage = windowCoverage(input.window);
  const report = input.soreness;

  if (!report) {
    return [
      {
        ruleId: 'soreness-quality-gate',
        scope: 'window',
        threshold: READINESS.sorenessBlocksQuality,
        observed: null,
        unit: 'severity',
        breached: false,
        blocking: true,
        overridable: false,
        coverage,
        detail:
          'No check-in reading. Absence of a reading is not a green light; it is an absence.',
      },
    ];
  }

  const gated = input.window.filter(
    (s) => s.kind === 'quality' && s.date >= report.since,
  );
  const sore = report.severity >= READINESS.sorenessBlocksQuality;

  return [
    {
      ruleId: 'soreness-quality-gate',
      scope: `window from ${report.since}`,
      threshold: READINESS.sorenessBlocksQuality,
      observed: report.severity,
      unit: 'severity',
      breached: sore && gated.length > 0,
      blocking: true,
      overridable: false,
      coverage,
      detail: sore
        ? gated.length > 0
          ? `Soreness ${report.severity} is at or above the ${READINESS.sorenessBlocksQuality} that blocks quality, and ${gated.length} quality session(s) stand from ${report.since}. Easy volume and swimming are unaffected.`
          : `Soreness ${report.severity} blocks quality; no quality session stands from ${report.since}.`
        : `Soreness ${report.severity} is below the ${READINESS.sorenessBlocksQuality} that blocks quality.`,
    },
  ];
}

/* ---------------------------------------------------------- utilities --- */

function weeksTouched(window: PlanWindow): string[] {
  return [...new Set(window.map((s) => mondayOf(s.date)))].sort((a, b) =>
    a.localeCompare(b),
  );
}

/**
 * Kilometres per date across a week: the window where it reaches, completed
 * history where it does not, and nothing where neither knows.
 *
 * A planned session supersedes history for the same date rather than adding to
 * it -- the two are the same run seen before and after, and summing them is how
 * a week reads as double its own volume.
 */
function kilometresByDate(
  dates: readonly string[],
  input: GuardrailInput,
): Map<string, number> {
  const km = new Map<string, number>();

  for (const run of input.history ?? []) {
    if (dates.includes(run.date)) {
      km.set(run.date, (km.get(run.date) ?? 0) + run.km);
    }
  }
  for (const session of input.window) {
    if (!dates.includes(session.date)) continue;
    const planned = input.window
      .filter((s) => s.date === session.date)
      .reduce((total, s) => total + s.km, 0);
    km.set(session.date, planned);
  }
  return km;
}

function windowCoverage(window: PlanWindow): GuardrailResult['coverage'] {
  const dates = window.map((s) => s.date).sort((a, b) => a.localeCompare(b));
  return {
    from: dates[0] ?? '',
    to: dates[dates.length - 1] ?? '',
    days: new Set(dates).size,
  };
}

function sum(values: readonly number[]): number {
  return values.reduce((total, v) => total + v, 0);
}

/**
 * The run-in to the goal race: a single session against how close to race day it
 * sits, rather than a week against its target.
 *
 * ADVISORY, NEVER A BLOCKER, for the same structural reason as the single-session
 * spike. Week 6's 18 km long run on 2026-10-18 is six days out and over the
 * 13 km the research asks for inside the final fortnight. That distance is a
 * ratified `BLOCK_WEEKS` decision, so a blocking version would refuse the taper
 * the config itself authored -- and a guardrail overridden every week is
 * repealed in practice. It is named and costed instead.
 *
 * `placement.distribute()` shapes easy volume so this never fires on a generated
 * week. What reaches here is therefore what the planner did NOT choose: a
 * ratified long run, or an athlete's own edit through the negotiation surface.
 *
 * Races are exempt by declaration -- the distance was entered months ago and is
 * not a planner decision to smooth. That includes the marathon itself, which
 * would otherwise breach a ceiling of zero on its own day.
 */
function raceRunInRule(input: GuardrailInput): GuardrailResult[] {
  const from = shiftIso(
    BLOCK.goalRaceDate,
    -GUARDRAILS.raceRunIn.fortnightDays,
  );
  const visible = input.window.filter(
    (s) => s.date >= from && s.date <= BLOCK.goalRaceDate,
  );

  const breaches = visible
    .filter((s) => s.kind !== 'race' && s.km > 0)
    .flatMap((s) => {
      const ceiling = raceRunInCeilingKm(s.date);
      if (ceiling === null || s.km <= ceiling + EPSILON_KM) return [];
      return [{ session: s, ceiling }];
    })
    .sort((a, b) => b.session.km - a.session.km);

  const worst = breaches[0];

  return [
    {
      ruleId: 'race-run-in',
      scope: `run-in from ${from}`,
      threshold: 0,
      observed: breaches.length,
      unit: 'sessions',
      breached: breaches.length > 0,
      blocking: false,
      overridable: true,
      coverage: {
        from,
        to: BLOCK.goalRaceDate,
        days: new Set(visible.map((s) => s.date)).size,
      },
      detail: worst
        ? `${breaches.length} session(s) in the last ${GUARDRAILS.raceRunIn.fortnightDays} days before ${BLOCK.goalRace} run longer than the run-in allows. Worst: ${worst.session.km} km on ${worst.session.date} against a ${worst.ceiling} km ceiling ${daysBetweenIso(worst.session.date, BLOCK.goalRaceDate)} days out.`
        : `Nothing inside the last ${GUARDRAILS.raceRunIn.fortnightDays} days before ${BLOCK.goalRace} runs longer than the run-in allows.`,
    },
  ];
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Sessions that are races on a date the config still calls live. */
export function isLiveRaceDate(date: string): boolean {
  return LIVE_RACE_DATES.includes(date);
}

/** Total running kilometres in a set of sessions. */
export function totalKm(sessions: readonly PlannedSession[]): number {
  return round1(sum(sessions.map((s) => s.km)));
}
