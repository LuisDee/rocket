/**
 * The pace layer.
 *
 * The assertions that matter here are the ones that would let a wrong pace
 * reach a session Luis actually runs. Chief among them: Garmin's threshold pace
 * of 4:20.9/km must never become a prescription, because a weekly 30-minute
 * "tempo" at that pace is a 10 km race effort stacked on a volume ramp he has
 * never attempted.
 */

import { describe, expect, it } from 'vitest';

import {
  ATHLETE,
  HR_ZONES,
  PACE_ANCHOR,
  PACE_MULTIPLIERS,
  RIEGEL,
} from '../../config/training';
import { formatPace } from '../lib/block';
import {
  anchorRejection,
  derivePaces,
  marathonProjection,
  normalisedPaceSecPerKm,
  pctOfMax,
  riegel,
  thresholdVerdict,
  type Effort,
} from './paces';

/** His best genuine continuous half: 21.14 km in 1:46:35, 47 s stopped. */
const JULY_HALF: Effort = {
  date: '2026-07-19',
  distanceKm: 21.14,
  timeSec: 6395,
  stoppedSec: 47,
};

/** Battersea Park Half, 2026-09-12. The anchor. 1:38:58, five seconds stopped. */
const BATTERSEA: Effort = {
  date: '2026-09-12',
  distanceKm: 21.275,
  timeSec: 5938,
  stoppedSec: 5,
};

describe('the derived paces', () => {
  it('puts threshold at 4:29/km, re-anchored on the Battersea Half', () => {
    // Was 4:52 off the July anchor. The 2026-09-12 race moved the anchor 23.5
    // s/km and every zone with it.
    //
    // Note what this does to the Garmin argument. Garmin's 4:20.9 is now 8 s/km
    // from the derived figure rather than 31, and he ran the last 3 km of the
    // race at 4:19-4:20. The reasoning that rejected it was sound on July data
    // -- it really was slower than his 5 km race pace at the time -- but the
    // conclusion was stated far too strongly. Keeping the field out of ATHLETE
    // is still right, because a device pace should not drive a prescription;
    // claiming it was "the most likely way to injure him" was not.
    const t = derivePaces().threshold;
    expect(formatPace((t.fastSecPerKm + t.slowSecPerKm) / 2)).toBe('4:29');
  });

  it('puts marathon pace at 5:03/km with a heart-rate ceiling of 170', () => {
    const m = derivePaces().marathon;
    expect(formatPace((m.fastSecPerKm + m.slowSecPerKm) / 2)).toBe('5:03');
    expect(m.hr.high).toBe(HR_ZONES.marathonCeiling);
  });

  it('bands easy at 5:46-6:19 and lets heart rate govern it', () => {
    const e = derivePaces().easy;
    expect(formatPace(e.fastSecPerKm)).toBe('5:46');
    expect(formatPace(e.slowSecPerKm)).toBe('6:19');
    // The band is an expected output, not a target: it should get faster across
    // the block at the same heart rate, and that fall is the adaptation signal.
    expect(e.hrGoverns).toBe(true);
    expect(e.hr.high).toBe(HR_ZONES.easyCeiling);
  });

  it('keeps every zone slower than the one above it', () => {
    // A band ordering fault would be invisible in any single-zone assertion and
    // would quietly prescribe threshold work as an easy run.
    const p = derivePaces();
    expect(p.threshold.slowSecPerKm).toBeLessThan(p.marathon.fastSecPerKm);
    expect(p.marathon.slowSecPerKm).toBeLessThan(p.easy.fastSecPerKm);
    expect(p.easy.slowSecPerKm).toBeLessThanOrEqual(p.recovery.slowSecPerKm);
  });

  it('repaces the whole block from one number when the anchor moves', () => {
    // The reason zones are multipliers. A 1:40 half is 284.4 s/km normalised.
    const faster = derivePaces((100 * 60 + 0) / 21.0975);
    expect(formatPace(faster.threshold.fastSecPerKm + 4)).toBe('4:34');
    expect(formatPace(faster.marathon.fastSecPerKm + 4)).toBe('5:09');
  });

  it('does not move the heart-rate bands when the pace anchor moves', () => {
    // HRmax and threshold HR are MEASURED. Re-deriving them from a race result
    // would let a good day inflate the ceilings that exist to contain a bad one.
    const slow = derivePaces(340);
    const fast = derivePaces(280);
    expect(slow.easy.hr.high).toBe(fast.easy.hr.high);
    expect(slow.threshold.hr).toEqual(fast.threshold.hr);
  });
});

describe('what may become the anchor', () => {
  it('accepts the July half, which is a real continuous effort', () => {
    expect(anchorRejection(JULY_HALF)).toBeNull();
  });

  it('rejects the faster-looking July 26 run, which stood still for 17 minutes', () => {
    // 1:44:44 on the timer against the anchor's 1:46:35, so it looks like a PR
    // and is a stop-start training run. Anchoring here would set every pace in
    // the block about 6 s/km too fast.
    const reason = anchorRejection({
      date: '2026-07-26',
      distanceKm: 21.1,
      timeSec: 6284,
      stoppedSec: 1047,
    });
    expect(reason).toContain('2026-07-26');
  });

  it('rejects any effort with more than two minutes stopped, by date or not', () => {
    const reason = anchorRejection({
      date: '2026-10-04',
      distanceKm: 21.1,
      timeSec: 6300,
      stoppedSec: 400,
    });
    expect(reason).toContain('stopped');
  });

  it('rejects a race slower than the floor, so a bad day cannot slow the block', () => {
    const reason = anchorRejection({
      date: '2026-09-12',
      distanceKm: 21.0975,
      timeSec: 7200,
      stoppedSec: 0,
    });
    expect(reason).not.toBeNull();
  });

  it('accepts Saturday at a plausible result', () => {
    expect(
      anchorRejection({
        date: '2026-09-12',
        distanceKm: 21.0975,
        timeSec: 6300,
        stoppedSec: 30,
      }),
    ).toBeNull();
  });
});

describe('normalising and predicting', () => {
  it('normalises the race distance to the half without changing pace much', () => {
    // The anchor is now the race itself, so normalising it must reproduce the
    // stored figure. 21.275 km measured against a 21.0975 km course is the
    // usual GPS overshoot, not a long course.
    const pace = normalisedPaceSecPerKm(BATTERSEA);
    expect(pace).toBeCloseTo(PACE_ANCHOR.normalisedPaceSecPerKm, 0);
  });

  it('projects a marathon far faster than the May one, off the new anchor', () => {
    // He ran 3:52:59 in May. Off the Battersea anchor, even at his OLD and
    // pessimistic fade exponent of 1.1315, the projection is 3:34:50 -- eighteen
    // minutes quicker without assuming any improvement in durability at all.
    const { floorSec } = marathonProjection();
    expect(floorSec).toBeLessThan(3 * 3600 + 40 * 60);
    expect(floorSec).toBeGreaterThan(3 * 3600 + 25 * 60);
  });

  it('shows the block’s claimed benefit as the gap between floor and target', () => {
    const { floorSec, targetSec } = marathonProjection();
    expect(targetSec).toBeLessThan(floorSec);
    // Roughly five minutes, and no trial supports it -- which is why both
    // numbers are surfaced rather than only the target.
    const gainMin = (floorSec - targetSec) / 60;
    expect(gainMin).toBeGreaterThan(3);
    expect(gainMin).toBeLessThan(8);
  });

  it('has a measured exponent worse than population, which is the problem', () => {
    // A HIGHER Riegel exponent means performance decays faster with distance.
    // His 1.1315 against a population 1.06 is exactly what a thin volume base
    // produces, and is what the block is trying to move.
    expect(RIEGEL.measured).toBeGreaterThan(RIEGEL.population);
    expect(RIEGEL.durabilityTarget).toBeLessThan(RIEGEL.measured);
  });

  it('is a pure power law, so doubling the distance scales by 2^k', () => {
    expect(riegel(3600, 10, 20, 1)).toBeCloseTo(7200, 6);
    expect(riegel(3600, 10, 20, 1.06)).toBeCloseTo(3600 * Math.pow(2, 1.06), 6);
  });
});

describe('the threshold self-correction', () => {
  it('calls the pace too fast when work intervals average above 180', () => {
    const v = thresholdVerdict(184);
    expect(v.tooFast).toBe(true);
    expect(v.adjustSecPerKm).toBe(5);
    // It must blame the pace, not the athlete: the derived number is three
    // formulas agreeing with each other and validated on nobody.
    expect(v.detail).toContain('pace being too fast');
  });

  it('holds the pace when the work-interval mean sits in the band', () => {
    expect(thresholdVerdict(175).tooFast).toBe(false);
    expect(thresholdVerdict(HR_ZONES.thresholdWorkMean[1]).tooFast).toBe(false);
  });

  it('does not fire on an instantaneous reading being high', () => {
    // The band is a MEAN of the work intervals. Read as a ceiling it aborts any
    // correctly-paced threshold session by the third repetition.
    expect(thresholdVerdict(178).tooFast).toBe(false);
  });
});

describe('the measured physiology it all rests on', () => {
  it('uses the recorded max of 201, not the profile 196 or the remembered 195', () => {
    expect(ATHLETE.hrMax).toBe(201);
  });

  it('puts threshold heart rate at 88% of max, where LT2 sits', () => {
    expect(pctOfMax(ATHLETE.lactateThresholdHr)).toBeGreaterThan(87);
    expect(pctOfMax(ATHLETE.lactateThresholdHr)).toBeLessThan(89);
  });

  it('sets the easy ceiling below 75% of max', () => {
    // The most load-bearing number in the block. Easy runs drifting upward is
    // the specific, likely and invisible way a 24 -> 100 km ramp fails.
    expect(pctOfMax(HR_ZONES.easyCeiling)).toBeLessThan(75);
  });

  it('never exposes a device-derived threshold pace', () => {
    // The regression guard for the whole module. Someone will eventually notice
    // Garmin publishes a threshold pace and helpfully wire it in.
    expect(Object.keys(ATHLETE)).not.toContain('lactateThresholdPace');
    expect(Object.values(PACE_MULTIPLIERS).flat()).not.toContain(261);
  });
});
