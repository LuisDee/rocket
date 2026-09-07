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

/**
 * A forensic finding, flattened from one module's results.
 *
 * The inspector nests findings two deep -- `module_reports[].results[]` -- and
 * names its fields in snake_case. This is the flat, camelCase view the screen
 * wants; `fromInspectorReport` below is the only place that knows the
 * difference.
 */
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

/**
 * The report exactly as `inspect_fit.py --quiet` emits it.
 *
 * Kept verbatim in `ingested_activities.forensic_report` rather than normalised
 * on the way in: the column's contract is "the report as produced", and a
 * pipeline that reshapes evidence before storing it is one you cannot later
 * check against the tool that produced it.
 */
type InspectorReport = {
  anomaly_score?: number;
  worst_severity?: string;
  module_reports?: {
    module?: string;
    results?: {
      name?: string;
      severity?: string;
      status?: string;
      rationale?: string;
    }[];
  }[];
};

/**
 * Read the inspector's own shape into the one this module exposes.
 *
 * This exists because the two drifted and nothing caught it: the reader was
 * written against `{anomalyScore, worstSeverity, findings}` while the tool emits
 * `{anomaly_score, worst_severity, module_reports}`. Every lookup missed, so
 * `notableFindings` returned an empty array for every activity and the approval
 * screen showed no forensics at all -- not an error, just silence, which is the
 * worst way for a check to fail. Found on the first live row, whose report
 * carried `worst_severity: "medium"`.
 */
export function fromInspectorReport(
  raw: unknown | null | undefined,
): ForensicReport | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as InspectorReport;

  // Already in our shape (a fixture, or a future normalised producer).
  if ('worstSeverity' in r || 'findings' in r) return raw as ForensicReport;

  const findings = (r.module_reports ?? []).flatMap((m) =>
    (m.results ?? []).map((res) => {
      // The key is omitted rather than set to undefined: `detail` is optional
      // and the repo runs exactOptionalPropertyTypes, under which the two are
      // not the same thing.
      const f: ForensicFinding = {
        check: res.name ?? m.module ?? 'unknown',
        severity: res.severity ?? 'info',
      };
      if (res.rationale !== undefined) f.detail = res.rationale;
      return f;
    }),
  );

  // Same exactOptionalPropertyTypes reason as `detail` above: an absent score
  // and a score of `undefined` are different types here, and the inspector
  // genuinely omits these on a report it could not complete.
  const out: ForensicReport = { findings };
  if (r.anomaly_score !== undefined) out.anomalyScore = r.anomaly_score;
  if (r.worst_severity !== undefined) out.worstSeverity = r.worst_severity;
  return out;
}

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
