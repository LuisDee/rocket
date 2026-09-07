/**
 * The append-only guards, exercised against the real database.
 *
 * Asserted on SQLSTATE, never on message text: the message is prose that a
 * future edit will reword, and a test that matches prose starts passing for the
 * wrong reason the moment somebody fixes a typo.
 *
 * Every case INSERTS A ROW FIRST. A row-level BEFORE UPDATE trigger does not
 * fire on an UPDATE that matches nothing, so the same assertions against an
 * empty table would pass while proving the trigger exists at all -- exactly the
 * vacuous shape this suite is meant to avoid.
 *
 * Everything runs inside a transaction that is rolled back, so the suite can be
 * pointed at the live database without writing to it.
 */

import { afterAll, describe, expect, test } from 'vitest';
import type { PoolClient } from 'pg';

import { getPool } from './client';

const GUARD_TRIGGERS = [
  'activities_append_only',
  'activities_no_truncate',
  'check_ins_append_only',
  'check_ins_no_truncate',
] as const;

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

/**
 * The SQLSTATE a statement raised, or a sentinel. Returning a string rather
 * than using `rejects.toThrow` keeps the assertion unconditional: a statement
 * that unexpectedly SUCCEEDS fails the test rather than skipping past it.
 */
async function sqlstate(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : 'error-without-sqlstate';
  }
  return 'no-error';
}

const ANY_ACTIVITY = `insert into activities (id, source, local_date)
                      values ('guard-test', 'manual', '2026-09-07')`;
const ANY_CHECK_IN = `insert into check_ins (id, local_date)
                      values ('guard-test', '2026-09-07')`;

describe('history is append-only', () => {
  test('UPDATE on activities as the application role is refused with 42501', async () => {
    const code = await inRolledBackTx(async (c) => {
      await c.query('set local role app_rw');
      await c.query(ANY_ACTIVITY);
      return sqlstate(() =>
        c.query(
          `update activities set name = 'edited' where id = 'guard-test'`,
        ),
      );
    });
    expect(code).toBe('42501');
  });

  test('UPDATE on activities as the table owner is refused with 23001', async () => {
    const code = await inRolledBackTx(async (c) => {
      await c.query(ANY_ACTIVITY);
      return sqlstate(() =>
        c.query(
          `update activities set name = 'edited' where id = 'guard-test'`,
        ),
      );
    });
    expect(code).toBe('23001');
  });

  test('DELETE on check_ins as the table owner is refused with 23001', async () => {
    const code = await inRolledBackTx(async (c) => {
      await c.query(ANY_CHECK_IN);
      return sqlstate(() =>
        c.query(`delete from check_ins where id = 'guard-test'`),
      );
    });
    expect(code).toBe('23001');
  });

  test('TRUNCATE on activities is refused with 23001', async () => {
    // The row-level trigger does not fire on TRUNCATE. This asserts the
    // separate statement-level trigger, without which the table can be emptied
    // silently while every other guard still passes.
    const code = await inRolledBackTx((c) =>
      sqlstate(() => c.query('truncate activities')),
    );
    expect(code).toBe('23001');
  });

  test('DELETE on check_ins as the application role is refused with 42501', async () => {
    const code = await inRolledBackTx(async (c) => {
      await c.query(ANY_CHECK_IN);
      await c.query('set local role app_rw');
      return sqlstate(() =>
        c.query(`delete from check_ins where id = 'guard-test'`),
      );
    });
    expect(code).toBe('42501');
  });

  test('every guard trigger is ENABLE ALWAYS, not merely enabled', async () => {
    // A trigger recreated without ALWAYS is a silent downgrade: it still shows
    // up in the catalogue and still refuses an ordinary UPDATE, so only
    // tgenabled tells the two apart.
    const { rows } = await getPool().query<{ tgname: string; state: string }>(
      `select tgname, tgenabled::text as state
         from pg_trigger
        where not tgisinternal
        order by tgname`,
    );
    expect(rows.map((r) => r.tgname)).toEqual([...GUARD_TRIGGERS]);
    expect(rows.map((r) => r.state)).toEqual(GUARD_TRIGGERS.map(() => 'A'));
  });
});

describe('what the guards deliberately do not stop', () => {
  test('INSERT and SELECT on activities as the application role succeed', async () => {
    const seen = await inRolledBackTx(async (c) => {
      await c.query('set local role app_rw');
      await c.query(ANY_ACTIVITY);
      const { rows } = await c.query<{ id: string }>(
        `select id from activities where id = 'guard-test'`,
      );
      return rows.map((r) => r.id);
    });
    expect(seen).toEqual(['guard-test']);
  });

  test('UPDATE on sessions succeeds -- the plan is mutable, history is not', async () => {
    const note = await inRolledBackTx(async (c) => {
      await c.query(
        `insert into sessions (id, date, type) values ('guard-test', '2026-09-07', 'easy')`,
      );
      await c.query('set local role app_rw');
      await c.query(
        `update sessions set note = 'moved' where id = 'guard-test'`,
      );
      const { rows } = await c.query<{ note: string | null }>(
        `select note from sessions where id = 'guard-test'`,
      );
      return rows[0]?.note;
    });
    expect(note).toBe('moved');
  });

  test('a note can be corrected and withdrawn by the application role', async () => {
    // 0001 sets ALTER DEFAULT PRIVILEGES granting only SELECT and INSERT to
    // future tables, so `notes` needed the explicit grant 0002 carries. A note
    // that cannot be corrected or withdrawn is useless.
    const result = await inRolledBackTx(async (c) => {
      await c.query('set local role app_rw');
      await c.query(
        `insert into notes (id, local_date, kind, text, source)
         values ('guard-test', '2026-09-07', 'availability', 'in Leeds Thursday', 'chat')`,
      );
      const updated = await c.query(
        `update notes set text = 'in Leeds Wednesday' where id = 'guard-test'`,
      );
      const deleted = await c.query(
        `delete from notes where id = 'guard-test'`,
      );
      return { updated: updated.rowCount, deleted: deleted.rowCount };
    });
    expect(result).toEqual({ updated: 1, deleted: 1 });
  });
});

describe('the limit of the guard on Neon', () => {
  test('the table owner CAN bypass by disabling the trigger', async () => {
    // Recorded as a live assertion rather than a comment, because it is the
    // honest shape of the protection: the privilege layer binds `app_rw`
    // absolutely -- it cannot grant itself UPDATE -- while the trigger binds
    // the owner only against ACCIDENT. Neon has no true superuser, and
    // `session_replication_role` is refused to the owner (42501), but the owner
    // owns the table and may disable its own trigger.
    //
    // This test exists so that a future Neon change tightening this is news,
    // and so the `tgenabled = 'A'` assertion above is understood as the thing
    // that catches a trigger left disabled after such a bypass.
    const name = await inRolledBackTx(async (c) => {
      await c.query(ANY_ACTIVITY);
      await c.query(
        'alter table activities disable trigger activities_append_only',
      );
      await c.query(
        `update activities set name = 'bypassed' where id = 'guard-test'`,
      );
      const { rows } = await c.query<{ name: string | null }>(
        `select name from activities where id = 'guard-test'`,
      );
      return rows[0]?.name;
    });
    expect(name).toBe('bypassed');
  });
});
