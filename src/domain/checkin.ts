/**
 * The daily check-in, written once and used twice: `rocket_daily_checkin` and
 * the `/checkin` page call this same function. A second write path is a second
 * set of defaults, and the two drift the first time one of them is edited.
 *
 * The zod fields are exported as a PLAIN OBJECT because that is what
 * `server.registerTool`'s `inputSchema` takes on the SDK v1 line -- wrapping
 * them in `z.object()` there is the classic porting mistake. The page wraps
 * them itself, so both surfaces validate against the same declarations.
 */

import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { READINESS } from '../../config/training';
import { scoreReadiness, type Readiness } from './readiness';
import type { Store } from './store';
import type { CheckIn } from './types';

/**
 * Where a runner reports soreness. Seven, not twenty: the form has to be
 * finishable in thirty seconds on a phone, and an unused location is a row of
 * buttons between Luis and the one he needs.
 */
export const SORENESS_LOCATIONS = [
  'calf',
  'achilles',
  'knee',
  'hamstring',
  'quad',
  'hip',
  'foot',
] as const;

export type SorenessLocation = (typeof SORENESS_LOCATIONS)[number];

const scales = READINESS.inputScales;

export const sorenessEntry = z.object({
  location: z.enum(SORENESS_LOCATIONS),
  severity: z
    .number()
    .min(scales.soreness.min)
    .max(scales.soreness.max)
    .describe(
      `0 means none. ${scales.soreness.max} is the worst it gets. ` +
        `${READINESS.sorenessBlocksQuality} or above gates all quality work.`,
    ),
});

/** The check-in's fields as raw zod validators -- see the module note. */
export const checkInFields = {
  rpe_yesterday: z
    .number()
    .min(scales.rpeYesterday.min)
    .max(scales.rpeYesterday.max)
    .optional()
    .describe(
      `How hard yesterday's session felt, ${scales.rpeYesterday.min}-${scales.rpeYesterday.max}. ` +
        `Ask for it; do not infer it from the activity.`,
    ),
  soreness: z
    .array(sorenessEntry)
    .optional()
    .describe(
      'Only the places that actually hurt. Omit the array entirely when nothing does; ' +
        'an empty array and a missing one are read the same way.',
    ),
  sleep: z
    .number()
    .min(scales.sleep.min)
    .max(24)
    .optional()
    .describe(
      `Hours slept last night. ${scales.sleep.max} scores full marks; this is not a target.`,
    ),
  motivation: z
    .number()
    .min(scales.motivation.min)
    .max(scales.motivation.max)
    .optional()
    .describe(
      `Appetite for training today, ${scales.motivation.min}-${scales.motivation.max}.`,
    ),
  note: z
    .string()
    .max(1000)
    .optional()
    .describe('Anything else about this morning. One sentence is plenty.'),
};

export const checkInSchema = z.object(checkInFields);
export type CheckInInput = z.infer<typeof checkInSchema>;

/**
 * A submitted `/checkin` form as check-in input.
 *
 * Pulled out of the server action so it can be tested without a database and
 * without writing a row into an append-only table to find out whether a blank
 * field parsed. The action is glue; this is the part with a bug surface.
 *
 * A blank field and a soreness row left on zero are both OMITTED rather than
 * stored as values. The score renormalises over the terms actually present, so
 * an omitted term is neutral while a stored zero is the worst possible reading
 * -- posting the form untouched must not record a red morning.
 */
export function checkInFromForm(form: {
  get(name: string): FormDataEntryValue | null;
}): CheckInInput {
  const number = (name: string): number | undefined => {
    const raw = form.get(name);
    if (typeof raw !== 'string' || raw.trim() === '') return undefined;
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
  };

  const soreness = SORENESS_LOCATIONS.flatMap((location) => {
    const severity = number(`soreness.${location}`);
    return severity === undefined || severity === 0
      ? []
      : [{ location, severity }];
  });

  const note = form.get('note');
  const rpe = number('rpe_yesterday');
  const sleep = number('sleep');
  const motivation = number('motivation');

  return checkInSchema.parse({
    ...(rpe === undefined ? {} : { rpe_yesterday: rpe }),
    ...(sleep === undefined ? {} : { sleep }),
    ...(motivation === undefined ? {} : { motivation }),
    ...(soreness.length === 0 ? {} : { soreness }),
    ...(typeof note === 'string' && note.trim() !== ''
      ? { note: note.trim() }
      : {}),
  });
}

/**
 * A submitted form as check-in input.
 *
 * Lives here rather than in the page because it IS the page's only logic, and
 * a field-name typo would silently drop a reading with nothing to notice it --
 * the form would still submit, the row would still be written, and the missing
 * term would just renormalise away. Parsing it in the domain makes it testable
 * without a browser.
 *
 * An empty field means "not answered", not zero. Soreness is the exception in
 * reverse: every location starts at 0, and the zeroes are dropped rather than
 * stored, so a morning with one sore calf records one entry instead of seven.
 */
export function parseCheckInForm(form: FormData): CheckInInput {
  const soreness = SORENESS_LOCATIONS.map((location) => ({
    location,
    severity: number(form, `soreness-${location}`) ?? 0,
  })).filter((entry) => entry.severity > 0);

  const rpe = number(form, 'rpe_yesterday');
  const sleep = number(form, 'sleep');
  const motivation = number(form, 'motivation');
  const note = form.get('note');

  return checkInSchema.parse({
    ...(rpe === undefined ? {} : { rpe_yesterday: rpe }),
    ...(sleep === undefined ? {} : { sleep }),
    ...(motivation === undefined ? {} : { motivation }),
    ...(soreness.length === 0 ? {} : { soreness }),
    ...(typeof note === 'string' && note.trim() !== ''
      ? { note: note.trim() }
      : {}),
  });
}

/** A number the form sent, or undefined when the field was left alone. */
function number(form: FormData, field: string): number | undefined {
  const raw = form.get(field);
  if (typeof raw !== 'string' || raw.trim() === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * Persist a check-in and score it.
 *
 * `today` and `historyDays` are passed in rather than read here so the caller
 * owns the clock -- the boundary a readiness test needs in order to pin the
 * CTL warm-up disclosure at all.
 */
export async function recordCheckIn(
  store: Store,
  input: CheckInInput,
  today: string,
): Promise<{ checkIn: CheckIn; readiness: Readiness }> {
  const checkIn: CheckIn = {
    id: randomUUID(),
    localDate: today,
    rpeYesterday: input.rpe_yesterday ?? null,
    soreness: input.soreness ?? null,
    sleep: input.sleep ?? null,
    motivation: input.motivation ?? null,
    note: input.note ?? null,
  };

  await store.insertCheckIn(checkIn);

  const historyDays = await store.activityHistoryDays(today);
  return {
    checkIn,
    readiness: scoreReadiness(
      {
        rpeYesterday: checkIn.rpeYesterday,
        soreness: checkIn.soreness,
        sleep: checkIn.sleep,
        motivation: checkIn.motivation,
      },
      historyDays,
    ),
  };
}
