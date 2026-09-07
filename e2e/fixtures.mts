/**
 * Ingest-queue fixtures for the viewport sweep.
 *
 * The sweep renders `/activities` and `/activities/[id]`, which need rows. CI
 * has an empty database, and `db:seed` deliberately does not touch the ingest
 * queue -- that table is fed by the pipeline, not by seed data.
 *
 * Two rows, not one, and specifically one `pending` and one `shipped`: the
 * approval screen renders different controls per status, and the Strava link
 * only exists once a run has shipped. A queue of nothing but pending rows
 * leaves that branch unmeasured, which is how an undersized tap target in it
 * survived until 2026-09-07.
 *
 * REFUSES to run against anything but a local, ephemeral database. `activities`
 * and `check_ins` are append-only by trigger, and while this queue is not,
 * inserting invented runs into the real approval queue would put fake work in
 * front of a human. The host check is the whole safety story here, so it fails
 * closed.
 */

import { Pool } from 'pg';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set.');

const host = new URL(url).hostname;
if (!['localhost', '127.0.0.1', 'postgres', 'db'].includes(host)) {
  throw new Error(
    `Refusing to write fixtures to ${host}. This inserts invented activities ` +
      'into the approval queue and is only ever meant for an ephemeral CI or ' +
      'throwaway local database.',
  );
}

const summary = (distanceKm: number, pauses: number) => ({
  elapsedSecondsBefore: 3600 + pauses * 120,
  elapsedSecondsAfter: 3600,
  movingSecondsBefore: 3600,
  movingSecondsAfter: 3600,
  distanceKmBefore: distanceKm,
  distanceKmAfter: distanceKm,
  pausesRemoved: Array.from({ length: pauses }, (_, i) => ({
    startOffsetS: 600 * (i + 1),
    durationS: 120,
  })),
  cropApplied: pauses > 0,
});

const pool = new Pool({ connectionString: url });

await pool.query(
  `insert into ingested_activities
     (garmin_activity_id, status, activity_name, started_at,
      cropped_filename, crop_summary, strava_activity_id)
   values
     ($1, 'pending', $2, $3, $4, $5, null),
     ($6, 'shipped', $7, $8, $9, $10, $11)
   on conflict (garmin_activity_id) do nothing`,
  [
    'e2e-pending-1',
    'Threshold reps',
    '2026-09-05T06:12:00Z',
    'run-2026-09-05-12.40km.fit',
    JSON.stringify(summary(12.4, 3)),

    'e2e-shipped-1',
    'Sóller long run',
    '2026-09-01T05:48:00Z',
    'soller-long-run-2026-09-01-28.06km.fit',
    JSON.stringify(summary(28.06, 0)),
    12345678901,
  ],
);

await pool.end();
process.stdout.write('ingest fixtures inserted (pending + shipped)\n');
