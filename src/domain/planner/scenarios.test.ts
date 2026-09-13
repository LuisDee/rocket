import { describe, expect, it } from 'vitest';

import { GUARDRAIL_RULE_IDS, READINESS } from '../../../config/training';
import { propose, replan } from './negotiate';
import { planWindow } from './placement';
import type { PlanWindow, PlannedSession } from './types';

/**
 * The seven scenario fixtures (review F29 / S6.8) plus the negotiation
 * contract they all run through.
 *
 * Four of them -- race added, race cancelled, a missed weekday morning, and the
 * two trend cases -- come from Luis's own ask and were absent from the plan.
 * Two of the race fixtures are regression tests for a defect this repo actually
 * shipped: the 2026-09-06 macro re-derivation put the block's peak long run on
 * Lincoln Half day, and nothing could catch it because no race existed anywhere
 * the planner could see.
 */

const totalKm = (window: PlanWindow, from?: string, to?: string) =>
  Math.round(
    window
      .filter(
        (s) => (from ? s.date >= from : true) && (to ? s.date <= to : true),
      )
      .reduce((sum, s) => sum + s.km, 0) * 10,
  ) / 10;

const kmOn = (window: PlanWindow, date: string) =>
  totalKm(window.filter((s) => s.date === date));

/** Week 2 and week 3 as completed runs, so ramp and spike have a baseline. */
const historyToWeek3 = planWindow('2026-09-14', 7)
  .filter((s) => s.km > 0)
  .map((s) => ({ date: s.date, km: s.km }));

describe('the negotiation contract', () => {
  it('refuses a request over the ramp cap, leaves the plan untouched, and counter-offers', () => {
    const window = planWindow('2026-09-21', 7);
    const result = propose(
      window,
      { kind: 'set-km', date: '2026-09-22', km: 30 },
      { history: historyToWeek3 },
    );

    expect(result.applied).toBe(false);
    expect(result.violated_rules).toContain('weekly-ramp-cap');
    // A refused write changes nothing, and says so in the field a test can read
    // rather than in a paragraph a model might narrate optimistically.
    expect(result.resulting_window).toEqual(window);
    expect(result.compliant_alternative).not.toBeNull();
    expect(result.compliant_alternative?.rationale).toContain('km');

    const offered = result.compliant_alternative?.changes.find(
      (c) => c.date === '2026-09-22' && c.field === 'km',
    );
    expect(Number(offered?.to)).toBeLessThan(30);
    expect(Number(offered?.to)).toBeGreaterThan(kmOn(window, '2026-09-22'));
  });

  it('evaluates every rule on every write, and only ever violates one it evaluated', () => {
    const window = planWindow('2026-09-21', 7);
    const result = propose(
      window,
      { kind: 'set-km', date: '2026-09-22', km: 12 },
      { history: historyToWeek3 },
    );

    expect([...result.applied_rules].sort()).toEqual(
      Object.keys(GUARDRAIL_RULE_IDS).sort(),
    );
    for (const violated of result.violated_rules) {
      expect(result.applied_rules).toContain(violated);
    }
  });

  it('stops ten individually-legal adjustments from walking the week past the cap', () => {
    // The whole point of validating the window rather than the session. Each
    // call adds two kilometres to a different day -- trivially legal on its own
    // -- and the week is what eventually breaks.
    let window = planWindow('2026-09-21', 7);
    const days = window
      .filter((s) => s.kind === 'easy')
      .map((s) => s.date)
      .slice(0, 5);
    let refusals = 0;

    for (let round = 0; round < 2; round += 1) {
      for (const date of days) {
        const result = propose(
          window,
          { kind: 'set-km', date, km: kmOn(window, date) + 2 },
          { history: historyToWeek3 },
        );
        if (result.applied) {
          window = result.resulting_window;
        } else {
          refusals += 1;
          expect(result.violated_rules).toContain('weekly-ramp-cap');
        }
      }
    }

    expect(refusals).toBeGreaterThan(0);
  });

  it('lets an explicit override through the ramp cap but never through the taper gate', () => {
    const taperWeek = planWindow('2026-10-12', 7);
    const overridden = propose(
      taperWeek,
      { kind: 'set-km', date: '2026-10-14', km: 30 },
      { override: true },
    );

    expect(overridden.applied).toBe(false);
    expect(overridden.violated_rules).toContain('protected-taper');

    const buildWeek = planWindow('2026-09-21', 7);
    const rampOverride = propose(
      buildWeek,
      { kind: 'set-km', date: '2026-09-22', km: 25 },
      { history: historyToWeek3, override: true },
    );

    expect(rampOverride.violated_rules).toContain('weekly-ramp-cap');
    expect(rampOverride.applied).toBe(true);
  });
});

describe('scenario: the spanner -- an unplanned 30 km logged', () => {
  const window = planWindow('2026-09-21', 7);
  const result = replan(
    window,
    { kind: 'spanner', date: '2026-09-22', km: 30 },
    { history: historyToWeek3 },
  );

  it('downgrades the next quality session and says what that cost', () => {
    const quality = result.resulting_window.filter(
      (s) => s.kind === 'quality' && s.date > '2026-09-22',
    );

    expect(quality).toEqual([]);
    expect(result.diff.rationale).toContain('Absorbed 30 km');
    expect(result.diff.rationale).toContain('quality becomes easy');
    expect(result.diff.changes.length).toBeGreaterThan(1);
  });

  it('gives the overshoot back out of the days still ahead rather than letting the week run away', () => {
    const before = totalKm(window, '2026-09-21', '2026-09-27');
    const after = totalKm(result.resulting_window, '2026-09-21', '2026-09-27');

    expect(kmOn(result.resulting_window, '2026-09-22')).toBe(30);
    expect(after).toBeLessThanOrEqual(before + 0.5);
    expect(result.diff.rationale).toContain('km');
  });
});

describe('scenario: the tumble dryer -- severe DOMS', () => {
  const swim: PlannedSession = {
    date: '2026-09-23',
    km: 0,
    kind: 'swim',
    slot: 'evening',
    note: 'Weekly swim.',
  };
  const window: PlanWindow = [...planWindow('2026-09-21', 7), swim].sort(
    (a, b) => a.date.localeCompare(b.date),
  );
  const result = replan(window, {
    kind: 'soreness',
    severity: READINESS.sorenessBlocksQuality + 1,
    since: '2026-09-22',
  });

  it('takes quality off the board while the soreness stands', () => {
    expect(
      result.resulting_window.filter(
        (s) => s.kind === 'quality' && s.date >= '2026-09-22',
      ),
    ).toEqual([]);
    expect(result.diff.rationale).toContain('quality is off');
  });

  it('leaves the swim exactly where it was -- it carries no impact load', () => {
    expect(result.resulting_window).toContainEqual(swim);
    expect(result.diff.rationale).toContain('swimming are untouched');
  });

  it('does not cut the easy volume the athlete can still run', () => {
    expect(totalKm(result.resulting_window)).toBe(totalKm(window));
  });
});

describe('scenario: a race added mid-block', () => {
  // The regression. A race appears on the date the plan had put its long run,
  // and nothing in the repo could see it until races became data.
  const window = planWindow('2026-09-21', 7);
  const result = replan(window, {
    kind: 'race-added',
    date: '2026-09-27',
    name: 'A race entered last night',
    distanceKm: 10,
  });

  it('moves the long run off the race date and says why', () => {
    const onRaceDay = result.resulting_window.filter(
      (s) => s.date === '2026-09-27',
    );

    expect(onRaceDay.map((s) => s.kind)).toEqual(['race']);
    expect(result.resulting_window.some((s) => s.kind === 'long')).toBe(true);
    expect(result.diff.rationale).toContain('A race entered last night added');
  });

  it('does not stack the long run against the race by moving it one day', () => {
    const long = result.resulting_window.find((s) => s.kind === 'long');
    const gap = Math.abs(
      (new Date(`${long?.date}T00:00:00Z`).getTime() -
        new Date('2026-09-27T00:00:00Z').getTime()) /
        86_400_000,
    );

    expect(gap).toBeGreaterThanOrEqual(2);
  });
});

describe('scenario: a race cancelled mid-block', () => {
  // Dorney, `role: 'dropped'` in the config. The date goes back to being an
  // ordinary day rather than silently acquiring a replacement long run.
  const window: PlanWindow = [
    ...planWindow('2026-09-28', 7),
    {
      date: '2026-10-03',
      km: 25,
      kind: 'race' as const,
      slot: 'weekend-daytime',
      note: 'Dorney Triathlon',
    },
  ].sort((a, b) => a.date.localeCompare(b.date));

  const result = replan(window, { kind: 'race-cancelled', date: '2026-10-03' });

  it('returns the date to ordinary planning', () => {
    expect(
      result.resulting_window.filter(
        (s) => s.date === '2026-10-03' && s.kind === 'race',
      ),
    ).toEqual([]);
    expect(result.diff.rationale).toContain('Dorney');
    expect(result.diff.rationale).toContain('ordinary planning');
  });

  it('names the volume the cancellation costs instead of inventing a replacement', () => {
    expect(totalKm(result.resulting_window)).toBe(totalKm(window) - 25);
    expect(result.diff.rationale).toContain('km to');
  });
});

describe('scenario: a lost run slot', () => {
  // A first-class replan trigger, not an exception.
  //
  // This scenario used to lose the weekday MORNING of 2026-10-20 and assert the
  // day got shorter, and it passed because race week put 16 km on that Tuesday:
  // 14 in the evening plus a 2 km morning top-up, three days before the
  // marathon. The run-in ceiling removed that session, so the fixture now
  // exercises the trigger the other way round -- lose the evening, and the day's
  // volume has to find the morning. Same mechanism, on a day that exists.
  const window = planWindow('2026-10-19', 7);
  const result = replan(window, {
    kind: 'availability-lost',
    date: '2026-10-20',
    slotId: 'evening',
  });

  it('empties the lost slot and re-places what it held', () => {
    expect(
      result.resulting_window.filter(
        (s) => s.date === '2026-10-20' && s.slot === 'evening',
      ),
    ).toEqual([]);
    // The kilometres do not vanish: they move to the only other slot the day
    // offers. Losing a slot is a constraint on WHERE, not on how much.
    expect(kmOn(result.resulting_window, '2026-10-20')).toBe(
      kmOn(window, '2026-10-20'),
    );
    expect(
      result.resulting_window.find((s) => s.date === '2026-10-20')?.slot,
    ).toBe('weekday-morning');
  });

  it('names the slot it lost and what moved', () => {
    expect(result.diff.rationale).toContain('evening');
    expect(result.diff.changes.length).toBeGreaterThan(0);
  });

  it('has no weekday morning left in the generated block to lose', () => {
    // Worth locking down rather than leaving as a surprise. Every planned day in
    // the block now fits inside one evening, so Luis's own "I missed the morning
    // run" trigger has nothing to remove. It becomes live again the moment
    // AVAILABILITY.runSlots.evening.maxKm comes down from its PROVISIONAL 14 --
    // and this assertion is what will say so.
    const block = planWindow('2026-09-14', 49);
    expect(block.filter((s) => s.slot === 'weekday-morning')).toEqual([]);
  });
});

describe('scenario: under-performing and over-performing', () => {
  const window = planWindow('2026-09-21', 7);

  it('reports an under-performing trend with the window it covers, and moves nothing', () => {
    const result = replan(window, {
      kind: 'trend',
      completedKm: 96,
      targetKm: 140,
      from: '2026-09-07',
      to: '2026-09-20',
    });

    expect(result.applied).toBe(true);
    expect(result.diff.changes).toEqual([]);
    expect(result.resulting_window).toEqual(window);
    // REDLINES: a trailing figure without the window it covers is wrong without
    // looking wrong.
    expect(result.diff.rationale).toContain('7 Sep');
    expect(result.diff.rationale).toContain('20 Sep');
    expect(result.diff.rationale).toContain('below');
  });

  it('does not let an over-performing trend raise a target by itself', () => {
    const result = replan(window, {
      kind: 'trend',
      completedKm: 168,
      targetKm: 140,
      from: '2026-09-07',
      to: '2026-09-20',
    });

    expect(result.diff.rationale).toContain('above');
    expect(result.diff.rationale).toContain('moves nothing by itself');
    expect(result.resulting_window).toEqual(window);
    expect(totalKm(result.resulting_window)).toBe(totalKm(window));
  });
});
