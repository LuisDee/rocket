/**
 * The crop-and-ship queue.
 *
 * One row per Garmin activity the ingest pipeline has pulled, cropped and
 * inspected. The row sits at `pending` until Luis looks at it and taps ship.
 *
 * NOT append-only, unlike `activities` and `check_ins` — this is a work queue
 * whose whole purpose is to change state, and the artefact it protects (the
 * original FIT) is held immutably in `original_fit` alongside whatever the
 * cropper produced. Losing a row here costs a re-pull from Garmin, not a
 * memory.
 *
 * `original_fit` is kept even after upload. It is a few hundred kilobytes and
 * it is the only way to answer "what did the watch actually record" once a
 * cropped file is the one on Strava.
 */

import {
  bigint,
  customType,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

/**
 * drizzle's `bytea` is not in pg-core. This is the documented custom-type
 * escape hatch; `Buffer` is what `pg` hands back for a bytea column anyway.
 */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

/**
 * `pending`   cropped and inspected, waiting on a human
 * `reviewed`  Luis has looked and is happy; the file is his to upload
 * `shipped`   he uploaded it to Strava by hand; `strava_activity_id` if he
 *             bothered to copy it back, null if he did not
 * `failed`    the crop or the inspection failed, `error` says why
 *
 * The original contract had `approved` / `uploading` / `uploaded`, which
 * assumed rocket would upload. It may not -- see docs/decisions.md, "Strava
 * uploads are prohibited; the pipeline ends at the preview" (2026-09-07) -- so
 * the two states describing an upload in flight have no producer and are gone.
 * The column set is unchanged, so this narrows a vocabulary rather than
 * breaking a schema. `strava_activity_id` stays: which Strava activity a file
 * became is a fact worth recording however it got there.
 */
export const INGEST_STATUSES = [
  'pending',
  'reviewed',
  'shipped',
  'failed',
] as const;

export type IngestStatus = (typeof INGEST_STATUSES)[number];

export const ingestedActivities = pgTable(
  'ingested_activities',
  {
    garminActivityId: text('garmin_activity_id').primaryKey(),
    status: text('status').notNull().default('pending'),
    activityName: text('activity_name'),
    startedAt: timestamp('started_at', { withTimezone: true }),

    originalFit: bytea('original_fit'),
    croppedFit: bytea('cropped_fit'),
    croppedFilename: text('cropped_filename'),

    /** See `CropSummary` in src/lib/crop.ts for the shape. */
    cropSummary: jsonb('crop_summary'),
    /** The forensic report as produced. No verdict field, by design. */
    forensicReport: jsonb('forensic_report'),

    stravaActivityId: bigint('strava_activity_id', { mode: 'number' }),
    error: text('error'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('ingested_activities_status_idx').on(t.status)],
);
