/**
 * Reading the macro block against a calendar date.
 *
 * Pure functions taking `today` explicitly rather than calling `new Date()`
 * inside: the current-week boundary is the whole point, and a function that
 * reads the clock itself cannot be tested at a boundary.
 *
 * Every training number comes from config/training.ts (REDLINES.md rule 1);
 * nothing here invents one.
 */

import { BLOCK, BLOCK_WEEKS } from '../../config/training';

export type BlockWeek = (typeof BLOCK_WEEKS)[number];

/** Days from `today` to the goal race. Negative once it is behind us. */
export function daysToRace(today: Date, raceDate = BLOCK.goalRaceDate): number {
  return daysBetween(today, parseIsoDate(raceDate));
}

/**
 * The week containing `today`, or null when today falls outside the block.
 *
 * A week runs from its Monday to the day before the next week's Monday; the
 * last week runs to the Sunday six days after its own Monday. Today being a
 * Monday must select that week, not the one before -- which is the boundary
 * the test pins.
 */
export function currentWeek(today: Date): BlockWeek | null {
  const day = startOfDay(today);

  for (let i = 0; i < BLOCK_WEEKS.length; i += 1) {
    const week = BLOCK_WEEKS[i];
    if (week === undefined) continue;

    const monday = parseIsoDate(week.monday);
    const next = BLOCK_WEEKS[i + 1];
    const end =
      next === undefined ? addDays(monday, 7) : parseIsoDate(next.monday);

    if (day >= monday && day < end) return week;
  }
  return null;
}

/** Total planned running kilometres across the block. */
export function plannedTotalKm(): number {
  return BLOCK_WEEKS.reduce((sum, week) => sum + (week.targetKm ?? 0), 0);
}

/**
 * Parse `YYYY-MM-DD` as local midnight.
 *
 * `new Date('2026-09-07')` parses as UTC midnight, which in a positive-offset
 * timezone is the 7th but in a negative one is the 6th -- so a date-only string
 * silently shifts a day depending on where it is read. All dates in this app
 * are Europe/London calendar dates, so they are constructed component-wise.
 */
export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const out = new Date(date);
  out.setDate(out.getDate() + days);
  return out;
}

/**
 * Whole days between two dates, counted on the calendar rather than in
 * milliseconds -- a 24-hour arithmetic difference is off by one across a
 * daylight-saving boundary, and this block spans the October clock change.
 */
function daysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / 86_400_000);
}

/** `5:42` from seconds per kilometre. */
export function formatPace(secondsPerKm: number | null): string {
  if (secondsPerKm === null || secondsPerKm <= 0) return '--:--';
  let minutes = Math.floor(secondsPerKm / 60);
  let seconds = Math.round(secondsPerKm % 60);
  // 59.6 rounds to 60, which would render as 5:60.
  if (seconds === 60) {
    seconds = 0;
    minutes += 1;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** `1:23:45`, or `23:45` under an hour. */
export function formatDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return '0:00';
  let hours = Math.floor(totalSeconds / 3600);
  let minutes = Math.floor((totalSeconds % 3600) / 60);
  let seconds = Math.round(totalSeconds % 60);
  if (seconds === 60) {
    seconds = 0;
    minutes += 1;
  }
  if (minutes === 60) {
    minutes = 0;
    hours += 1;
  }
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${minutes}:${ss}`;
}

/** `Sat 12 Sep`. */
export function formatShortDate(iso: string): string {
  return parseIsoDate(iso).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}
