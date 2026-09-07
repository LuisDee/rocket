/**
 * Rolling load: ATL, CTL, TSB. `docs/specs/02-load-engine.md`, "Rolling load
 * state".
 *
 * Two properties are load-bearing and neither is about the arithmetic.
 *
 * **It is computed from the full series, and returns the window it covers**
 * (REDLINES.md rule 7). A trailing figure derived from a truncated list is
 * wrong without looking wrong -- that is the failure that produced a confident
 * recommendation to abandon the goal race on 2026-09-06. `coverage` is not
 * decoration: it is how a reader tells a 42-day CTL from a 9-day one.
 *
 * **It is WARM-STARTED** from Garmin's own measured chronic/acute pair
 * (`LOAD.seed`). An exponential average initialised at zero does not converge
 * for one time constant; it ramps upward as a pure artefact of its window
 * filling, so a block being established reads as a block collapsing. Seeding
 * inherits Garmin's model, in Garmin's units, which is the right trade while
 * Garmin holds the history and we do not -- and the borrowing is stated in
 * `warmingUp` and `caveat` rather than hidden (REDLINES.md rule 4).
 *
 * **ATL, CTL and TSB are trend displays. Nothing is gated on them.** The 7 and
 * 42 day constants were never fitted against outcome data (Hellard 2006), and
 * where they have been fitted the values move with the metric fed to them
 * (Vermeire 2022). Decisions come from the single-session cap, the weekly ramp
 * cap, the soreness gate and the readiness verdict.
 *
 * No threshold lives here (REDLINES.md rule 1): every number is read from
 * `config/training.ts` at evaluation time.
 */

import { LOAD } from '../../config/training';
import { daysBetweenIso, shiftIso } from './planner/dates';

/** One day's total training stress, in arbitrary units. */
export type DailyStress = {
  readonly date: string;
  readonly load: number;
  /**
   * Where the number came from. Garmin's own per-activity training load and a
   * session-RPE floor are NOT the same scale, and a series that silently mixes
   * them is a series with a step change in it.
   */
  readonly basis: 'garmin' | 'rpe';
};

export type LoadState = {
  readonly ctl: number;
  readonly atl: number;
  /** CTL - ATL. A difference, not a ratio, and still nothing to threshold. */
  readonly tsb: number;
  readonly coverage: {
    /** First day of our own series -- the day after the seed was read. */
    readonly from: string;
    readonly to: string;
    /** Days the recursion actually ran over. */
    readonly days: number;
    /** Of those, how many carried a real activity rather than a rest zero. */
    readonly daysWithLoad: number;
    /** Days whose load came from the RPE floor rather than Garmin's model. */
    readonly daysOnRpeFloor: number;
  };
  readonly seed: {
    readonly ctl: number;
    readonly atl: number;
    readonly asOf: string;
  };
  /** True while our own series is shorter than one CTL time constant. */
  readonly warmingUp: boolean;
  /** Non-null exactly when `warmingUp`. The sentence a caller must not drop. */
  readonly caveat: string | null;
};

/** An activity, in the only shape this module needs from one. */
export type ScorableActivity = {
  readonly localDate: string;
  readonly durationS: number | null;
  readonly rpe: number | null;
  /** Garmin's own per-activity training load, when the source supplied one. */
  readonly trainingLoad: number | null;
};

/**
 * Collapse activities to one stress figure per day.
 *
 * The cascade is `02-load-engine.md`'s, minus the middle rung: Garmin's own
 * load when it came with the activity, otherwise Foster session-RPE
 * (RPE x minutes), which is the floor and is always computable from a manual
 * log. The pace-vs-threshold rung needs athlete thresholds that the Lincoln
 * Half has not settled yet, so it is absent rather than guessed.
 *
 * An activity with neither a load nor an RPE contributes nothing -- a run we
 * know happened but cannot score must not be scored as a zero-effort day.
 */
export function dailyStress(
  activities: readonly ScorableActivity[],
): DailyStress[] {
  const byDate = new Map<string, { load: number; rpeOnly: boolean }>();

  for (const activity of activities) {
    const garmin = activity.trainingLoad;
    const minutes = (activity.durationS ?? 0) / 60;
    const foster =
      activity.rpe !== null && minutes > 0 ? activity.rpe * minutes : null;
    const load = garmin ?? foster;
    if (load === null || !Number.isFinite(load)) continue;

    const existing = byDate.get(activity.localDate) ?? {
      load: 0,
      rpeOnly: false,
    };
    byDate.set(activity.localDate, {
      load: existing.load + load,
      rpeOnly: existing.rpeOnly || garmin === null,
    });
  }

  return [...byDate.entries()]
    .map(([date, day]) => ({
      date,
      load: round1(day.load),
      basis: day.rpeOnly ? ('rpe' as const) : ('garmin' as const),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Run the two exponential averages from the seed up to `today`.
 *
 * Missing days are real zeros: a rest day is a day of no training, and skipping
 * it would make a fortnight off look like continuous training at a lower rate.
 */
export function rollingLoad(
  series: readonly DailyStress[],
  today: string,
): LoadState {
  const seed = LOAD.seed;
  const from = shiftIso(seed.asOf, 1);
  const days = Math.max(0, daysBetweenIso(seed.asOf, today));

  const byDate = new Map(series.map((day) => [day.date, day]));
  const ctlAlpha = alpha(LOAD.ctlDays);
  const atlAlpha = alpha(LOAD.atlDays);

  let ctl = seed.ctl;
  let atl = seed.atl;
  let daysWithLoad = 0;
  let daysOnRpeFloor = 0;

  for (let i = 0; i < days; i++) {
    const date = shiftIso(from, i);
    const day = byDate.get(date);
    const load = day?.load ?? 0;
    if (day !== undefined) {
      daysWithLoad += 1;
      if (day.basis === 'rpe') daysOnRpeFloor += 1;
    }
    ctl += (load - ctl) * ctlAlpha;
    atl += (load - atl) * atlAlpha;
  }

  const warmingUp = days < LOAD.ctlWarmUpDays;

  return {
    ctl: round1(ctl),
    atl: round1(atl),
    tsb: round1(ctl - atl),
    coverage: {
      from,
      to: today,
      days,
      daysWithLoad,
      daysOnRpeFloor,
    },
    seed: { ctl: seed.ctl, atl: seed.atl, asOf: seed.asOf },
    warmingUp,
    caveat: warmingUp
      ? `CTL has ${String(days)} of ${String(LOAD.ctlWarmUpDays)} days of our own history behind it; ` +
        `the rest is Garmin's own chronic/acute pair (${String(seed.ctl)}/${String(seed.atl)}) as read on ${seed.asOf}. ` +
        `Read it as a trend, not as a verdict.`
      : null,
  };
}

/**
 * The EWMA smoothing factor for a time constant in days.
 *
 * `1 - exp(-1/n)` rather than the `2/(n+1)` of a trading-style EMA: the
 * training literature's ATL/CTL are impulse responses with a time constant in
 * days, and the two forms differ by enough at n = 42 to move a TSB by several
 * units.
 */
function alpha(days: number): number {
  return 1 - Math.exp(-1 / days);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
