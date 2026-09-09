import 'server-only';

import { desc, gte, lte, and, sql } from 'drizzle-orm';

import { getDb } from '../db/client';
import { ingestedActivities } from '../db/ingest-schema';
import { activities } from '../db/schema';
import type { Run } from './actuals';
import { toIsoDate } from './block';

type Db = ReturnType<typeof getDb>;

/**
 * Completed runs over an inclusive span.
 *
 * Reads `activities`, the training log and the source of truth. It holds 57 rows
 * as of 2026-09-08: 54 backfilled from the Garmin GDPR export (2026-03-28
 * onward, see `src/db/backfill-garmin.mts`) and 3 written by the intervals.icu
 * daily pass.
 *
 * The ingest queue is still supplemented in, because the crop pipeline can see a
 * run before either sync does -- it pulls straight from Garmin within minutes.
 * Rows are keyed by date so a run in both is counted once, and `activities`
 * wins.
 *
 * ponytail: two sources, and it should be one. The proper fix is the ingest
 * writing an `activities` row as well as its queue row; this bridge should be
 * deleted the day that lands.
 */
export async function completedRuns(
  from: string,
  to: string,
  db: Db = getDb(),
): Promise<Run[]> {
  const logged = await db
    .select({
      date: activities.localDate,
      distanceM: activities.distanceM,
    })
    .from(activities)
    .where(and(gte(activities.localDate, from), lte(activities.localDate, to)));

  const byDate = new Map<string, number>();
  for (const row of logged) {
    byDate.set(
      row.date,
      (byDate.get(row.date) ?? 0) + (row.distanceM ?? 0) / 1000,
    );
  }

  const queued = await db
    .select({
      startedAt: ingestedActivities.startedAt,
      cropSummary: ingestedActivities.cropSummary,
    })
    .from(ingestedActivities);

  for (const row of queued) {
    const date = isoDate(row.startedAt);
    if (date === null || date < from || date > to) continue;
    if (byDate.has(date)) continue; // the training log wins
    const km = distanceFromCropSummary(row.cropSummary);
    if (km !== null) byDate.set(date, km);
  }

  return [...byDate.entries()]
    .map(([date, km]) => ({ date, km: Math.round(km * 100) / 100 }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export type RecentRun = {
  date: string;
  name: string;
  km: number;
  seconds: number | null;
};

/**
 * The newest runs for the "recent" list, newest first.
 *
 * Reads the training log FIRST and the crop queue second. It used to read only
 * the queue, which meant the screen showed the five runs the Mac poller happened
 * to have cropped and nothing else -- so after 54 activities were backfilled on
 * 2026-09-08 the list still showed five, and the athlete reasonably asked why his
 * runs were missing.
 *
 * The queue is still unioned in, because it sees a run within minutes of the
 * watch syncing while the daily pass runs once a day. A run in both appears once:
 * matched on the start instant, which is the same key the backfill dedupes on and
 * is reliable across sources because two runs cannot begin in the same second.
 */
export async function recentRuns(
  limit: number,
  db: Db = getDb(),
): Promise<RecentRun[]> {
  const logged = await db
    .select({
      localDate: activities.localDate,
      name: activities.name,
      distanceM: activities.distanceM,
      durationS: activities.durationS,
      movingDurationS: activities.movingDurationS,
    })
    .from(activities)
    .orderBy(desc(activities.startTimeLocal))
    .limit(limit);

  // Matched on DATE AND DISTANCE, not on a timestamp.
  //
  // The three timestamp columns involved follow three different conventions and
  // no two agree. For a run that began 07:44 local on 2026-08-22:
  // `activities.start_time_local` holds 08:44 (a `timestamp` the driver rendered
  // in BST when the backfill wrote it), `activities.start_time_gmt` holds the
  // correct 06:44 UTC, and `ingested_activities.started_at` holds 07:44 tagged
  // `+00` -- local wall clock mislabelled as UTC. Any timestamp comparison
  // matches on at most one pair, and the screen showed every recent run twice.
  //
  // Date and distance are the two things all three agree on. 150 m of slack
  // absorbs the crop pipeline trimming a few metres; it is far below the gap
  // between any two runs an athlete does on one day.
  const seen = logged.flatMap((r) =>
    r.distanceM === null ? [] : [{ date: r.localDate, km: r.distanceM / 1000 }],
  );
  const alreadyLogged = (date: string, km: number): boolean =>
    seen.some((s) => s.date === date && Math.abs(s.km - km) < 0.15);

  const runs: RecentRun[] = logged.flatMap((row) => {
    if (row.distanceM === null) return [];
    return [
      {
        date: row.localDate,
        name: row.name ?? 'Run',
        km: Math.round((row.distanceM / 1000) * 100) / 100,
        // Moving time is what a pace should be read against; total duration
        // includes standing still, and two of these runs carry 17 minutes of it.
        seconds: row.movingDurationS ?? row.durationS,
      },
    ];
  });

  const queued = await db
    .select({
      startedAt: ingestedActivities.startedAt,
      name: ingestedActivities.activityName,
      cropSummary: ingestedActivities.cropSummary,
    })
    .from(ingestedActivities)
    .orderBy(desc(ingestedActivities.startedAt))
    .limit(limit);

  for (const row of queued) {
    const date = isoDate(row.startedAt);
    const km = distanceFromCropSummary(row.cropSummary);
    if (date === null || km === null) continue;
    if (alreadyLogged(date, km)) continue;
    runs.push({
      date,
      name: row.name ?? 'Run',
      km,
      seconds: movingSecondsFromCropSummary(row.cropSummary),
    });
  }

  return runs.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
}

/** How many runs are sitting in the crop queue awaiting a decision. */
export async function pendingCount(db: Db = getDb()): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(ingestedActivities)
    .where(sql`${ingestedActivities.status} = 'pending'`);
  return row?.n ?? 0;
}

function isoDate(value: Date | string | null): string | null {
  if (value === null) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return toIsoDate(d);
}

/**
 * Post-crop distance, which is the distance actually run.
 *
 * A crop removes standing-still time, never distance, so before and after agree
 * on a correct file -- reading the post-crop figure means a bad crop shows up
 * here rather than being averaged away.
 */
function distanceFromCropSummary(summary: unknown): number | null {
  if (typeof summary !== 'object' || summary === null) return null;
  const km = (summary as Record<string, unknown>).distanceKmAfter;
  return typeof km === 'number' && Number.isFinite(km) ? km : null;
}

function movingSecondsFromCropSummary(summary: unknown): number | null {
  if (typeof summary !== 'object' || summary === null) return null;
  const s = (summary as Record<string, unknown>).movingSecondsAfter;
  return typeof s === 'number' && Number.isFinite(s) ? s : null;
}
