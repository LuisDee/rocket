/**
 * The daily pass -- the only scheduled job. `docs/specs/05-integrations.md`.
 *
 * Four steps in order, then the outbound write:
 *
 *   1. INGEST     yesterday's activities and wellness from the bridge, raw
 *                 payload kept losslessly alongside the mapped rows.
 *   2. RECOMPUTE  ATL/CTL/TSB by code over the full series, with the coverage
 *                 window stated (REDLINES.md rule 7). Never by reading a list.
 *   3. TRIGGERS   the five in `03-planner.md`. A trigger that fires runs the
 *                 deterministic planner; nothing else writes sessions
 *                 (REDLINES.md rule 8).
 *   4. NOTE       one dated line saying what the pass found and what it changed,
 *                 waiting in `rocket_get_status` when the next conversation
 *                 opens. Web push stays deferred; this computation earns its
 *                 keep with no push at all.
 *   5. WATCH      one intervals.icu event per planned session, so the wrist and
 *                 the plan agree at 06:00. Finding F19: a plan that adapts daily
 *                 and a watch still showing yesterday's session make the
 *                 adaptation decorative, because the athlete follows the watch.
 *
 * FAILURE IS LOUD, because the interesting failure is silence (REDLINES.md
 * rule 3). Three layers, each catching what the one above structurally cannot:
 *
 *   1. a `sync_runs` row written under autocommit, so the failure row survives
 *      the throw that caused it;
 *   2. a dead-man's-switch ping as the final step of a SUCCESSFUL pass -- the
 *      only layer that can detect "the job never ran at all", which a row in
 *      our own database is blind to by construction, and what makes Vercel
 *      Hobby cron's best-effort delivery harmless;
 *   3. `rocket_get_status` reporting staleness once `SYNC.staleAfterHours`
 *      trips.
 *
 * This function does not throw. It catches, records, and returns `ok: false`,
 * because every one of the three layers is downstream of the record being
 * written -- an exception escaping here would take the heartbeat with it.
 */

import { randomUUID } from 'node:crypto';

import {
  GUARDRAILS,
  LOAD,
  READINESS,
  REPLAN,
  SYNC,
} from '../../config/training';
import { dailyStress, rollingLoad, type LoadState } from '../domain/load';
import { shiftIso } from '../domain/planner/dates';
import { replan, type ReplanTrigger } from '../domain/planner/negotiate';
import { planWindow } from '../domain/planner/placement';
import { scoreReadiness, worstSoreness } from '../domain/readiness';
import type { Store } from '../domain/store';
import type { IngestedActivity, SessionRow } from '../domain/types';
import type {
  Bridge,
  BridgeActivity,
  PlannedEvent,
} from '../integrations/intervals';
import { toPlanWindow } from '../mcp/window';

export const DAILY_PASS_JOB = 'daily-pass';

/** The clock, injected so a test can pin a date. Matches `mcp/tools.ts`. */
export type Clock = { today(): string; now(): Date };

export type PassDeps = {
  readonly store: Store;
  /** Null when the personal API key is not configured yet. A reported state. */
  readonly bridge: Bridge | null;
  readonly clock: Clock;
  /** The dead-man's switch. Null disables it, which the result states. */
  readonly healthcheckUrl?: string | null;
  /** Injected so the switch is asserted rather than assumed in tests. */
  readonly ping?: (url: string) => Promise<void>;
};

/** Which of the five replan triggers were looked at, and what each said. */
export type TriggerReport = {
  readonly id:
    | 'readiness'
    | 'spanner'
    | 'availability'
    | 'user-request'
    | 'weekly-rollover';
  readonly fired: boolean;
  readonly detail: string;
};

export type PassResult = {
  readonly ok: boolean;
  readonly today: string;
  readonly ingested: {
    readonly activities: number;
    readonly wellnessDays: number;
  };
  readonly load: LoadState | null;
  readonly triggers: readonly TriggerReport[];
  readonly replanned: boolean;
  readonly pushedToWatch: number;
  readonly deadMansSwitch:
    'pinged' | 'not-configured' | 'withheld-on-failure' | 'ping-failed';
  /** One human sentence. What a person reads at 07:00 on a bad morning. */
  readonly detail: string;
};

export async function runDailyPass(deps: PassDeps): Promise<PassResult> {
  const { store, clock } = deps;
  const today = clock.today();

  let ingested = { activities: 0, wellnessDays: 0 };
  let load: LoadState | null = null;
  let triggers: TriggerReport[] = [];
  let replanned = false;
  let pushedToWatch = 0;
  let failure: string | null = null;

  try {
    if (deps.bridge === null) {
      // Not an exception: the key may legitimately not exist yet, and
      // `00-overview.md` invariant 2 makes every feature work without it. It
      // IS a failed pass, though -- ok:false, no ping, and the dead-man's
      // switch alarms daily until the key lands. That noise is the point.
      throw new Error(
        'the intervals.icu bridge is not configured (INTERVALS_API_KEY, INTERVALS_ATHLETE_ID)',
      );
    }

    ingested = await ingest(store, deps.bridge, today);
    load = await recompute(store, today);
    const evaluated = await evaluateTriggers(store, today);
    const applied = await applyTriggers(store, today, evaluated.fired);
    triggers = [...evaluated.reports, applied.rollover];
    replanned = applied.changed;
    pushedToWatch = await pushPlanToWatch(store, deps.bridge, today);
  } catch (error) {
    failure = reason(error);
  }

  const ok = failure === null;
  const detail = ok
    ? summarise(today, ingested, load, triggers, replanned, pushedToWatch)
    : `Daily pass FAILED on ${today}: ${failure} ` +
      `Nothing was pushed to the watch and the dead-man's switch was not pinged. ` +
      `Manual logging and check-ins are unaffected.`;

  // The heartbeat, before the ping and outside any transaction, so a failure
  // that happened above is on the record even if everything below also fails.
  await recordHeartbeat(store, clock, ok, detail, {
    ingested,
    load,
    triggers,
    replanned,
    pushedToWatch,
  });

  // The coach note is written on a FAILED pass too. A silent morning is exactly
  // the outcome REDLINES rule 3 exists to prevent, and `rocket_get_status`
  // reads notes, so this is the sentence the next conversation opens with.
  await store.insertNote({
    id: randomUUID(),
    localDate: today,
    kind: 'free_text',
    text: detail,
    source: 'cron',
    expiresAt: null,
  });

  const deadMansSwitch = await pingSwitch(deps, ok);

  return {
    ok,
    today,
    ingested,
    load,
    triggers,
    replanned,
    pushedToWatch,
    deadMansSwitch,
    detail,
  };
}

/* ------------------------------------------------------------- 1. ingest --- */

async function ingest(
  store: Store,
  bridge: Bridge,
  today: string,
): Promise<{ activities: number; wellnessDays: number }> {
  // Wider than one day on purpose: the cron is best-effort and never retried,
  // and the bridge can sync late, so a strictly-yesterday window would leave
  // permanent holes. Re-offering a stored activity is a no-op.
  const oldest = shiftIso(today, -SYNC.ingestLookbackDays);

  const [activities, wellness] = await Promise.all([
    bridge.activities(oldest, today),
    bridge.wellness(oldest, today),
  ]);

  const inserted = await store.ingestActivities(activities.map(toIngested));

  for (const day of wellness) {
    // Verbatim, no typed column: Decision gate G1 forbids leaning on any
    // bridge-supplied wellness field until the probe has read a real payload.
    await store.upsertWellness(day.id, day);
  }

  return { activities: inserted, wellnessDays: wellness.length };
}

/**
 * A bridge activity in the shape the `activities` table holds.
 *
 * Only fields whose meaning is unambiguous are mapped. The whole payload goes
 * to `raw`, which is the schema's standing instruction: a field nobody thought
 * to type must not need re-ingesting later.
 */
export function toIngested(activity: BridgeActivity): IngestedActivity {
  const startLocal = activity.start_date_local ?? null;
  return {
    id: `icu:${activity.id}`,
    source: 'intervals',
    localDate: (startLocal ?? '').slice(0, 10),
    name: activity.name ?? null,
    activityType: normaliseType(activity.type),
    startTimeLocal: startLocal === null ? null : new Date(startLocal),
    distanceM: numberOrNull(activity.distance),
    durationS: numberOrNull(activity.moving_time),
    elapsedDurationS: numberOrNull(activity.elapsed_time),
    averageHr: numberOrNull(activity.average_heartrate),
    maxHr: numberOrNull(activity.max_heartrate),
    elevationGainM: numberOrNull(activity.total_elevation_gain),
    calories: numberOrNull(activity.calories),
    activityTrainingLoad: numberOrNull(activity.icu_training_load),
    raw: activity,
  };
}

/**
 * The bridge's activity type onto the vocabulary the rest of the repo uses.
 *
 * `store.completedRuns()` filters on `running`, `trail_running`,
 * `treadmill_running` and `track_running` -- Garmin's own `typeKey` values, per
 * `tools/garmin_probe/CATALOGUE.md`. The bridge speaks Strava-flavoured
 * CamelCase ("Run", "Swim"), and an unmapped type would silently drop every run
 * out of the ramp baseline, which is the quietest possible way to break a
 * guardrail. Anything unrecognised passes through lower-cased rather than being
 * discarded.
 */
function normaliseType(type: string | undefined): string | null {
  if (type === undefined || type === '') return null;
  const known: Record<string, string> = {
    Run: 'running',
    TrailRun: 'trail_running',
    VirtualRun: 'treadmill_running',
    Swim: 'lap_swimming',
    OpenWaterSwim: 'open_water_swimming',
    Ride: 'cycling',
    Walk: 'walking',
    Hike: 'hiking',
  };
  return known[type] ?? type.toLowerCase();
}

/* ---------------------------------------------------------- 2. recompute --- */

/**
 * ATL, CTL and TSB over the whole series behind them.
 *
 * The series starts at the seed date, not at "the last few days": REDLINES.md
 * rule 7 wants the figure computed from the full series and returned with the
 * window it covers, and `rollingLoad` does both.
 */
async function recompute(store: Store, today: string): Promise<LoadState> {
  const activities = await store.scorableActivities(LOAD.seed.asOf, today);
  return rollingLoad(dailyStress(activities), today);
}

/* ----------------------------------------------------------- 3. triggers --- */

async function evaluateTriggers(
  store: Store,
  today: string,
): Promise<{ reports: TriggerReport[]; fired: ReplanTrigger[] }> {
  const reports: TriggerReport[] = [];
  const fired: ReplanTrigger[] = [];

  /* 1 -- daily check-in red/amber readiness. */
  const checkIn = await store.latestCheckIn();
  if (checkIn === null || checkIn.localDate < today) {
    reports.push({
      id: 'readiness',
      fired: false,
      detail:
        checkIn === null
          ? 'no check-in has ever been recorded'
          : `latest check-in is ${checkIn.localDate}, not today`,
    });
  } else {
    const historyDays = await store.activityHistoryDays(today);
    const verdict = scoreReadiness(checkIn, historyDays);
    const severity = worstSoreness(checkIn.soreness);

    // SORENESS ALONE DECIDES, and the band does not get a veto. This used to
    // read `verdict.band !== 'green' && severity !== null`, which fails both
    // ways: a calf at 3 beside nine hours' sleep, high motivation and an easy
    // previous day scores 0.73 -- GREEN -- so the gate never fired on the one
    // signal that is about tissue; and any reading at all on an amber morning
    // fired it, so a 1/5 niggle after a bad night took out the week's only hard
    // session. The injury gate is a threshold on severity
    // (`READINESS.sorenessBlocksQuality`), not a mood composite.
    const gated =
      severity !== null && severity >= READINESS.sorenessBlocksQuality;
    if (gated) {
      fired.push({ kind: 'soreness', severity, since: checkIn.localDate });
    }
    reports.push({
      id: 'readiness',
      fired: gated,
      detail: gated
        ? `soreness ${String(severity)} at or above ${String(READINESS.sorenessBlocksQuality)} -- quality gated from ${checkIn.localDate} (band ${verdict.band}, ${String(verdict.score)})`
        : // The planner repairs what it has a repair FOR. An amber driven by
          // sleep or motivation alone has no session-level fix that is not
          // guesswork, so it is surfaced for the conversation instead of being
          // auto-applied. Reported rather than omitted.
          `${verdict.band} (${String(verdict.score)}), soreness ${severity === null ? 'not reported' : String(severity)} -- below the quality gate, surfaced not auto-repaired`,
    });
  }

  /* 2 -- an ad-hoc activity deviating from plan by more than the threshold. */
  const spanner = await findSpanner(store, today);
  if (spanner !== null) fired.push(spanner.trigger);
  reports.push({
    id: 'spanner',
    fired: spanner !== null,
    detail:
      spanner?.detail ??
      `no run yesterday deviated by more than ${String(REPLAN.spannerDeviationPct)}% from plan`,
  });

  /* 3 and 4 -- structurally invisible to a cron. Named, not omitted. */
  reports.push({
    id: 'availability',
    fired: false,
    detail:
      'not observable by a cron: an availability change arrives as a note or a tool call, and replans at that moment',
  });
  reports.push({
    id: 'user-request',
    fired: false,
    detail: 'not observable by a cron: `rocket_replan` is a conversation',
  });

  return { reports, fired };
}

/**
 * Loop A. Yesterday's actual running kilometres against what was planned.
 *
 * Yesterday rather than today because today is not over. Compared as a whole
 * day, not per session: two easy runs that together hit the day's target are
 * not a spanner, and one 20 km run on a 10 km day is, whichever session it was
 * logged against.
 */
async function findSpanner(
  store: Store,
  today: string,
): Promise<{ trigger: ReplanTrigger; detail: string } | null> {
  const yesterday = shiftIso(today, -1);
  const runs = await store.completedRuns(yesterday, yesterday);
  if (runs.length === 0) return null;

  const actualKm = round1(runs.reduce((sum, run) => sum + run.km, 0));
  const planned = await store.window(yesterday, yesterday);
  const plannedKm = round1(
    planned.reduce((sum, row) => sum + (row.plannedKm ?? 0), 0),
  );

  // A day with nothing planned and a run on it is a spanner by definition --
  // there is no baseline to be within 20% of.
  const deviation =
    plannedKm === 0
      ? Infinity
      : (Math.abs(actualKm - plannedKm) / plannedKm) * 100;
  if (deviation <= REPLAN.spannerDeviationPct) return null;

  return {
    trigger: { kind: 'spanner', date: yesterday, km: actualKm },
    detail: `${String(actualKm)} km run on ${yesterday} against ${String(plannedKm)} km planned`,
  };
}

/**
 * Run the deterministic planner for what fired, and keep the rolling window
 * full (trigger 5, weekly rollover).
 *
 * Every write goes through `store.replaceWindow`, which is the planner's own
 * output: REDLINES.md rule 8 admits no other author of a session row, and a
 * cron is not an exception to it.
 */
async function applyTriggers(
  store: Store,
  today: string,
  fired: readonly ReplanTrigger[],
): Promise<{ changed: boolean; rollover: TriggerReport }> {
  const from = today;
  const to = shiftIso(today, REPLAN.rollingWindowDays.max - 1);
  let changed = false;

  // ROLLOVER FIRST (trigger 5), because it plans the window from the macro
  // layer and would otherwise overwrite a repair applied a moment earlier --
  // a soreness downgrade followed by a fresh weekly plan puts the quality
  // session straight back. Found by the test, not by reading: repair operates
  // on a window, so the window has to exist before anything repairs it.
  //
  // It is not a `ReplanTrigger`: there is nothing to repair, the micro-planner
  // has simply run short of the horizon it is supposed to hold. Planned week by
  // week, because every guardrail that matters is weekly.
  const existing = await store.window(from, to);
  const horizon = shiftIso(today, REPLAN.rollingWindowDays.min - 1);
  const covered = new Set(existing.map((row) => row.date));
  const missing = daysBetween(today, horizon).filter(
    (day) => !covered.has(day),
  );
  if (missing.length > 0) {
    await store.replaceWindow(from, to, planWindow(from));
    changed = true;
  }

  for (const trigger of fired) {
    const rows = await store.window(from, to);
    const result = replan(toPlanWindow(rows), trigger, {
      history: await store.completedRuns(
        shiftIso(from, -GUARDRAILS.singleSessionSpikeWindowDays),
        to,
      ),
    });
    await store.replaceWindow(from, to, result.resulting_window);
    changed = true;
  }

  return {
    changed,
    rollover: {
      id: 'weekly-rollover',
      fired: missing.length > 0,
      detail:
        missing.length > 0
          ? `window was short of the ${String(REPLAN.rollingWindowDays.min)}-day horizon by ${String(missing.length)} day(s); replanned through ${to}`
          : `window already covers the ${String(REPLAN.rollingWindowDays.min)}-day horizon`,
    },
  };
}

/* ---------------------------------------------------------- 5. the wrist --- */

/**
 * One event per planned session, upserted on the session id.
 *
 * Words, not compiled steps (`05-integrations.md`): structured workout files,
 * pace and HR targets and Garmin-direct upload are out of scope until after
 * 2026-10-24. This block is easy volume with one quality session and one long
 * run a week, which a Fenix 8 user runs to pace or to feel.
 *
 * Rest days are skipped rather than pushed as an empty workout: a calendar
 * entry that says "do nothing" is noise on a watch face, and its absence
 * already means the same thing.
 */
async function pushPlanToWatch(
  store: Store,
  bridge: Bridge,
  today: string,
): Promise<number> {
  const to = shiftIso(today, SYNC.watchPushDays - 1);
  const rows = await store.window(today, to);
  const events = rows
    .filter((row) => row.type !== 'rest' && row.status === 'planned')
    .map(toEvent);
  return bridge.pushEvents(events);
}

export function toEvent(row: SessionRow): PlannedEvent {
  const km = row.plannedKm ?? 0;
  const label = TITLES[row.type] ?? row.type;
  const name = km > 0 ? `${label} ${km.toFixed(1)} km` : label;

  const description = [
    GUIDANCE[row.type] ?? null,
    row.timeSlot === null ? null : `Slot: ${row.timeSlot}.`,
    row.note,
    'Planned by rocket. If this disagrees with the app, the app is right.',
  ]
    .filter((line): line is string => line !== null && line !== '')
    .join('\n');

  return {
    external_id: row.id,
    // Midnight local: a calendar workout is a day's prescription, and the slot
    // is words in the description rather than a time the watch would treat as
    // an appointment.
    start_date_local: `${row.date}T00:00:00`,
    category: 'WORKOUT',
    type: row.type === 'swim' ? 'Swim' : 'Run',
    name,
    description,
  };
}

/**
 * The prescription in words. Not thresholds -- phrasing -- so they live here
 * rather than in `config/training.ts`, which is the registry of NUMBERS.
 */
const TITLES: Record<string, string> = {
  easy: 'Easy',
  steady: 'Steady',
  quality: 'Quality',
  long: 'Long run',
  race: 'Race',
  swim: 'Swim',
};

const GUIDANCE: Record<string, string> = {
  easy: 'Conversational. If you can not talk in sentences, slow down.',
  steady: 'Comfortably hard but controlled. Not a workout.',
  quality: 'The week is one quality session. Warm up properly.',
  long: 'Time on feet. Start slower than feels right.',
  race: 'Race day. Execute the role this race has in the block.',
  swim: 'Technique. Real cardio cost, near-zero impact cost.',
};

/* ------------------------------------------------------- the three layers --- */

async function recordHeartbeat(
  store: Store,
  clock: Clock,
  ok: boolean,
  detail: string,
  summary: unknown,
): Promise<void> {
  await store.recordSyncRun({
    id: randomUUID(),
    job: DAILY_PASS_JOB,
    ranAt: clock.now(),
    ok,
    detail,
    summary,
  });
}

/**
 * Layer 2. Pinged ONLY at the end of a successful pass.
 *
 * Its absence is the alarm, and it is the only layer that can detect a job that
 * never ran -- which a row in our own database is blind to by construction.
 * Pinging on a failed pass would convert the one signal that survives a total
 * outage into a heartbeat for "the process started", which is not the question.
 */
async function pingSwitch(
  deps: PassDeps,
  ok: boolean,
): Promise<PassResult['deadMansSwitch']> {
  if (!ok) return 'withheld-on-failure';
  const url = deps.healthcheckUrl ?? null;
  if (url === null || url === '') return 'not-configured';
  const ping = deps.ping ?? defaultPing;
  try {
    await ping(url);
    return 'pinged';
  } catch {
    // A failed ping is not a failed pass: the work landed and is recorded. It
    // does mean the alarm will fire, which is the correct direction to fail.
    return 'ping-failed';
  }
}

async function defaultPing(url: string): Promise<void> {
  await globalThis.fetch(url, { method: 'GET' });
}

/* ---------------------------------------------------------------- prose --- */

function summarise(
  today: string,
  ingested: { activities: number; wellnessDays: number },
  load: LoadState | null,
  triggers: readonly TriggerReport[],
  replanned: boolean,
  pushed: number,
): string {
  const firedIds = triggers.filter((t) => t.fired).map((t) => t.id);
  const loadLine =
    load === null
      ? 'Load not recomputed.'
      : `CTL ${String(load.ctl)}, ATL ${String(load.atl)}, TSB ${String(load.tsb)} ` +
        `over ${String(load.coverage.days)} day(s) from ${load.coverage.from}` +
        (load.caveat === null ? '.' : ` -- ${load.caveat}`);

  return (
    `Daily pass ${today}: ingested ${String(ingested.activities)} new activity/activities and ` +
    `${String(ingested.wellnessDays)} wellness day(s). ${loadLine} ` +
    (firedIds.length === 0
      ? 'No replan trigger fired.'
      : `Triggers fired: ${firedIds.join(', ')}.`) +
    (replanned ? ' Rolling window replanned.' : '') +
    ` ${String(pushed)} session(s) pushed to the watch.`
  );
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  for (let day = from; day <= to; day = shiftIso(day, 1)) days.push(day);
  return days;
}
