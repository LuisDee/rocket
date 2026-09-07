/**
 * The five tables M1 needs. Wellness snapshots, availability rules and plan
 * revisions are deliberately absent until something reads them.
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

/** Tables the append-only guards protect. The migration and tests both read this. */
export const APPEND_ONLY_TABLES = ['activities', 'check_ins'] as const;
