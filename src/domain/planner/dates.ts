/**
 * Calendar arithmetic for the planner. `YYYY-MM-DD` in, `YYYY-MM-DD` out.
 *
 * UTC arithmetic on purpose, matching `config/training.ts`: these are calendar
 * dates with no time of day, and this block spans the October clock change,
 * where a local-midnight shift is off by an hour and can cross a day.
 *
 * ponytail: `config/training.ts` has its own private copy of `shiftIsoDate`.
 * It stays private -- importing a date utility out of the threshold registry
 * would put a dependency on `config` in every module that needs to add a day,
 * and the registry is meant to be read for numbers, not linked against.
 */

const MS_PER_DAY = 86_400_000;

function toUtc(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
}

/** `YYYY-MM-DD` shifted by whole days. */
export function shiftIso(iso: string, days: number): string {
  const at = toUtc(iso);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

/** ISO weekday: 1 = Monday through 7 = Sunday, matching `AVAILABILITY.runSlots`. */
export function isoWeekday(iso: string): number {
  return toUtc(iso).getUTCDay() || 7;
}

/** The Monday of the week containing `iso`. */
export function mondayOf(iso: string): string {
  return shiftIso(iso, 1 - isoWeekday(iso));
}

/** Monday through Sunday of the week starting at `monday`. */
export function weekDates(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => shiftIso(monday, i));
}

/** Whole days from `from` to `to`. Negative when `to` is earlier. */
export function daysBetweenIso(from: string, to: string): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / MS_PER_DAY);
}

/** `Sat 12 Sep` -- for rationale prose, which a human reads. */
export function humanDate(iso: string): string {
  return toUtc(iso).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}
