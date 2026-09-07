/**
 * Reading a crop summary, for a human deciding whether to keep the result.
 *
 * The cropper removes paused segments from a FIT file. The decision Luis is
 * making is not "is this file valid" -- the forensic inspector reports on that
 * and deliberately returns no verdict -- it is "is this the run I remember".
 *
 * The one thing worth understanding before reading the rest: a crop removes
 * TIME, not DISTANCE. Standing still logs seconds and no metres, so elapsed
 * time should fall a lot and distance should barely move. A big distance delta
 * means the cropper took out something the watch thought was movement, which is
 * the case worth interrupting for.
 */

/** As written by the ingest pipeline. See `ingested_activities.crop_summary`. */
export type CropSummary = {
  elapsedSecondsBefore: number;
  elapsedSecondsAfter: number;
  movingSecondsBefore: number;
  movingSecondsAfter: number;
  distanceKmBefore: number;
  distanceKmAfter: number;
  pausesRemoved: { startOffsetS: number; durationS: number }[];
  /**
   * False when the run had no timer pauses. The cropper writes nothing in that
   * case and the "cropped" file is a byte-identical copy of the original --
   * still perfectly shippable, but nothing was done to it and the screen must
   * not imply otherwise.
   */
  cropApplied: boolean;
};

/**
 * A crop should move distance by essentially nothing. 50 m is generous for
 * float and lap-boundary noise while still catching a cropper that ate a real
 * segment.
 *
 * ponytail: a fixed threshold, not a proportion of distance. A 50 m error
 * matters the same on a 5 km run as on a 35 km one because it means the same
 * thing -- movement was removed. Revisit if it turns out to fire on long runs.
 */
export const DISTANCE_ANOMALY_KM = 0.05;

export type CropDelta = {
  elapsedSecondsRemoved: number;
  movingSecondsRemoved: number;
  distanceKmChanged: number;
  pauseCount: number;
  pauseSecondsTotal: number;
  /** The removed time is not explained by the pauses the report lists. */
  pauseAccountingMismatch: boolean;
  /** Distance moved further than a crop can innocently explain. */
  distanceAnomaly: boolean;
};

export function cropDelta(summary: CropSummary): CropDelta {
  const pauseSecondsTotal = summary.pausesRemoved.reduce(
    (sum, p) => sum + p.durationS,
    0,
  );
  const elapsedSecondsRemoved =
    summary.elapsedSecondsBefore - summary.elapsedSecondsAfter;
  const distanceKmChanged = summary.distanceKmAfter - summary.distanceKmBefore;

  return {
    elapsedSecondsRemoved,
    movingSecondsRemoved:
      summary.movingSecondsBefore - summary.movingSecondsAfter,
    distanceKmChanged,
    pauseCount: summary.pausesRemoved.length,
    pauseSecondsTotal,
    // One second of slack for rounding at segment boundaries. Beyond that the
    // listed pauses do not explain the time that vanished, so the screen should
    // not present the list as the whole story.
    pauseAccountingMismatch:
      summary.cropApplied &&
      Math.abs(elapsedSecondsRemoved - pauseSecondsTotal) > 1,
    distanceAnomaly: Math.abs(distanceKmChanged) > DISTANCE_ANOMALY_KM,
  };
}

/** A forensic finding, as the inspector emits them. No verdict field, by design. */
export type ForensicFinding = {
  check: string;
  severity: string;
  detail?: string;
};

export type ForensicReport = {
  anomalyScore?: number;
  worstSeverity?: string;
  findings?: ForensicFinding[];
};

const SEVERITY_ORDER = ['info', 'low', 'medium', 'high', 'critical'];

/**
 * Findings worth showing, worst first. `info` is dropped: the inspector emits
 * one per check that passed, and a screen listing thirty green lines buries the
 * one red one.
 */
export function notableFindings(
  report: ForensicReport | null | undefined,
): ForensicFinding[] {
  const findings = report?.findings ?? [];
  return findings
    .filter((f) => f.severity.toLowerCase() !== 'info')
    .sort(
      (a, b) =>
        SEVERITY_ORDER.indexOf(b.severity.toLowerCase()) -
        SEVERITY_ORDER.indexOf(a.severity.toLowerCase()),
    );
}
