import { describe, expect, it } from 'vitest';

import {
  ACTIVE_RAMP_CAP_PCT,
  AVAILABILITY,
  BLOCK,
  BLOCK_WEEKS,
  CHECK_IN_GATES,
  GUARDRAIL_RULE_IDS,
  GUARDRAILS,
  LIVE_RACE_DATES,
  MEASURED_BASE,
  MULTIPLIERS,
  PACE_ESTIMATES,
  qualitySessionCount,
  RACES,
  READINESS,
  SHOES,
  singleSessionSpikes,
  type SpikeSession,
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

  it('stands the rebuild week on an explicit ratification rather than on any cap', () => {
    // 60 km measured against the 34.8 km pre-taper base is +72.4%: over the
    // standard cap and over the aggressive one in force. It stands on Luis's
    // explicit ratification, recorded in the exemption string, and nothing
    // else. That distinction must not blur.
    //
    // This ran against GUARDRAILS.returningFromRestRampCapPct until 2026-09-07
    // -- a 35 nothing in the repo read and nobody had ratified. Deleted (review
    // F8): a threshold no code path consumes cannot be the rule a week
    // breaches, and leaving it invited a later planner to start reading it.
    const rebuild = BLOCK_WEEKS.find((w) => w.week === 2);
    const rise = pctRise(
      MEASURED_BASE.preTaperBaselineKm,
      rebuild?.targetKm as number,
    );
    expect(rise).toBeGreaterThan(ACTIVE_RAMP_CAP_PCT);
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

  it('gives the race week a target rather than a null, so the taper is checkable', () => {
    // 100 -> 80 -> 60 -> null read as planned while leaving the last week
    // unbounded. Bosquet 2007 wants a 41-60% volume cut held across the taper,
    // which a null cannot express (review F15).
    const raceWeek = BLOCK_WEEKS.find((w) => w.phase === 'race');
    const peak = BLOCK_WEEKS.find((w) => w.phase === 'peak');

    expect(raceWeek?.targetKm).not.toBeNull();
    expect(raceWeek?.targetKm as number).toBeLessThan(
      (peak?.targetKm as number) / 2,
    );
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
    // 21.1 is the Battersea Half, 33 is Lincoln inside a long day, 16 is LDNX.
    // Reshaped twice: the 26 that used to sit on LDNX day became 16, and on
    // 2026-09-07 the 20/30/35 ladder became 22/27/33 to take the 142% spike
    // off 27 September (review F7).
    expect(longRuns).toEqual([21.1, 22, 27, 33, 16, 18]);
  });

  it('builds to a peak then comes down through the taper', () => {
    const peak = Math.max(...longRuns);
    expect(peak).toBe(33);
    expect(longRuns.at(-1) as number).toBeLessThan(peak);
  });

  it('keeps the longest run of the block at or above 32 km', () => {
    // The floor the reshape is not allowed to breach. Doherty 2020 associates
    // faster marathons with the longest run and the count of 32 km+ runs, and
    // this block has three build weeks off a 28 km/week base -- it has none of
    // the chronic volume that makes a Hansons-style short long run work
    // (review F9).
    expect(Math.max(...longRuns)).toBeGreaterThanOrEqual(32);
  });

  it('stays inside what the athlete has actually run before', () => {
    // 33 km against a 42.7 km run recorded w/c 4 May. The long runs are the
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
  // NOTE the exact property, which is weaker than "no long session on a race
  // date": three of six DO sit on race days by design. What is guaranteed is
  // that a long session on a race date must NAME the race carrying it, so a
  // collision cannot arrive silently -- which is the bug this was written for
  // (the block once put a 35 km run on Lincoln Half day with nothing declared).
  it('never places a long session on a live race date without naming the race that carries it', () => {
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

/**
 * The guardrail on the axis the evidence supports (Nielsen 2025: hazard rises
 * once a single run passes ~110% of the trailing-30-day longest, while
 * week-to-week ratios were not significant). The weekly caps above cannot see
 * this: they were satisfied by a block whose 27 September long run was 142% of
 * anything in the previous month.
 */
describe('single-session spike', () => {
  /**
   * Longest run in the 30 days before the block's first race, from
   * src/data/recent-activities.json -- the 31.5 km of 9 August falls outside
   * that window and the 16.0 km of 22 August is the real baseline.
   */
  const historySeed: SpikeSession[] = [{ date: '2026-08-22', km: 16.0 }];

  /** The block's long sessions, read from the config rather than restated. */
  const longSessions: SpikeSession[] = BLOCK_WEEKS.flatMap((week) =>
    week.longRunKm === null || week.longRunDate === null
      ? []
      : [{ date: week.longRunDate, km: week.longRunKm }],
  );

  const marathon: SpikeSession = { date: BLOCK.goalRaceDate, km: 42.195 };
  const ladder: SpikeSession[] = [...historySeed, ...longSessions, marathon];

  const dayBefore = (iso: string) => {
    const at = new Date(`${iso}T00:00:00Z`);
    at.setUTCDate(at.getUTCDate() - 1);
    return at.toISOString().slice(0, 10);
  };

  it('flags both planner-chosen spikes, including the one wrapped around a race', () => {
    // Two, not one. The 33 km on Lincoln day used to be invisible because the
    // exemption skipped the whole date; it is 21.1 km of race plus ~12 km the
    // planner chose, and the tissue runs all 33. Narrowing the exemption to a
    // PURE race is what surfaces it.
    const breaches = singleSessionSpikes(ladder);

    expect(breaches.map((b) => b.date)).toEqual(['2026-09-27', '2026-10-04']);
    expect(breaches[0]?.baselineKm).toBe(22);
    expect(breaches[0]?.pctOfBaseline).toBeCloseTo(122.7, 0);
    expect(breaches[1]?.km).toBe(33);
    expect(breaches[1]?.pctOfBaseline).toBeCloseTo(122.2, 0);
  });

  it('exempts a pure race but not a race the planner has built a session around', () => {
    // 12 September is 21.1 km and the race is 21.1 km: nothing was added, so
    // there is no planner decision to smooth and it is exempt. Add a single
    // kilometre of warm-up and the session becomes the planner's again.
    const pure = singleSessionSpikes(ladder).map((b) => b.date);
    expect(pure).not.toContain('2026-09-12');

    const withWarmUp = ladder.map((s) =>
      s.date === '2026-09-12' ? { ...s, km: 26 } : s,
    );
    expect(singleSessionSpikes(withWarmUp).map((b) => b.date)).toContain(
      '2026-09-12',
    );
  });

  it('bites: the ladder this replaced spiked 142% on the same day', () => {
    // The proof the guardrail is not decorative. Put the 20/30/35 ladder back
    // and the step the reshape removed reappears, 19 points higher, against a
    // 21.1 km baseline that was itself a race two weeks earlier.
    const before = ladder.map((session) => {
      if (session.date === '2026-09-19') return { ...session, km: 20 };
      if (session.date === '2026-09-27') return { ...session, km: 30 };
      if (session.date === '2026-10-04') return { ...session, km: 35 };
      return session;
    });

    const breaches = singleSessionSpikes(before);
    expect(breaches.map((b) => b.date)).toEqual(['2026-09-27', '2026-10-04']);
    expect(breaches[0]?.baselineKm).toBe(21.1);
    expect(breaches[0]?.pctOfBaseline).toBeCloseTo(142.2, 0);

    const shipped = singleSessionSpikes(ladder).find(
      (b) => b.date === '2026-09-27',
    )?.pctOfBaseline as number;
    expect(shipped).toBeLessThan((breaches[0]?.pctOfBaseline as number) - 15);
  });

  it('exempts races, and the exemption is what is doing the work', () => {
    // Move every race a day earlier and three more breaches appear -- the half
    // at 132%, Lincoln at 122% and the marathon at 128%. The marathon breaching
    // by construction is why this rule warns and never blocks: a hard version
    // would refuse the race the block exists for.
    const shifted = ladder.map((session) =>
      LIVE_RACE_DATES.includes(session.date)
        ? { ...session, date: dayBefore(session.date) }
        : session,
    );

    const breaches = singleSessionSpikes(shifted);
    expect(breaches.map((b) => b.date)).toEqual([
      '2026-09-11',
      '2026-09-27',
      '2026-10-03',
      '2026-10-23',
    ]);
    expect(breaches.at(-1)?.pctOfBaseline).toBeCloseTo(127.9, 0);
  });

  it('has no baseline to measure the first run against, and says so by silence', () => {
    expect(singleSessionSpikes([{ date: '2026-09-27', km: 30 }])).toEqual([]);
  });

  it('ignores runs that have aged out of the trailing window', () => {
    // The 31.5 km of 9 August is the longest run in the legs and is NOT the
    // denominator on 27 September, because it is seven weeks old. A window that
    // silently widened would hide every spike in the block.
    const withOldLongRun = [{ date: '2026-08-09', km: 31.5 }, ...ladder];
    expect(singleSessionSpikes(withOldLongRun).map((b) => b.date)).toEqual([
      '2026-09-27',
      '2026-10-04',
    ]);
  });
});

/**
 * The number 1 was never the defect; its ambiguity was. Nothing said whether a
 * race spent the budget, so the peak week could legally hold Lincoln at
 * marathon pace AND a separate interval session on top of 100 km (review F15).
 */
describe('quality session budget', () => {
  it('counts the race that carries the peak week against the budget', () => {
    const peak = BLOCK_WEEKS.find((w) => w.week === 4);
    expect(qualitySessionCount(peak as (typeof BLOCK_WEEKS)[number])).toBe(1);
  });

  it('keeps every week of the block inside the budget', () => {
    for (const week of BLOCK_WEEKS) {
      expect(
        qualitySessionCount(week),
        `week ${week.week}`,
      ).toBeLessThanOrEqual(GUARDRAILS.maxQualitySessionsPerWeekBuild);
    }
  });

  it('catches an interval session stacked on top of the race that already carries the week', () => {
    const peak = BLOCK_WEEKS.find((w) => w.week === 4);
    const stacked = {
      monday: peak?.monday as string,
      days: [{ date: '2026-10-01', kind: 'quality' }],
    };

    expect(qualitySessionCount(stacked)).toBe(2);
    expect(qualitySessionCount(stacked)).toBeGreaterThan(
      GUARDRAILS.maxQualitySessionsPerWeekBuild,
    );
  });

  it('does not double-count a quality day that is itself the race', () => {
    const stacked = {
      monday: '2026-09-28',
      days: [{ date: '2026-10-04', kind: 'quality' }],
    };
    expect(qualitySessionCount(stacked)).toBe(1);
  });
});

describe('guardrail rule ids', () => {
  it('claims every guardrail exactly once, so a decision can name what it applied', () => {
    // The emission half of review S6.9: applied_rules[] and violated_rules[]
    // need stable ids, and a guardrail nobody gave one to is a rule the planner
    // can enforce but cannot cite.
    const claimed = Object.values(GUARDRAIL_RULE_IDS).flat();
    expect([...claimed].sort()).toEqual(Object.keys(GUARDRAILS).sort());
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

  it('records when the swim slot starts and ends, so the option to model it survives', () => {
    // Capture only -- no readiness term reads these (review S6.7). The point is
    // that a late finish compressing sleep cannot be evaluated retrospectively
    // if the time was never written down.
    const hours = (hhmm: string) =>
      Number(hhmm.slice(0, 2)) + Number(hhmm.slice(3, 5)) / 60;

    expect(
      hours(AVAILABILITY.swimSlotEndLocal) -
        hours(AVAILABILITY.swimSlotStartLocal),
    ).toBe(AVAILABILITY.swimSessionHours);
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

  it('keeps the watch below a third of the verdict', () => {
    // With HRV and sleep score empty across a seven-day probe, renormalising
    // concentrates rather than protects: at 0.4 a tenth of the whole verdict
    // lands on Body Battery. The tests above pass through any share, which is
    // why this one exists (review F12).
    expect(READINESS.objectiveShareWhenAvailable).toBeLessThanOrEqual(0.3);
  });

  it('lets the objective block veto a green but never manufacture one', () => {
    expect(READINESS.objectiveCanOnlyDowngrade).toBe(true);
  });

  it('reads HRV as a rolling mean against a longer baseline, never a daily value', () => {
    expect(READINESS.hrv.rollingMeanDays).toBeGreaterThan(1);
    expect(READINESS.hrv.baselineDays).toBeGreaterThan(
      READINESS.hrv.rollingMeanDays,
    );
    expect(READINESS.hrv.swcBandSd).toBeGreaterThan(0);
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
