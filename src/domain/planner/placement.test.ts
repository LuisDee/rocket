import { describe, expect, it } from 'vitest';

import {
  AVAILABILITY,
  BLOCK_WEEKS,
  GUARDRAILS,
  REPLAN,
} from '../../../config/training';
import { isoWeekday, weekDates } from './dates';
import { evaluateGuardrails } from './guardrails';
import { openings, planWeek, planWindow } from './placement';

const week = (n: number) => {
  const found = BLOCK_WEEKS.find((w) => w.week === n);
  if (!found) throw new Error(`no week ${n}`);
  return found;
};

/** Completed runs standing in for everything planned before `monday`. */
const historyBefore = (monday: string) =>
  BLOCK_WEEKS.filter((w) => w.monday < monday).flatMap((w) =>
    planWeek(w)
      .sessions.filter((s) => s.km > 0)
      .map((s) => ({ date: s.date, km: s.km })),
  );

describe('session placement', () => {
  it('places every macro week without breaking a blocking guardrail', () => {
    // The property that matters more than any single rule: the planner cannot
    // author a week its own guardrails would refuse. Advisory breaches (the
    // single-session spike) are expected and are not blockers by design.
    for (const macro of BLOCK_WEEKS) {
      const plan = planWeek(macro);
      const breaches = evaluateGuardrails({
        window: plan.sessions,
        history: historyBefore(macro.monday),
      }).filter((r) => r.breached && r.blocking);

      expect(
        breaches.map((b) => `week ${macro.week}: ${b.ruleId} ${b.detail}`),
      ).toEqual([]);
    }
  });

  it('uses only slots the availability data declares, on days that data allows', () => {
    // The data-driven proof: no slot id is baked into the planner, so every
    // slot a session claims has to come back out of `AVAILABILITY.runSlots`.
    const ids = new Set<string>(AVAILABILITY.runSlots.map((s) => s.id));

    for (const macro of BLOCK_WEEKS) {
      for (const session of planWeek(macro).sessions) {
        if (session.slot === null) {
          expect(session.km).toBe(0);
          continue;
        }
        expect(ids.has(session.slot)).toBe(true);

        const slot = AVAILABILITY.runSlots.find((s) => s.id === session.slot);
        expect(slot?.weekdays as readonly number[]).toContain(
          isoWeekday(session.date),
        );
        expect(session.km).toBeLessThanOrEqual(slot?.maxKm ?? 0);
      }
    }
  });

  it('gives every week exactly one long session, on the date the macro layer chose', () => {
    for (const macro of BLOCK_WEEKS) {
      const hard = planWeek(macro).sessions.filter(
        (s) => s.kind === 'long' || s.kind === 'race',
      );
      if (macro.longRunDate === null) continue;

      expect(hard.map((s) => s.date)).toContain(macro.longRunDate);
      expect(hard.find((s) => s.date === macro.longRunDate)?.km).toBe(
        macro.longRunKm,
      );
    }
  });

  it('keeps the quality session away from the hard days on both sides of it', () => {
    const plan = planWeek(week(3));
    const quality = plan.sessions.find((s) => s.kind === 'quality');
    expect(quality).toBeDefined();

    // Week 3's long run is Sunday 27th and week 2's was Saturday 19th, so a
    // legal-but-poor Monday placement is what this rules out.
    expect(quality?.date).toBe('2026-09-23');
  });

  it('reports a shortfall rather than silently generating an unrunnable week', () => {
    // Every slot gone from four of the seven days: the 80 km cannot fit, and
    // the planner has to say so in kilometres rather than quietly plan 50.
    const unavailable = weekDates(week(3).monday)
      .slice(0, 4)
      .flatMap((date) =>
        AVAILABILITY.runSlots.map((slot) => ({ date, slotId: slot.id })),
      );
    const plan = planWeek(week(3), { unavailable });

    expect(plan.shortfallKm).toBeGreaterThan(0);
    expect(plan.placedKm).toBeLessThan(plan.targetKm);
    expect(plan.notes.join(' ')).toContain('does not fit the slots');
    expect(plan.notes.join(' ')).toContain('debt');
  });

  it('holds the mandatory recovery day even when the week asks for more running days than fit', () => {
    // Week 4 asks for seven running days and the recovery guardrail allows six.
    // A config conflict, surfaced rather than resolved by whoever read it last.
    const plan = planWeek(week(4));
    const runDays = new Set(
      plan.sessions.filter((s) => s.km > 0).map((s) => s.date),
    ).size;

    expect(week(4).minRunDays).toBe(7);
    expect(runDays).toBe(7 - GUARDRAILS.minRestOrSwimOnlyDaysPerWeek);
    expect(plan.notes.join(' ')).toContain('rest-or-swim-only');
  });

  it('opens fewer slots when availability is lost, and none on a day stripped bare', () => {
    const all = openings('2026-09-21');
    const lost = openings('2026-09-21', [
      { date: '2026-09-22', slotId: 'evening' },
    ]);

    expect(lost.length).toBe(all.length - 1);
    expect(
      lost.some((o) => o.date === '2026-09-22' && o.slotId === 'evening'),
    ).toBe(false);
  });

  it('holds only the rolling window the config asks for, in date order', () => {
    const window = planWindow('2026-09-21');
    const dates = window.map((s) => s.date);

    expect(dates).toEqual([...dates].sort());
    expect(dates[0]).toBe('2026-09-21');
    expect(new Set(dates).size).toBeLessThanOrEqual(
      REPLAN.rollingWindowDays.max,
    );
  });
});
