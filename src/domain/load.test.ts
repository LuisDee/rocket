/**
 * The load engine. Two things are being defended here, and neither is the
 * arithmetic of an exponential average.
 *
 * 1. The WARM START. Without it a 42-day average starting at zero climbs for
 *    six weeks purely because its window is filling, so a block being
 *    established reads as a block collapsing. The regression test for that is
 *    the "no history" case: CTL must equal the seed, not drift toward zero.
 * 2. The COVERAGE WINDOW travelling with the number (REDLINES.md rule 7). A
 *    trailing figure without the span it covers is wrong without looking wrong.
 */

import { describe, expect, it } from 'vitest';

import { LOAD } from '../../config/training';
import { dailyStress, rollingLoad, type ScorableActivity } from './load';
import { shiftIso } from './planner/dates';

const SEED = LOAD.seed;

function activity(over: Partial<ScorableActivity>): ScorableActivity {
  return {
    localDate: SEED.asOf,
    durationS: 3600,
    rpe: null,
    trainingLoad: null,
    ...over,
  };
}

describe('dailyStress', () => {
  it("prefers the source's own training load over the RPE floor", () => {
    const [day] = dailyStress([
      activity({ localDate: '2026-09-07', trainingLoad: 120, rpe: 5 }),
    ]);
    expect(day?.load).toBe(120);
    expect(day?.basis).toBe('garmin');
  });

  it('falls back to Foster session-RPE, which a manual log always supplies', () => {
    // RPE 6 x 60 minutes = 360 AU. The floor is what keeps the load engine
    // working through an integration outage (spec invariant 2).
    const [day] = dailyStress([
      activity({ localDate: '2026-09-07', durationS: 3600, rpe: 6 }),
    ]);
    expect(day?.load).toBe(360);
    expect(day?.basis).toBe('rpe');
  });

  it('sums two activities on the same day into one figure', () => {
    const [day] = dailyStress([
      activity({ localDate: '2026-09-07', trainingLoad: 100 }),
      activity({ localDate: '2026-09-07', trainingLoad: 40 }),
    ]);
    expect(day?.load).toBe(140);
  });

  it('marks a day as RPE-based when any part of it used the floor', () => {
    const [day] = dailyStress([
      activity({ localDate: '2026-09-07', trainingLoad: 100 }),
      activity({ localDate: '2026-09-07', rpe: 4, durationS: 1800 }),
    ]);
    // A day mixing units has to say so: it is the discontinuity that would
    // otherwise be invisible in the series.
    expect(day?.basis).toBe('rpe');
  });

  it('scores nothing for an activity with neither a load nor an RPE', () => {
    // A run we know happened but cannot score must not be recorded as a
    // zero-effort day -- that is a lie the EWMA would carry for six weeks.
    expect(
      dailyStress([activity({ localDate: '2026-09-07', durationS: 3600 })]),
    ).toEqual([]);
  });
});

describe('rollingLoad', () => {
  it('is the seed exactly when no days have passed since it was read', () => {
    const state = rollingLoad([], SEED.asOf);
    expect(state.ctl).toBe(SEED.ctl);
    expect(state.atl).toBe(SEED.atl);
    expect(state.coverage.days).toBe(0);
  });

  it('decays from the seed rather than climbing from zero on a rest week', () => {
    const state = rollingLoad([], shiftIso(SEED.asOf, 7));
    // The failure this exists to catch: an unseeded EWMA would be RISING here.
    expect(state.ctl).toBeLessThan(SEED.ctl);
    expect(state.ctl).toBeGreaterThan(SEED.ctl * 0.8);
    expect(state.atl).toBeLessThan(state.ctl);
  });

  it('drives ATL harder than CTL for the same load, which is what TSB reads', () => {
    const today = shiftIso(SEED.asOf, 7);
    const heavy = Array.from({ length: 7 }, (_, i) => ({
      date: shiftIso(SEED.asOf, i + 1),
      load: 600,
      basis: 'garmin' as const,
    }));
    const state = rollingLoad(heavy, today);
    expect(state.atl).toBeGreaterThan(state.ctl);
    expect(state.tsb).toBeLessThan(0);
    expect(state.tsb).toBeCloseTo(state.ctl - state.atl, 1);
  });

  it('returns the window it covers, not just the number', () => {
    const today = shiftIso(SEED.asOf, 10);
    const state = rollingLoad(
      [{ date: shiftIso(SEED.asOf, 3), load: 200, basis: 'garmin' }],
      today,
    );
    expect(state.coverage).toEqual({
      from: shiftIso(SEED.asOf, 1),
      to: today,
      days: 10,
      daysWithLoad: 1,
      daysOnRpeFloor: 0,
    });
  });

  it('counts the days that leaned on the RPE floor, so a mixed series says so', () => {
    const state = rollingLoad(
      [
        { date: shiftIso(SEED.asOf, 1), load: 200, basis: 'garmin' },
        { date: shiftIso(SEED.asOf, 2), load: 300, basis: 'rpe' },
      ],
      shiftIso(SEED.asOf, 3),
    );
    expect(state.coverage.daysOnRpeFloor).toBe(1);
  });

  it('states its own insufficiency below one CTL time constant', () => {
    const state = rollingLoad([], shiftIso(SEED.asOf, LOAD.ctlWarmUpDays - 1));
    expect(state.warmingUp).toBe(true);
    // REDLINES.md rule 4: the caveat has to name the days it has and where the
    // rest came from, in the payload, where a caller cannot silently drop it.
    expect(state.caveat).toContain(String(LOAD.ctlWarmUpDays));
    expect(state.caveat).toContain(String(SEED.ctl));
    expect(state.caveat).toContain(SEED.asOf);
  });

  it('stops caveating once a full time constant of our own history exists', () => {
    const state = rollingLoad([], shiftIso(SEED.asOf, LOAD.ctlWarmUpDays));
    expect(state.warmingUp).toBe(false);
    expect(state.caveat).toBeNull();
  });

  it('ignores a day outside the window rather than folding it in', () => {
    const before = rollingLoad([], shiftIso(SEED.asOf, 5));
    const withStrayDay = rollingLoad(
      [{ date: shiftIso(SEED.asOf, 40), load: 900, basis: 'garmin' }],
      shiftIso(SEED.asOf, 5),
    );
    expect(withStrayDay.ctl).toBe(before.ctl);
  });
});
