/**
 * Reading Garmin's GDPR bulk export into `activities`.
 *
 * The export is the only source that carries the WHOLE history. Garmin's API
 * exposes a rolling window of roughly six weeks, which is shorter than one CTL
 * time constant, so every chronic figure computed from it inherits a warm-start
 * seed rather than being measured. `docs/decisions.md` records that seed as
 * PROVISIONAL and names this backfill as the thing that settles it.
 *
 * ## The units, which are not the API's units
 *
 * This is the whole reason the module exists as a typed mapper rather than a
 * one-line `JSON.parse` at a call site. The bulk export and the live API
 * describe the same activities in DIFFERENT SCALES, and every one of the
 * differences is silent -- a wrong reading produces a plausible number, not an
 * error.
 *
 * | export field         | export unit | column        | factor |
 * | -------------------- | ----------- | ------------- | ------ |
 * | `distance`           | centimetres | `distance_m`  | / 100  |
 * | `duration`           | ms          | `duration_s`  | / 1000 |
 * | `avgSpeed`           | cm/ms       | m/s           | x 10   |
 * | `elevationGain/Loss` | centimetres | metres        | / 100  |
 * | `minElevation`       | centimetres | metres        | / 100  |
 * | `calories`           | KILOJOULES  | `calories`    | /4.184 |
 *
 * `avgSpeed` is the nastiest: a 10 km run in 49:13 stores `0.3386`, and 3.386
 * m/s is the true figure. Read as m/s it is a 49-minute kilometre; read as
 * km/h it is a walk. Both are wrong in a direction a human might not query.
 * The factor was established by dividing distance by duration across all 56
 * activities in the 2026-09-08 export -- median 9.9998, range 9.9964 to
 * 10.0018 -- not by reading documentation.
 *
 * `calories` is the one a reader is least likely to doubt, because the field is
 * named for the unit it is not in. The 2026-05-10 marathon stores 14904, which
 * as kilocalories is 349 kcal/km -- roughly four times what a human burns. As
 * kilojoules it is 3562 kcal, or 83.5 kcal/km, which is the ~1 kcal/kg/km an
 * 85.5 kg runner actually costs. Confirmed against an independent oracle: the
 * daily summaries in `DI-Connect-Aggregator/UDSFile_*.json` give
 * `activeKilocalories` 3737 for that day.
 *
 * `avgRunCadence` is per-leg (74) and `avgDoubleCadence` is both (148.6). The
 * column means steps per minute, so the double is the one that belongs in it.
 * Halving that mistake would look like a plausible cadence, which is precisely
 * why it is called out.
 */

/**
 * One activity as the export writes it.
 *
 * Every field optional: the export omits rather than nulls, and the omissions
 * are real (a treadmill run has no GPS, so no elevation and no coordinates).
 * `activityId` and `startTimeLocal` are the two that must be present for a row
 * to be placeable at all.
 */
export type ExportActivity = {
  readonly activityId?: number;
  readonly name?: string | null;
  readonly activityType?: string | null;
  readonly sportType?: string | null;
  readonly timeZoneId?: number | null;
  readonly startTimeLocal?: number | null;
  readonly startTimeGmt?: number | null;
  readonly distance?: number | null;
  readonly duration?: number | null;
  readonly elapsedDuration?: number | null;
  readonly movingDuration?: number | null;
  readonly avgSpeed?: number | null;
  readonly maxSpeed?: number | null;
  readonly avgHr?: number | null;
  readonly maxHr?: number | null;
  readonly elevationGain?: number | null;
  readonly elevationLoss?: number | null;
  readonly minElevation?: number | null;
  readonly maxElevation?: number | null;
  readonly elevationCorrected?: boolean | null;
  readonly steps?: number | null;
  readonly avgDoubleCadence?: number | null;
  readonly maxDoubleCadence?: number | null;
  readonly avgGroundContactTime?: number | null;
  readonly avgVerticalOscillation?: number | null;
  readonly avgStrideLength?: number | null;
  readonly avgVerticalRatio?: number | null;
  readonly avgPower?: number | null;
  readonly maxPower?: number | null;
  readonly normPower?: number | null;
  readonly activityTrainingLoad?: number | null;
  readonly aerobicTrainingEffect?: number | null;
  readonly anaerobicTrainingEffect?: number | null;
  readonly trainingEffectLabel?: string | null;
  readonly calories?: number | null;
  readonly lapCount?: number | null;
  readonly deviceId?: number | null;
  readonly manufacturer?: string | null;
};

/** One row of `activities`, in the shape the backfill inserts. */
export type BackfillRow = {
  readonly id: string;
  readonly source: 'garmin';
  readonly garminActivityId: string;
  readonly name: string | null;
  readonly activityType: string | null;
  readonly startTimeLocal: Date | null;
  readonly startTimeGmt: Date | null;
  readonly timeZoneId: number | null;
  readonly localDate: string;
  readonly distanceM: number | null;
  readonly durationS: number | null;
  readonly elapsedDurationS: number | null;
  readonly movingDurationS: number | null;
  readonly averageSpeed: number | null;
  readonly maxSpeed: number | null;
  readonly averageHr: number | null;
  readonly maxHr: number | null;
  readonly elevationGainM: number | null;
  readonly elevationLossM: number | null;
  readonly minElevationM: number | null;
  readonly maxElevationM: number | null;
  readonly isElevationCorrected: boolean | null;
  readonly steps: number | null;
  readonly averageRunningCadence: number | null;
  readonly maxRunningCadence: number | null;
  readonly avgGroundContactTimeMs: number | null;
  readonly avgVerticalOscillationCm: number | null;
  readonly avgStrideLengthCm: number | null;
  readonly avgVerticalRatio: number | null;
  readonly avgPowerW: number | null;
  readonly maxPowerW: number | null;
  readonly normPowerW: number | null;
  readonly activityTrainingLoad: number | null;
  readonly aerobicTrainingEffect: number | null;
  readonly anaerobicTrainingEffect: number | null;
  readonly trainingEffectLabel: string | null;
  readonly calories: number | null;
  readonly lapCount: number | null;
  readonly deviceId: string | null;
  readonly manufacturer: string | null;
  readonly raw: unknown;
};

/** Centimetres to metres. */
const CM_TO_M = 100;
/** Milliseconds to seconds. */
const MS_TO_S = 1000;
/**
 * The export's speed unit (cm/ms) to m/s. Derived from the data, see the
 * module comment -- 1 cm/ms is 10 m/s.
 */
const SPEED_TO_M_S = 10;
/**
 * Kilojoules to kilocalories. The export's `calories` field is kJ despite the
 * name; the thermochemical calorie is 4.184 J exactly.
 */
const KJ_TO_KCAL = 4.184;

/**
 * Pull the activity list out of the export file's envelope.
 *
 * The file is a one-element array wrapping the real list under a single key,
 * which is a shape worth naming rather than indexing past at a call site.
 * Anything else throws: a silently-empty backfill is worse than a loud one,
 * because the seed it was meant to replace would stay in place unnoticed.
 */
export function parseExport(contents: unknown): ExportActivity[] {
  if (!Array.isArray(contents) || contents.length === 0) {
    throw new Error(
      'Garmin export: expected a non-empty array at the root. ' +
        `Got ${describe(contents)}.`,
    );
  }
  const envelope: unknown = contents[0];
  if (typeof envelope !== 'object' || envelope === null) {
    throw new Error(
      `Garmin export: expected an object inside the root array, got ${describe(envelope)}.`,
    );
  }
  const list: unknown = (envelope as Record<string, unknown>)[
    'summarizedActivitiesExport'
  ];
  if (!Array.isArray(list)) {
    throw new Error(
      'Garmin export: no `summarizedActivitiesExport` array. Keys present: ' +
        Object.keys(envelope).join(', '),
    );
  }
  return list as ExportActivity[];
}

/**
 * Map one export activity onto an `activities` row.
 *
 * Returns null for a record that cannot be placed on a calendar day -- no id or
 * no local start time. Those are dropped rather than defaulted, because a
 * training day is exactly what the load series is indexed by and a guessed one
 * would land real load on the wrong date.
 */
export function toActivityRow(activity: ExportActivity): BackfillRow | null {
  const { activityId, startTimeLocal } = activity;
  if (typeof activityId !== 'number' || !Number.isFinite(activityId)) {
    return null;
  }
  if (typeof startTimeLocal !== 'number' || !Number.isFinite(startTimeLocal)) {
    return null;
  }

  const localStart = new Date(startTimeLocal);
  const localDate = localStart.toISOString().slice(0, 10);
  const garminActivityId = String(activityId);

  return {
    // `garmin:<id>`, matching the `icu:<id>` the bridge already uses. The
    // prefix is what lets two sources describe the same run without one
    // silently overwriting the other's primary key.
    id: `garmin:${garminActivityId}`,
    source: 'garmin',
    garminActivityId,
    name: str(activity.name),
    activityType: str(activity.activityType),
    // `startTimeLocal` is already wall-clock at the activity, so it is stored
    // as-is into a timestamp WITHOUT time zone. Converting it would shift a
    // 20:25 run into whatever offset the server happens to run in.
    startTimeLocal: localStart,
    startTimeGmt: epoch(activity.startTimeGmt),
    timeZoneId: int(activity.timeZoneId),
    localDate,
    distanceM: scale(activity.distance, 1 / CM_TO_M),
    durationS: scale(activity.duration, 1 / MS_TO_S),
    elapsedDurationS: scale(activity.elapsedDuration, 1 / MS_TO_S),
    movingDurationS: scale(activity.movingDuration, 1 / MS_TO_S),
    averageSpeed: scale(activity.avgSpeed, SPEED_TO_M_S),
    maxSpeed: scale(activity.maxSpeed, SPEED_TO_M_S),
    averageHr: num(activity.avgHr),
    maxHr: num(activity.maxHr),
    elevationGainM: scale(activity.elevationGain, 1 / CM_TO_M),
    elevationLossM: scale(activity.elevationLoss, 1 / CM_TO_M),
    minElevationM: scale(activity.minElevation, 1 / CM_TO_M),
    maxElevationM: scale(activity.maxElevation, 1 / CM_TO_M),
    isElevationCorrected: bool(activity.elevationCorrected),
    steps: int(activity.steps),
    // Both-legs cadence. See the module comment: the per-leg field is half this
    // and would read as a plausible-but-wrong 74 spm.
    averageRunningCadence: num(activity.avgDoubleCadence),
    maxRunningCadence: num(activity.maxDoubleCadence),
    avgGroundContactTimeMs: num(activity.avgGroundContactTime),
    avgVerticalOscillationCm: num(activity.avgVerticalOscillation),
    avgStrideLengthCm: num(activity.avgStrideLength),
    avgVerticalRatio: num(activity.avgVerticalRatio),
    avgPowerW: num(activity.avgPower),
    maxPowerW: num(activity.maxPower),
    normPowerW: num(activity.normPower),
    activityTrainingLoad: num(activity.activityTrainingLoad),
    aerobicTrainingEffect: num(activity.aerobicTrainingEffect),
    anaerobicTrainingEffect: num(activity.anaerobicTrainingEffect),
    trainingEffectLabel: str(activity.trainingEffectLabel),
    calories: scale(activity.calories, 1 / KJ_TO_KCAL),
    lapCount: int(activity.lapCount),
    deviceId: activity.deviceId == null ? null : String(activity.deviceId),
    manufacturer: str(activity.manufacturer),
    // The whole record, per the schema's standing rule that a field nobody
    // thought to type must not need re-ingesting later. The export link expires
    // after 72 hours, so anything dropped here is genuinely gone.
    raw: activity,
  };
}

/**
 * Every placeable activity, oldest first.
 *
 * Ordered by the start INSTANT, not by `localDate`. Two runs on one day is a
 * normal week here -- 2026-08-02 has a morning 18 km and a lunchtime 11 km, and
 * 2026-09-05 a morning hike and an evening treadmill run -- and a date-only
 * comparison leaves those pairs in whatever order the file happened to hold.
 */
export function toActivityRows(
  activities: readonly ExportActivity[],
): BackfillRow[] {
  return activities
    .map(toActivityRow)
    .filter((row): row is BackfillRow => row !== null)
    .sort(
      (a, b) =>
        (a.startTimeLocal?.getTime() ?? 0) - (b.startTimeLocal?.getTime() ?? 0),
    );
}

function num(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function int(value: number | null | undefined): number | null {
  const n = num(value);
  return n === null ? null : Math.round(n);
}

function str(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function bool(value: boolean | null | undefined): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function scale(
  value: number | null | undefined,
  factor: number,
): number | null {
  const n = num(value);
  return n === null ? null : n * factor;
}

function epoch(value: number | null | undefined): Date | null {
  const n = num(value);
  return n === null ? null : new Date(n);
}

function describe(value: unknown): string {
  return value === null ? 'null' : typeof value;
}
