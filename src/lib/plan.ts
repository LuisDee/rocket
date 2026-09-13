/**
 * The plan as any surface should see it: stored rows first, config as fallback,
 * this morning's check-in applied.
 *
 * ## Why it is one function
 *
 * Three surfaces rendered the same day and could disagree about it. The home
 * screen recomputed the week from `BLOCK_WEEKS` on every request and never read a
 * session row -- `store.window()` was called nowhere under `src/app` -- so every
 * adaptation the planner wrote was invisible in the app. `rocket_get_status` read
 * the rows and reported them as bare kilometres and a type, with no zone, pace or
 * structure. And the watch push, generated from those same rows, carried a
 * description ending "Planned by rocket. If this disagrees with the app, the app
 * is right." -- pointing the athlete at the one surface that could not see the
 * adaptation.
 *
 * So: one reader, one composition, and the divergence stops being possible rather
 * than being tested for.
 *
 * ## Why the store wins
 *
 * `sessions` is what the deterministic planner actually authored, repairs
 * included (REDLINES rule 8 admits no other author). Config is what the plan
 * would have been if nothing had ever adapted. Where the week has rows, they are
 * the plan; where it has none -- the far end of the rolling window, or any week
 * before the first pass ran -- config is the honest answer rather than an empty
 * screen, and `source` says which the caller got.
 */

import { currentWeek, parseIsoDate } from './block';
import { mondayOf, shiftIso } from '../domain/planner/dates';
import type { Described, Gate } from '../domain/planner/prescribe';
import { gateFromCheckIn, prescribeWeek } from '../domain/planner/today';
import type { PlannedSession } from '../domain/planner/types';
import type { CheckIn, SessionRow } from '../domain/types';

/** The reads this needs, so a caller can pass a store or a fake. */
export type PlanReader = {
  window(from: string, to: string): Promise<SessionRow[]>;
  latestCheckIn(): Promise<CheckIn | null>;
};

export type DayPlan = {
  readonly date: string;
  /** The whole week the date sits in, described. Empty outside the block. */
  readonly week: readonly Described[];
  readonly today: Described | null;
  readonly gate: Gate | null;
  /** Kilometres the week's slots could not hold. Zero when reading stored rows. */
  readonly shortfallKm: number;
  /** Everything the planner had to compromise on, in plain words. */
  readonly notes: readonly string[];
  /** Which placement the caller got. `config` means the planner has not written this week. */
  readonly source: 'stored' | 'config';
};

/**
 * `steady` is a running session the planner has no separate kind for, so it maps
 * onto `easy`. Anything unrecognised maps to `easy` as well rather than throwing:
 * one odd row must not take a screen down.
 *
 * Duplicated from `src/mcp/window.ts` on purpose -- importing the MCP adapter into
 * the app would make the phone depend on the assistant's I/O layer. The shape is
 * three lines and the two are asserted equal by test.
 */
const KINDS: Record<string, PlannedSession['kind']> = {
  easy: 'easy',
  steady: 'easy',
  quality: 'quality',
  long: 'long',
  race: 'race',
  swim: 'swim',
  rest: 'rest',
};

export function toPlanned(row: SessionRow): PlannedSession {
  return {
    date: row.date,
    km: row.plannedKm ?? 0,
    kind: KINDS[row.type] ?? 'easy',
    slot: row.timeSlot,
    ...(row.note === null ? {} : { note: row.note }),
  };
}

export async function planForDate(
  reader: PlanReader,
  date: string,
): Promise<DayPlan> {
  const monday = mondayOf(date);
  const week = currentWeek(parseIsoDate(date));

  const [rows, checkIn] = await Promise.all([
    reader.window(monday, shiftIso(monday, 6)),
    reader.latestCheckIn(),
  ]);

  const gate = gateFromCheckIn(checkIn, date);
  if (week === null) {
    return {
      date,
      week: [],
      today: null,
      gate,
      shortfallKm: 0,
      notes: [],
      source: 'config',
    };
  }

  const stored = rows.map(toPlanned);
  const prescribed = prescribeWeek(week, gate, stored);

  return {
    date,
    week: prescribed.sessions,
    today: prescribed.sessions.find((s) => s.date === date) ?? null,
    gate,
    shortfallKm: prescribed.shortfallKm,
    notes: prescribed.notes,
    source: stored.length > 0 ? 'stored' : 'config',
  };
}
