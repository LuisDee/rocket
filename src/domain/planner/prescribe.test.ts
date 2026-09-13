/**
 * The description layer, composed over `planWeek`.
 *
 * The property these defend is that describing a week must not CHANGE it.
 * Placement is `planWeek`'s job and it does several things a from-scratch
 * generator got wrong, so the most valuable assertion here is the dull one: same
 * dates, same distances, same slots, in the same order.
 */

import { describe, expect, it } from 'vitest';

import {
  AVAILABILITY,
  BLOCK_WEEKS,
  PRESCRIPTION,
  RACES,
} from '../../../config/training';
import { shiftIso } from './dates';
import { planWeek } from './placement';
import {
  describeWeek,
  longRunMpKm,
  placeStrength,
  thresholdKmFor,
} from './prescribe';

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
    // Doubles were never missing from the system -- an earlier generator of mine
    // simply did not use them. This used to read them off race week, which split
    // its Tuesday and Wednesday into 14 + 2 km; the run-in ceiling removed those
    // sessions, and rightly, so the condition is now created rather than found.
    //
    // Peak week minus one Tuesday: 67 km of easy volume over four days is
    // 16.75 a day, and the evening slot caps at 14. The day has to open a second
    // slot or the week cannot be run at all.
    const w = blockWeek(4);
    const unavailable = AVAILABILITY.runSlots.map((slot) => ({
      date: '2026-09-29',
      slotId: slot.id,
    }));
    const out = describeWeek(w, planWeek(w, { unavailable }).sessions);

    const perDate = new Map<string, number>();
    for (const s of out) perDate.set(s.date, (perDate.get(s.date) ?? 0) + 1);
    const doubled = [...perDate.entries()].filter(([, n]) => n > 1);

    expect(doubled.length).toBeGreaterThan(0);
    for (const [date] of doubled) {
      const sessions = out.filter((s) => s.date === date);
      expect(new Set(sessions.map((s) => s.slot)).size).toBe(sessions.length);
      for (const s of sessions) {
        const slot = AVAILABILITY.runSlots.find((x) => x.id === s.slot);
        expect(s.km).toBeLessThanOrEqual(slot?.maxKm ?? 0);
      }
    }
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
  it('never puts a barbell on a race day', () => {
    // THE REGRESSION. `placeStrength` picked the longest session by kilometres
    // with no notion of a race, so heavy squats landed on the maximal Battersea
    // Half (2026-09-12, the effort every pace in the block is anchored on), on
    // Lincoln day (2026-10-04, 33 km with 21.1 at marathon pace) and on the
    // raced 10K (2026-10-11). A competent coach refuses all three.
    for (const w of BLOCK_WEEKS) {
      for (const s of describeWeek(w, planWeek(w).sessions)) {
        if (s.race === null) continue;
        expect(s.strength).toBeNull();
      }
    }
  });

  it('leaves the day before a race clear of the gym too', () => {
    // Push was on 2026-09-10 and pull on 2026-09-11 -- the two days before the
    // half. Upper body is unconstrained against RUNNING, which is the argument
    // the config makes and it is right; it is not unconstrained against racing.
    const eves = new Set(
      RACES.filter((r) => r.role !== 'dropped').map((r) =>
        shiftIso(r.date, -1),
      ),
    );
    for (const w of BLOCK_WEEKS) {
      for (const s of describeWeek(w, planWeek(w).sessions)) {
        if (!eves.has(s.date)) continue;
        expect(s.strength).toBeNull();
      }
    }
  });

  it('puts legs on the hardest NON-race day, and only one that is already hard', () => {
    for (const w of BLOCK_WEEKS) {
      const out = describeWeek(w, planWeek(w).sessions);
      const legs = out.find((s) => s.strength === 'legs');
      if (!legs) continue;
      const hardest = out
        .filter((s) => s.race === null)
        .reduce((a, b) => (b.km > a.km ? b : a));
      expect(legs.date).toBe(hardest.date);
      expect(legs.km).toBeGreaterThanOrEqual(8);
    }
  });

  it('gives week 1 no leg session at all, because no day in it is hard', () => {
    // Its longest non-race session is a 2.3 km taper shakeout. Loading a barbell
    // beside that turns the easiest day of the block into the hardest, which is
    // the collapse STRENGTH's own prose warns about.
    expect(described(1).some((s) => s.strength === 'legs')).toBe(false);
    expect(
      Math.max(
        ...described(1)
          .filter((s) => s.race === null)
          .map((s) => s.km),
      ),
    ).toBeLessThan(8);
  });

  it('keeps legs in peak week even though the race carries the long session', () => {
    // The opposite failure to week 1: skipping legs in the 100 km week would drop
    // the injury protection exactly where the volume is highest.
    const legs = described(4).find((s) => s.strength === 'legs');
    expect(legs?.date).toBe('2026-09-29');
  });

  it('lifts three times a week in the build weeks and twice once legs is dropped', () => {
    for (const n of [2, 3, 4, 5]) {
      const lifts = described(n).flatMap((s) =>
        s.strength ? [s.strength] : [],
      );
      expect(lifts.length).toBe(3);
      expect(new Set(lifts).size).toBe(3);
    }
    for (const n of [1, 6]) {
      const lifts = described(n).flatMap((s) =>
        s.strength ? [s.strength] : [],
      );
      expect(lifts.length).toBe(2);
      expect(lifts).not.toContain('legs');
    }
  });

  it('gives race week one upper-body session on the Monday and nothing else', () => {
    // `raceWeekPolicy` was a prose string nothing could read, so the planner put
    // pull on 2026-10-22 -- two days before the marathon -- and another the day
    // AFTER it.
    const lifts = described(7).filter((s) => s.strength !== null);

    expect(lifts.map((s) => [s.date, s.strength])).toEqual([
      ['2026-10-19', 'push'],
    ]);
  });

  it('puts legs AFTER a mid-week race rather than two days before it', () => {
    // Every race in this block is on a weekend, where taking the earliest of the
    // equal-effort days happens to give the right answer. Move a race to a
    // Wednesday and it does not: Monday is two days out, and the honest choice is
    // the Thursday after. The rule exists for the calendar rather than for this
    // fixture list, so the race dates are injected.
    const week = blockWeek(3);
    const days = [
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
      '2026-09-24',
      '2026-09-25',
    ];
    const sessions = days.map((date) => ({
      date,
      km: 12,
      kind: 'easy' as const,
      slot: 'evening',
    }));

    // Wednesday race: Wednesday is blocked as the race and Tuesday as its eve,
    // leaving Monday, Thursday and Friday all at 12 km. Monday is two days out
    // and loses; Thursday and Friday are both past the race and tie, so date
    // order takes the earlier. Thursday is the answer, and Monday is the answer
    // the tie-break exists to refuse.
    const placed = placeStrength(week, sessions, ['2026-09-23']);

    expect([...placed.entries()].find(([, k]) => k === 'legs')?.[0]).toBe(
      '2026-09-24',
    );
    // And the race and its eve stay clear, while Monday -- two days out, which
    // `gymFreeDaysBeforeRace: 1` does not reach -- may still take upper body.
    expect(placed.get('2026-09-23')).toBeUndefined();
    expect(placed.get('2026-09-22')).toBeUndefined();
    expect(placed.get('2026-09-21')).toBe('push');
  });

  it('tells him what the lift actually is, not just its name', () => {
    // "Gym: legs" was the whole prescription. The heavy, low-rep instruction that
    // makes this match the evidence it cites never reached him, so the default is
    // the three-sets-of-twelve the config explicitly warns against.
    const legs = described(3).find((s) => s.strength === 'legs');
    expect(legs?.gym).toContain('3-5 sets x 3-6 reps');
    expect(legs?.gym).toContain('trap-bar deadlift');
    expect(legs?.gym).toContain('6 h after');

    const push = described(3).find((s) => s.strength === 'push');
    expect(push?.gym).toContain('overhead press');
    expect(push?.gym).toContain('5-8 reps');

    for (const s of described(3)) {
      if (s.strength === null) expect(s.gym).toBeNull();
      else expect((s.gym ?? '').length).toBeGreaterThan(20);
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
