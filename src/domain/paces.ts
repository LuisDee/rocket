/**
 * Training paces, derived from one race rather than chosen.
 *
 * ## Why this exists
 *
 * Until 2026-09-09 the planner produced `{ date, km, kind }` and nothing else.
 * `kind: 'quality'` was a bare label -- no pace, no structure, no session
 * content anywhere in the codebase. It said how far and which day, and stopped.
 *
 * ## The number this module exists to keep out
 *
 * Garmin reports a lactate-threshold pace of 4:20.9/km. His best 5.10 km race
 * was 4:19/km, so Garmin is asserting that his 22-minute race pace is
 * sustainable for an hour. It refutes itself on his own file, and Lu et al. 2025
 * measured the same failure across recreational runners: smartwatch LT PACE
 * overestimated with MAPE 25.78 %, while smartwatch LT HEART RATE was not
 * significantly different from a laboratory test.
 *
 * So the heart-rate anchors come from the device and the pace anchors come from
 * a race. `ATHLETE` carries a comment where the device's pace would go,
 * explaining why it is absent, because the failure mode is somebody helpfully
 * adding it back.
 *
 * ## Everything is a multiplier
 *
 * No session anywhere stores a pace. A prescription names a ZONE, and a zone
 * becomes seconds per kilometre only at render time, from a single anchor. That
 * is REDLINES rule 1 satisfied by construction, and it means re-anchoring after
 * Saturday's half is one field in `config/training.ts` rather than forty
 * sessions.
 *
 * ## What is evidence and what is convention
 *
 * The multipliers are Daniels/Gilbert curve-fits and coaching convention, not
 * trial findings, and `config/training.ts` grades each one. The strongest claim
 * here is negative -- that Garmin's pace is wrong -- and it rests on the
 * athlete's own file rather than on any citation.
 */

import {
  ATHLETE,
  HR_ZONES,
  PACE_ANCHOR,
  PACE_MULTIPLIERS,
  RIEGEL,
} from '../../config/training';

export type Zone = 'recovery' | 'easy' | 'marathon' | 'threshold';

/** A zone's pace, in seconds per kilometre. */
export type ZonePace = {
  readonly zone: Zone;
  /** Fastest end of the band. */
  readonly fastSecPerKm: number;
  /** Slowest end. Equal to `fastSecPerKm` for a zone with no band. */
  readonly slowSecPerKm: number;
  /** The heart-rate range that governs, and that wins on disagreement. */
  readonly hr: { readonly low: number | null; readonly high: number };
  /** True when heart rate governs and the pace is an expected output. */
  readonly hrGoverns: boolean;
};

/**
 * A performance that could become the pace anchor.
 *
 * `stoppedSec` matters as much as the time: a 21 km run with 17 minutes of
 * standing in it looks like his fastest half and is not a half at all.
 */
export type Effort = {
  readonly date: string;
  readonly distanceKm: number;
  readonly timeSec: number;
  readonly stoppedSec: number;
};

/**
 * Riegel: `t2 = t1 * (d2 / d1) ^ k`.
 *
 * `k` is the fatigue exponent. 1.06 is the population value; a HIGHER `k` means
 * performance falls away faster with distance, which is what a thin volume base
 * produces. His measured 1.1315 is well above population, and moving it toward
 * 1.10 is the entire thesis of the block.
 */
export function riegel(
  fromSec: number,
  fromKm: number,
  toKm: number,
  exponent: number,
): number {
  if (fromKm <= 0 || toKm <= 0 || fromSec <= 0) return 0;
  return fromSec * Math.pow(toKm / fromKm, exponent);
}

/**
 * Normalise an effort to a standard distance, so a 21.14 km run is comparable
 * with a 21.0975 km race.
 *
 * Uses `PACE_ANCHOR.normalisationExponent`, which is fitted for this athlete and
 * is used ONLY here. Predicting across distances uses `RIEGEL` instead, and
 * conflating the two would silently apply a short-distance exponent to a
 * marathon.
 */
export function normalisedPaceSecPerKm(
  effort: Effort,
  toKm: number = PACE_ANCHOR.normalisedDistanceKm,
): number {
  const time = riegel(
    effort.timeSec,
    effort.distanceKm,
    toKm,
    PACE_ANCHOR.normalisationExponent,
  );
  return time / toKm;
}

/** Whether an effort is allowed to become the anchor, and why not when it is not. */
export function anchorRejection(effort: Effort): string | null {
  if (
    (PACE_ANCHOR.excludedEfforts as readonly string[]).includes(effort.date)
  ) {
    return `${effort.date} is on the excluded list: it looks faster than the anchor and is not a real effort.`;
  }
  if (effort.stoppedSec > PACE_ANCHOR.rejectIfStoppedOverSec) {
    return (
      `${effort.date} carries ${String(Math.round(effort.stoppedSec / 60))} min of stopped time, over the ` +
      `${String(Math.round(PACE_ANCHOR.rejectIfStoppedOverSec / 60))} min limit. Timer pace is not race pace when the clock stops.`
    );
  }
  if (effort.timeSec > PACE_ANCHOR.rejectIfSlowerThanSec) {
    return `${effort.date} is slower than the floor for re-anchoring, so the existing anchor stands.`;
  }
  return null;
}

/**
 * Every zone's pace for a given anchor.
 *
 * `anchorSecPerKm` defaults to the configured anchor, so a caller that wants
 * "what would my paces be off a 1:44 half" passes one number.
 */
export function derivePaces(
  anchorSecPerKm: number = PACE_ANCHOR.normalisedPaceSecPerKm,
): Record<Zone, ZonePace> {
  const band = (range: readonly [number, number]) => ({
    fastSecPerKm: anchorSecPerKm * range[0],
    slowSecPerKm: anchorSecPerKm * range[1],
  });

  const recovery = band(
    PACE_MULTIPLIERS.recovery as unknown as readonly [number, number],
  );
  const easy = band(
    PACE_MULTIPLIERS.easy as unknown as readonly [number, number],
  );
  const marathon = anchorSecPerKm * PACE_MULTIPLIERS.marathon;
  const threshold = anchorSecPerKm * PACE_MULTIPLIERS.threshold;
  const tBand = PACE_MULTIPLIERS.thresholdBandSecPerKm;

  return {
    recovery: {
      zone: 'recovery',
      ...recovery,
      hr: { low: null, high: HR_ZONES.recoveryCeiling },
      hrGoverns: true,
    },
    easy: {
      zone: 'easy',
      ...easy,
      hr: { low: HR_ZONES.recoveryCeiling, high: HR_ZONES.easyCeiling },
      // The band is what the heart-rate ceiling should PRODUCE. It gets faster
      // across a block at the same heart rate, and that fall is the adaptation
      // signal -- so a pace prescription here would suppress the measurement.
      hrGoverns: true,
    },
    marathon: {
      zone: 'marathon',
      fastSecPerKm: marathon - 4,
      slowSecPerKm: marathon + 4,
      hr: {
        low: HR_ZONES.marathonTarget[0],
        high: HR_ZONES.marathonCeiling,
      },
      hrGoverns: false,
    },
    threshold: {
      zone: 'threshold',
      fastSecPerKm: threshold - tBand,
      slowSecPerKm: threshold + tBand,
      hr: {
        low: HR_ZONES.thresholdWorkMean[0],
        high: HR_ZONES.thresholdWorkMean[1],
      },
      // Threshold is the one zone run TO a pace, because its whole purpose is a
      // controlled dose. The HR band is the check, not the target -- and if the
      // work-interval mean exceeds `thresholdPaceTooFastAbove`, the pace is
      // wrong rather than the athlete.
      hrGoverns: false,
    },
  };
}

/**
 * Did a threshold session confirm the derived pace, or is the pace too fast?
 *
 * The self-correcting loop. The threshold pace is three formulas agreeing with
 * each other, none of them validated on this athlete, so the first sessions are
 * the experiment -- and without this the derived number would never be revisited.
 */
export function thresholdVerdict(workIntervalMeanHr: number): {
  readonly tooFast: boolean;
  readonly adjustSecPerKm: number;
  readonly detail: string;
} {
  if (workIntervalMeanHr > HR_ZONES.thresholdPaceTooFastAbove) {
    return {
      tooFast: true,
      adjustSecPerKm: 5,
      detail:
        `Work intervals averaged ${String(workIntervalMeanHr)} bpm, above the ${String(HR_ZONES.thresholdPaceTooFastAbove)} bpm mark. ` +
        `That is the pace being too fast, not the athlete being unfit: slow the threshold pace by 5 s/km and re-derive.`,
    };
  }
  return {
    tooFast: false,
    adjustSecPerKm: 0,
    detail:
      `Work intervals averaged ${String(workIntervalMeanHr)} bpm, inside the ${String(HR_ZONES.thresholdWorkMean[0])}-${String(HR_ZONES.thresholdWorkMean[1])} bpm band. ` +
      `The derived threshold pace is holding.`,
  };
}

/**
 * Marathon prediction from the anchor, as a floor and a target.
 *
 * The floor uses his MEASURED exponent -- what he runs if the block changes
 * nothing. The target uses the durability goal. The gap between them is the
 * block's entire claimed benefit, and stating both is what stops the target
 * being read as a prediction.
 */
export function marathonProjection(
  anchorSecPerKm: number = PACE_ANCHOR.normalisedPaceSecPerKm,
): {
  readonly floorSec: number;
  readonly targetSec: number;
} {
  const halfKm = PACE_ANCHOR.normalisedDistanceKm;
  const halfSec = anchorSecPerKm * halfKm;
  const marathonKm = 42.195;
  return {
    floorSec: riegel(halfSec, halfKm, marathonKm, RIEGEL.measured),
    targetSec: riegel(halfSec, halfKm, marathonKm, RIEGEL.durabilityTarget),
  };
}

/** Heart rate as a percentage of measured max, for display. */
export function pctOfMax(bpm: number): number {
  return Math.round((bpm / ATHLETE.hrMax) * 1000) / 10;
}
