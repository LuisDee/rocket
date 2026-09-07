/**
 * Reading the crop-and-ship queue.
 *
 * Thin on purpose: the pages want two queries and one update, and a repository
 * abstraction over three statements is an interface with one implementation.
 *
 * Every function takes the db handle rather than reaching for a module-level
 * one, so a test can hand in whatever it likes without a live Postgres.
 */

import { desc, eq, inArray } from 'drizzle-orm';

import { getDb } from '../db/client';
import { ingestedActivities } from '../db/ingest-schema';

export type IngestRow = typeof ingestedActivities.$inferSelect;

type Db = ReturnType<typeof getDb>;

/** Everything still awaiting a decision, newest first. */
export async function listPending(db: Db = getDb()): Promise<IngestRow[]> {
  return db
    .select()
    .from(ingestedActivities)
    .where(
      inArray(ingestedActivities.status, ['pending', 'reviewed', 'failed']),
    )
    .orderBy(desc(ingestedActivities.startedAt));
}

export async function getActivity(
  garminActivityId: string,
  db: Db = getDb(),
): Promise<IngestRow | undefined> {
  const rows = await db
    .select()
    .from(ingestedActivities)
    .where(eq(ingestedActivities.garminActivityId, garminActivityId))
    .limit(1);
  return rows[0];
}

/**
 * Record that Luis has uploaded this one to Strava by hand.
 *
 * The Strava id is optional and typed loosely because he has to read it off a
 * URL -- requiring it would make the common case (tapped upload, cannot be
 * bothered to copy the id) impossible to record at all.
 */
export async function markShipped(
  garminActivityId: string,
  stravaActivityId: number | null,
  db: Db = getDb(),
): Promise<void> {
  await db
    .update(ingestedActivities)
    .set({
      status: 'shipped',
      stravaActivityId,
      updatedAt: new Date(),
    })
    .where(eq(ingestedActivities.garminActivityId, garminActivityId));
}
