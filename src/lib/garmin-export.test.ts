/**
 * Every fixture here is a VERBATIM record from the 2026-09-08 GDPR export, not
 * a hand-written one. The point of the module is unit conversion, and a fixture
 * invented to match the implementation would agree with any factor it was given
 * -- including the wrong one.
 *
 * The expected values are derived independently: 10 km in 49:13.5 is 3.386 m/s
 * by arithmetic, so an `avgSpeed` of 0.3386 must be multiplied by ten, and no
 * appeal to the code establishes that.
 */

import { describe, expect, test } from 'vitest';

import {
  parseExport,
  toActivityRow,
  toActivityRows,
  type ExportActivity,
} from './garmin-export';

/** Treadmill run, 2026-09-05: 10.00 km in 49:13.5. No GPS, so no elevation. */
const TREADMILL: ExportActivity = {
  activityId: 24251846565,
  name: 'Treadmill Running',
  activityType: 'treadmill_running',
  startTimeLocal: 1788641685000,
  startTimeGmt: 1788638085000,
  timeZoneId: 159,
  distance: 1000000.0,
  duration: 2953511.962890625,
  elapsedDuration: 2953511.962890625,
  movingDuration: 2856871.9787597656,
  avgSpeed: 0.3385999917984009,
  maxSpeed: 0.345199990272522,
  avgHr: 141.0,
  maxHr: 181.0,
  elevationGain: null,
  elevationLoss: null,
  minElevation: null,
  maxElevation: null,
  elevationCorrected: false,
  steps: 7316.0,
  avgDoubleCadence: 148.640625,
  maxDoubleCadence: 170.0,
  avgGroundContactTime: 298.20001220703125,
  avgVerticalOscillation: 9.180000305175781,
  avgStrideLength: 102.6199951171875,
  avgVerticalRatio: 9.010000228881836,
  avgPower: 300.0,
  maxPower: 430.0,
  normPower: 317.0,
  activityTrainingLoad: 128.48760986328125,
  aerobicTrainingEffect: 3.5,
  anaerobicTrainingEffect: 2.0,
  trainingEffectLabel: 'LACTATE_THRESHOLD',
  calories: 2543.3421399999997,
  lapCount: 8,
  deviceId: 3613943939,
  manufacturer: 'GARMIN',
};

/** High Peak hike, 2026-09-05: the only fixture here carrying elevation. */
const HIKE: ExportActivity = {
  activityId: 24245302199,
  name: 'High Peak Hiking',
  activityType: 'hiking',
  startTimeLocal: 1788598212000,
  distance: 609162.98828125,
  duration: 7512540.0390625,
  avgSpeed: 0.08109999895095826,
  elevationGain: 24100.0,
  elevationLoss: 33800.0,
  minElevation: 20380.00030517578,
  maxElevation: 42860.00061035156,
  activityTrainingLoad: 15.85369873046875,
};

/**
 * The treadmill fixture with one key REMOVED, not set to undefined. The export
 * omits fields it has no value for, and `exactOptionalPropertyTypes` makes the
 * distinction real rather than cosmetic -- a fixture that sets the key to
 * undefined would not compile, and would not be what the file looks like.
 */
function without(key: keyof ExportActivity): ExportActivity {
  const copy: Record<string, unknown> = { ...TREADMILL };
  delete copy[key];
  return copy as ExportActivity;
}

describe('unit conversion', () => {
  test('distance in centimetres becomes 10.00 km, not 10000 km', () => {
    expect(toActivityRow(TREADMILL)?.distanceM).toBe(10000);
  });

  test('duration in milliseconds becomes 49 minutes, not 49000', () => {
    const seconds = toActivityRow(TREADMILL)?.durationS ?? 0;
    expect(seconds).toBeCloseTo(2953.512, 3);
    expect(Math.round(seconds / 60)).toBe(49);
  });

  test('average speed is scaled by ten to give 3.386 m/s', () => {
    // Independently: 10000 m / 2953.512 s = 3.3859 m/s. The stored 0.3386
    // would be a 49-minute kilometre if it were read as m/s.
    expect(toActivityRow(TREADMILL)?.averageSpeed).toBeCloseTo(3.386, 3);
  });

  test('converted distance and duration agree with the converted speed', () => {
    // The cross-check that catches any of the three factors drifting: it fails
    // unless distance, duration and speed are mutually consistent.
    //
    // Compared as a RELATIVE error, because the two disagree in the fourth
    // decimal (3.38580 derived against 3.38600 stored) and that gap is Garmin
    // rounding its own average, not a conversion fault. 0.1 % is loose enough
    // to ignore the rounding and four orders of magnitude tighter than the
    // smallest mistake the test exists to catch, which is a factor of ten.
    const row = toActivityRow(TREADMILL);
    const derived = (row?.distanceM ?? 0) / (row?.durationS ?? 1);
    const stored = row?.averageSpeed ?? 0;
    expect(Math.abs(derived - stored) / stored).toBeLessThan(0.001);
  });

  test('pace derived from the row is 4:55 per kilometre', () => {
    const row = toActivityRow(TREADMILL);
    const secondsPerKm = (row?.durationS ?? 0) / ((row?.distanceM ?? 0) / 1000);
    expect(Math.floor(secondsPerKm / 60)).toBe(4);
    expect(Math.round(secondsPerKm % 60)).toBe(55);
  });

  test('elevation in centimetres becomes 241 m of gain, not 24100 m', () => {
    const row = toActivityRow(HIKE);
    expect(row?.elevationGainM).toBeCloseTo(241, 6);
    expect(row?.elevationLossM).toBeCloseTo(338, 6);
    // Peak District, so a few hundred metres above sea level -- not 20 km up.
    expect(row?.minElevationM).toBeCloseTo(203.8, 1);
    expect(row?.maxElevationM).toBeCloseTo(428.6, 1);
  });

  test('cadence is the both-legs figure, not the per-leg one', () => {
    // 74 spm is the per-leg reading and is a plausible-looking wrong answer,
    // which is exactly why this asserts the value rather than a range.
    expect(toActivityRow(TREADMILL)?.averageRunningCadence).toBeCloseTo(
      148.64,
      2,
    );
    expect(toActivityRow(TREADMILL)?.maxRunningCadence).toBe(170);
  });
});

describe('identity and placement', () => {
  test('id is prefixed so a second source cannot collide on the key', () => {
    const row = toActivityRow(TREADMILL);
    expect(row?.id).toBe('garmin:24251846565');
    expect(row?.garminActivityId).toBe('24251846565');
    expect(row?.source).toBe('garmin');
  });

  test('local date comes from local time, so a 20:54 run stays on its own day', () => {
    // startTimeLocal is 2026-09-05 20:54 local. Read as UTC and shifted it
    // would land on the 5th anyway; the run that would move is a late-evening
    // one in a positive offset, which is why the field is used unshifted.
    expect(toActivityRow(TREADMILL)?.localDate).toBe('2026-09-05');
  });

  test('an activity with no id cannot be placed and is dropped', () => {
    expect(toActivityRow(without('activityId'))).toBeNull();
  });

  test('an activity with no local start is dropped rather than dated today', () => {
    expect(toActivityRow({ ...TREADMILL, startTimeLocal: null })).toBeNull();
  });

  test('two activities on one day are ordered by time, not left as found', () => {
    // Both fixtures fall on 2026-09-05: the hike starts 08:50, the treadmill
    // run 20:54. Sorting on the date string alone ties them and preserves input
    // order, which put the evening run first. Two-a-day is normal here
    // (2026-08-02 is an 18 km morning and an 11 km lunchtime), so the tie is
    // the common case rather than an edge one.
    const rows = toActivityRows([TREADMILL, without('activityId'), HIKE]);
    expect(rows.map((r) => r.garminActivityId)).toEqual([
      '24245302199',
      '24251846565',
    ]);
    expect(rows.map((r) => r.localDate)).toEqual(['2026-09-05', '2026-09-05']);
  });
});

describe('load and absent fields', () => {
  test("Garmin's own per-activity load is carried through unchanged", () => {
    // The primary input to CTL/ATL. Unscaled deliberately: it is already a
    // per-activity figure, unlike dailyTrainingLoadAcute which accumulates a
    // week and must never be mixed into the same series.
    expect(toActivityRow(TREADMILL)?.activityTrainingLoad).toBeCloseTo(
      128.4876,
      4,
    );
    expect(toActivityRow(TREADMILL)?.aerobicTrainingEffect).toBe(3.5);
    expect(toActivityRow(TREADMILL)?.trainingEffectLabel).toBe(
      'LACTATE_THRESHOLD',
    );
  });

  test('a treadmill run keeps null elevation rather than gaining a zero', () => {
    // Zero metres climbed and no altimeter reading are different facts, and
    // averaging a fabricated zero into elevation stats would understate hills.
    const row = toActivityRow(TREADMILL);
    expect(row?.elevationGainM).toBeNull();
    expect(row?.maxElevationM).toBeNull();
  });

  test('the whole upstream record is kept, since the export link expires', () => {
    expect(toActivityRow(TREADMILL)?.raw).toEqual(TREADMILL);
  });

  test('device id becomes text so a big integer keeps its digits', () => {
    expect(toActivityRow(TREADMILL)?.deviceId).toBe('3613943939');
  });
});

describe('parsing the export envelope', () => {
  test('activities are read out of the single-key wrapper', () => {
    const parsed = parseExport([{ summarizedActivitiesExport: [TREADMILL] }]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.activityId).toBe(24251846565);
  });

  test('a wrong shape throws instead of backfilling nothing quietly', () => {
    // The failure this guards: an empty backfill leaves LOAD.seed in place and
    // nothing on screen says the history never arrived.
    expect(() => parseExport([])).toThrow(/non-empty array/);
    expect(() => parseExport({})).toThrow(/non-empty array/);
    expect(() => parseExport([{ wrongKey: [] }])).toThrow(
      /summarizedActivitiesExport/,
    );
    expect(() => parseExport([null])).toThrow(/expected an object/);
  });
});
