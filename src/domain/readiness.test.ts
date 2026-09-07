import { describe, expect, it } from 'vitest';

import { LOAD, READINESS } from '../../config/training';
import { scoreReadiness, worstSoreness } from './readiness';

/**
 * The score is four weighted subjective terms and nothing else today. These
 * pin the three properties that would silently break: which soreness reading
 * counts, what a missing term does, and whether a verdict built on partial
 * history admits it.
 */

const FULL_HISTORY = LOAD.ctlWarmUpDays;

describe('soreness', () => {
  it('takes the worst location rather than averaging the body', () => {
    // Averaging turns one wrecked calf into mild all-over stiffness, which is
    // the reading that lets a quality session through.
    expect(
      worstSoreness([
        { location: 'calf', severity: 5 },
        { location: 'knee', severity: 0 },
        { location: 'quad', severity: 0 },
      ]),
    ).toBe(5);
  });

  it('reads an empty list as no reading, not as a zero', () => {
    expect(worstSoreness([])).toBeNull();
    expect(worstSoreness(null)).toBeNull();
  });

  it('gates quality at the configured severity and not below it', () => {
    const at = scoreReadiness(
      {
        soreness: [
          { location: 'calf', severity: READINESS.sorenessBlocksQuality },
        ],
      },
      FULL_HISTORY,
    );
    const below = scoreReadiness(
      {
        soreness: [
          { location: 'calf', severity: READINESS.sorenessBlocksQuality - 1 },
        ],
      },
      FULL_HISTORY,
    );

    expect(at.qualityBlocked).toBe(true);
    expect(below.qualityBlocked).toBe(false);
  });
});

describe('missing terms', () => {
  it('renormalises over the terms present instead of scoring a gap as bad', () => {
    // Sleep alone at full marks is a green day on what was actually reported.
    // Treating the three unreported terms as zero would make it red.
    const sleepOnly = scoreReadiness(
      { sleep: READINESS.inputScales.sleep.max },
      FULL_HISTORY,
    );

    expect(sleepOnly.score).toBe(1);
    expect(sleepOnly.band).toBe('green');
    expect(sleepOnly.termsUsed).toEqual(['sleep']);
  });

  it('reports which terms it used, so a thin day reads as thin', () => {
    const thin = scoreReadiness({ motivation: 3, sleep: 7 }, FULL_HISTORY);
    expect([...thin.termsUsed].sort()).toEqual(['motivation', 'sleep']);
  });

  it('is red with nothing to score, and says so', () => {
    const nothing = scoreReadiness({}, FULL_HISTORY);
    expect(nothing.band).toBe('red');
    expect(nothing.rationale).toContain('nothing to score');
  });
});

describe('direction of each scale', () => {
  it('scores a hard yesterday below an easy one', () => {
    const hard = scoreReadiness({ rpeYesterday: 10 }, FULL_HISTORY);
    const easy = scoreReadiness({ rpeYesterday: 1 }, FULL_HISTORY);
    expect(hard.score).toBeLessThan(easy.score);
  });

  it('scores a bad night below a good one', () => {
    const bad = scoreReadiness({ sleep: 3 }, FULL_HISTORY);
    const good = scoreReadiness({ sleep: 9 }, FULL_HISTORY);
    expect(bad.score).toBeLessThan(good.score);
  });
});

describe('CTL warm-up disclosure (REDLINES.md rule 4)', () => {
  it('states its own insufficiency below one CTL time constant', () => {
    const early = scoreReadiness({ sleep: 8 }, LOAD.ctlWarmUpDays - 1);
    expect(early.insufficientHistory).toBe(true);
    expect(early.caveat).toContain(
      `${LOAD.ctlWarmUpDays - 1} of ${LOAD.ctlWarmUpDays}`,
    );
  });

  it('drops the caveat once there is a full time constant behind it', () => {
    const settled = scoreReadiness({ sleep: 8 }, LOAD.ctlWarmUpDays);
    expect(settled.insufficientHistory).toBe(false);
    expect(settled.caveat).toBeNull();
  });
});

describe('bands', () => {
  /**
   * Motivation alone, so the score IS that one normalised reading and a band
   * boundary is a property of the floors rather than an artefact of four
   * weights. Margins rather than exact floors: `1 + 0.45 * 4` is
   * 2.8000000000000003 in binary and normalises back to 0.44999999999999996,
   * so an exact-boundary assertion tests floating point, not banding.
   */
  const { min, max } = READINESS.inputScales.motivation;
  const reading = (fraction: number) => min + fraction * (max - min);
  const bandAt = (fraction: number) =>
    scoreReadiness({ motivation: reading(fraction) }, FULL_HISTORY).band;

  it('is green above the green floor and amber just below it', () => {
    expect(bandAt(READINESS.greenFloor + 0.02)).toBe('green');
    expect(bandAt(READINESS.greenFloor - 0.02)).toBe('amber');
  });

  it('is amber above the amber floor and red just below it', () => {
    expect(bandAt(READINESS.amberFloor + 0.02)).toBe('amber');
    expect(bandAt(READINESS.amberFloor - 0.02)).toBe('red');
  });

  it('never reports green on a reading that scores below the amber floor', () => {
    expect(bandAt(0)).toBe('red');
    expect(bandAt(1)).toBe('green');
  });
});
