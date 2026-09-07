/**
 * The seeder and the export, against the real database.
 *
 * Everything runs inside a transaction that is rolled back, so running this
 * suite against the live database neither seeds it nor disturbs a seed already
 * there.
 */

import { afterAll, describe, expect, test } from 'vitest';
import type { PoolClient } from 'pg';

import { BLOCK_WEEKS, RACES } from '../../config/training';
import { getPool } from './client';
import { exportTables, EXPORTED_TABLES, exportFilename } from './export.mts';
import { raceId, seedBlock } from './seed.mts';

afterAll(async () => {
  await getPool().end();
});

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

async function counts(
  c: PoolClient,
): Promise<{ weeks: number; races: number }> {
  const { rows } = await c.query<{ weeks: string; races: string }>(
    `select (select count(*) from weeks) as weeks,
            (select count(*) from races) as races`,
  );
  return { weeks: Number(rows[0]?.weeks), races: Number(rows[0]?.races) };
}

describe('seeding the block', () => {
  test('seeding twice leaves the same row counts as seeding once', async () => {
    const observed = await inRolledBackTx(async (c) => {
      await seedBlock(c);
      const first = await counts(c);
      await seedBlock(c);
      const second = await counts(c);
      return { first, second };
    });
    const expected = { weeks: BLOCK_WEEKS.length, races: RACES.length };
    expect(observed.first).toEqual(expected);
    expect(observed.second).toEqual(expected);
  });

  test('the dropped Dorney race is seeded, not silently omitted', async () => {
    // It was ratified as dropped and retained on purpose, so the record shows
    // it was considered and released rather than forgotten. A seeder that
    // filtered on role would erase exactly that.
    const row = await inRolledBackTx(async (c) => {
      await seedBlock(c);
      const { rows } = await c.query<{
        name: string;
        role: string;
        droppable: boolean;
        distance: string | null;
      }>(
        `select name, role, droppable, distance from races
           where id = $1`,
        [raceId('2026-10-03', 'Dorney Triathlon')],
      );
      return rows[0];
    });
    expect(row).toEqual({
      name: 'Dorney Triathlon',
      role: 'dropped',
      droppable: true,
      distance: null,
    });
  });

  test('a race the config no longer names is removed, not left behind', async () => {
    // `races` mirrors `config/training.ts`. A stale row would make the table
    // disagree with LIVE_RACE_DATES, which is the list the planner consults.
    const survivors = await inRolledBackTx(async (c) => {
      await c.query(
        `insert into races (id, date, name, role) values ('stale', '2026-09-30', 'Withdrawn 10K', 'sharpener')`,
      );
      await seedBlock(c);
      const { rows } = await c.query<{ id: string }>(
        `select id from races where id = 'stale'`,
      );
      return rows.length;
    });
    expect(survivors).toBe(0);
  });

  test('the per-day layer the table has no columns for survives in extra', async () => {
    // Week 2 is the only week carrying a day-by-day breakdown. Dropping it on
    // the way in would lose the shape of the riskiest week in the block.
    const days = await inRolledBackTx(async (c) => {
      await seedBlock(c);
      const { rows } = await c.query<{
        extra: { days: { date: string; km: number }[] | null };
      }>(`select extra from weeks where week_number = 2`);
      return rows[0]?.extra.days;
    });
    expect(days?.map((d) => d.km)).toEqual([6, 8, 10, 8, 6, 22, 0]);
  });
});

describe('the JSON export', () => {
  test('exports the tables that cannot be regenerated', async () => {
    const dump = await inRolledBackTx(async (c) => {
      await c.query(
        `insert into check_ins (id, local_date, sleep) values ('export-test', '2026-09-07', 7)`,
      );
      return exportTables(c);
    });
    expect(Object.keys(dump.tables)).toEqual([...EXPORTED_TABLES]);
    const checkIns = dump.tables['check_ins'] as { id: string }[];
    expect(checkIns.map((r) => r.id)).toContain('export-test');
  });

  test('omits weeks and races, which are a projection of a file in git', async () => {
    const dump = await inRolledBackTx((c) => exportTables(c));
    expect(Object.keys(dump.tables)).not.toContain('weeks');
    expect(Object.keys(dump.tables)).not.toContain('races');
  });

  test('the filename carries a sortable timestamp', () => {
    // Colons are legal in a path but hostile in a shell and illegal on some
    // filesystems, so the ISO stamp is flattened rather than used raw.
    const name = exportFilename(new Date('2026-09-07T12:34:56.789Z'));
    expect(name).toBe('rocket-2026-09-07T12-34-56-789Z.json');
  });
});
