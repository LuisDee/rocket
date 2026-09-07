/**
 * Dump the tables that cannot be regenerated to a timestamped JSON file.
 *
 * This IS the backup. Neon's free tier gives a fixed six-hour restore window,
 * which is shorter than the gap between noticing a mistake and being at a
 * keyboard, so point-in-time restore cannot be relied on for the one artefact
 * REDLINES.md rule 2 says is irreplaceable.
 *
 * WHAT IS EXPORTED, and why these four:
 *   check_ins   purely human, exists nowhere else -- what he felt that morning
 *   notes       purely human, and Claude's own memory cannot be read back
 *   activities  machine-ingested, but rpe, notes, shoe_id and surface are hand
 *               annotations no upstream holds
 *   sessions    the plan as it was actually flown, including status edits
 *
 * WHAT IS NOT, and why: `weeks` and `races` are a projection of
 * `config/training.ts`, which is in git. Backing them up is backing up git.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { Pool, type PoolClient } from 'pg';

type Queryable = Pick<PoolClient, 'query'>;

/** Ordered so a restore reads in the order a human would want it. */
export const EXPORTED_TABLES = [
  'check_ins',
  'notes',
  'activities',
  'sessions',
] as const;

export interface Export {
  exportedAt: string;
  tables: Record<string, unknown[]>;
}

export async function exportTables(db: Queryable): Promise<Export> {
  const tables: Record<string, unknown[]> = {};
  for (const table of EXPORTED_TABLES) {
    // Table names come from the frozen list above, never from input, so the
    // identifier interpolation has no untrusted path into it.
    const result = await db.query(`select * from ${table}`);
    tables[table] = result.rows;
  }
  return { exportedAt: new Date().toISOString(), tables };
}

/** `backups/rocket-2026-09-07T12-34-56-789Z.json` -- sorts chronologically. */
export function exportFilename(at: Date): string {
  return `rocket-${at.toISOString().replace(/[:.]/g, '-')}.json`;
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. The export reads the pooled URL.',
    );
  }
  const dir = process.env.ROCKET_BACKUP_DIR ?? 'backups';
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    const dump = await exportTables(pool);
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, exportFilename(new Date(dump.exportedAt)));
    await writeFile(file, `${JSON.stringify(dump, null, 2)}\n`, 'utf8');
    const counts = EXPORTED_TABLES.map(
      (t) => `${t}=${dump.tables[t]?.length ?? 0}`,
    ).join(' ');
    process.stdout.write(`wrote ${file} (${counts})\n`);
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
