import { describe, expect, it } from 'vitest';

import {
  BLOCK,
  BLOCK_WEEKS,
  GUARDRAILS,
  MEASURED_BASE,
  MULTIPLIERS,
  PACE_ESTIMATES,
  READINESS,
  SHOES,
} from './training';

/**
 * These tests guard the re-derived block against the guardrails it is supposed
 * to obey. Three week-over-week steps exceed the ramp cap; the point of the
 * first pair of tests is that those breaches stay declared and visible rather
 * than being quietly absorbed by a future edit to a weekly target -- or, worse,
 * by raising the cap.
 */

const pctRise = (from: number, to: number) => ((to - from) / from) * 100;

/** Weeks with a real km target, paired with the week before. */
const steps = BLOCK_WEEKS.flatMap((week, i) => {
  const previous = BLOCK_WEEKS[i - 1];
  if (previous === undefined) return [];
  if (week.targetKm === null || previous.targetKm === null) return [];
  return [{ week, previousKm: previous.targetKm }];
});

describe('block ramp rate', () => {
  it('declares an exemption on exactly the steps that exceed the ramp cap', () => {
    const overCap = steps
      .filter(
        ({ week, previousKm }) =>
          pctRise(previousKm, week.targetKm as number) > GUARDRAILS.rampCapPct,
      )
      .map((s) => s.week.week);

    expect(overCap).toEqual([2, 3, 4]);
    expect(
      steps
        .filter(({ week }) => overCap.includes(week.week))
        .every(({ week }) => week.rampExemption !== null),
    ).toBe(true);
  });

  it('carries no exemption that does not correspond to a real breach', () => {
    // The converse of the test above. Without it an exemption could outlive the
    // step that justified it, and read as licence the next time someone edits a
    // target upward.
    const exempted = BLOCK_WEEKS.filter((w) => w.rampExemption !== null).map(
      (w) => w.week,
    );
    expect(exempted).toEqual([2, 3, 4]);
  });

  it('measures the rebuild week against the pre-taper base, not the taper week', () => {
    const rebuild = BLOCK_WEEKS.find((w) => w.week === 2);
    expect(rebuild?.phase).toBe('rebuild');

    const rise = pctRise(
      MEASURED_BASE.preTaperBaselineKm,
      rebuild?.targetKm as number,
    );
    expect(rise).toBeLessThanOrEqual(GUARDRAILS.rampCapPct);
  });

  it('opens with a race taper that is not a valid ramp baseline', () => {
    const first = BLOCK_WEEKS[0];
    expect(first?.phase).toBe('race-taper');
    expect(first?.targetKm as number).toBeLessThan(
      MEASURED_BASE.preTaperBaselineKm,
    );
  });

  it('tapers monotonically once past peak', () => {
    const fromPeak = BLOCK_WEEKS.filter(
      (w) => w.week >= 5 && w.targetKm !== null,
    ).map((w) => w.targetKm as number);

    expect(
      fromPeak.every((km, i) => i === 0 || km < (fromPeak[i - 1] as number)),
    ).toBe(true);
  });

  it('protects the final weeks named by the taper guardrail', () => {
    const scheduled = BLOCK_WEEKS.filter((w) => w.phase !== 'race');
    const protectedWeeks = scheduled.slice(-GUARDRAILS.protectedTaperWeeks + 1);
    expect(protectedWeeks.every((w) => w.phase === 'taper')).toBe(true);
  });
});

describe('long runs', () => {
  const longRuns = BLOCK_WEEKS.filter((w) => w.longRunKm !== null).map(
    (w) => w.longRunKm as number,
  );

  it('fits only four long runs before the taper, which is the binding constraint', () => {
    expect(longRuns).toHaveLength(4);
  });

  it('builds to a peak then deliberately cuts back before the taper', () => {
    expect(longRuns).toEqual([22, 26, 32, 24]);
    const peak = Math.max(...longRuns);
    expect(longRuns.at(-1) as number).toBeLessThan(peak);
  });

  it('never asks for a long run beyond what is already in the legs by much', () => {
    // A 32 km peak against a 31.5 km run banked on 2026-08-09. Progression, not
    // a leap into unfamiliar distance.
    const peak = Math.max(...longRuns);
    expect(peak - MEASURED_BASE.longestRecentKm).toBeLessThanOrEqual(2);
  });

  it('puts every long run at or above the carbon threshold in carbons', () => {
    const peak = Math.max(...longRuns);
    expect(peak).toBeGreaterThanOrEqual(SHOES.carbonMinDistanceKm);
  });
});

describe('block dates', () => {
  it('starts on the Monday after the re-derivation', () => {
    expect(BLOCK.blockStart).toBe('2026-09-07');
    expect(new Date(`${BLOCK.blockStart}T00:00:00Z`).getUTCDay()).toBe(1);
  });

  it('runs the tune-up half before the goal marathon, in the same park', () => {
    expect(BLOCK.tuneUpRaceDate < BLOCK.goalRaceDate).toBe(true);
    expect(BLOCK.tuneUpRace).toContain('Battersea');
    expect(BLOCK.goalRace).toContain('Battersea');
  });
});

describe('pace estimates', () => {
  it('keeps the athlete realistic slower than his aspiration', () => {
    expect(PACE_ESTIMATES.athleteHalfRealisticSeconds).toBeGreaterThan(
      PACE_ESTIMATES.athleteHalfAspirationSeconds,
    );
  });

  it('treats Garmin as more optimistic than the athlete, which is why it is provisional', () => {
    expect(PACE_ESTIMATES.garminPredictionSeconds.half).toBeLessThan(
      PACE_ESTIMATES.athleteHalfAspirationSeconds,
    );
  });

  it('brackets the athlete-derived marathon projection inside the planning band', () => {
    const projected =
      PACE_ESTIMATES.athleteHalfRealisticSeconds *
      PACE_ESTIMATES.halfToMarathonRatio;
    expect(projected).toBeGreaterThanOrEqual(
      PACE_ESTIMATES.planningBandSeconds.fast,
    );
    expect(projected).toBeLessThanOrEqual(
      PACE_ESTIMATES.planningBandSeconds.slow,
    );
  });
});

describe('shoe inventory', () => {
  it('has a non-carbon road trainer for everyday mileage', () => {
    const daily = SHOES.inventory.find((s) => s.id === 'daily-trainer');
    expect(daily?.carbon).toBe(false);
    expect(daily?.surface).toBe('road');
  });

  it('flags the daily trainer as new, so novelty load is charged to it', () => {
    // A new shoe during a volume ramp is two novel stressors at once. The
    // 2026-08-09 run that wrecked him stacked three.
    const daily = SHOES.inventory.find((s) => s.id === 'daily-trainer');
    expect(daily?.isNew).toBe(true);
    expect(MULTIPLIERS.shoeNovelty[0]).toBeGreaterThan(1);
  });

  it('keeps trail shoes off the road and carbons for races', () => {
    const trail = SHOES.inventory.find((s) => s.id === 'peregrine-16');
    expect(trail?.surface).toBe('trail');
    const carbons = SHOES.inventory.find((s) => s.id === 'carbons');
    expect(carbons?.carbon).toBe(true);
  });
});

describe('readiness weights', () => {
  it('has subjective weights summing to one, so a missing term is visible', () => {
    const total = Object.values(READINESS.subjectiveWeights).reduce(
      (a, b) => a + b,
      0,
    );
    expect(total).toBeCloseTo(1, 10);
  });

  it('has objective weights summing to one', () => {
    const total = Object.values(READINESS.objectiveWeights).reduce(
      (a, b) => a + b,
      0,
    );
    expect(total).toBeCloseTo(1, 10);
  });

  it('makes soreness the dominant subjective term', () => {
    const { soreness, ...rest } = READINESS.subjectiveWeights;
    expect(Math.max(...Object.values(rest))).toBeLessThan(soreness);
  });

  it('keeps green above amber', () => {
    expect(READINESS.greenFloor).toBeGreaterThan(READINESS.amberFloor);
  });
});

describe('context multipliers', () => {
  it('costs more musculoskeletally on rougher ground', () => {
    const { road, path, gravel, trail } = MULTIPLIERS.surface;
    expect(road).toBeLessThanOrEqual(path);
    expect(path).toBeLessThan(gravel);
    expect(gravel).toBeLessThan(trail);
  });

  it('decays shoe novelty toward neutral without ever going below it', () => {
    const decay = MULTIPLIERS.shoeNovelty;
    expect(decay.every((m, i) => i === 0 || m < (decay[i - 1] as number))).toBe(
      true,
    );
    expect(decay.at(-1) as number).toBeGreaterThan(1);
  });

  it('treats swimming as near-zero impact, which is why it survives recovery weeks', () => {
    expect(MULTIPLIERS.swimMusculoskeletal).toBeLessThan(
      MULTIPLIERS.surface.road / 10,
    );
  });
});
