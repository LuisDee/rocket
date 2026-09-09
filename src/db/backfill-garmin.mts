/**
 * Backfill `activities` from a Garmin GDPR bulk export.
 *
 *   npm run db:backfill -- ~/garmin-export/2026-09-08/raw/DI_CONNECT/\
 *     DI-Connect-Fitness/<email>_1_summarizedActivities.json
 *
 * ## Why this exists rather than a wider API sync
 *
 * Garmin's API serves a rolling window of about six weeks. One CTL time
 * constant is also six weeks, so a chronic figure computed from the API alone
 * is never measured -- it is seeded, and `LOAD.seed` is that seed. The bulk
 * export is the only source carrying the whole history, and its download link
 * expires 72 hours after the request, which is why the entire upstream record
 * goes into `raw` rather than only the fields typed today.
 *
 * ## Append-only, and what that costs here
 *
 * `activities` is append-only: `app_rw` has no UPDATE or DELETE grant and a
 * trigger refuses both regardless (REDLINES.md rule 2, `docs/ci-gates.md`). So
 * this inserts with ON CONFLICT DO NOTHING and never updates. Re-running is
 * therefore safe and idempotent, but it also means a row already written from
 * the live bridge WINS over the export's version of the same activity. That is
 * the correct precedence -- the bridge's row may carry an RPE, a shoe or a
 * surface that Luis typed in, and none of that exists in the export.
 *
 * The conflict target is `garmin_activity_id`, not the primary key: the bridge
 * writes `icu:<id>` for the same run that this writes as `garmin:<id>`, so
 * keying on the primary key alone would insert the run twice under two ids and
 * double its load for that day.
 */

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { Pool, type PoolClient } from 'pg';

import {
  parseExport,
  toActivityRows,
  type BackfillRow,
} from '../lib/garmin-export.ts';

export type Queryable = Pick<PoolClient, 'query'>;

export type BackfillCounts = {
  /** Activities in the file that could be placed on a calendar day. */
  readonly parsed: number;
  /** Rows this run actually wrote. */
  readonly inserted: number;
  /** Rows already present, left untouched. */
  readonly skipped: number;
  readonly earliest: string | null;
  readonly latest: string | null;
};

const COLUMNS = [
  'id',
  'source',
  'garmin_activity_id',
  'name',
  'activity_type',
  'start_time_local',
  'start_time_gmt',
  'time_zone_id',
  'local_date',
  'distance_m',
  'duration_s',
  'elapsed_duration_s',
  'moving_duration_s',
  'average_speed',
  'max_speed',
  'average_hr',
  'max_hr',
  'elevation_gain_m',
  'elevation_loss_m',
  'min_elevation_m',
  'max_elevation_m',
  'is_elevation_corrected',
  'steps',
  'average_running_cadence',
  'max_running_cadence',
  'avg_ground_contact_time_ms',
  'avg_vertical_oscillation_cm',
  'avg_stride_length_cm',
  'avg_vertical_ratio',
  'avg_power_w',
  'max_power_w',
  'norm_power_w',
  'activity_training_load',
  'aerobic_training_effect',
  'anaerobic_training_effect',
  'training_effect_label',
  'calories',
  'lap_count',
  'device_id',
  'manufacturer',
  'raw',
] as const;

/**
 * `YYYY-MM-DD HH:MM:SS` from a Date whose UTC fields ARE the local wall clock.
 *
 * The export gives `startTimeLocal` as epoch milliseconds already shifted to
 * local time, so the Date's UTC accessors read back the wall clock directly.
 * Using the local accessors here would apply the shift a second time.
 */
function naiveTimestamp(at: Date | null): string | null {
  if (at === null) return null;
  return at.toISOString().slice(0, 19).replace('T', ' ');
}

function values(row: BackfillRow): unknown[] {
  return [
    row.id,
    row.source,
    row.garminActivityId,
    row.name,
    row.activityType,
    // Formatted as a naive wall-clock STRING, never handed over as a Date.
    // `start_time_local` is `timestamp without time zone`, and node-postgres
    // renders a Date into it using the process timezone -- so a run that began
    // 07:44 local was stored as 08:44 during BST. Postgres parses this string
    // literally, with no conversion. (The 54 rows written on 2026-09-08 carry
    // that hour; see docs/decisions.md. `local_date` was never affected, which
    // is why no rollup was wrong.)
    naiveTimestamp(row.startTimeLocal),
    row.startTimeGmt,
    row.timeZoneId,
    row.localDate,
    row.distanceM,
    row.durationS,
    row.elapsedDurationS,
    row.movingDurationS,
    row.averageSpeed,
    row.maxSpeed,
    row.averageHr,
    row.maxHr,
    row.elevationGainM,
    row.elevationLossM,
    row.minElevationM,
    row.maxElevationM,
    row.isElevationCorrected,
    row.steps,
    row.averageRunningCadence,
    row.maxRunningCadence,
    row.avgGroundContactTimeMs,
    row.avgVerticalOscillationCm,
    row.avgStrideLengthCm,
    row.avgVerticalRatio,
    row.avgPowerW,
    row.maxPowerW,
    row.normPowerW,
    row.activityTrainingLoad,
    row.aerobicTrainingEffect,
    row.anaerobicTrainingEffect,
    row.trainingEffectLabel,
    row.calories,
    row.lapCount,
    row.deviceId,
    row.manufacturer,
    JSON.stringify(row.raw),
  ];
}

/**
 * Start instants already in the table, as `YYYY-MM-DDTHH:MM:SS`.
 *
 * The dedupe key, and it has to be this rather than the id or the Garmin id.
 * Rows already written by the intervals.icu bridge carry `icu:<id>` with
 * `garmin_activity_id` NULL, so a conflict clause on either would not fire and
 * the export would insert the same run a second time. Two runs cannot start in
 * the same second, which makes the local start a natural key across sources --
 * verified on the live table, where the bridge's `2026-09-05 20:54:45` matches
 * the export's `startTimeLocal` for that activity exactly.
 */
async function existingStarts(db: Queryable): Promise<Set<string>> {
  const result = await db.query(
    `select to_char(start_time_local, 'YYYY-MM-DD"T"HH24:MI:SS') as start
       from activities where start_time_local is not null`,
  );
  return new Set(
    (result.rows as { start: string | null }[])
      .map((r) => r.start)
      .filter((s): s is string => s !== null),
  );
}

/** The same instant, formatted to match `existingStarts`. */
function startKey(row: BackfillRow): string | null {
  const at = row.startTimeLocal;
  if (at === null) return null;
  return at.toISOString().slice(0, 19);
}

/**
 * Write the rows. Takes a client so the integration suite can drive it inside a
 * transaction it rolls back, the same arrangement `seedBlock` uses.
 *
 * Two layers of dedupe, because they catch different things: the pre-filter
 * catches the same run arriving from a DIFFERENT source, and the ON CONFLICT
 * catches this script being run twice.
 */
export async function backfillActivities(
  db: Queryable,
  rows: readonly BackfillRow[],
): Promise<BackfillCounts> {
  const already = await existingStarts(db);
  const fresh = rows.filter((row) => {
    const key = startKey(row);
    return key === null || !already.has(key);
  });

  const placeholders = COLUMNS.map((_, i) => `$${String(i + 1)}`).join(', ');
  const sql =
    `insert into activities (${COLUMNS.join(', ')}) values (${placeholders}) ` +
    `on conflict (garmin_activity_id) do nothing returning id`;

  let inserted = 0;
  for (const row of fresh) {
    const result = await db.query(sql, values(row));
    inserted += result.rowCount ?? 0;
  }

  const dates = rows.map((r) => r.localDate).sort();
  return {
    parsed: rows.length,
    inserted,
    skipped: rows.length - inserted,
    earliest: dates[0] ?? null,
    latest: dates[dates.length - 1] ?? null,
  };
}

/** Read and map an export file, without touching a database. */
export function rowsFromFile(path: string): BackfillRow[] {
  return toActivityRows(parseExport(JSON.parse(readFileSync(path, 'utf8'))));
}

async function main(): Promise<void> {
  const path = process.argv[2];
  if (!path) {
    throw new Error(
      'Usage: npm run db:backfill -- <summarizedActivities.json>\n' +
        'The file is inside the GDPR export under ' +
        'DI_CONNECT/DI-Connect-Fitness/.',
    );
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. This is ordinary DML, so it wants the pooled ' +
        'URL; only migrations need DATABASE_URL_UNPOOLED.',
    );
  }

  const rows = rowsFromFile(path);
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    const counts = await backfillActivities(pool, rows);
    process.stdout.write(
      `backfilled ${String(counts.inserted)} of ${String(counts.parsed)} ` +
        `activities (${String(counts.skipped)} already present), ` +
        `${counts.earliest ?? '-'} to ${counts.latest ?? '-'}\n`,
    );
  } finally {
    await pool.end();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
