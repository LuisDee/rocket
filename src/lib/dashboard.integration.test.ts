/**
 * The dashboard's two reads, against the real database.
 *
 * Fixture dates are in 2027 deliberately. The live `activities` table holds the
 * real training history (2026-03-28 to 2026-09-07), so a fixture dated inside
 * that span sums with a real run and the assertion fails for a reason that has
 * nothing to do with the code -- which is exactly what happened on the first
 * attempt at this file. 2027 also sorts to the top of a newest-first list, so
 * `recentRuns` reaches the fixtures without a large limit.
 *
 * This is an integration test and not a unit test on purpose. The bug it exists
 * for lived entirely in the interaction between node-postgres and two columns of
 * different types -- a faked client would have agreed with whatever the code did
 * and caught nothing.
 *
 * The bug, found on 2026-09-09: `recentRuns` showed every recent run TWICE.
 * Three timestamp conventions are in play and no two agree. For a run that began
 * 07:44 local on 2027-08-22:
 *
 *   activities.start_time_local     08:44  (`timestamp`, rendered by the driver
 *                                           in BST when the backfill wrote it)
 *   activities.start_time_gmt       06:44  (`timestamptz`, the correct instant)
 *   ingested_activities.started_at  07:44  (`timestamptz`, but holding local
 *                                           wall clock mislabelled as +00)
 *
 * Any dedupe keyed on a timestamp matches at most one of those pairs. Date plus
 * distance is what all three agree on.
 *
 * Everything runs inside a transaction that is rolled back, so this neither adds
 * rows to `activities` -- which is append-only and could not be cleaned up -- nor
 * disturbs the live training log.
 */

import { afterAll, describe, expect, test, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { PoolClient } from 'pg';

vi.mock('server-only', () => ({}));

import { getPool, schema } from '../db/client';

async function inRolledBackTx<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    return await fn(client);
  } finally {
    await client.query('rollback').catch(() => undefined);
    client.release();
  }
}

afterAll(async () => {
  await getPool().end();
});

/** One run, written into both tables the way each source actually writes it. */
async function writeTheSameRunTwice(c: PoolClient): Promise<void> {
  await c.query(
    `insert into activities
       (id, source, garmin_activity_id, name, activity_type, local_date,
        start_time_local, start_time_gmt, distance_m, duration_s, moving_duration_s)
     values ('test:dupe', 'garmin', 'test-dupe-1', 'Barnet Running', 'running',
             '2027-08-22',
             -- an hour ahead of the true local time, as the backfill stored it
             timestamp '2027-08-22 08:44:08',
             timestamptz '2027-08-22 06:44:08+00',
             16000, 5020, 5018)`,
  );
  await c.query(
    `insert into ingested_activities
       (garmin_activity_id, status, activity_name, started_at, crop_summary)
     values ('test-dupe-1-queue', 'pending', 'Barnet Running',
             -- local wall clock tagged +00, as the crop pipeline stores it
             timestamptz '2027-08-22 07:44:08+00',
             '{"distanceKmAfter": 16.0, "movingSecondsAfter": 5020}'::jsonb)`,
  );
}

describe('recentRuns', () => {
  test('one run written by two sources appears once, not twice', async () => {
    const seen = await inRolledBackTx(async (c) => {
      await writeTheSameRunTwice(c);
      const { recentRuns } = await import('./dashboard');
      const db = drizzle(c, { schema }) as unknown as Parameters<
        typeof recentRuns
      >[1];
      const runs = await recentRuns(20, db);
      return runs.filter((r) => r.date === '2027-08-22' && r.km === 16);
    });

    // The whole bug in one assertion. Before the fix this was length 2, and the
    // screen showed the same 16 km twice under the same name.
    expect(seen).toHaveLength(1);
  });

  test('the training log wins, so the run keeps its logged distance', async () => {
    const run = await inRolledBackTx(async (c) => {
      await writeTheSameRunTwice(c);
      const { recentRuns } = await import('./dashboard');
      const db = drizzle(c, { schema }) as unknown as Parameters<
        typeof recentRuns
      >[1];
      const runs = await recentRuns(20, db);
      return runs.find((r) => r.date === '2027-08-22') ?? null;
    });

    expect(run).not.toBeNull();
    expect(run?.km).toBe(16);
    // Moving time, not total: pace read against total duration is wrong by
    // however long the athlete stood still, which on two logged runs is 17 min.
    expect(run?.seconds).toBe(5018);
  });

  test('a queued run the training log has never seen still appears', async () => {
    // The reason the queue is unioned in at all: the crop pipeline sees a run
    // within minutes of the watch syncing, while the daily pass runs once a day.
    // Dropping the queue entirely would fix the duplicates and lose today's run.
    const seen = await inRolledBackTx(async (c) => {
      await c.query(
        `insert into ingested_activities
           (garmin_activity_id, status, activity_name, started_at, crop_summary)
         values ('test-queue-only', 'pending', 'Fresh Run',
                 timestamptz '2027-08-21 18:00:00+00',
                 '{"distanceKmAfter": 8.4, "movingSecondsAfter": 2400}'::jsonb)`,
      );
      const { recentRuns } = await import('./dashboard');
      const db = drizzle(c, { schema }) as unknown as Parameters<
        typeof recentRuns
      >[1];
      const runs = await recentRuns(50, db);
      return runs.filter((r) => r.name === 'Fresh Run');
    });

    expect(seen).toHaveLength(1);
    expect(seen[0]?.km).toBe(8.4);
  });

  test('two genuinely different runs on one day both appear', async () => {
    // The dedupe matches on date AND distance, so it must not collapse a real
    // two-a-day. The real 2026-08-02 was an 18.35 km morning and an 11.37 km
    // lunchtime; the fixture is dated 2027 for the reason at the top of the file.
    const seen = await inRolledBackTx(async (c) => {
      await c.query(
        `insert into activities
           (id, source, garmin_activity_id, name, activity_type, local_date,
            start_time_local, distance_m, duration_s)
         values
           ('test:am', 'garmin', 'test-am', 'Morning', 'running', '2027-08-02',
            timestamp '2027-08-02 09:17:00', 18350, 5589),
           ('test:pm', 'garmin', 'test-pm', 'Lunchtime', 'running', '2027-08-02',
            timestamp '2027-08-02 11:06:00', 11370, 3552)`,
      );
      const { recentRuns } = await import('./dashboard');
      const db = drizzle(c, { schema }) as unknown as Parameters<
        typeof recentRuns
      >[1];
      const runs = await recentRuns(50, db);
      return runs.filter((r) => r.date === '2027-08-02');
    });

    expect(seen).toHaveLength(2);
    expect(seen.map((r) => r.km).sort((a, b) => a - b)).toEqual([11.37, 18.35]);
  });

  test('a second run that day, still only in the queue, is not swallowed', async () => {
    // The case that makes the distance half of the key load-bearing. The
    // previous test uses two LOGGED runs, which the dedupe never touches -- so
    // it passes even with a date-only match and proves nothing about the key.
    //
    // Here the morning run is logged and the lunchtime run has reached only the
    // crop queue, which is the real 2026-08-02 shape: an 18.35 km morning and an
    // 11.37 km lunchtime. Match on date alone and the lunchtime run vanishes
    // from the screen because the morning one already claimed the day.
    const seen = await inRolledBackTx(async (c) => {
      await c.query(
        `insert into activities
           (id, source, garmin_activity_id, name, activity_type, local_date,
            start_time_local, distance_m, duration_s)
         values ('test:am2', 'garmin', 'test-am2', 'Morning', 'running',
                 '2027-08-02', timestamp '2027-08-02 09:17:00', 18350, 5589)`,
      );
      await c.query(
        `insert into ingested_activities
           (garmin_activity_id, status, activity_name, started_at, crop_summary)
         values ('test-pm2-queue', 'pending', 'Lunchtime',
                 timestamptz '2027-08-02 11:06:00+00',
                 '{"distanceKmAfter": 11.37, "movingSecondsAfter": 3552}'::jsonb)`,
      );
      const { recentRuns } = await import('./dashboard');
      const db = drizzle(c, { schema }) as unknown as Parameters<
        typeof recentRuns
      >[1];
      const runs = await recentRuns(50, db);
      return runs.filter((r) => r.date === '2027-08-02');
    });

    expect(seen.map((r) => r.km).sort((a, b) => a - b)).toEqual([11.37, 18.35]);
  });
});

describe('completedRuns', () => {
  test('reads the training log, not just the crop queue', async () => {
    // The other half of the same complaint: before the backfill this table was
    // empty and the screen showed only whatever the Mac poller had cropped.
    const runs = await inRolledBackTx(async (c) => {
      await c.query(
        `insert into activities
           (id, source, garmin_activity_id, name, activity_type, local_date,
            start_time_local, distance_m, duration_s)
         values ('test:hist', 'garmin', 'test-hist', 'Old Run', 'running',
                 '2027-04-12', timestamp '2027-04-12 10:29:00', 30110, 11876)`,
      );
      const { completedRuns } = await import('./dashboard');
      const db = drizzle(c, { schema }) as unknown as Parameters<
        typeof completedRuns
      >[2];
      return completedRuns('2027-04-01', '2027-04-30', db);
    });

    const april12 = runs.find((r) => r.date === '2027-04-12');
    expect(april12?.km).toBe(30.11);
  });
});
