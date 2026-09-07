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
 * Reads `activities`, the training log, which is the source of truth and is
 * populated by the intervals.icu daily pass. That sync has not run yet -- Garmin
 * was connected to the bridge on 2026-09-07 and the backfill is outstanding --
 * so the table is currently empty while five real runs sit in
 * `ingested_activities`, pulled straight from Garmin by the crop pipeline.
 *
 * Until the sync lands, the ingest queue is supplemented in so the screen shows
 * runs that demonstrably happened rather than zeroes. Rows are keyed by date so
 * a run present in both is counted once, and `activities` wins.
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

/** The newest runs for the "recent" list, newest first. */
export async function recentRuns(
  limit: number,
  db: Db = getDb(),
): Promise<
  { date: string; name: string; km: number; seconds: number | null }[]
> {
  const rows = await db
    .select({
      startedAt: ingestedActivities.startedAt,
      name: ingestedActivities.activityName,
      cropSummary: ingestedActivities.cropSummary,
    })
    .from(ingestedActivities)
    .orderBy(desc(ingestedActivities.startedAt))
    .limit(limit);

  return rows.flatMap((row) => {
    const date = isoDate(row.startedAt);
    const km = distanceFromCropSummary(row.cropSummary);
    if (date === null || km === null) return [];
    return [
      {
        date,
        name: row.name ?? 'Run',
        km,
        seconds: movingSecondsFromCropSummary(row.cropSummary),
      },
    ];
  });
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
