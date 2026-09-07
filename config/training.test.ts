import { describe, expect, it } from 'vitest';

import {
  ACTIVE_RAMP_CAP_PCT,
  AVAILABILITY,
  BLOCK,
  BLOCK_WEEKS,
  CHECK_IN_GATES,
  GUARDRAILS,
  LIVE_RACE_DATES,
  MEASURED_BASE,
  MULTIPLIERS,
  PACE_ESTIMATES,
  RACES,
  READINESS,
  SHOES,
} from './training';

/**
 * These tests guard the aggressive volume block against the guardrails it is
 * supposed to obey. Exactly one week-over-week step exceeds the cap in force;
 * the point of the first pair of tests is that the breach stays declared and
 * visible rather than being quietly absorbed by a future edit to a target --
 * or, worse, by raising the cap again.
 */

const pctRise = (from: number, to: number) => ((to - from) / from) * 100;

/** Weeks with a real km target, paired with the week before. */
const steps = BLOCK_WEEKS.flatMap((week, i) => {
  const previous = BLOCK_WEEKS[i - 1];
  if (previous === undefined) return [];
  if (week.targetKm === null || previous.targetKm === null) return [];
  return [{ week, previousKm: previous.targetKm }];
});

describe('ramp mode', () => {
  it('runs under the aggressive cap, which is the one the block was built for', () => {
    expect(GUARDRAILS.rampMode).toBe('aggressive');
    expect(ACTIVE_RAMP_CAP_PCT).toBe(GUARDRAILS.aggressiveRampCapPct);
  });

  it('keeps the aggressive cap strictly above the standard one, and still able to fire', () => {
    // A cap so high nothing ever trips it is not a guardrail. 35% still catches
    // the 20 -> 60 return from the race taper at +200%.
    expect(GUARDRAILS.aggressiveRampCapPct).toBeGreaterThan(
      GUARDRAILS.rampCapPct,
    );
    expect(GUARDRAILS.aggressiveRampCapPct).toBeLessThan(50);
  });
});

describe('block ramp rate', () => {
  it('declares an exemption on exactly the steps that exceed the cap in force', () => {
    const overCap = steps
      .filter(
        ({ week, previousKm }) =>
          pctRise(previousKm, week.targetKm as number) > ACTIVE_RAMP_CAP_PCT,
      )
      .map((s) => s.week.week);

    expect(overCap).toEqual([2]);
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
    expect(exempted).toEqual([2]);
  });

  it('keeps the 80 and the 100 inside the cap, so only the race-taper return needs an override', () => {
    const byWeek = new Map(steps.map((s) => [s.week.week, s]));
    const eighty = byWeek.get(3);
    const hundred = byWeek.get(4);

    expect(
      pctRise(eighty?.previousKm as number, eighty?.week.targetKm as number),
    ).toBeLessThanOrEqual(ACTIVE_RAMP_CAP_PCT);
    expect(
      pctRise(hundred?.previousKm as number, hundred?.week.targetKm as number),
    ).toBeLessThanOrEqual(ACTIVE_RAMP_CAP_PCT);
  });

  it('breaches even the returning-from-rest allowance on the rebuild week, so it is a named override not a rule', () => {
    // 60 km measured against the 34.8 km pre-taper base is +72.4%: over the
    // standard cap, over the aggressive cap, and over the returning-from-rest
    // allowance too. It stands on Luis's explicit ratification, recorded in the
    // exemption string, and nothing else. That distinction must not blur.
    const rebuild = BLOCK_WEEKS.find((w) => w.week === 2);
    const rise = pctRise(
      MEASURED_BASE.preTaperBaselineKm,
      rebuild?.targetKm as number,
    );
    expect(rise).toBeGreaterThan(GUARDRAILS.returningFromRestRampCapPct);
    expect(rebuild?.rampExemption).toContain('RATIFIED');
  });

  it('opens with a race taper that is not a valid ramp baseline', () => {
    const first = BLOCK_WEEKS[0];
    expect(first?.phase).toBe('race-taper');
    expect(first?.targetKm as number).toBeLessThan(
      MEASURED_BASE.preTaperBaselineKm,
    );
  });

  it('peaks at 100 km and tapers monotonically from there', () => {
    const peakWeek = BLOCK_WEEKS.find((w) => w.phase === 'peak');
    expect(peakWeek?.targetKm).toBe(100);

    const fromPeak = BLOCK_WEEKS.filter(
      (w) => w.week >= (peakWeek?.week as number) && w.targetKm !== null,
    ).map((w) => w.targetKm as number);

    expect(
      fromPeak.every((km, i) => i === 0 || km < (fromPeak[i - 1] as number)),
    ).toBe(true);
  });

  it('leaves three taper weeks after the peak, not two', () => {
    // Peak volume was put in the week of 28 Sep rather than 5 Oct precisely to
    // buy the third down-week. If someone moves the peak later, this fails.
    const peakWeek = BLOCK_WEEKS.find((w) => w.phase === 'peak');
    const after = BLOCK_WEEKS.filter(
      (w) => w.week > (peakWeek?.week as number),
    );
    expect(after).toHaveLength(3);
  });

  it('protects the final weeks named by the taper guardrail', () => {
    const scheduled = BLOCK_WEEKS.filter((w) => w.phase !== 'race');
    const protectedWeeks = scheduled.slice(-GUARDRAILS.protectedTaperWeeks);
    expect(protectedWeeks.every((w) => w.phase === 'taper')).toBe(true);
  });
});

describe('weekly shape', () => {
  it('spreads high-volume weeks across enough running days', () => {
    // 100 km over five days is 20 km a day. The weekly total is not the injury
    // risk; the per-session load is.
    const heavy = BLOCK_WEEKS.filter(
      (w) => (w.targetKm ?? 0) >= GUARDRAILS.highVolumeThresholdKm,
    );
    expect(heavy.length).toBeGreaterThan(0);
    expect(
      heavy.every((w) => w.minRunDays >= GUARDRAILS.minRunDaysAtHighVolume),
    ).toBe(true);
  });

  it('never asks for a long run larger than the week that contains it', () => {
    expect(
      BLOCK_WEEKS.every(
        (w) =>
          w.longRunKm === null ||
          w.targetKm === null ||
          w.longRunKm < w.targetKm,
      ),
    ).toBe(true);
  });

  it('has a per-day plan for the rebuild week that sums to its weekly target', () => {
    // The sharpest risk in the block is this week, not the 100 -- it starts two
    // days after a raced half. A weekly total alone cannot express that shape.
    const rebuild = BLOCK_WEEKS.find((w) => w.week === 2);
    const days = rebuild?.days;
    expect(days).not.toBeNull();
    expect(days).toHaveLength(7);

    const total = (days ?? []).reduce((sum, d) => sum + d.km, 0);
    expect(total).toBe(rebuild?.targetKm);
  });

  it('matches the rebuild week declared run-day count to its actual running days', () => {
    const rebuild = BLOCK_WEEKS.find((w) => w.week === 2);
    const running = (rebuild?.days ?? []).filter((d) => d.km > 0);
    expect(running).toHaveLength(rebuild?.minRunDays as number);
  });

  it('puts the long run on the day the week says is the long run', () => {
    const rebuild = BLOCK_WEEKS.find((w) => w.week === 2);
    const long = (rebuild?.days ?? []).filter((d) => d.kind === 'long');
    expect(long).toHaveLength(1);
    expect(long[0]?.km).toBe(rebuild?.longRunKm);
  });
});

describe('long runs', () => {
  const longRuns = BLOCK_WEEKS.filter((w) => w.longRunKm !== null).map(
    (w) => w.longRunKm as number,
  );

  it('carries six long sessions, three of them carried by races', () => {
    // 21.1 is the Battersea Half, 35 is Lincoln inside a long day, 16 is LDNX.
    // Reshaped 2026-09-07: the 26 that used to sit here was a long run on
    // LDNX day, which is why it is now 16.
    expect(longRuns).toEqual([21.1, 20, 30, 35, 16, 18]);
  });

  it('builds to a peak then comes down through the taper', () => {
    const peak = Math.max(...longRuns);
    expect(peak).toBe(35);
    expect(longRuns.at(-1) as number).toBeLessThan(peak);
  });

  it('stays inside what the athlete has actually run before', () => {
    // 35 km against a 42.7 km run recorded w/c 4 May. The long runs are the
    // least speculative part of this block -- it is the weekly volume that is
    // new territory, not the distance of any single run.
    const peak = Math.max(...longRuns);
    expect(peak).toBeLessThan(MEASURED_BASE.longestRecordedRunKm);
  });

  it('puts every long run at or above the carbon threshold in carbons', () => {
    const peak = Math.max(...longRuns);
    expect(peak).toBeGreaterThanOrEqual(SHOES.carbonMinDistanceKm);
  });
});

/**
 * The collision these guard against was real and committed: the block re-derived
 * on 2026-09-06 put the peak 35 km long run on Sunday 4 October, which is Lincoln
 * Half day, and a 26 km week ending on LDNX 10K day. Nothing caught it because no
 * race data existed for anything to check against. Found by adversarial review F6.
 */
describe('races and session placement', () => {
  it('never places a long session on a live race date uninvited', () => {
    const trespassing = BLOCK_WEEKS.filter(
      (w) =>
        w.longRunDate !== null &&
        LIVE_RACE_DATES.includes(w.longRunDate) &&
        w.longRunOnRace === null,
    );

    expect(trespassing.map((w) => w.longRunDate)).toEqual([]);
  });

  it('names the actual race whenever one carries the long session', () => {
    for (const week of BLOCK_WEEKS) {
      if (week.longRunOnRace === null) continue;

      const race = RACES.find((r) => r.name === week.longRunOnRace);
      expect(race, `no race named ${week.longRunOnRace}`).toBeDefined();
      expect(race?.date).toBe(week.longRunDate);
      expect(race?.role).not.toBe('dropped');
    }
  });

  it('dates every long session, so a collision is detectable at all', () => {
    // Widened deliberately: against the const-asserted literal TS narrows this
    // filter to `never` because it can already prove the invariant. Keeping the
    // runtime assertion means it still holds once weeks are loaded from the
    // database rather than read from a literal.
    const weeks: readonly {
      week: number;
      longRunKm: number | null;
      longRunDate: string | null;
    }[] = BLOCK_WEEKS;
    const undated = weeks.filter(
      (w) => w.longRunKm !== null && w.longRunDate === null,
    );

    expect(undated.map((w) => w.week)).toEqual([]);
  });

  it('keeps the dropped race on the record rather than deleting it', () => {
    const dorney = RACES.find((r) => r.name === 'Dorney Triathlon');

    expect(dorney?.role).toBe('dropped');
    expect(LIVE_RACE_DATES).not.toContain(dorney?.date);
  });

  it('leaves one uninterrupted long run before the races take over', () => {
    const uninterrupted = BLOCK_WEEKS.filter(
      (w) => w.longRunKm !== null && w.longRunOnRace === null && w.week > 1,
    );

    // Weeks 2, 3 and 6. Both peak-fortnight slots are races, which is the
    // whole reason the block was reshaped.
    expect(uninterrupted.map((w) => w.week)).toEqual([2, 3, 6]);
  });
});

describe('check-in gates', () => {
  it('gates the step up to 80 km on the rebuild week actually going well', () => {
    const gate = CHECK_IN_GATES.find((g) => g.afterWeekMonday === '2026-09-14');
    expect(gate).toBeDefined();
    expect(gate?.decides).toContain('80');
    expect(gate?.criteria.length).toBeGreaterThanOrEqual(3);
  });

  it('treats the acute:chronic ratio as a trend and says so, rather than as a threshold', () => {
    // Lolli 2019 and Impellizzeri 2020 dismantled the ratio as a predictor. It
    // survives here as a direction of travel only, and the comment has to say
    // that or the next reader will turn it back into a rule.
    const gate = CHECK_IN_GATES[0];
    const ratio = gate?.criteria.find((c) => c.id === 'acute-chronic-trend');
    expect(ratio?.holdIf).toContain('TREND SIGNAL');
  });
});

describe('availability', () => {
  it('records swimming as one session a week, not five evenings', () => {
    // The spec pack said five evenings, and the original feasibility arithmetic
    // concluded from that that weekday running was morning-only. That premise
    // was wrong, and it made this block look harder than it is.
    expect(AVAILABILITY.swimSessionsPerWeek).toBe(1);
    expect(AVAILABILITY.swimSessionHours).toBe(2);
  });

  it('leaves enough free evenings for a 100 km week to be spread', () => {
    expect(AVAILABILITY.freeEveningsPerWeek).toBeGreaterThanOrEqual(
      GUARDRAILS.minRunDaysAtHighVolume,
    );
  });

  it('models no cycling, because there is none', () => {
    expect(AVAILABILITY.cycles).toBe(false);
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
