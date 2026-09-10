/**
 * The week generator.
 *
 * These assert the RULES, not a stored block. That distinction is the whole
 * point of the file: a test that pinned "week 2 Wednesday is 11.5 km" would pass
 * for a hand-written array and tell you nothing about whether the generator can
 * still produce a sane week when the anchor moves or a race is added.
 *
 * Four of these are regressions for bugs the generator had on its first run,
 * which is itself the argument for generating rather than typing: a 42-day array
 * hides its own contradictions, and rules surface them the moment they execute.
 */

import { describe, expect, it } from 'vitest';

import { BLOCK_WEEKS, RACES } from '../../../config/training';
import { prescribeBlock, prescribeWeek, thresholdKmFor } from './prescribe';

const BLOCK = prescribeBlock();
const weekOf = (n: number) => {
  const w = BLOCK.find((x) => x.week === n);
  if (!w) throw new Error(`no week ${String(n)}`);
  return w;
};

describe('quality budget', () => {
  it('spends nothing on threshold in a week that carries a race', () => {
    // REGRESSION. Week 5 first came out with a 10K race AND a tempo session --
    // the exact pairing the research said not to run, because the race already
    // is the week's hard session. Weeks 4 and 5 both carry races.
    expect(weekOf(4).sessions.reduce((a, s) => a + s.thresholdKm, 0)).toBe(0);
    expect(weekOf(5).sessions.reduce((a, s) => a + s.thresholdKm, 0)).toBe(0);
  });

  it('caps threshold at 6 km in the 60 km week and 6.5 km in the 80 km one', () => {
    // Literals, not `PRESCRIPTION.thresholdMaxKm`. Reading the cap from config
    // to compute the expectation makes both sides move together, and the first
    // version of this test passed happily with the ceiling raised to 99.
    expect(weekOf(2).sessions.reduce((a, s) => a + s.thresholdKm, 0)).toBe(6);
    expect(weekOf(3).sessions.reduce((a, s) => a + s.thresholdKm, 0)).toBe(6.5);
    // No week anywhere exceeds the ceiling the design settled on.
    for (const w of BLOCK) {
      expect(
        w.sessions.reduce((a, s) => a + s.thresholdKm, 0),
      ).toBeLessThanOrEqual(6.5);
    }
  });

  it('gives the 60 km rebuild week less threshold than the 80 km build week', () => {
    // The fraction binds on the small week and the absolute cap on the large
    // one. That ordering is the design: the tightest constraint lands on the
    // week that opens two days after a maximal half.
    expect(thresholdKmFor(BLOCK_WEEKS[1]!)).toBeLessThan(
      thresholdKmFor(BLOCK_WEEKS[2]!),
    );
  });

  it('never places two hard sessions on consecutive days', () => {
    for (const w of BLOCK) {
      const hard = w.sessions.filter(
        (s) => s.thresholdKm > 0 || s.mpKm > 0 || s.race !== null,
      );
      for (const a of hard) {
        for (const b of hard) {
          if (a.date === b.date) continue;
          const gap = Math.abs(Date.parse(a.date) - Date.parse(b.date));
          expect(gap).toBeGreaterThan(86_400_000);
        }
      }
    }
  });
});

describe('races', () => {
  it('makes the race the week’s long session, wherever it falls', () => {
    // REGRESSION. The goal marathon is on a Saturday while race week's Sunday is
    // the 25th, so the generator placed the marathon as an ordinary easy day and
    // the block simply did not contain its own goal race.
    const marathon = weekOf(7).sessions.find(
      (s) => s.race === 'Battersea Park Marathon',
    );
    expect(marathon?.km).toBeCloseTo(42.195, 3);
    expect(marathon?.zone).toBe('race');
  });

  it('carries every live race in RACES and none of the dropped ones', () => {
    const placed = BLOCK.flatMap((w) =>
      w.sessions.flatMap((s) => (s.race ? [s.race] : [])),
    );
    for (const r of RACES) {
      if (r.role === 'dropped') expect(placed).not.toContain(r.name);
      else expect(placed).toContain(r.name);
    }
  });
});

describe('strength placement', () => {
  it('puts legs on the week’s longest run, never on an easy day', () => {
    // Luis's rule, and the reason for it: upper-body work does not compete with
    // running recovery, lower-body work does. Legs on an easy day turns that day
    // hard, which is how a polarised week becomes an everything-moderate week.
    for (const w of BLOCK) {
      const legs = w.sessions.find((s) => s.strength === 'legs');
      if (!legs) continue;
      const longest = w.sessions.reduce((a, b) => (b.km > a.km ? b : a));
      expect(legs.date).toBe(longest.date);
    }
  });

  it('runs three lifts a week through week 5, then two', () => {
    // Week numbers as literals. Deriving the boundary from
    // `STRENGTH.dropLegsFromWeek` made this pass with the value set to 99.
    for (const n of [1, 2, 3, 4, 5]) {
      expect(
        weekOf(n).sessions.flatMap((s) => (s.strength ? [1] : [])),
      ).toHaveLength(3);
    }
    for (const n of [6, 7]) {
      expect(
        weekOf(n).sessions.flatMap((s) => (s.strength ? [1] : [])),
      ).toHaveLength(2);
    }
  });

  it('drops legs from weeks 6 and 7, and keeps it in 1 to 5', () => {
    for (const n of [1, 2, 3, 4, 5]) {
      expect(weekOf(n).sessions.map((s) => s.strength)).toContain('legs');
    }
    for (const n of [6, 7]) {
      expect(weekOf(n).sessions.map((s) => s.strength)).not.toContain('legs');
    }
  });
});

describe('volume', () => {
  it('places the ratified weekly target, and never invents volume', () => {
    // The generator fills a week whose size the athlete ratified. Silently
    // re-cutting 100 km would make that ratification meaningless.
    for (const w of BLOCK) {
      if (w.notes.length > 0) continue; // weeks that flagged a compromise
      expect(Math.abs(w.placedKm - w.targetKm)).toBeLessThan(0.6);
    }
  });

  it('says so rather than going negative when one session exceeds the week', () => {
    // REGRESSION. Race week's target is 32 km and its marathon is 42.195, so the
    // easy budget went to -10 and every easy day came out at -5.1 km.
    const race = weekOf(7);
    expect(race.sessions.every((s) => s.km >= 0)).toBe(true);
    expect(race.notes.join(' ')).toContain('exceeds');
  });

  it('never labels a zero-kilometre day as a run', () => {
    // REGRESSION. Days squeezed out by the run-day cap kept their `easy` zone,
    // so the render showed a pace band against no distance -- which reads as a
    // session to be done.
    for (const w of BLOCK) {
      for (const s of w.sessions) {
        if (s.km === 0) expect(s.zone).toBe('rest');
        if (s.zone === 'rest') expect(s.strides).toBe(0);
      }
    }
  });

  it('respects each week’s run-day count', () => {
    for (const w of BLOCK) {
      const runDays = w.sessions.filter((s) => s.km > 0).length;
      const declared = BLOCK_WEEKS.find((b) => b.week === w.week)?.minRunDays;
      if (declared == null) continue;
      expect(runDays).toBeLessThanOrEqual(declared);
    }
  });
});

describe('it regenerates rather than storing', () => {
  it('produces a different block when the ratified volume changes', () => {
    // The property that makes this infrastructure rather than a document: change
    // an input, get a different plan, with no session edited by hand.
    const original = BLOCK_WEEKS[2]!;
    const heavier = { ...original, targetKm: original.targetKm + 20 };
    const before = prescribeWeek(original);
    const after = prescribeWeek(heavier);
    expect(after.placedKm).toBeGreaterThan(before.placedKm + 15);
    expect(after.sessions.length).toBe(before.sessions.length);
  });

  it('moves the whole week when the long run moves', () => {
    const original = BLOCK_WEEKS[2]!;
    const moved = { ...original, longRunDate: original.monday };
    const after = prescribeWeek(moved);
    const longest = after.sessions.reduce((a, b) => (b.km > a.km ? b : a));
    expect(longest.date).toBe(original.monday);
    // and the lift follows it, because the rule is about the run not the date
    expect(after.sessions.find((s) => s.strength === 'legs')?.date).toBe(
      original.monday,
    );
  });
});
