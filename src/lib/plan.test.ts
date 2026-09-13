/**
 * One plan, three surfaces.
 *
 * The home screen, `rocket_get_status` and the watch push each rendered the same
 * day from a different source, and the divergence was not theoretical: the app
 * recomputed the week from `BLOCK_WEEKS` and never read a session row, so a
 * downgrade written by the cron was invisible on the phone while the watch event
 * generated from that same row said "Planned by rocket. If this disagrees with
 * the app, the app is right." The test that matters here is the boring one --
 * given one store, every surface says the same thing.
 */

import { describe, expect, it } from 'vitest';

import { memoryStore, type MemoryStore } from '../domain/store-memory';
import { toPlannerSession } from '../mcp/window';
import type { CheckIn, SessionRow } from '../domain/types';
import { planForDate, toPlanned } from './plan';

/** Wednesday of week 3, which is the block's threshold day. */
const QUALITY_DATE = '2026-09-23';

const row = (
  over: Partial<SessionRow> & { id: string; date: string },
): SessionRow => ({
  weekNumber: 3,
  type: 'easy',
  plannedKm: 10,
  timeSlot: 'evening',
  status: 'planned',
  note: null,
  ...over,
});

const sore = (localDate: string, severity: number): CheckIn => ({
  id: `ci-${localDate}`,
  localDate,
  rpeYesterday: 4,
  soreness: [{ location: 'achilles', severity }],
  sleep: 8,
  motivation: 4,
  note: null,
});

function storeWith(
  rows: readonly SessionRow[],
  checkIn?: CheckIn,
): MemoryStore {
  const store = memoryStore();
  store.rows.sessions.push(...rows);
  if (checkIn) store.rows.checkIns.push(checkIn);
  return store;
}

describe('the two row adapters agree', () => {
  it('maps a row to the same planner session as the MCP adapter does', () => {
    // `plan.ts` keeps its own copy so the app does not depend on the assistant's
    // I/O layer. Three lines duplicated is cheap; three lines DRIFTING is a
    // surface silently reading a different plan, which is the whole bug this
    // module exists to close.
    for (const type of [
      'easy',
      'steady',
      'quality',
      'long',
      'race',
      'swim',
      'rest',
      'something-nobody-has-written-yet',
    ]) {
      const r = row({ id: `r-${type}`, date: QUALITY_DATE, type, note: 'n' });
      expect(toPlanned(r)).toEqual(toPlannerSession(r));
    }
  });
});

describe('the stored plan wins over config', () => {
  it('reads the rows the planner authored, not the week config describes', async () => {
    // The config plan puts 10.6 km on this date. A repair moved it to 6.
    const plan = await planForDate(
      storeWith([row({ id: 's1', date: QUALITY_DATE, plannedKm: 6 })]),
      QUALITY_DATE,
    );

    expect(plan.source).toBe('stored');
    expect(plan.today?.km).toBe(6);
  });

  it('shows the adaptation, not the plan as it would have been', async () => {
    // A quality row the cron already downgraded to easy. Recomputing from config
    // hands the threshold session straight back -- which is what the app did.
    const plan = await planForDate(
      storeWith([
        row({
          id: 's1',
          date: QUALITY_DATE,
          type: 'easy',
          plannedKm: 10.6,
          note: 'Downgraded from quality: soreness 4 reported 2026-09-21.',
        }),
      ]),
      QUALITY_DATE,
    );

    expect(plan.today?.zone).toBe('easy');
    expect(plan.today?.what).not.toMatch(/threshold/i);
  });

  it('falls back to config for a week the planner has not written yet', async () => {
    const plan = await planForDate(storeWith([]), QUALITY_DATE);

    expect(plan.source).toBe('config');
    expect(plan.today?.zone).toBe('threshold');
    expect(plan.week.length).toBeGreaterThan(0);
  });

  it('applies this morning’s check-in on top of the stored rows', async () => {
    // The cron runs at 03:30 and he checks in at 07:00, so the gate routinely
    // post-dates the rows. If it were only applied at planning time the app would
    // show the ungated session all day.
    const plan = await planForDate(
      storeWith(
        [
          row({
            id: 's1',
            date: QUALITY_DATE,
            type: 'quality',
            plannedKm: 10.6,
          }),
        ],
        sore(QUALITY_DATE, 4),
      ),
      QUALITY_DATE,
    );

    expect(plan.gate).toEqual({ severity: 4, since: QUALITY_DATE });
    expect(plan.today?.zone).toBe('easy');
    expect(plan.today?.demoted?.fromZone).toBe('threshold');
    expect(plan.today?.km).toBe(10.6);
  });

  it('reports nothing for a date outside the block instead of inventing a week', async () => {
    const plan = await planForDate(storeWith([]), '2027-03-01');

    expect(plan.today).toBeNull();
    expect(plan.week).toEqual([]);
  });
});
