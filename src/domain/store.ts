/**
 * The one seam between the domain and Postgres.
 *
 * Both writers go through it -- the MCP tools and the PWA check-in form -- so
 * there is no second persistence story, and the in-memory implementation next
 * to it is what lets `npm run test` drive the whole tool surface with no
 * database (`store-memory.ts`).
 *
 * Reads and writes only. No policy: guardrails, readiness and every threshold
 * live in the pure modules, because a rule embedded in a query cannot be tested
 * without a database and cannot be read without SQL.
 */

import { randomUUID } from 'node:crypto';

import { and, desc, eq, gte, isNull, lte, or, sql } from 'drizzle-orm';

import { BLOCK_WEEKS } from '../../config/training';
import { getDb, schema } from '../db/client';
import type { ScorableActivity } from './load';
import { mondayOf } from './planner/dates';
import type { PlannedSession as PlannerSession } from './planner/types';
import type {
  CheckIn,
  IngestedActivity,
  LoggedActivity,
  Note,
  SessionRow,
  SessionChanges,
  SyncRun,
} from './types';

export interface Store {
  /** Sessions between two inclusive `YYYY-MM-DD` bounds, in date order. */
  window(from: string, to: string): Promise<SessionRow[]>;
  session(id: string): Promise<SessionRow | null>;
  /** Typed fields only -- REDLINES.md rule 8 admits no free-form schedule. */
  updateSession(id: string, changes: SessionChanges): Promise<void>;
  /**
   * Persist a window the deterministic planner produced.
   *
   * Rows whose status is anything but `planned` are LEFT ALONE -- a completed
   * or skipped session is a record of what happened, and REDLINES.md forbids
   * editing one to make a plan tidy. Everything else in the span is reconciled
   * by date against what the planner returned.
   */
  replaceWindow(
    from: string,
    to: string,
    sessions: readonly PlannerSession[],
  ): Promise<void>;

  latestCheckIn(): Promise<CheckIn | null>;
  insertCheckIn(checkIn: CheckIn): Promise<void>;

  insertActivity(activity: LoggedActivity): Promise<void>;
  /**
   * Completed runs in a span, as the guardrails' history input.
   *
   * The ramp baseline and the spike baseline both need what was actually RUN,
   * not what was planned: a planned week compared against a planned week always
   * passes, because the plan was written to pass it.
   */
  completedRuns(
    from: string,
    to: string,
  ): Promise<{ date: string; km: number }[]>;
  /** Calendar days spanned by the activity history, 0 when there is none. */
  activityHistoryDays(today: string): Promise<number>;
  /** When the newest activity was ingested. Null means nothing ever arrived. */
  lastIngestAt(): Promise<Date | null>;

  /** Notes about `today` or later that have not expired. */
  openNotes(today: string, now: Date): Promise<Note[]>;
  insertNote(note: Note): Promise<void>;

  /* ----------------------------------------------------- the daily pass --- */

  /**
   * Activities from the bridge. Returns how many rows were NEW.
   *
   * Idempotent by primary key rather than by a "have I seen this day" flag:
   * the ingest deliberately re-asks for `SYNC.ingestLookbackDays` because the
   * cron is best-effort and the bridge can sync late, so re-offering a stored
   * activity is the normal case, not the error case.
   */
  ingestActivities(rows: readonly IngestedActivity[]): Promise<number>;

  /**
   * One wellness day, stored verbatim and upserted on its date.
   *
   * No typed column, by Decision gate G1: nothing may lean on a bridge-supplied
   * wellness field until `npm run probe:g1` has read a real payload.
   */
  upsertWellness(localDate: string, raw: unknown): Promise<void>;

  /** Everything the load engine can score, over an inclusive span. */
  scorableActivities(from: string, to: string): Promise<ScorableActivity[]>;

  /**
   * The heartbeat row. REDLINES.md rule 3.
   *
   * Written for a FAILED pass as well as a successful one, and written as a
   * single statement outside any transaction so it survives the throw.
   */
  recordSyncRun(run: SyncRun): Promise<void>;

  /** The newest heartbeat for a job, or null if the job has never run. */
  lastSyncRun(job: string): Promise<SyncRun | null>;
}

type Db = ReturnType<typeof getDb>;

/**
 * The connection is resolved on first USE, not at construction. Building the
 * store must not require `DATABASE_URL`: the MCP route constructs one inside
 * its initialiser, and a route that cannot even answer `initialize` without a
 * database would be untestable and would fail an unauthenticated request with
 * the wrong error.
 */
export function postgresStore(provided?: Db): Store {
  let resolved = provided;
  const db = (): Db => (resolved ??= getDb());
  const { activities, checkIns, notes, sessions, syncRuns, wellnessRaw } =
    schema;

  return {
    async window(from, to) {
      const rows = await db()
        .select()
        .from(sessions)
        .where(and(gte(sessions.date, from), lte(sessions.date, to)))
        .orderBy(sessions.date);
      return rows.map(toSession);
    },

    async session(id) {
      const rows = await db()
        .select()
        .from(sessions)
        .where(eq(sessions.id, id))
        .limit(1);
      const row = rows[0];
      return row === undefined ? null : toSession(row);
    },

    async updateSession(id, changes) {
      await db().update(sessions).set(changes).where(eq(sessions.id, id));
    },

    async replaceWindow(from, to, next) {
      const existing = await db()
        .select()
        .from(sessions)
        .where(and(gte(sessions.date, from), lte(sessions.date, to)));

      const editable = existing.filter((row) => row.status === 'planned');
      const byDate = new Map(editable.map((row) => [row.date, row]));

      for (const session of next) {
        const row = byDate.get(session.date);
        const values = plannedValues(session);
        if (row === undefined) {
          await db()
            .insert(sessions)
            .values({ id: randomUUID(), date: session.date, ...values });
        } else {
          await db()
            .update(sessions)
            .set(values)
            .where(eq(sessions.id, row.id));
        }
      }

      const kept = new Set(next.map((s) => s.date));
      for (const row of editable) {
        if (!kept.has(row.date)) {
          await db().delete(sessions).where(eq(sessions.id, row.id));
        }
      }
    },

    async latestCheckIn() {
      const rows = await db()
        .select()
        .from(checkIns)
        .orderBy(desc(checkIns.localDate), desc(checkIns.createdAt))
        .limit(1);
      const row = rows[0];
      if (row === undefined) return null;
      return {
        id: row.id,
        localDate: row.localDate,
        rpeYesterday: row.rpeYesterday,
        soreness: (row.soreness ?? null) as CheckIn['soreness'],
        sleep: row.sleep,
        motivation: row.motivation,
        note: row.note,
      };
    },

    async insertCheckIn(checkIn) {
      await db().insert(checkIns).values({
        id: checkIn.id,
        localDate: checkIn.localDate,
        rpeYesterday: checkIn.rpeYesterday,
        soreness: checkIn.soreness,
        sleep: checkIn.sleep,
        motivation: checkIn.motivation,
        note: checkIn.note,
      });
    },

    async insertActivity(activity) {
      await db().insert(activities).values({
        id: activity.id,
        source: 'manual',
        localDate: activity.localDate,
        activityType: activity.activityType,
        distanceM: activity.distanceM,
        durationS: activity.durationS,
        elevationGainM: activity.elevationGainM,
        rpe: activity.rpe,
        shoeId: activity.shoeId,
        surface: activity.surface,
        notes: activity.notes,
      });
    },

    async completedRuns(from, to) {
      const rows = await db()
        .select({
          date: activities.localDate,
          distanceM: activities.distanceM,
          type: activities.activityType,
        })
        .from(activities)
        .where(
          and(gte(activities.localDate, from), lte(activities.localDate, to)),
        )
        .orderBy(activities.localDate);
      return rows.filter(isRunRow).map((row) => ({
        date: row.date,
        km: (row.distanceM ?? 0) / 1000,
      }));
    },

    async activityHistoryDays(today) {
      const rows = await db()
        .select({ earliest: sql<string | null>`min(${activities.localDate})` })
        .from(activities);
      const earliest = rows[0]?.earliest ?? null;
      if (earliest === null) return 0;
      return Math.max(0, daysBetween(earliest, today));
    },

    async lastIngestAt() {
      const rows = await db()
        .select({ at: activities.ingestedAt })
        .from(activities)
        .orderBy(desc(activities.ingestedAt))
        .limit(1);
      return rows[0]?.at ?? null;
    },

    async openNotes(today, now) {
      const rows = await db()
        .select()
        .from(notes)
        .where(
          and(
            gte(notes.localDate, today),
            or(isNull(notes.expiresAt), gte(notes.expiresAt, now)),
          ),
        )
        .orderBy(notes.localDate);
      return rows.map((row) => ({
        id: row.id,
        localDate: row.localDate,
        kind: row.kind,
        text: row.text,
        source: row.source,
        expiresAt: row.expiresAt,
      }));
    },

    async insertNote(note) {
      await db().insert(notes).values({
        id: note.id,
        localDate: note.localDate,
        kind: note.kind,
        text: note.text,
        source: note.source,
        expiresAt: note.expiresAt,
      });
    },
    async ingestActivities(rows) {
      if (rows.length === 0) return 0;
      // `onConflictDoNothing` and not an upsert: `activities` carries the
      // append-only triggers, so an UPDATE here would be refused by the
      // database (SQLSTATE 23001) rather than merely being wrong. Re-offering a
      // stored activity has to be a no-op, and this makes it one.
      const inserted = await db()
        .insert(activities)
        .values(
          rows.map((row) => ({
            id: row.id,
            source: row.source,
            localDate: row.localDate,
            name: row.name,
            activityType: row.activityType,
            startTimeLocal: row.startTimeLocal,
            distanceM: row.distanceM,
            durationS: row.durationS,
            elapsedDurationS: row.elapsedDurationS,
            averageHr: row.averageHr,
            maxHr: row.maxHr,
            elevationGainM: row.elevationGainM,
            calories: row.calories,
            activityTrainingLoad: row.activityTrainingLoad,
            raw: row.raw,
          })),
        )
        .onConflictDoNothing()
        .returning({ id: activities.id });
      return inserted.length;
    },

    async upsertWellness(localDate, raw) {
      await db()
        .insert(wellnessRaw)
        .values({ localDate, raw })
        .onConflictDoUpdate({
          target: wellnessRaw.localDate,
          set: { raw, ingestedAt: new Date() },
        });
    },

    async scorableActivities(from, to) {
      const rows = await db()
        .select({
          localDate: activities.localDate,
          durationS: activities.durationS,
          rpe: activities.rpe,
          trainingLoad: activities.activityTrainingLoad,
        })
        .from(activities)
        .where(
          and(gte(activities.localDate, from), lte(activities.localDate, to)),
        )
        .orderBy(activities.localDate);
      return rows;
    },

    async recordSyncRun(run) {
      // One statement, no transaction wrapper: `pg` runs it under autocommit,
      // which is the whole point. A heartbeat written inside the transaction
      // that a failure rolls back is a heartbeat that does not exist.
      await db().insert(syncRuns).values({
        id: run.id,
        job: run.job,
        ranAt: run.ranAt,
        ok: run.ok,
        detail: run.detail,
        summary: run.summary,
      });
    },

    async lastSyncRun(job) {
      const rows = await db()
        .select()
        .from(syncRuns)
        .where(eq(syncRuns.job, job))
        .orderBy(desc(syncRuns.ranAt))
        .limit(1);
      const row = rows[0];
      if (row === undefined) return null;
      return {
        id: row.id,
        job: row.job,
        ranAt: row.ranAt,
        ok: row.ok,
        detail: row.detail,
        summary: row.summary,
      };
    },
  };
}

type DbSession = typeof schema.sessions.$inferSelect;

function toSession(row: DbSession): SessionRow {
  return {
    id: row.id,
    date: row.date,
    weekNumber: row.weekNumber,
    type: row.type,
    plannedKm: row.plannedKm,
    timeSlot: row.timeSlot,
    status: row.status,
    note: row.note,
  };
}

/**
 * Activity types that put running kilometres through the legs. A swim is real
 * cardio and no impact, so it is not part of a ramp baseline.
 */
const RUN_TYPES = new Set([
  'running',
  'trail_running',
  'treadmill_running',
  'track_running',
]);

function isRunRow(row: {
  type: string | null;
  distanceM: number | null;
}): boolean {
  return (
    row.type !== null && RUN_TYPES.has(row.type) && (row.distanceM ?? 0) > 0
  );
}

/** The columns a planner-authored session sets. Status stays `planned`: this
 *  function only ever writes rows the planner owns. */
function plannedValues(session: PlannerSession) {
  return {
    weekNumber:
      BLOCK_WEEKS.find((w) => w.monday === mondayOf(session.date))?.week ??
      null,
    type: session.kind,
    plannedKm: session.km,
    timeSlot: session.slot,
    note: session.note ?? null,
    status: 'planned',
  };
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}
