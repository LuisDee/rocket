/**
 * Planned kilometres against what was actually run.
 *
 * The number that says whether the block on screen is the block being run.
 * Pure functions over rows the caller fetched, so the aggregation is testable
 * without a database -- the reason the earlier guardrail bug survived was that
 * a planned week was being compared against a planned week.
 */

import { BLOCK_WEEKS } from '../../config/training';
import { shiftIsoDate } from './block';

/** One completed run. Same shape the guardrails take as history. */
export type Run = { readonly date: string; readonly km: number };

/** The subset of a block week this module reads. */
export type PlannableWeek = {
  readonly week: number;
  readonly monday: string;
  readonly phase: string;
  readonly targetKm: number | null;
};

export type WeekActual = {
  readonly week: number;
  readonly monday: string;
  readonly phase: string;
  /** Null for race week, which carries no running target. */
  readonly plannedKm: number | null;
  readonly actualKm: number;
  /** actual - planned. Null when there is nothing to compare against. */
  readonly deltaKm: number | null;
  /** True once the week has finished, so a partial week is not read as a shortfall. */
  readonly complete: boolean;
};

/** Sunday of the week starting `monday`, as `YYYY-MM-DD`. */
export function weekEnd(monday: string): string {
  return shiftIsoDate(monday, 6);
}

/**
 * Sum the runs falling inside each block week.
 *
 * `today` decides which weeks are complete: a week still in progress shows its
 * actual so far, and its delta is reported but must not be read as a miss.
 */
export function weeklyActuals(
  runs: readonly Run[],
  today: string,
  // Taken as a parameter rather than read from the module, for the reason
  // block.ts takes `today`: a function that reaches for a global cannot be
  // tested at a case the live config does not currently contain -- here, a week
  // with no running target.
  weeks: readonly PlannableWeek[] = BLOCK_WEEKS,
): WeekActual[] {
  return weeks.map((week) => {
    const end = weekEnd(week.monday);
    const actualKm = runs
      .filter((r) => r.date >= week.monday && r.date <= end)
      .reduce((sum, r) => sum + r.km, 0);

    const planned = week.targetKm;
    return {
      week: week.week,
      monday: week.monday,
      phase: week.phase,
      plannedKm: planned,
      actualKm: round1(actualKm),
      deltaKm: planned === null ? null : round1(actualKm - planned),
      complete: end < today,
    };
  });
}

/**
 * Block totals, counting only weeks that have finished.
 *
 * An in-progress week would otherwise drag the cumulative delta negative every
 * Monday morning and recover by Sunday, which is noise rather than signal.
 */
export function blockTotals(weeks: readonly WeekActual[]): {
  plannedKm: number;
  actualKm: number;
  deltaKm: number;
  weeksCounted: number;
} {
  const done = weeks.filter((w) => w.complete && w.plannedKm !== null);
  const plannedKm = done.reduce((s, w) => s + (w.plannedKm ?? 0), 0);
  const actualKm = done.reduce((s, w) => s + w.actualKm, 0);
  return {
    plannedKm: round1(plannedKm),
    actualKm: round1(actualKm),
    deltaKm: round1(actualKm - plannedKm),
    weeksCounted: done.length,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
