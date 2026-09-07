import { describe, expect, it } from 'vitest';

import { BLOCK, BLOCK_WEEKS } from '../../config/training';
import {
  currentWeek,
  daysToRace,
  formatDuration,
  formatPace,
  parseIsoDate,
  shiftIsoDate,
  toIsoDate,
} from './block';

/**
 * The current-week boundary is what the page is built on. If it is off by one,
 * the highlighted row is wrong every Monday -- the day the week's plan actually
 * matters most.
 */
describe('currentWeek', () => {
  it('selects the week whose Monday is today, not the week before', () => {
    const firstMonday = BLOCK_WEEKS[0]?.monday as string;
    const week = currentWeek(parseIsoDate(firstMonday));
    expect(week?.monday).toBe(firstMonday);
  });

  it('still selects that week on its final Sunday', () => {
    const second = BLOCK_WEEKS[1]?.monday as string;
    const sunday = parseIsoDate(second);
    sunday.setDate(sunday.getDate() - 1);
    expect(currentWeek(sunday)?.monday).toBe(BLOCK_WEEKS[0]?.monday);
  });

  it('rolls over to the next week on its Monday', () => {
    const second = BLOCK_WEEKS[1]?.monday as string;
    expect(currentWeek(parseIsoDate(second))?.monday).toBe(second);
  });

  it('returns null before the block starts', () => {
    const before = parseIsoDate(BLOCK.blockStart);
    before.setDate(before.getDate() - 1);
    expect(currentWeek(before)).toBeNull();
  });

  it('returns null after the final week ends', () => {
    const lastMonday = BLOCK_WEEKS[BLOCK_WEEKS.length - 1]?.monday as string;
    const after = parseIsoDate(lastMonday);
    after.setDate(after.getDate() + 7);
    expect(currentWeek(after)).toBeNull();
  });

  it('covers every day of the block with exactly one week', () => {
    const start = parseIsoDate(BLOCK.blockStart);
    const weeks = new Set<string>();
    for (let i = 0; i < BLOCK_WEEKS.length * 7; i += 1) {
      const day = new Date(start);
      day.setDate(day.getDate() + i);
      const week = currentWeek(day);
      expect(week, `day +${i} fell outside the block`).not.toBeNull();
      weeks.add(week?.monday as string);
    }
    expect(weeks.size).toBe(BLOCK_WEEKS.length);
  });
});

describe('daysToRace', () => {
  it('is zero on race day', () => {
    expect(daysToRace(parseIsoDate(BLOCK.goalRaceDate))).toBe(0);
  });

  it('counts calendar days, not 24-hour periods, across the October clock change', () => {
    // BST ends on the last Sunday of October 2026, inside the taper. A
    // millisecond-difference implementation is off by one here.
    expect(daysToRace(parseIsoDate('2026-10-23'))).toBe(1);
    expect(daysToRace(parseIsoDate('2026-10-01'))).toBe(23);
  });

  it('goes negative once the race is behind us', () => {
    expect(daysToRace(parseIsoDate('2026-10-25'))).toBe(-1);
  });
});

describe('parseIsoDate', () => {
  it('reads a date-only string as a local calendar date', () => {
    // new Date('2026-09-07') is UTC midnight and lands on the 6th in any
    // negative-offset timezone. These are Europe/London calendar dates.
    const d = parseIsoDate('2026-09-07');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8);
    expect(d.getDate()).toBe(7);
  });
});

describe('formatting', () => {
  it('carries a rounded 60 seconds into the minute rather than printing 5:60', () => {
    expect(formatPace(359.6)).toBe('6:00');
    expect(formatDuration(3599.6)).toBe('1:00:00');
  });

  it('renders a missing pace rather than NaN', () => {
    expect(formatPace(null)).toBe('--:--');
    expect(formatPace(0)).toBe('--:--');
  });

  it('drops the hour component under an hour', () => {
    expect(formatDuration(1530)).toBe('25:30');
  });
});

describe('toIsoDate / shiftIsoDate', () => {
  it('round-trips parseIsoDate across the October clock change', () => {
    // British Summer Time ends on 25 October 2026, and this block runs through
    // it. `parseIsoDate` builds local midnight, which on that morning is still
    // BST and therefore 23:00 UTC on the 24th -- so the obvious
    // `toISOString().slice(0, 10)` hands back the wrong day. This pins the
    // pairing rather than the implementation.
    for (const iso of ['2026-10-24', '2026-10-25', '2026-10-26']) {
      expect(toIsoDate(parseIsoDate(iso))).toBe(iso);
    }
  });

  it('counts days on the calendar across the clock change, not in hours', () => {
    // The 25th is a 25-hour day. Millisecond arithmetic lands at 23:00 on the
    // 25th and truncates back to the 25th, losing a day.
    expect(shiftIsoDate('2026-10-24', 1)).toBe('2026-10-25');
    expect(shiftIsoDate('2026-10-25', 1)).toBe('2026-10-26');
    expect(shiftIsoDate('2026-10-26', -1)).toBe('2026-10-25');
  });

  it('shifts backwards across a month boundary', () => {
    expect(shiftIsoDate('2026-11-01', -1)).toBe('2026-10-31');
  });
});
