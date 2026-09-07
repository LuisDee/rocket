/**
 * The five tables M1 needs, plus the two the daily pass added. Availability
 * rules and a TYPED wellness table are deliberately still absent: the first is
 * covered by dated notes, and the second is what Decision gate G1 forbids until
 * the probe has read a real payload (`wellness_raw` holds it whole meanwhile).
 *
 * The split that matters is not by entity, it is by MUTABILITY:
 *
 *   PLAN      weeks, sessions, races      -- changes constantly, that is the point
 *   HISTORY   activities, check_ins       -- APPEND-ONLY, enforced in Postgres
 *
 * REDLINES.md rule 2: training history is the one artefact in this project that
 * cannot be regenerated. You cannot re-run week 3. The guards live in
 * `migrations/0001_append_only_guards.sql`, not in application code, because a
 * convention is not a constraint.
 *
 * Activity columns are drawn from `tools/garmin_probe/CATALOGUE.md` -- real
 * field names observed on Luis's own Fenix 8, not guesses. Everything Garmin
 * returns is kept: the queryable fields are typed columns, and the whole
 * payload also lands in `raw` so a field we did not think to type is not lost
 * and does not need re-ingesting later.
 *
 * What is NOT stored: per-second streams. One activity measured 587,968 bytes
 * against a 0.5 GB free tier, and they are re-fetchable from Garmin, so the
 * table holds a reference instead.
 */

import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/* ------------------------------------------------------------------ plan --- */

/** The macro layer: one row per week of the block. Mirrors `BLOCK_WEEKS`. */
export const weeks = pgTable('weeks', {
  weekNumber: integer('week_number').primaryKey(),
  monday: date('monday').notNull(),
  phase: text('phase').notNull(),
  /** Null in race week, which has no volume target. */
  targetKm: real('target_km'),
  longRunKm: real('long_run_km'),
  /**
   * Non-null exactly when the step into this week exceeds the ramp cap.
   * Carried rather than absorbed: docs/specs/03-planner.md:28 requires a
   * guardrail breach to be named and costed, never silently executed.
   */
  rampExemption: text('ramp_exemption'),
  note: text('note'),
  /** Free-form room for whatever the config grows next, per-day layer included. */
  extra: jsonb('extra'),
});

/** The micro layer: concrete sessions in the rolling window. */
export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    date: date('date').notNull(),
    weekNumber: integer('week_number').references(() => weeks.weekNumber),
    /** easy | steady | quality | long | swim | rest | race */
    type: text('type').notNull(),
    plannedKm: real('planned_km'),
    plannedDurationS: integer('planned_duration_s'),
    intendedIntensity: text('intended_intensity'),
    prescribedShoe: text('prescribed_shoe'),
    surface: text('surface'),
    timeSlot: text('time_slot'),
    /** planned | done | modified | skipped */
    status: text('status').notNull().default('planned'),
    /**
     * The activity that fulfilled this session, when one did. A completed
     * session is never overwritten with what actually happened -- the two are
     * linked so planned-versus-actual variance stays visible.
     */
    fulfilledByActivityId: text('fulfilled_by_activity_id'),
    note: text('note'),
  },
  (t) => [index('sessions_date_idx').on(t.date)],
);

/** Races. Roles are ours, not the source's. */
export const races = pgTable('races', {
  id: text('id').primaryKey(),
  date: date('date').notNull(),
  name: text('name').notNull(),
  distance: text('distance'),
  /** goal | rehearsal | sharpener | easy | absorbed */
  role: text('role').notNull(),
  droppable: boolean('droppable').notNull().default(false),
  note: text('note'),
});

/* --------------------------------------------------------------- history --- */

/**
 * What actually happened. APPEND-ONLY -- see the guard migration.
 *
 * Columns follow `CATALOGUE.md` naming so the mapping from a Garmin payload is
 * mechanical. Running dynamics are included because they are present on every
 * one of Luis's outdoor runs and are the only real biomechanical input the
 * musculoskeletal load component will ever get.
 */
export const activities = pgTable(
  'activities',
  {
    id: text('id').primaryKey(),
    /** garmin | strava | manual */
    source: text('source').notNull(),
    /** Stable upstream id. Null for a manual log. */
    garminActivityId: text('garmin_activity_id'),
    stravaActivityId: text('strava_activity_id'),

    name: text('name'),
    /** Garmin `activityType.typeKey`: running, treadmill_running, hiking, ... */
    activityType: text('activity_type'),
    startTimeLocal: timestamp('start_time_local', { withTimezone: false }),
    startTimeGmt: timestamp('start_time_gmt', { withTimezone: true }),
    timeZoneId: integer('time_zone_id'),
    /** Local calendar day. The unit every daily rollup groups by. */
    localDate: date('local_date').notNull(),

    distanceM: doublePrecision('distance_m'),
    durationS: doublePrecision('duration_s'),
    elapsedDurationS: doublePrecision('elapsed_duration_s'),
    movingDurationS: doublePrecision('moving_duration_s'),

    averageSpeed: doublePrecision('average_speed'),
    maxSpeed: doublePrecision('max_speed'),

    averageHr: real('average_hr'),
    maxHr: real('max_hr'),

    elevationGainM: real('elevation_gain_m'),
    elevationLossM: real('elevation_loss_m'),
    minElevationM: real('min_elevation_m'),
    maxElevationM: real('max_elevation_m'),
    isElevationCorrected: boolean('is_elevation_corrected'),

    steps: integer('steps'),
    averageRunningCadence: real('average_running_cadence'),
    maxRunningCadence: real('max_running_cadence'),

    // Running dynamics -- native on the Fenix 8, present on every outdoor run.
    avgGroundContactTimeMs: real('avg_ground_contact_time_ms'),
    avgVerticalOscillationCm: real('avg_vertical_oscillation_cm'),
    avgStrideLengthCm: real('avg_stride_length_cm'),
    avgVerticalRatio: real('avg_vertical_ratio'),
    avgPowerW: real('avg_power_w'),
    maxPowerW: real('max_power_w'),
    normPowerW: real('norm_power_w'),

    // Garmin's own load model -- an independent cross-check on ours, and free.
    activityTrainingLoad: real('activity_training_load'),
    aerobicTrainingEffect: real('aerobic_training_effect'),
    anaerobicTrainingEffect: real('anaerobic_training_effect'),
    trainingEffectLabel: text('training_effect_label'),

    calories: real('calories'),
    lapCount: integer('lap_count'),
    deviceId: text('device_id'),
    manufacturer: text('manufacturer'),

    // Context tags. Surface, elevation and footwear change training stress for
    // the same distance -- spec invariant 5. Never score on distance alone.
    shoeId: text('shoe_id'),
    surface: text('surface'),
    rpe: real('rpe'),
    notes: text('notes'),

    /**
     * A pointer, not a payload. Per-second streams are ~588 KB each and are
     * re-fetchable; putting them here would spend the free tier on data Garmin
     * already holds.
     */
    streamsRef: text('streams_ref'),

    /** The whole upstream payload, so a field we did not type is not lost. */
    raw: jsonb('raw'),

    ingestedAt: timestamp('ingested_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('activities_local_date_idx').on(t.localDate),
    uniqueIndex('activities_garmin_id_key').on(t.garminActivityId),
  ],
);

/**
 * The daily check-in. APPEND-ONLY, and the most irreplaceable data here: an
 * activity can be re-pulled from Garmin, but what Luis felt on a given morning
 * exists nowhere else.
 */
export const checkIns = pgTable(
  'check_ins',
  {
    id: text('id').primaryKey(),
    localDate: date('local_date').notNull(),
    rpeYesterday: real('rpe_yesterday'),
    /** [{ location, severity }] -- separates "tired" from "wrecked". */
    soreness: jsonb('soreness'),
    sleep: real('sleep'),
    motivation: real('motivation'),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('check_ins_local_date_idx').on(t.localDate)],
);

/**
 * Free-form notes that change the plan but arrive as conversation.
 *
 * "I'm in Leeds Thursday" and "my calf is tight" are planning inputs, and
 * Claude's own memory is per-account, synthesised daily and not readable by
 * this server -- so anything not written here is lost the moment the
 * conversation ends. This is the table that stops the coach forgetting.
 *
 * MUTABLE, deliberately, and so NOT in APPEND_ONLY_TABLES: a note is a
 * statement about the near future that gets corrected ("actually it's
 * Wednesday") or withdrawn. Activities and check-ins are the historical record
 * and cannot be edited; a note is not history.
 *
 * `expiresAt` is what keeps rocket_get_status short -- an availability note for
 * last Thursday should stop being surfaced without anyone tidying it away.
 */
export const notes = pgTable(
  'notes',
  {
    id: text('id').primaryKey(),
    /** The day the note is ABOUT, not the day it was said. */
    localDate: date('local_date').notNull(),
    kind: text('kind', {
      enum: ['availability', 'wellness', 'constraint', 'free_text'],
    }).notNull(),
    text: text('text').notNull(),
    source: text('source', { enum: ['chat', 'checkin', 'cron'] }).notNull(),
    /** Null means it stands until withdrawn. */
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('notes_local_date_idx').on(t.localDate)],
);

/* ------------------------------------------------------------ the sync --- */

/**
 * The heartbeat. REDLINES.md rule 3: the daily sync fails loudly.
 *
 * One row per run of the daily pass, success or failure, written under
 * AUTOCOMMIT -- a plain single-statement insert outside any transaction -- so
 * the failure row survives the throw that caused it. A row written inside the
 * transaction the failure rolls back is a row that does not exist, which is the
 * exact shape of a sync that "dies quietly during taper".
 *
 * This is layer 1 of three, and it is blind by construction to the one failure
 * that matters most: a job that never ran writes no row at all. Layer 2 is the
 * healthchecks.io dead-man's switch pinged as the pass's final step; layer 3 is
 * `rocket_get_status` reporting staleness once `SYNC.staleAfterHours` trips.
 *
 * MUTABLE by omission rather than by intent -- it is operational telemetry, not
 * training history, so it is not in `APPEND_ONLY_TABLES`. Nothing updates it.
 */
export const syncRuns = pgTable(
  'sync_runs',
  {
    id: text('id').primaryKey(),
    /** Which scheduled job. One today (`daily-pass`); named so a second one can exist. */
    job: text('job').notNull(),
    ranAt: timestamp('ran_at', { withTimezone: true }).notNull().defaultNow(),
    ok: boolean('ok').notNull(),
    /** One human sentence. The thing a person reads at 07:00 on a bad morning. */
    detail: text('detail').notNull(),
    /** The structured pass result: counts, triggers fired, load state. */
    summary: jsonb('summary'),
  },
  (t) => [index('sync_runs_ran_at_idx').on(t.ranAt)],
);

/**
 * Wellness, exactly as the bridge returned it. NO TYPED COLUMNS, deliberately.
 *
 * Decision gate G1 (`docs/plans/PLAN-2026-001-m1-core-loop.md:295-309`) forbids
 * designing the wellness schema before the probe returns a real payload: the
 * bridge's coverage of `hrv`, `restingHR`, `sleepScore` and `bodyBattery` is
 * the one thing the research could not confirm from a primary source, and a
 * column named after a field that arrives null forever is worse than no column.
 *
 * The daily pass still has to ingest wellness or it is not the pass the spec
 * describes, so it lands here whole. When `npm run probe:g1` has run and
 * `docs/G1-BRIDGE-PROBE.md` says what is actually populated, the typed table is
 * derived FROM this one by a migration that reads rows already in hand -- no
 * re-ingest, no gap.
 *
 * Keyed by local date and UPSERTED: a wellness day is re-stated by the bridge
 * as the day's data lands (overnight metrics arrive after the morning sync),
 * and it is re-fetchable, so it is not history in the append-only sense.
 */
export const wellnessRaw = pgTable('wellness_raw', {
  localDate: date('local_date').primaryKey(),
  raw: jsonb('raw').notNull(),
  ingestedAt: timestamp('ingested_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Tables the append-only guards protect. The migration and tests both read this. */
export const APPEND_ONLY_TABLES = ['activities', 'check_ins'] as const;
