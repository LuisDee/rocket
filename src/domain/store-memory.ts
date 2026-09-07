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

import type { PlannedSession as PlannerSession } from './planner/types';
import type { Store } from './store';
import type {
  CheckIn,
  LoggedActivity,
  Note,
  SessionRow,
  SessionChanges,
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
    activities: LoggedActivity[];
    notes: Note[];
  };
};

export function memoryStore(sessions: SessionRow[] = []): MemoryStore {
  const rows = {
    sessions: [...sessions],
    checkIns: [] as CheckIn[],
    activities: [] as LoggedActivity[],
    notes: [] as Note[],
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
      rows.activities
        .filter(
          (a) =>
            a.localDate >= from &&
            a.localDate <= to &&
            RUN_TYPES.has(a.activityType) &&
            (a.distanceM ?? 0) > 0,
        )
        .map((a) => ({ date: a.localDate, km: (a.distanceM ?? 0) / 1000 }))
        .sort((a, b) => a.date.localeCompare(b.date)),

    activityHistoryDays: async (today) => {
      const dates = rows.activities.map((a) => a.localDate).sort();
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
  };
}
