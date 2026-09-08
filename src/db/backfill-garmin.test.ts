/**
 * The dedupe, which is the only logic in the backfill worth testing.
 *
 * It exists because of a real collision found on the live table on 2026-09-08:
 * `activities` already held three rows written by the intervals.icu bridge as
 * `icu:<id>` with `garmin_activity_id` NULL. A conflict clause keyed on either
 * column would not have fired, and the export would have inserted 2026-09-05's
 * hike and treadmill run a second time -- doubling that day's training load
 * four days before a race, in the direction that makes an athlete look more
 * fatigued than he is.
 */

import { describe, expect, test } from 'vitest';

import { backfillActivities, type Queryable } from './backfill-garmin.mts';
import { toActivityRows, type ExportActivity } from '../lib/garmin-export';

/** 2026-09-05 20:54:45 local -- the run the bridge had already written. */
const TREADMILL: ExportActivity = {
  activityId: 24251846565,
  name: 'Treadmill Running',
  activityType: 'treadmill_running',
  startTimeLocal: 1788641685000,
  distance: 1000000.0,
  duration: 2953511.962890625,
  activityTrainingLoad: 128.48760986328125,
};

/** 2026-08-22 07:44 local -- not in the table, so it must be written. */
const EARLIER: ExportActivity = {
  activityId: 24068977377,
  name: 'Barnet Running',
  activityType: 'running',
  startTimeLocal: 1787384640000,
  distance: 1600000.0,
  duration: 5020000.0,
  activityTrainingLoad: 226.0,
};

/**
 * A client that answers the existing-starts query with whatever it was given
 * and counts inserts. Real enough for the branch under test and no more.
 */
function fakeDb(existing: string[]): { inserted: string[]; db: Queryable } {
  const inserted: string[] = [];
  const query = (sql: string, params?: unknown[]) => {
    if (sql.includes('select to_char')) {
      return Promise.resolve({
        rows: existing.map((start) => ({ start })),
        rowCount: existing.length,
      });
    }
    // params[2] is garmin_activity_id, third in COLUMNS.
    inserted.push(String(params?.[2]));
    return Promise.resolve({ rows: [{ id: 'x' }], rowCount: 1 });
  };
  // One cast, here rather than at four call sites. `pg`'s `query` carries a
  // dozen overloads for callbacks, cursors and typed row shapes; a plain
  // function cannot satisfy it structurally, and widening `Queryable` to
  // accommodate a test would weaken the production signature. The two fields
  // the code under test reads -- `rows` and `rowCount` -- are real above.
  return { inserted, db: { query } as unknown as Queryable };
}

describe('dedupe against rows another source already wrote', () => {
  test('a run the bridge already stored is not inserted a second time', async () => {
    const fake = fakeDb(['2026-09-05T20:54:45']);
    const counts = await backfillActivities(
      fake.db,
      toActivityRows([TREADMILL, EARLIER]),
    );

    expect(fake.inserted).toEqual(['24068977377']);
    expect(counts.inserted).toBe(1);
    expect(counts.skipped).toBe(1);
    expect(counts.parsed).toBe(2);
  });

  test('matching is to the second, so a different start on the same day inserts', async () => {
    // The hike and the treadmill run are both 2026-09-05. A date-level dedupe
    // would drop the second one, losing a real activity.
    const fake = fakeDb(['2026-09-05T08:50:12']);
    const counts = await backfillActivities(
      fake.db,
      toActivityRows([TREADMILL]),
    );

    expect(fake.inserted).toEqual(['24251846565']);
    expect(counts.inserted).toBe(1);
  });

  test('an empty table takes everything', async () => {
    const fake = fakeDb([]);
    const counts = await backfillActivities(
      fake.db,
      toActivityRows([TREADMILL, EARLIER]),
    );

    expect(fake.inserted).toHaveLength(2);
    expect(counts.skipped).toBe(0);
    expect(counts.earliest).toBe('2026-08-22');
    expect(counts.latest).toBe('2026-09-05');
  });

  test('re-running over a fully-populated table writes nothing', async () => {
    const fake = fakeDb(['2026-09-05T20:54:45', '2026-08-22T07:44:00']);
    const counts = await backfillActivities(
      fake.db,
      toActivityRows([TREADMILL, EARLIER]),
    );

    expect(fake.inserted).toEqual([]);
    expect(counts.inserted).toBe(0);
    expect(counts.skipped).toBe(2);
  });
});
