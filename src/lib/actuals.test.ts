import { describe, expect, it } from 'vitest';

import { BLOCK_WEEKS } from '../../config/training';
import { blockTotals, weekEnd, weeklyActuals } from './actuals';

const W1 = BLOCK_WEEKS[0]!;
const W2 = BLOCK_WEEKS[1]!;

describe('weekEnd', () => {
  it('is the Sunday six days after the Monday', () => {
    expect(weekEnd('2026-09-07')).toBe('2026-09-13');
  });

  it('crosses a month boundary without slipping', () => {
    expect(weekEnd('2026-09-28')).toBe('2026-10-04');
  });
});

describe('weeklyActuals', () => {
  it('reports zero actual for a week with no activities, not a missing row', () => {
    const rows = weeklyActuals([], '2026-09-20');
    const w2 = rows.find((r) => r.monday === W2.monday)!;

    // The bug this pins: a week with no runs silently vanishing from the list,
    // so a missed week looks like a week that was never planned.
    expect(rows).toHaveLength(BLOCK_WEEKS.length);
    expect(w2.actualKm).toBe(0);
    expect(w2.deltaKm).toBe(-(W2.targetKm ?? 0));
  });

  it('sums only the runs inside the week, not the ones either side', () => {
    const rows = weeklyActuals(
      [
        { date: '2026-09-06', km: 99 }, // Sunday before week 1
        { date: '2026-09-07', km: 10 }, // Monday, first day of week 1
        { date: '2026-09-13', km: 5 }, // Sunday, last day of week 1
        { date: '2026-09-14', km: 99 }, // Monday of week 2
      ],
      '2026-09-30',
    );
    const w1 = rows.find((r) => r.monday === W1.monday)!;
    expect(w1.actualKm).toBe(15);
  });

  it('marks a week complete only once it has finished', () => {
    // Mid-week: week 1 runs 7-13 Sept, so on the 10th it is not complete.
    const midweek = weeklyActuals([], '2026-09-10');
    expect(midweek.find((r) => r.monday === '2026-09-07')!.complete).toBe(
      false,
    );

    const after = weeklyActuals([], '2026-09-14');
    expect(after.find((r) => r.monday === '2026-09-07')!.complete).toBe(true);
  });

  it('carries a null delta for a week with no running target', () => {
    // Every week in the live block currently carries a target, so this case is
    // exercised with a synthetic one. There is nothing to be ahead or behind of
    // when nothing was asked for, and reporting 0 - 0 = 0 would read as "on
    // plan" for a week that had no plan.
    const rows = weeklyActuals([{ date: '2026-10-20', km: 8 }], '2026-11-01', [
      {
        week: 99,
        monday: '2026-10-19',
        phase: 'race',
        targetKm: null,
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.actualKm).toBe(8);
    expect(rows[0]!.deltaKm).toBeNull();
  });
});

describe('blockTotals', () => {
  it('counts finished weeks only, so an in-progress week is not read as a miss', () => {
    const rows = weeklyActuals([{ date: '2026-09-07', km: 12 }], '2026-09-10');
    const totals = blockTotals(rows);

    // Week 1 is still running on the 10th, so nothing is counted yet.
    expect(totals.weeksCounted).toBe(0);
    expect(totals.plannedKm).toBe(0);
    expect(totals.actualKm).toBe(0);
  });

  it('includes a week once it is behind us', () => {
    const rows = weeklyActuals([{ date: '2026-09-07', km: 12 }], '2026-09-16');
    const totals = blockTotals(rows);
    expect(totals.weeksCounted).toBe(1);
    expect(totals.actualKm).toBe(12);
    expect(totals.plannedKm).toBe(W1.targetKm);
    expect(totals.deltaKm).toBe(
      Math.round((12 - (W1.targetKm ?? 0)) * 10) / 10,
    );
  });
});
