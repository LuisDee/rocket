import { describe, expect, it } from 'vitest';

import {
  cropDelta,
  DISTANCE_ANOMALY_KM,
  notableFindings,
  type CropSummary,
} from './crop';

/** A normal run: two stops at traffic lights, distance essentially unchanged. */
const normalCrop: CropSummary = {
  elapsedSecondsBefore: 3_600,
  elapsedSecondsAfter: 3_450,
  movingSecondsBefore: 3_450,
  movingSecondsAfter: 3_450,
  distanceKmBefore: 10.02,
  distanceKmAfter: 10.02,
  pausesRemoved: [
    { startOffsetS: 900, durationS: 90 },
    { startOffsetS: 2_400, durationS: 60 },
  ],
  cropApplied: true,
};

describe('cropDelta', () => {
  it('reports the elapsed time removed, which is the point of cropping', () => {
    expect(cropDelta(normalCrop).elapsedSecondsRemoved).toBe(150);
  });

  it('leaves moving time untouched on a clean crop', () => {
    expect(cropDelta(normalCrop).movingSecondsRemoved).toBe(0);
  });

  it('totals the removed pauses and counts them', () => {
    const d = cropDelta(normalCrop);
    expect(d.pauseCount).toBe(2);
    expect(d.pauseSecondsTotal).toBe(150);
  });

  it('does not flag a distance anomaly when distance held', () => {
    expect(cropDelta(normalCrop).distanceAnomaly).toBe(false);
  });

  it('accepts pause accounting that matches the elapsed drop', () => {
    expect(cropDelta(normalCrop).pauseAccountingMismatch).toBe(false);
  });

  it('flags a distance change beyond the threshold as an anomaly', () => {
    // A crop removes time, not distance. Losing 300 m means the cropper took
    // out something the watch recorded as movement -- the case worth stopping
    // for, and the reason this field exists.
    const ateDistance = {
      ...normalCrop,
      distanceKmAfter: normalCrop.distanceKmBefore - 0.3,
    };
    const d = cropDelta(ateDistance);
    expect(d.distanceAnomaly).toBe(true);
    expect(d.distanceKmChanged).toBeCloseTo(-0.3, 5);
  });

  it('tolerates float noise just under the threshold', () => {
    const noise = {
      ...normalCrop,
      distanceKmAfter:
        normalCrop.distanceKmBefore - (DISTANCE_ANOMALY_KM - 0.001),
    };
    expect(cropDelta(noise).distanceAnomaly).toBe(false);
  });

  it('flags time that the listed pauses do not account for', () => {
    // 150 s vanished but only one 60 s pause is reported: the list is not the
    // whole story and the screen must not present it as though it were.
    const unexplained = {
      ...normalCrop,
      pausesRemoved: [{ startOffsetS: 900, durationS: 60 }],
    };
    expect(cropDelta(unexplained).pauseAccountingMismatch).toBe(true);
  });

  it('never flags an accounting mismatch when no crop was applied', () => {
    const untouched: CropSummary = {
      ...normalCrop,
      elapsedSecondsAfter: normalCrop.elapsedSecondsBefore,
      pausesRemoved: [],
      cropApplied: false,
    };
    const d = cropDelta(untouched);
    expect(d.pauseAccountingMismatch).toBe(false);
    expect(d.elapsedSecondsRemoved).toBe(0);
    expect(d.pauseCount).toBe(0);
  });
});

describe('notableFindings', () => {
  it('drops info findings so a real one is not buried', () => {
    const out = notableFindings({
      findings: [
        { check: 'structural', severity: 'info' },
        { check: 'elevation', severity: 'high', detail: 'drift 40 m' },
      ],
    });
    expect(out.map((f) => f.check)).toEqual(['elevation']);
  });

  it('orders worst first', () => {
    const out = notableFindings({
      findings: [
        { check: 'a', severity: 'low' },
        { check: 'b', severity: 'critical' },
        { check: 'c', severity: 'medium' },
      ],
    });
    expect(out.map((f) => f.severity)).toEqual(['critical', 'medium', 'low']);
  });

  it('handles a missing report without throwing', () => {
    expect(notableFindings(null)).toEqual([]);
    expect(notableFindings(undefined)).toEqual([]);
    expect(notableFindings({})).toEqual([]);
  });
});
