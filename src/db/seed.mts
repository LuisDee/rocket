/**
 * Load the block into Postgres from `config/training.ts`.
 *
 * `weeks` and `races` are a PROJECTION of that file, not an independent copy.
 * The config is the source of truth (REDLINES.md rule 1: every threshold is
 * read from there), so seeding upserts by a deterministic key and deletes rows
 * the config no longer names. Without that delete a race removed from the
 * config would linger in the database, and `LIVE_RACE_DATES` would disagree
 * with the table that is supposed to mirror it.
 *
 * Idempotent by construction: `weeks` keys on its own week number and `races`
 * on a key derived from date and name, so a second run updates in place and
 * the row counts do not move.
 *
 * `sessions` is deliberately NOT seeded. REDLINES.md rule 8 reserves session
 * rows to the deterministic planner, and inventing them here would be the
 * seeder writing the plan.
 */

import { pathToFileURL } from 'node:url';

import { Pool, type PoolClient } from 'pg';

import { BLOCK_WEEKS, RACES } from '../../config/training.ts';

/** A client or a pool -- anything that can run a parameterised query. */
type Queryable = Pick<PoolClient, 'query'>;

/**
 * Stable id for a race: date plus a slug of the name. Derived rather than
 * random so re-seeding updates the row it wrote last time instead of adding a
 * second one beside it.
 */
export function raceId(date: string, name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${date}-${slug}`;
}

export interface SeedCounts {
  weeks: number;
  races: number;
}

/**
 * Write the block. Takes a client so a caller -- the integration suite -- can
 * run it inside a transaction it rolls back.
 */
export async function seedBlock(db: Queryable): Promise<SeedCounts> {
  for (const w of BLOCK_WEEKS) {
    await db.query(
      `insert into weeks
         (week_number, monday, phase, target_km, long_run_km, ramp_exemption, note, extra)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (week_number) do update set
         monday = excluded.monday,
         phase = excluded.phase,
         target_km = excluded.target_km,
         long_run_km = excluded.long_run_km,
         ramp_exemption = excluded.ramp_exemption,
         note = excluded.note,
         extra = excluded.extra`,
      [
        w.week,
        w.monday,
        w.phase,
        w.targetKm,
        w.longRunKm,
        w.rampExemption,
        w.note,
        // The config carries more per-week structure than the table types.
        // `extra` exists so that structure survives the round trip rather than
        // being silently dropped on the way in.
        {
          longRunDate: w.longRunDate,
          longRunOnRace: w.longRunOnRace,
          minRunDays: w.minRunDays,
          days: w.days,
        },
      ],
    );
  }

  for (const r of RACES) {
    await db.query(
      `insert into races (id, date, name, distance, role, droppable, note)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (id) do update set
         date = excluded.date,
         name = excluded.name,
         distance = excluded.distance,
         role = excluded.role,
         droppable = excluded.droppable,
         note = excluded.note`,
      [
        raceId(r.date, r.name),
        r.date,
        r.name,
        // `distance` is text in the schema while the config carries a numeric
        // `distanceKm`. Stored as the number's own string rather than migrating
        // a column nothing reads yet -- see tasks/neon-apply-and-seed.md.
        r.distanceKm === null ? null : String(r.distanceKm),
        r.role,
        r.droppable,
        r.note,
      ],
    );
  }

  // Rows the config no longer names. A race dropped from the config must not
  // survive in the table that mirrors it.
  await db.query(`delete from weeks where week_number <> all($1::int[])`, [
    BLOCK_WEEKS.map((w) => w.week),
  ]);
  await db.query(`delete from races where id <> all($1::text[])`, [
    RACES.map((r) => raceId(r.date, r.name)),
  ]);

  return { weeks: BLOCK_WEEKS.length, races: RACES.length };
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Seeding is ordinary DML, so it uses the ' +
        'pooled URL; only migrations need DATABASE_URL_UNPOOLED.',
    );
  }
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    const counts = await seedBlock(pool);
    process.stdout.write(
      `seeded ${counts.weeks} weeks and ${counts.races} races\n`,
    );
  } finally {
    await pool.end();
  }
}

// Run only as a CLI, never on import -- the integration suite imports this
// module to drive it inside a transaction it rolls back. `import.meta.main`
// would be tidier and exists on this Node, but not in the pinned @types/node.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
