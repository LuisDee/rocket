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
 * `shipping`  an upload is in flight; Strava has the file and has not yet
 *             said what it became
 * `shipped`   on Strava, `strava_activity_id` recorded
 * `failed`    the crop or the inspection failed, `error` says why
 *
 * This vocabulary narrowed on 2026-09-07 when uploads looked prohibited, then
 * regained `shipping` the same day when Luis read API Policy 5.3 and overrode
 * it knowingly -- see docs/decisions.md. `shipped` therefore covers both a
 * rocket upload and one Luis did by hand, which is why `strava_activity_id` is
 * nullable: he may not bother copying an id back off a URL.
 */
export const INGEST_STATUSES = [
  'pending',
  'reviewed',
  'shipping',
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

/**
 * Third-party OAuth tokens, one row per provider.
 *
 * In Postgres rather than a file or an env var for one reason: Strava rotates
 * the refresh token on every refresh, so the store has to be writable. An env
 * var would be correct exactly once and stale thereafter.
 *
 * It is also what stops the previous loss repeating. The Strava athlete token
 * lived at `tools/strava_probe/out/token.json`, correctly gitignored; the probe
 * directory was deleted on policy grounds on 2026-09-07 and the token went with
 * it, unrecoverable, forcing a re-authorisation.
 *
 * Mutable by design, so it carries an explicit UPDATE grant -- see the
 * migration. Not append-only: a token history is a liability, not an asset.
 */
export const oauthTokens = pgTable('oauth_tokens', {
  /** `strava`, and whatever comes next. */
  provider: text('provider').primaryKey(),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token').notNull(),
  /** Strava gives an absolute unix expiry; stored as a timestamp. */
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  scope: text('scope'),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
