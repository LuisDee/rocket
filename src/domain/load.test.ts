/**
 * The load engine. Two things are being defended here, and neither is the
 * arithmetic of an exponential average.
 *
 * 1. The COLD START, and that it is only safe because a long series now backs
 *    it. A 42-day average starting at zero climbs for six weeks purely because
 *    its window is filling, so a block being established reads as a block
 *    collapsing. Until 2026-09-08 that was suppressed by seeding from Garmin's
 *    chronic/acute pair -- which was seven times too large, because Garmin
 *    accumulates a week where this runs on daily load. The defence is now the
 *    165-day backfill plus `warmingUp`, which says outright when the window is
 *    too short to trust.
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

  it('decays toward zero on a rest week, ATL faster than CTL', () => {
    // Sixty days of steady training, then seven days off. This is the shape the
    // real series has after the 2026-08-24 holiday, and the property that makes
    // TSB readable: both averages fall, the 7-day one falls faster, so freshness
    // rises. A sign error or a swapped time constant inverts it.
    const trained = Array.from({ length: 60 }, (_, i) => ({
      date: shiftIso(SEED.asOf, i + 1),
      load: 150,
      basis: 'garmin' as const,
    }));
    const lastTrainingDay = shiftIso(SEED.asOf, 60);
    const before = rollingLoad(trained, lastTrainingDay);
    const after = rollingLoad(trained, shiftIso(lastTrainingDay, 7));

    expect(after.ctl).toBeLessThan(before.ctl);
    expect(after.atl).toBeLessThan(before.atl);
    // ATL sheds far more of itself in a week than CTL does.
    expect(before.atl - after.atl).toBeGreaterThan(before.ctl - after.ctl);
    expect(after.tsb).toBeGreaterThan(before.tsb);
    expect(after.tsb).toBeGreaterThan(0);
  });

  it('starts from zero, so an empty series never invents a fitness level', () => {
    // The regression for the unit error fixed on 2026-09-08: the seed used to
    // be Garmin's `dailyTrainingLoadChronic` (287), a WEEKLY accumulation fed
    // into a DAILY average, which reported CTL 273.7 against a true 52.2. A
    // non-zero seed here would mean someone had reintroduced a borrowed level.
    expect(SEED.ctl).toBe(0);
    expect(SEED.atl).toBe(0);
    const state = rollingLoad([], shiftIso(SEED.asOf, 7));
    expect(state.ctl).toBe(0);
    expect(state.atl).toBe(0);
    expect(state.tsb).toBe(0);
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
    expect(state.caveat).toContain(SEED.asOf);
    // It must describe a window that is too short, NOT a borrowed level. The
    // old wording named "Garmin's own chronic/acute pair", which stopped being
    // true when the seed went to zero and would have been a caveat that lied.
    expect(state.caveat).not.toContain('Garmin');
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
