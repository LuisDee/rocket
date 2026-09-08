/**
 * Reading the crop-and-ship queue.
 *
 * Thin on purpose: the pages want two queries and one update, and a repository
 * abstraction over three statements is an interface with one implementation.
 *
 * Every function takes the db handle rather than reaching for a module-level
 * one, so a test can hand in whatever it likes without a live Postgres.
 */

import { and, desc, eq, inArray } from 'drizzle-orm';

import { getDb } from '../db/client';
import { ingestedActivities } from '../db/ingest-schema';
import { StravaError, uploadFit } from './strava';

export type IngestRow = typeof ingestedActivities.$inferSelect;

/**
 * Statuses that mean "not on Strava, and not in flight".
 *
 * These are the rows the queue offers a decision on, and the only rows the
 * ship action may claim. `shipping` and `shipped` are absent deliberately:
 * including either would let a second tap re-upload a run that is already
 * uploading or already there.
 */
export const AWAITING_DECISION = ['pending', 'reviewed', 'failed'] as const;

type Db = ReturnType<typeof getDb>;

/** Everything still awaiting a decision, newest first. */
export async function listPending(db: Db = getDb()): Promise<IngestRow[]> {
  return db
    .select()
    .from(ingestedActivities)
    .where(inArray(ingestedActivities.status, AWAITING_DECISION))
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

/**
 * Upload this activity's cropped file to Strava.
 *
 * Guarded server-side rather than by disabling the button: a double tap, a
 * refresh of a POSTed page, or two phones all reach this, and only the row can
 * arbitrate. `shipping` is claimed conditionally, so the second caller finds
 * nothing to claim and returns instead of uploading the same run twice.
 *
 * Failures are written to the row rather than thrown at the page. The approval
 * screen is `force-dynamic` and re-renders after the action, so `error` is on
 * screen at the next paint with no client state involved.
 */
export async function shipToStrava(
  garminActivityId: string,
  deps: { upload?: typeof uploadFit } = {},
  db: Db = getDb(),
): Promise<{ ok: boolean; stravaActivityId?: number; error?: string }> {
  const upload = deps.upload ?? uploadFit;

  // Claim it. Only a row still awaiting a decision can move to `shipping`.
  const claimed = await db
    .update(ingestedActivities)
    .set({ status: 'shipping', error: null, updatedAt: new Date() })
    .where(
      and(
        eq(ingestedActivities.garminActivityId, garminActivityId),
        inArray(ingestedActivities.status, AWAITING_DECISION),
      ),
    )
    .returning();

  const row = claimed[0];
  if (row === undefined) {
    return { ok: false, error: 'Already uploading or already on Strava.' };
  }
  if (!row.croppedFit) {
    await db
      .update(ingestedActivities)
      .set({
        status: 'failed',
        error: 'No cropped file on this row.',
        updatedAt: new Date(),
      })
      .where(eq(ingestedActivities.garminActivityId, garminActivityId));
    return { ok: false, error: 'No cropped file on this row.' };
  }

  try {
    const stravaActivityId = await upload(
      row.croppedFit,
      row.croppedFilename ?? `${garminActivityId}.fit`,
      // Deliberately bare: no description, and an external_id that names only
      // the Garmin activity. Luis ratified uploading despite API Policy 5.3 on
      // 2026-09-07, but ratifying the risk is not the same as advertising it --
      // a description reading "pause-cropped by rocket" tells Strava exactly
      // what the policy prohibits. The id is still unique enough to dedupe on.
      { externalId: garminActivityId },
    );
    await db
      .update(ingestedActivities)
      .set({
        status: 'shipped',
        stravaActivityId,
        error: null,
        updatedAt: new Date(),
      })
      .where(eq(ingestedActivities.garminActivityId, garminActivityId));
    return { ok: true, stravaActivityId };
  } catch (cause) {
    const error =
      cause instanceof StravaError
        ? cause.message
        : `Upload failed: ${String(cause)}`;
    await db
      .update(ingestedActivities)
      .set({ status: 'failed', error, updatedAt: new Date() })
      .where(eq(ingestedActivities.garminActivityId, garminActivityId));
    return { ok: false, error };
  }
}
