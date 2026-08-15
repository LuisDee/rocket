import { describe, expect, it } from 'vitest';

import {
  GUARDRAILS,
  MULTIPLIERS,
  PRE_BLOCK_BASELINE_KM,
  READINESS,
  SEED_WEEKS,
} from './training';

/**
 * These tests guard the seed block against the guardrails it is supposed to
 * obey. The specs contain a real contradiction here -- see the block comment on
 * GUARDRAILS.returningFromRestRampCapPct -- and the point of the first test is
 * that the contradiction stays visible rather than being quietly absorbed by a
 * future edit to a weekly target.
 */

const pctRise = (from: number, to: number) => ((to - from) / from) * 100;

/** Weeks with a real km target, paired with the week before. */
const steps = SEED_WEEKS.flatMap((week, i) => {
  const previous = SEED_WEEKS[i - 1];
  if (previous === undefined) return [];
  if (week.targetKm === null || previous.targetKm === null) return [];
  return [{ week, previousKm: previous.targetKm }];
});

describe('seed block ramp rate', () => {
  it('never rises faster than the ramp cap, except returning from forced rest', () => {
    const overCap = steps.filter(
      ({ week, previousKm }) =>
        pctRise(previousKm, week.targetKm as number) > GUARDRAILS.rampCapPct,
    );

    expect(overCap.map((s) => s.week.week)).toEqual([2]);
  });

  it('measures the returning-from-rest week against the pre-rest baseline', () => {
    const rebuild = SEED_WEEKS.find((w) => w.week === 2);
    expect(rebuild?.phase).toBe('rebuild');

    const rise = pctRise(PRE_BLOCK_BASELINE_KM, rebuild?.targetKm as number);
    expect(rise).toBeGreaterThan(GUARDRAILS.rampCapPct);
    expect(rise).toBeLessThanOrEqual(GUARDRAILS.returningFromRestRampCapPct);
  });

  it('starts with a recovery week below the pre-rest baseline', () => {
    const first = SEED_WEEKS[0];
    expect(first?.phase).toBe('forced-recovery');
    expect(first?.targetKm as number).toBeLessThan(PRE_BLOCK_BASELINE_KM);
  });

  it('tapers monotonically once past peak', () => {
    const fromPeak = SEED_WEEKS.filter(
      (w) => w.week >= 7 && w.targetKm !== null,
    ).map((w) => w.targetKm as number);

    const descending = fromPeak.every(
      (km, i) => i === 0 || km < (fromPeak[i - 1] as number),
    );
    expect(descending).toBe(true);
  });

  it('protects the final weeks named by the taper guardrail', () => {
    const withTarget = SEED_WEEKS.filter((w) => w.targetKm !== null);
    const protectedWeeks = withTarget.slice(-GUARDRAILS.protectedTaperWeeks);

    expect(protectedWeeks.every((w) => w.phase === 'taper')).toBe(true);
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
