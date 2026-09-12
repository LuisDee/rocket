/**
 * The description layer, composed over `planWeek`.
 *
 * The property these defend is that describing a week must not CHANGE it.
 * Placement is `planWeek`'s job and it does several things a from-scratch
 * generator got wrong, so the most valuable assertion here is the dull one: same
 * dates, same distances, same slots, in the same order.
 */

import { describe, expect, it } from 'vitest';

import { BLOCK_WEEKS, PRESCRIPTION, RACES } from '../../../config/training';
import { planWeek } from './placement';
import { describeWeek, longRunMpKm, thresholdKmFor } from './prescribe';

const blockWeek = (n: number) => {
  const w = BLOCK_WEEKS.find((x) => x.week === n);
  if (!w) throw new Error(`no week ${String(n)}`);
  return w;
};
const described = (n: number) => {
  const w = blockWeek(n);
  return describeWeek(w, planWeek(w).sessions);
};

describe('describing does not re-place', () => {
  it('returns exactly the sessions planWeek placed, unchanged', () => {
    // The whole architecture in one test. If describing ever moves a session or
    // changes a distance, two planners exist again and they will disagree.
    for (const w of BLOCK_WEEKS) {
      const placed = planWeek(w).sessions;
      const out = describeWeek(w, placed);
      expect(out).toHaveLength(placed.length);
      expect(out.map((s) => s.date)).toEqual(placed.map((s) => s.date));
      expect(out.map((s) => s.km)).toEqual(placed.map((s) => s.km));
      expect(out.map((s) => s.slot)).toEqual(placed.map((s) => s.slot));
    }
  });

  it('keeps the doubles planWeek produced', () => {
    // Race week splits Tuesday and Wednesday across two slots because the
    // evening caps at 14 km. Doubles were never missing from the system -- an
    // earlier generator of mine simply did not use them.
    const out = described(7);
    const perDate = new Map<string, number>();
    for (const s of out) perDate.set(s.date, (perDate.get(s.date) ?? 0) + 1);
    expect([...perDate.values()].filter((n) => n > 1).length).toBeGreaterThan(
      0,
    );
  });

  it('gives every running session something to actually do', () => {
    for (const w of BLOCK_WEEKS) {
      for (const s of describeWeek(w, planWeek(w).sessions)) {
        expect(s.what.length).toBeGreaterThan(0);
        if (s.km > 0) expect(s.zone).not.toBe('rest');
      }
    }
  });
});

describe('quality budget', () => {
  it('spends nothing on threshold in a week carrying a race', () => {
    // REGRESSION. Week 5 first came out with a 10K race AND a tempo, the exact
    // pairing the research said not to run.
    for (const n of [4, 5, 7]) {
      expect(described(n).reduce((a, s) => a + s.thresholdKm, 0)).toBe(0);
    }
  });

  it('gives 6 km of threshold to the 60 km week and 6.5 to the 80 km one', () => {
    // Literals rather than `PRESCRIPTION.thresholdMaxKm`, because computing the
    // expectation from the config makes both sides move together -- an earlier
    // version of this test passed happily with the ceiling raised to 99.
    expect(described(2).reduce((a, s) => a + s.thresholdKm, 0)).toBe(6);
    expect(described(3).reduce((a, s) => a + s.thresholdKm, 0)).toBe(6.5);
    for (const w of BLOCK_WEEKS) {
      const t = describeWeek(w, planWeek(w).sessions).reduce(
        (a, s) => a + s.thresholdKm,
        0,
      );
      expect(t).toBeLessThanOrEqual(6.5);
    }
  });

  it('zeroes the budget for a race week regardless of phase', () => {
    const w = blockWeek(3); // a build week, which normally carries threshold
    expect(thresholdKmFor(w, false)).toBeGreaterThan(0);
    expect(thresholdKmFor(w, true)).toBe(0);
  });

  it('puts marathon-pace work inside the long run, growing through the block', () => {
    expect(longRunMpKm(blockWeek(2))).toBeLessThan(longRunMpKm(blockWeek(3)));
    expect(longRunMpKm(blockWeek(1))).toBe(0);
    // And it is a fraction of the long run, not of the week.
    const w3 = blockWeek(3);
    expect(longRunMpKm(w3)).toBeLessThan(w3.longRunKm ?? 0);
  });
});

describe('races', () => {
  it('names every live race and none of the dropped ones', () => {
    const placed = BLOCK_WEEKS.flatMap((w) =>
      describeWeek(w, planWeek(w).sessions).flatMap((s) =>
        s.race ? [s.race] : [],
      ),
    );
    for (const r of RACES) {
      if (r.role === 'dropped') expect(placed).not.toContain(r.name);
      else expect(placed).toContain(r.name);
    }
  });

  it('tells him NOT to race Lincoln, which peak week depends on', () => {
    const lincoln = described(4).find(
      (s) => s.race === 'Lincoln Half Marathon',
    );
    expect(lincoln?.what).toContain('NOT RACED');
    expect(lincoln?.what).toContain('MARATHON PACE');
  });
});

describe('strength placement', () => {
  it('puts legs on the longest session of the week, never an easy day', () => {
    for (const w of BLOCK_WEEKS) {
      const out = describeWeek(w, planWeek(w).sessions);
      const legs = out.find((s) => s.strength === 'legs');
      if (!legs) continue;
      const longest = out.reduce((a, b) => (b.km > a.km ? b : a));
      expect(legs.date).toBe(longest.date);
    }
  });

  it('lifts three times a week through week 5, then twice', () => {
    for (const n of [1, 2, 3, 4, 5]) {
      const lifts = new Set(
        described(n).flatMap((s) => (s.strength ? [s.strength] : [])),
      );
      expect(lifts.size).toBe(3);
    }
    for (const n of [6, 7]) {
      const lifts = new Set(
        described(n).flatMap((s) => (s.strength ? [s.strength] : [])),
      );
      expect(lifts.size).toBe(2);
      expect(lifts.has('legs')).toBe(false);
    }
  });
});

describe('strides', () => {
  it('puts strides on easy days and nowhere else', () => {
    for (const w of BLOCK_WEEKS) {
      for (const s of describeWeek(w, planWeek(w).sessions)) {
        if (s.strides > 0) expect(s.zone).toBe('easy');
        if (s.zone === 'rest') expect(s.strides).toBe(0);
      }
    }
  });

  it('uses the configured count rather than a literal', () => {
    const withStrides = described(2).find((s) => s.strides > 0);
    expect(withStrides?.strides).toBe(PRESCRIPTION.strides.count);
  });
});
