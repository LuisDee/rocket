import { describe, expect, it } from 'vitest';

import {
  ACTIVE_RAMP_CAP_PCT,
  GUARDRAILS,
  GUARDRAIL_RULE_IDS,
  READINESS,
} from '../../../config/training';
import { shiftIso } from './dates';
import { evaluateGuardrails } from './guardrails';
import type { PlannedSession } from './types';

/**
 * The rule these tests are written against: a guardrail result is never a bare
 * boolean. If one of these can pass while the planner returns `false` with no
 * threshold and no observed value, it is testing the wrong thing -- the
 * negotiation contract needs the numbers to quantify the cost of a breach.
 */

const easy = (date: string, km: number): PlannedSession => ({
  date,
  km,
  kind: 'easy',
  slot: 'evening',
});

const quality = (date: string, km: number): PlannedSession => ({
  date,
  km,
  kind: 'quality',
  slot: 'evening',
});

/** A flat week of five equal easy days, Monday to Friday. */
const flatWeek = (monday: string, weeklyKm: number): PlannedSession[] =>
  Array.from({ length: 5 }, (_, i) => easy(shiftIso(monday, i), weeklyKm / 5));

const find = (
  results: readonly ReturnType<typeof evaluateGuardrails>[number][],
  ruleId: string,
) => results.filter((r) => r.ruleId === ruleId);

describe('guardrail evaluation', () => {
  it('evaluates every rule id the config declares, so a rule cannot be added and silently unenforced', () => {
    // The gate this file exists for. `applied_rules[]` must mean "consulted",
    // not "happened to fire": a planner that skipped the ramp cap entirely and
    // one that checked and passed it are otherwise indistinguishable.
    const results = evaluateGuardrails({ window: flatWeek('2026-09-14', 50) });
    const evaluated = new Set(results.map((r) => r.ruleId));

    expect([...evaluated].sort()).toEqual(
      Object.keys(GUARDRAIL_RULE_IDS).sort(),
    );
  });

  it('reports the threshold and the observed value, never a bare verdict', () => {
    const results = evaluateGuardrails({ window: flatWeek('2026-09-14', 50) });

    for (const result of results) {
      expect(result.ruleId.length).toBeGreaterThan(0);
      expect(typeof result.breached).toBe('boolean');
      expect(result.detail.length).toBeGreaterThan(10);
      // REDLINES: an aggregate is returned with the window it covers, or it is
      // wrong without looking wrong.
      expect(result.coverage.from.length).toBe(10);
      expect(result.coverage.to.length).toBe(10);
    }

    const ramp = find(results, 'weekly-ramp-cap')[0];
    expect(ramp?.threshold).toBe(ACTIVE_RAMP_CAP_PCT);
    expect(typeof ramp?.observed).toBe('number');
  });

  it('catches a week over the ramp cap and names the compliant ceiling', () => {
    const history = flatWeek('2026-09-07', 40).map((s) => ({
      date: s.date,
      km: s.km,
    }));
    const results = evaluateGuardrails({
      window: flatWeek('2026-09-14', 80),
      history,
    });
    const ramp = find(results, 'weekly-ramp-cap').find((r) => r.breached);

    expect(ramp).toBeDefined();
    expect(ramp?.observed).toBe(100);
    expect(ramp?.threshold).toBe(ACTIVE_RAMP_CAP_PCT);
    expect(ramp?.blocking).toBe(true);
    expect(ramp?.overridable).toBe(true);
    expect(ramp?.detail).toContain('54 km'); // 40 * 1.35, the compliant ceiling
  });

  it('does not re-fire the ramp cap on the week whose breach is already ratified in the config', () => {
    // Week 2 carries a signed-off exemption. It covers the week AS AUTHORED --
    // the guardrail is not repealed for that week, it is priced.
    const atTarget = evaluateGuardrails({
      window: [
        ...flatWeek('2026-09-14', 38),
        { date: '2026-09-19', km: 22, kind: 'long', slot: 'weekend-daytime' },
      ],
    });
    expect(find(atTarget, 'weekly-ramp-cap')[0]?.breached).toBe(false);

    const aboveTarget = evaluateGuardrails({
      window: [
        ...flatWeek('2026-09-14', 48),
        { date: '2026-09-19', km: 22, kind: 'long', slot: 'weekend-daytime' },
      ],
    });
    expect(find(aboveTarget, 'weekly-ramp-cap')[0]?.breached).toBe(true);
  });

  it('catches a high-volume week squeezed into too few running days', () => {
    // A fully planned week: five running days and two declared rest days. The
    // rule needs the whole week in view before it can call a day empty.
    const results = evaluateGuardrails({
      window: [
        ...flatWeek('2026-09-28', GUARDRAILS.highVolumeThresholdKm + 20),
        { date: '2026-10-03', km: 0, kind: 'rest', slot: null },
        { date: '2026-10-04', km: 0, kind: 'rest', slot: null },
      ],
    });
    const spread = find(results, 'high-volume-spread')[0];

    expect(spread?.breached).toBe(true);
    expect(spread?.observed).toBe(5);
    expect(spread?.threshold).toBe(GUARDRAILS.minRunDaysAtHighVolume);
  });

  it('catches a week with no rest-or-swim-only day left in it', () => {
    const everyDay = Array.from({ length: 7 }, (_, i) =>
      easy(`2026-09-${String(14 + i).padStart(2, '0')}`, 8),
    );
    const results = evaluateGuardrails({ window: everyDay });
    const recovery = find(results, 'weekly-recovery-days')[0];

    expect(recovery?.breached).toBe(true);
    expect(recovery?.observed).toBe(0);
    expect(recovery?.threshold).toBe(GUARDRAILS.minRestOrSwimOnlyDaysPerWeek);
  });

  it('spends the quality budget on a race, so a race plus an interval session breaches', () => {
    // The LDNX 10K and the Wednesday before it: one week, two hard sessions,
    // and the exact stacking `racesCountAsQualitySessions` exists to stop.
    const results = evaluateGuardrails({
      window: [
        quality('2026-10-07', 10),
        { date: '2026-10-11', km: 16, kind: 'race', slot: 'weekend-daytime' },
      ],
    });
    const budget = find(results, 'quality-session-budget').find(
      (r) => r.scope.startsWith('week') && r.breached,
    );

    expect(budget?.observed).toBe(2);
    expect(budget?.threshold).toBe(GUARDRAILS.maxQualitySessionsPerWeekBuild);
  });

  it('refuses quality the day after a long run, across the week boundary', () => {
    // Sunday long run, Monday quality: two different weeks, which is exactly
    // why the spacing rules are evaluated over the window rather than per week.
    const results = evaluateGuardrails({
      window: [
        { date: '2026-09-20', km: 22, kind: 'long', slot: 'weekend-daytime' },
        quality('2026-09-21', 10),
      ],
    });
    const dayAfter = find(results, 'quality-session-budget').find((r) =>
      r.scope.includes('day after'),
    );

    expect(dayAfter?.breached).toBe(true);
    expect(dayAfter?.observed).toBe(1);
  });

  it('protects the final taper weeks, and does not let an override reach them', () => {
    const results = evaluateGuardrails({
      window: flatWeek('2026-10-12', 90),
    });
    const taper = find(results, 'protected-taper')[0];

    expect(taper?.breached).toBe(true);
    expect(taper?.threshold).toBe(60);
    expect(taper?.observed).toBe(90);
    expect(taper?.overridable).toBe(false);
  });

  it('does not let the goal marathon itself breach the taper protection it is the point of', () => {
    const raceWeek = evaluateGuardrails({
      window: [
        easy('2026-10-20', 16),
        easy('2026-10-21', 16),
        {
          date: '2026-10-24',
          km: 42.195,
          kind: 'race',
          slot: 'weekend-daytime',
        },
      ],
    });

    expect(find(raceWeek, 'protected-taper')[0]?.breached).toBe(false);
  });

  it('gates quality on soreness, and the gate is not overridable', () => {
    const window = [quality('2026-09-16', 10)];
    const sore = evaluateGuardrails({
      window,
      soreness: {
        severity: READINESS.sorenessBlocksQuality + 1,
        since: '2026-09-15',
      },
    });
    const gate = find(sore, 'soreness-quality-gate')[0];

    expect(gate?.breached).toBe(true);
    expect(gate?.observed).toBe(READINESS.sorenessBlocksQuality + 1);
    expect(gate?.overridable).toBe(false);
    expect(gate?.detail).toContain('swimming');

    const fine = evaluateGuardrails({
      window,
      soreness: { severity: 1, since: '2026-09-15' },
    });
    expect(find(fine, 'soreness-quality-gate')[0]?.breached).toBe(false);
  });

  it('treats a missing check-in as an absence rather than a green light', () => {
    const results = evaluateGuardrails({ window: [quality('2026-09-16', 10)] });
    const gate = find(results, 'soreness-quality-gate')[0];

    expect(gate?.observed).toBeNull();
    expect(gate?.breached).toBe(false);
    expect(gate?.detail).toContain('absence');
  });

  it('reports a single-session spike as advisory, never as a blocker', () => {
    const results = evaluateGuardrails({
      window: [
        { date: '2026-09-27', km: 33, kind: 'long', slot: 'weekend-daytime' },
      ],
      history: [{ date: '2026-09-19', km: 22 }],
    });
    const spike = find(results, 'single-session-spike').find((r) => r.breached);

    expect(spike?.observed).toBe(150);
    expect(spike?.threshold).toBe(GUARDRAILS.singleSessionSpikePct);
    expect(spike?.blocking).toBe(false);
  });

  it('does not invent a shortage of running days from a window that only sees part of a week', () => {
    // Three visible days is not a five-day week. A partial view must never
    // manufacture a breach -- that is how a correct plan gets refused.
    const results = evaluateGuardrails({
      window: [
        easy('2026-09-28', 30),
        easy('2026-09-29', 30),
        easy('2026-09-30', 30),
      ],
    });
    const spread = find(results, 'high-volume-spread')[0];

    expect(spread?.breached).toBe(false);
    expect(spread?.coverage.days).toBe(3);
  });
});
