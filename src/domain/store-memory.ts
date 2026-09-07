/**
 * The store, in memory.
 *
 * Exists so the MCP tools can be driven end to end -- through `tools/call`,
 * over a real client -- with no database. `npm run test` must stay green on a
 * machine that has never seen `DATABASE_URL`, and a tool surface that is only
 * exercised when a database happens to be present is a tool surface nobody
 * tests.
 *
 * Deliberately NOT a fake with assertions on it: it stores rows and hands them
 * back. Everything worth asserting is asserted on what the tools return.
 */

import { randomUUID } from 'node:crypto';

import type { ScorableActivity } from './load';
import type { PlannedSession as PlannerSession } from './planner/types';
import type { Store } from './store';
import type {
  CheckIn,
  IngestedActivity,
  LoggedActivity,
  Note,
  SessionRow,
  SessionChanges,
  SyncRun,
} from './types';

/** Mirrors the postgres store's own filter, so the two agree on what a run is. */
const RUN_TYPES = new Set([
  'running',
  'trail_running',
  'treadmill_running',
  'track_running',
]);

export type MemoryStore = Store & {
  readonly rows: {
    sessions: SessionRow[];
    checkIns: CheckIn[];
    /** Hand-logged activities -- what `rocket_log_activity` writes. */
    activities: LoggedActivity[];
    /** Bridge-ingested activities. Separate only because their shapes differ. */
    ingested: IngestedActivity[];
    notes: Note[];
    /** Wellness days, verbatim, keyed on date -- the upsert target. */
    wellness: Map<string, unknown>;
    syncRuns: SyncRun[];
  };
};

export function memoryStore(sessions: SessionRow[] = []): MemoryStore {
  const rows = {
    sessions: [...sessions],
    checkIns: [] as CheckIn[],
    activities: [] as LoggedActivity[],
    ingested: [] as IngestedActivity[],
    notes: [] as Note[],
    wellness: new Map<string, unknown>(),
    syncRuns: [] as SyncRun[],
  };
  /** Stands in for `activities.ingested_at`; set on every insert. */
  let lastIngest: Date | null = null;

  return {
    rows,

    window: async (from, to) =>
      rows.sessions
        .filter((s) => s.date >= from && s.date <= to)
        .sort((a, b) => a.date.localeCompare(b.date)),

    session: async (id) => rows.sessions.find((s) => s.id === id) ?? null,

    updateSession: async (id: string, changes: SessionChanges) => {
      rows.sessions = rows.sessions.map((s) =>
        s.id === id ? { ...s, ...changes } : s,
      );
    },

    replaceWindow: async (
      from: string,
      to: string,
      next: readonly PlannerSession[],
    ) => {
      const inSpan = (d: string) => d >= from && d <= to;
      const untouched = rows.sessions.filter(
        (s) => !inSpan(s.date) || s.status !== 'planned',
      );
      const editable = new Map(
        rows.sessions
          .filter((s) => inSpan(s.date) && s.status === 'planned')
          .map((s) => [s.date, s]),
      );
      rows.sessions = [
        ...untouched,
        ...next.map((session) => {
          const existing = editable.get(session.date);
          return {
            id: existing?.id ?? randomUUID(),
            date: session.date,
            weekNumber: existing?.weekNumber ?? null,
            type: session.kind,
            plannedKm: session.km,
            timeSlot: session.slot,
            status: 'planned',
            note: session.note ?? null,
          };
        }),
      ].sort((a, b) => a.date.localeCompare(b.date));
    },

    latestCheckIn: async () =>
      [...rows.checkIns].sort((a, b) =>
        b.localDate.localeCompare(a.localDate),
      )[0] ?? null,

    insertCheckIn: async (checkIn: CheckIn) => {
      rows.checkIns.push(checkIn);
    },

    insertActivity: async (activity: LoggedActivity) => {
      rows.activities.push(activity);
      lastIngest = new Date();
    },

    completedRuns: async (from: string, to: string) =>
      everyActivity()
        .filter(
          (a) =>
            a.localDate >= from &&
            a.localDate <= to &&
            a.activityType !== null &&
            RUN_TYPES.has(a.activityType) &&
            (a.distanceM ?? 0) > 0,
        )
        .map((a) => ({ date: a.localDate, km: (a.distanceM ?? 0) / 1000 }))
        .sort((a, b) => a.date.localeCompare(b.date)),

    activityHistoryDays: async (today) => {
      const dates = everyActivity()
        .map((a) => a.localDate)
        .sort();
      const earliest = dates[0];
      if (earliest === undefined) return 0;
      return Math.max(
        0,
        Math.round((Date.parse(today) - Date.parse(earliest)) / 86_400_000),
      );
    },

    lastIngestAt: async () => lastIngest,

    openNotes: async (today, now) =>
      rows.notes
        .filter(
          (n) =>
            n.localDate >= today &&
            (n.expiresAt === null || n.expiresAt >= now),
        )
        .sort((a, b) => a.localDate.localeCompare(b.localDate)),

    insertNote: async (note: Note) => {
      rows.notes.push(note);
    },

    ingestActivities: async (incoming: readonly IngestedActivity[]) => {
      // Mirrors the postgres store's `onConflictDoNothing`: the primary key is
      // the upstream id, so re-offering a stored activity is a no-op and the
      // return value is what was genuinely new.
      const seen = new Set(rows.ingested.map((a) => a.id));
      const fresh = incoming.filter((a) => !seen.has(a.id));
      rows.ingested.push(...fresh);
      if (fresh.length > 0) lastIngest = new Date();
      return fresh.length;
    },

    upsertWellness: async (localDate: string, raw: unknown) => {
      rows.wellness.set(localDate, raw);
    },

    scorableActivities: async (from: string, to: string) =>
      everyActivity()
        .filter((a) => a.localDate >= from && a.localDate <= to)
        .map(({ localDate, durationS, rpe, trainingLoad }) => ({
          localDate,
          durationS,
          rpe,
          trainingLoad,
        }))
        .sort((a, b) => a.localDate.localeCompare(b.localDate)),

    recordSyncRun: async (run: SyncRun) => {
      rows.syncRuns.push(run);
    },

    lastSyncRun: async (job: string) =>
      [...rows.syncRuns]
        .filter((r) => r.job === job)
        .sort((a, b) => b.ranAt.getTime() - a.ranAt.getTime())[0] ?? null,
  };

  /**
   * Both activity sources as one series.
   *
   * A hand-logged activity has an RPE and no training load; a bridge one has a
   * training load and no RPE. The load engine's cascade takes whichever is
   * there, so anything that reasons over history has to see both -- a ramp
   * baseline blind to manual logs is a ramp baseline that reads zero during an
   * integration outage, which is the exact opposite of what invariant 2 wants.
   */
  function everyActivity(): (ScorableActivity & {
    activityType: string | null;
    distanceM: number | null;
  })[] {
    return [
      ...rows.activities.map((a) => ({
        localDate: a.localDate,
        activityType: a.activityType,
        distanceM: a.distanceM,
        durationS: a.durationS,
        rpe: a.rpe,
        trainingLoad: null,
      })),
      ...rows.ingested.map((a) => ({
        localDate: a.localDate,
        activityType: a.activityType,
        distanceM: a.distanceM,
        durationS: a.durationS,
        rpe: null,
        trainingLoad: a.activityTrainingLoad,
      })),
    ];
  }
}
