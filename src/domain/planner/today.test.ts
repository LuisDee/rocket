/**
 * What the athlete is actually doing today, with the morning check-in applied.
 *
 * The property these defend is that a red morning CHANGES THE SESSION. Before
 * this module existed, `readiness.qualityBlocked` was computed correctly and
 * consumed for one sentence of copy: the home screen printed "Quality work is
 * gated today" thirty pixels under a card that still read THRESHOLD, with the
 * threshold pace band and the interval structure under it. The athlete reads the
 * prescription, not the footnote.
 */

import { describe, expect, it } from 'vitest';

import { BLOCK_WEEKS, READINESS } from '../../../config/training';
import type { CheckIn } from '../types';
import { gateFromCheckIn, prescribeDay, prescribeWeek } from './today';

const checkIn = (
  localDate: string,
  severity: number | null,
  extra: Partial<CheckIn> = {},
): CheckIn => ({
  id: `ci-${localDate}`,
  localDate,
  rpeYesterday: 4,
  soreness: severity === null ? null : [{ location: 'calf', severity }],
  sleep: 8,
  motivation: 4,
  note: null,
  ...extra,
});

const WEEK_3_MONDAY = '2026-09-21';

const week3 = () => {
  const found = BLOCK_WEEKS.find((w) => w.monday === WEEK_3_MONDAY);
  if (!found) throw new Error(`no week starting ${WEEK_3_MONDAY}`);
  return found;
};

/** Week 3's quality day, chosen by placement: Wednesday 2026-09-23. */
const QUALITY_DATE = '2026-09-23';

describe('the gate a check-in puts on the plan', () => {
  it('gates on soreness alone, whatever the overall band says', () => {
    // REGRESSION. The cron read `band !== 'green' && severity !== null`, so a
    // sore calf at 3 alongside good sleep, high motivation and an easy previous
    // day scores 0.73 -- GREEN -- and the gate never fired. Soreness is the
    // injury signal; it does not get outvoted by having slept well.
    const green = checkIn('2026-09-23', READINESS.sorenessBlocksQuality, {
      sleep: 9,
      motivation: 5,
      rpeYesterday: 1,
    });
    expect(gateFromCheckIn(green, '2026-09-23')).toEqual({
      severity: 3,
      since: '2026-09-23',
    });
  });

  it('does not gate below the threshold, whatever the band says', () => {
    // The other direction, and also a regression: the repair downgraded quality
    // on ANY soreness reading paired with an amber band, so a 1/5 niggle after a
    // bad night took out the week's only hard session.
    const amber = checkIn('2026-09-23', 1, { sleep: 3, motivation: 1 });
    expect(gateFromCheckIn(amber, '2026-09-23')).toBeNull();
  });

  it('lets a stale reading expire instead of gating the rest of the block', () => {
    const sore = checkIn('2026-09-21', 4);
    expect(gateFromCheckIn(sore, '2026-09-21')).not.toBeNull();
    expect(gateFromCheckIn(sore, '2026-09-22')).not.toBeNull();
    expect(gateFromCheckIn(sore, '2026-09-23')).toBeNull();
    expect(gateFromCheckIn(sore, '2026-10-24')).toBeNull();
  });

  it('treats no check-in as no gate, which is not the same as green', () => {
    expect(gateFromCheckIn(null, '2026-09-23')).toBeNull();
    expect(
      gateFromCheckIn(checkIn('2026-09-23', null), '2026-09-23'),
    ).toBeNull();
  });
});

describe('a red morning changes the session', () => {
  it('turns the threshold day into a genuinely easy run at the easy pace', () => {
    const gate = { severity: 4, since: QUALITY_DATE };
    const before = prescribeDay(QUALITY_DATE, null);
    const after = prescribeDay(QUALITY_DATE, gate);

    expect(before?.zone).toBe('threshold');
    expect(before?.thresholdKm).toBeGreaterThan(0);

    expect(after?.zone).toBe('easy');
    expect(after?.thresholdKm).toBe(0);
    // "Do not downgrade the session to 'easy tempo' -- cancel it. There is no
    // version of this block where a compromised threshold session is worth its
    // cost." (docs/research/session-prescription-design.json)
    expect(after?.what).not.toMatch(/threshold|tempo/i);
  });

  it('keeps the distance, because intensity is cut before volume', () => {
    const before = prescribeDay(QUALITY_DATE, null);
    const after = prescribeDay(QUALITY_DATE, {
      severity: 5,
      since: QUALITY_DATE,
    });

    expect(after?.km).toBe(before?.km);
    expect(after?.km).toBeGreaterThan(0);
  });

  it('drops the strides too, on the same gate', () => {
    const gate = { severity: 3, since: WEEK_3_MONDAY };
    const gated = prescribeWeek(week3(), gate).sessions;
    const open = prescribeWeek(week3(), null).sessions;

    expect(open.some((s) => s.strides > 0)).toBe(true);
    expect(gated.every((s) => s.strides === 0)).toBe(true);
  });

  it('says what it took away and why, so the demotion is visible', () => {
    const after = prescribeDay(QUALITY_DATE, {
      severity: 4,
      since: QUALITY_DATE,
    });

    expect(after?.demoted?.fromZone).toBe('threshold');
    expect(after?.demoted?.fromWhat).toContain('threshold');
    expect(after?.demoted?.reason).toContain('Soreness 4');
    expect(after?.demoted?.reason).toContain('distance stands');
  });

  it('does not gate a day the reading cannot speak to', () => {
    // The gate applies FORWARD. A Friday check-in must not retroactively delete
    // the threshold session he already ran on the Wednesday -- rewriting history
    // to match this morning's mood is how a plan stops being a record.
    const friday = prescribeDay(QUALITY_DATE, {
      severity: 5,
      since: '2026-09-25',
    });

    expect(friday?.zone).toBe('threshold');
    expect(friday?.demoted).toBeNull();
  });

  it('leaves a green morning identical to no check-in at all', () => {
    const green = gateFromCheckIn(checkIn(QUALITY_DATE, 1), QUALITY_DATE);
    expect(prescribeWeek(week3(), green).sessions).toEqual(
      prescribeWeek(week3(), null).sessions,
    );
  });

  it('marks nothing as demoted when nothing was', () => {
    for (const s of prescribeWeek(week3(), null).sessions) {
      expect(s.demoted).toBeNull();
    }
  });
});
