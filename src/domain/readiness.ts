/**
 * Readiness from a check-in alone. docs/specs/02-load-engine.md:19-24.
 *
 * SUBJECTIVE ONLY, deliberately. The objective half of `READINESS` needs a
 * wellness snapshot that no sync writes yet, and the musculoskeletal load
 * component is Stage 8. What is here is the whole of the score that can be
 * computed from data this system actually holds, and it is enough to answer
 * "should I do the quality session" -- which is the question the check-in
 * exists for.
 *
 * Every number is read from `config/training.ts` (REDLINES.md rule 1); this
 * file contains no threshold of its own.
 *
 * REDLINES.md rule 4 is discharged by `insufficientHistory` and the sentence
 * that comes with it: a verdict built on less than one CTL time constant states
 * its own insufficiency, in the payload, where a caller cannot drop it without
 * noticing.
 */

import { LOAD, READINESS } from '../../config/training';

export type Soreness = { readonly location: string; readonly severity: number };

export type ReadinessInput = {
  readonly rpeYesterday?: number | null;
  readonly soreness?: readonly Soreness[] | null;
  readonly sleep?: number | null;
  readonly motivation?: number | null;
};

export type Readiness = {
  readonly score: number;
  readonly band: 'green' | 'amber' | 'red';
  /**
   * Which of the four terms were present. A thin day must read as thin.
   *
   * A fresh mutable array, not a `readonly` one: it is rebuilt on every call and
   * every consumer so far has wanted to sort it, which a readonly array refuses.
   */
  readonly termsUsed: string[];
  readonly qualityBlocked: boolean;
  readonly rationale: string;
  /** True while activity history is shorter than one CTL time constant. */
  readonly insufficientHistory: boolean;
  readonly caveat: string | null;
};

type ScaleKey = keyof typeof READINESS.inputScales;

/** A reading mapped onto 0-1 where 1 is good, clamped to the stated range. */
function normalise(key: ScaleKey, reading: number): number {
  const scale = READINESS.inputScales[key];
  const span = scale.max - scale.min;
  const clamped = Math.min(Math.max(reading, scale.min), scale.max);
  const fraction = span === 0 ? 0 : (clamped - scale.min) / span;
  return scale.worseIsHigh ? 1 - fraction : fraction;
}

/** The dominant soreness reading: the worst location, not their average. */
export function worstSoreness(
  soreness: readonly Soreness[] | null | undefined,
): number | null {
  if (!soreness || soreness.length === 0) return null;
  return soreness.reduce((worst, s) => Math.max(worst, s.severity), 0);
}

/**
 * Score a check-in.
 *
 * `historyDays` is how many days of activity history stand behind it. Passed in
 * rather than read here so this stays a pure function of its inputs -- the
 * caller counts the rows.
 */
export function scoreReadiness(
  input: ReadinessInput,
  historyDays: number,
): Readiness {
  const worst = worstSoreness(input.soreness);
  const readings: { key: ScaleKey; value: number | null | undefined }[] = [
    { key: 'soreness', value: worst },
    { key: 'sleep', value: input.sleep },
    { key: 'motivation', value: input.motivation },
    { key: 'rpeYesterday', value: input.rpeYesterday },
  ];

  const present = readings.filter(
    (r): r is { key: ScaleKey; value: number } =>
      r.value !== null && r.value !== undefined && Number.isFinite(r.value),
  );

  // Renormalise over the terms actually present: a missing motivation reading
  // must not drag the score toward zero as though it were a bad one.
  const weightOf = (key: ScaleKey) => READINESS.subjectiveWeights[key];
  const totalWeight = present.reduce((sum, r) => sum + weightOf(r.key), 0);
  const raw =
    totalWeight === 0
      ? 0
      : present.reduce(
          (sum, r) => sum + weightOf(r.key) * normalise(r.key, r.value),
          0,
        ) / totalWeight;

  /**
   * Rounded to four places BEFORE banding, so the floors land where the config
   * says they do. A reading exactly on `amberFloor` normalises to
   * 0.44999999999999996 in binary floating point and banded red -- a threshold
   * the config states and the code does not apply, which is worse than a
   * threshold set in the wrong place because nothing shows it.
   */
  const score = Math.round(raw * 10_000) / 10_000;

  const band =
    present.length === 0
      ? 'red'
      : score >= READINESS.greenFloor
        ? 'green'
        : score >= READINESS.amberFloor
          ? 'amber'
          : 'red';

  const qualityBlocked =
    worst !== null && worst >= READINESS.sorenessBlocksQuality;

  const insufficientHistory = historyDays < LOAD.ctlWarmUpDays;

  return {
    score,
    band,
    termsUsed: present.map((r) => r.key),
    qualityBlocked,
    rationale: rationale(band, present.length, worst, qualityBlocked),
    insufficientHistory,
    caveat: insufficientHistory
      ? `Provisional: ${historyDays} of ${LOAD.ctlWarmUpDays} days of history. ` +
        `CTL has not had one time constant to settle, so this is a subjective ` +
        `reading with no load state behind it -- treat it as a mood check, not a verdict.`
      : null,
  };
}

function rationale(
  band: string,
  termCount: number,
  worst: number | null,
  qualityBlocked: boolean,
): string {
  if (termCount === 0)
    return 'No check-in today, so there is nothing to score.';
  const parts = [`${band} on ${termCount} of 4 subjective terms`];
  if (worst !== null) parts.push(`worst soreness ${worst}/5`);
  if (qualityBlocked) {
    parts.push(
      `soreness at or above ${READINESS.sorenessBlocksQuality} gates all quality work`,
    );
  }
  return `${parts.join('; ')}.`;
}
