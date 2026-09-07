/**
 * The negotiation seam: propose a change, get back what it did to the WHOLE
 * window and what it broke.
 *
 * `docs/specs/04-mcp-surface.md:31-51`. Every write returns
 * `{applied, applied_rules, violated_rules, compliant_alternative,
 * resulting_window}`, and validation covers the whole rolling window rather
 * than the session being edited -- ten individually-legal edits can otherwise
 * walk a compliant week past the ramp cap with every call truthfully reporting
 * success. That scope is the half that cannot be retrofitted.
 *
 * Refusals are never dead ends: when a compliant version of the request exists,
 * it comes back in `compliant_alternative` in the same diff shape as an applied
 * change, so accepting it is one more call rather than a re-negotiation.
 */

import { BLOCK_WEEKS, RACES, REPLAN } from '../../../config/training';
import { humanDate, mondayOf, shiftIso, weekDates } from './dates';
import {
  evaluateGuardrails,
  round1,
  totalKm,
  type GuardrailInput,
  type SorenessReport,
} from './guardrails';
import { planWeek, type PlacementOptions } from './placement';
import type {
  Diff,
  GuardrailResult,
  PlanWindow,
  PlannedSession,
  ReplanResult,
  RuleId,
  SessionChange,
  SessionKind,
  WriteResult,
} from './types';

export type ProposedChange =
  | { readonly kind: 'set-km'; readonly date: string; readonly km: number }
  | {
      readonly kind: 'set-type';
      readonly date: string;
      readonly sessionKind: SessionKind;
    }
  | {
      readonly kind: 'add';
      readonly date: string;
      readonly km: number;
      readonly sessionKind: SessionKind;
    }
  | { readonly kind: 'remove'; readonly date: string }
  | { readonly kind: 'move'; readonly date: string; readonly toDate: string };

export type ProposeOptions = {
  readonly history?: GuardrailInput['history'];
  readonly soreness?: SorenessReport | null;
  /**
   * The athlete's explicit override. Reaches every guardrail EXCEPT the taper
   * and the injury gate, which `overridable: false` puts out of its reach --
   * enforced here rather than by asking the caller to remember which is which.
   */
  readonly override?: boolean;
};

/**
 * Resolution of the search for a compliant counter-offer, in kilometres.
 *
 * Not a training threshold -- it is how finely the search steps, and it never
 * decides anything. A coarser step would offer a needlessly small alternative;
 * a finer one would burn evaluations to move a counter-offer by metres.
 */
const ALTERNATIVE_STEP_KM = 0.5;

/** Evaluate a proposed change against the whole window. */
export function propose(
  window: PlanWindow,
  change: ProposedChange,
  options: ProposeOptions = {},
): WriteResult {
  const next = applyChange(window, change);
  const results = evaluate(next, options);
  const blockers = blocking(results, options.override ?? false);

  if (blockers.length === 0) {
    return envelope(true, results, null, next);
  }

  return envelope(
    false,
    results,
    findAlternative(window, change, options),
    // A refused write leaves the plan exactly as it was. The caller never has
    // to ask what the plan is now, and a narration can be checked against it.
    window,
  );
}

/* ------------------------------------------------------------- replan --- */

export type ReplanTrigger =
  /** Loop A. An unplanned run happened; the window absorbs it. */
  | {
      readonly kind: 'spanner';
      readonly date: string;
      readonly km: number;
    }
  /** Loop B. The tumble dryer. */
  | {
      readonly kind: 'soreness';
      readonly severity: number;
      readonly since: string;
    }
  | {
      readonly kind: 'race-added';
      readonly date: string;
      readonly name: string;
      readonly distanceKm: number;
    }
  | { readonly kind: 'race-cancelled'; readonly date: string }
  | {
      readonly kind: 'availability-lost';
      readonly date: string;
      readonly slotId: string;
    }
  /**
   * The trailing trend. INFORMS AND NEVER ACTS (`04-mcp-surface.md`):
   * over-performing is evidence for a conversation about the goal band, not a
   * licence for the planner to raise a target by itself.
   */
  | {
      readonly kind: 'trend';
      readonly completedKm: number;
      readonly targetKm: number;
      readonly from: string;
      readonly to: string;
    };

/**
 * Replan the rolling window. Returns the envelope plus the diff and the
 * plain-language rationale naming what moved and what it cost.
 *
 * A replan REACTS TO A FACT -- a run happened, a body hurts, a race was
 * entered, a slot vanished -- so the repair always lands and `applied` is true.
 * That is the opposite of `propose()`, where the athlete is asking for
 * something and a guardrail may refuse. Refusing to update the plan because
 * reality broke a guardrail would leave the stored plan disagreeing with the
 * world, which is strictly worse than a plan carrying a named breach: anything
 * still broken after the repair comes back in `violated_rules` and is spelled
 * out at the end of the rationale.
 */
export function replan(
  window: PlanWindow,
  trigger: ReplanTrigger,
  options: ProposeOptions = {},
): ReplanResult {
  const next = repair(window, trigger, options);
  const soreness =
    trigger.kind === 'soreness'
      ? { severity: trigger.severity, since: trigger.since }
      : (options.soreness ?? null);
  const results = evaluate(next, { ...options, soreness });
  const changes = diffWindows(window, next);

  const diff: Diff = {
    changes,
    rationale: rationale(trigger, window, next, changes, results),
  };

  return {
    ...envelope(true, results, null, next),
    diff,
    guardrails: results,
  };
}

/* ---------------------------------------------------------- internals --- */

function evaluate(
  window: PlanWindow,
  options: ProposeOptions,
): readonly GuardrailResult[] {
  return evaluateGuardrails({
    window,
    ...(options.history ? { history: options.history } : {}),
    soreness: options.soreness ?? null,
  });
}

function blocking(
  results: readonly GuardrailResult[],
  override: boolean,
): GuardrailResult[] {
  return results.filter(
    (r) => r.breached && r.blocking && !(override && r.overridable),
  );
}

function envelope(
  applied: boolean,
  results: readonly GuardrailResult[],
  alternative: Diff | null,
  window: PlanWindow,
): WriteResult {
  const evaluated = unique(results.map((r) => r.ruleId));
  const violated = unique(
    results.filter((r) => r.breached).map((r) => r.ruleId),
  );

  return {
    applied,
    applied_rules: evaluated,
    violated_rules: violated,
    compliant_alternative: alternative,
    resulting_window: window,
  };
}

function unique(ids: readonly RuleId[]): RuleId[] {
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
}

/** Pure. The window in is never mutated -- callers hold on to the original. */
export function applyChange(
  window: PlanWindow,
  change: ProposedChange,
): PlanWindow {
  const onDate = window.filter((s) => s.date === change.date);
  const others = window.filter((s) => s.date !== change.date);
  const biggest = [...onDate].sort((a, b) => b.km - a.km)[0];

  switch (change.kind) {
    case 'set-km':
      return sorted([
        ...others,
        {
          date: change.date,
          km: change.km,
          kind: biggest?.kind ?? 'easy',
          slot: biggest?.slot ?? null,
        },
      ]);

    case 'set-type':
      return sorted([
        ...others,
        ...onDate.map((s, i) =>
          i === 0 ? { ...s, kind: change.sessionKind } : s,
        ),
      ]);

    case 'add':
      return sorted([
        ...window,
        {
          date: change.date,
          km: change.km,
          kind: change.sessionKind,
          slot: biggest?.slot ?? null,
        },
      ]);

    case 'remove':
      return sorted(others);

    case 'move':
      return sorted([
        ...others.filter((s) => s.date !== change.toDate),
        ...onDate.map((s) => ({ ...s, date: change.toDate })),
      ]);
  }
}

function sorted(sessions: readonly PlannedSession[]): PlanWindow {
  return [...sessions].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * The closest compliant version of the request.
 *
 * Distance requests step down towards what already stood; a session type
 * refused by the injury gate falls back to easy. Anything else returns null,
 * and null means "no compliant version of this request exists" -- which is a
 * legitimate answer, not a missing feature.
 */
function findAlternative(
  window: PlanWindow,
  change: ProposedChange,
  options: ProposeOptions,
): Diff | null {
  const compliant = (candidate: ProposedChange): Diff | null => {
    const next = applyChange(window, candidate);
    if (
      blocking(evaluate(next, options), options.override ?? false).length > 0
    ) {
      return null;
    }
    const changes = diffWindows(window, next);
    return {
      changes,
      rationale: alternativeRationale(candidate, window, next),
    };
  };

  if (change.kind === 'set-km' || change.kind === 'add') {
    const floor =
      change.kind === 'set-km'
        ? totalKm(window.filter((s) => s.date === change.date))
        : 0;

    for (
      let km = round1(change.km - ALTERNATIVE_STEP_KM);
      km >= floor;
      km = round1(km - ALTERNATIVE_STEP_KM)
    ) {
      const found = compliant({ ...change, km });
      if (found) return found;
    }
    return null;
  }

  if (change.kind === 'set-type' && change.sessionKind === 'quality') {
    return compliant({ ...change, sessionKind: 'easy' });
  }

  return null;
}

function alternativeRationale(
  change: ProposedChange,
  before: PlanWindow,
  after: PlanWindow,
): string {
  const week = mondayOf(change.date);
  const from = weekTotal(before, week);
  const to = weekTotal(after, week);

  if (change.kind === 'set-km' || change.kind === 'add') {
    return `${change.km} km on ${humanDate(change.date)} clears every guardrail: the week of ${humanDate(week)} lands at ${to} km against ${from} km as planned.`;
  }
  return `Easy on ${humanDate(change.date)} instead: it keeps the day and the week's ${to} km without spending anything the guardrails refuse.`;
}

/* ---------------------------------------------------------- the repair --- */

function repair(
  window: PlanWindow,
  trigger: ReplanTrigger,
  options: ProposeOptions,
): PlanWindow {
  switch (trigger.kind) {
    case 'spanner':
      return absorbSpanner(window, trigger.date, trigger.km);

    case 'soreness':
      return sorted(
        window.map((s) =>
          s.kind === 'quality' && s.date >= trigger.since
            ? {
                ...s,
                kind: 'easy' as const,
                note: `Downgraded from quality: soreness ${trigger.severity} reported ${trigger.since}.`,
              }
            : s,
        ),
      );

    case 'race-added':
      return addRace(window, trigger.date, trigger.name, trigger.distanceKm);

    case 'race-cancelled':
      // The date returns to ordinary planning. Nothing is invented to replace
      // the race: the week's shortfall against its macro target is real, and
      // hiding it behind an auto-placed long run is how debt goes unnoticed.
      return sorted(
        window.filter((s) => !(s.date === trigger.date && s.kind === 'race')),
      );

    case 'availability-lost':
      return replanWeekWithout(window, trigger.date, trigger.slotId, options);

    case 'trend':
      return window;
  }
}

/**
 * Loop A. The logged run replaces the day's plan, the next quality session
 * after it is downgraded, and the week's remaining easy days give back whatever
 * the day overshot by -- in that order, because the quality session is the
 * recovery cost and the easy kilometres are the volume cost.
 */
function absorbSpanner(
  window: PlanWindow,
  date: string,
  km: number,
): PlanWindow {
  const planned = totalKm(window.filter((s) => s.date === date));
  const overshoot = round1(km - planned);
  const logged: PlannedSession = {
    date,
    km,
    kind: km > planned ? 'long' : 'easy',
    slot: window.find((s) => s.date === date)?.slot ?? null,
    note: `Logged unplanned: ${km} km against ${planned} km planned.`,
  };

  const nextQuality = window
    .filter((s) => s.kind === 'quality' && s.date > date)
    .sort((a, b) => a.date.localeCompare(b.date))[0];

  const withLog = window
    .filter((s) => s.date !== date)
    .map((s) =>
      nextQuality && s.date === nextQuality.date && s.kind === 'quality'
        ? {
            ...s,
            kind: 'easy' as const,
            note: `Downgraded from quality: ${km} km logged on ${date} spends the recovery this session needed.`,
          }
        : s,
    );

  if (overshoot <= 0) return sorted([...withLog, logged]);

  // Give the overshoot back out of the easy days still ahead, proportionally,
  // so the week ends where the macro layer put it.
  const week = new Set(weekDates(mondayOf(date)));
  const givers = withLog.filter(
    (s) => s.kind === 'easy' && s.date > date && week.has(s.date) && s.km > 0,
  );
  const givable = totalKm(givers);
  const factor = givable > 0 ? Math.max(0, 1 - overshoot / givable) : 1;

  return sorted([
    ...withLog.map((s) =>
      givers.includes(s) ? { ...s, km: round1(s.km * factor) } : s,
    ),
    logged,
  ]);
}

/**
 * A race lands on a date the plan did not know about. Anything hard already on
 * that date moves, and it moves EARLIER by at least two days by preference:
 * the day after a race is forbidden outright, and a long run the day before one
 * merely stacks the two, which is the mistake this block already corrected once.
 */
function addRace(
  window: PlanWindow,
  date: string,
  name: string,
  distanceKm: number,
): PlanWindow {
  const clash = window.filter(
    (s) => s.date === date && (s.kind === 'long' || s.kind === 'quality'),
  );
  const occupied = new Set(
    window
      .filter(
        (s) => s.kind === 'long' || s.kind === 'race' || s.kind === 'quality',
      )
      .map((s) => s.date),
  );
  const dates = window.map((s) => s.date);
  const earliest = dates[0] ?? date;
  const latest = dates[dates.length - 1] ?? date;

  const candidates = [
    ...[2, 3, 4, 5].map((d) => shiftIso(date, -d)),
    ...[2, 3, 4, 5].map((d) => shiftIso(date, d)),
  ].filter((d) => d >= earliest && d <= latest && !occupied.has(d));
  const target = candidates[0] ?? null;

  const moved = clash.flatMap((s) =>
    target === null
      ? []
      : [
          {
            ...s,
            date: target,
            note: `Moved off ${date}: ${name} now stands there.`,
          },
        ],
  );

  return sorted(
    [
      // Anything already on the target day is replaced rather than doubled up:
      // that day becomes the long day, and the easy kilometres it held are a real
      // cost the rationale reports rather than a total that quietly grows.
      ...window.filter((s) => !clash.includes(s) && s.date !== target),
      ...moved,
      {
        date,
        km: distanceKm,
        kind: 'race' as const,
        slot: window.find((s) => s.date === date)?.slot ?? null,
        note: name,
      },
      // A race spends the week's quality budget (`racesCountAsQualitySessions`),
      // so the interval session it displaces is downgraded here rather than left
      // to breach. This is the stacking the budget exists to prevent.
    ].map((s) =>
      s.kind === 'quality' && sameWeek(s.date, date)
        ? {
            ...s,
            kind: 'easy' as const,
            note: `Downgraded from quality: ${name} on ${date} spends this week's quality budget.`,
          }
        : s,
    ),
  );
}

function sameWeek(a: string, b: string): boolean {
  return mondayOf(a) === mondayOf(b);
}

/** A lost slot re-places its whole week from availability data, not by hand. */
function replanWeekWithout(
  window: PlanWindow,
  date: string,
  slotId: string,
  options: ProposeOptions,
): PlanWindow {
  const monday = mondayOf(date);
  const week = BLOCK_WEEKS.find((w) => w.monday === monday);
  if (!week) return window;

  const placement: PlacementOptions = {
    unavailable: [{ date, slotId }],
    ...(options.soreness
      ? { sorenessSeverity: options.soreness.severity }
      : {}),
  };
  const replanned = planWeek(week, placement).sessions;
  const inWindow = new Set(window.map((s) => s.date));

  return sorted([
    ...window.filter((s) => mondayOf(s.date) !== monday),
    ...replanned.filter((s) => inWindow.has(s.date)),
  ]);
}

/* ------------------------------------------------------------ the diff --- */

/** What changed, day by day. Sessions have no ids yet, so the date is the key. */
export function diffWindows(
  before: PlanWindow,
  after: PlanWindow,
): SessionChange[] {
  const dates = [...new Set([...before, ...after].map((s) => s.date))].sort(
    (a, b) => a.localeCompare(b),
  );

  return dates.flatMap((date) => {
    const was = before.filter((s) => s.date === date);
    const now = after.filter((s) => s.date === date);
    const changes: SessionChange[] = [];

    if (was.length > 0 && now.length === 0) {
      return [
        { date, field: 'presence' as const, from: kindOf(was), to: null },
      ];
    }
    if (was.length === 0 && now.length > 0) {
      return [
        { date, field: 'presence' as const, from: null, to: kindOf(now) },
      ];
    }

    const wasKm = totalKm(was);
    const nowKm = totalKm(now);
    if (wasKm !== nowKm) {
      changes.push({ date, field: 'km', from: wasKm, to: nowKm });
    }
    if (kindOf(was) !== kindOf(now)) {
      changes.push({ date, field: 'kind', from: kindOf(was), to: kindOf(now) });
    }
    // A session that keeps its distance and moves slot has still moved, and a
    // replan triggered by a lost slot would otherwise report an empty diff --
    // the shape a caller cannot distinguish from "nothing happened".
    if (slotOf(was) !== slotOf(now)) {
      changes.push({ date, field: 'slot', from: slotOf(was), to: slotOf(now) });
    }
    return changes;
  });
}

function kindOf(sessions: readonly PlannedSession[]): string {
  return [...sessions].sort((a, b) => b.km - a.km)[0]?.kind ?? 'rest';
}

function slotOf(sessions: readonly PlannedSession[]): string | null {
  return [...sessions].sort((a, b) => b.km - a.km)[0]?.slot ?? null;
}

function weekTotal(window: PlanWindow, monday: string): number {
  const dates = new Set(weekDates(monday));
  return totalKm(window.filter((s) => dates.has(s.date)));
}

/**
 * The plain-language half. Names what moved, then what it cost, then anything
 * still breached -- in that order, because the athlete's first question is
 * "what changed" and the second is "what did that cost me".
 */
export function rationale(
  trigger: ReplanTrigger,
  before: PlanWindow,
  after: PlanWindow,
  changes: readonly SessionChange[],
  results: readonly GuardrailResult[],
): string {
  const moved = changes.map((c) => phrase(c)).filter((p) => p.length > 0);
  const weeks = [...new Set(changes.map((c) => mondayOf(c.date)))];
  const cost = weeks.map((monday) => {
    const from = weekTotal(before, monday);
    const to = weekTotal(after, monday);
    return from === to
      ? `the week of ${humanDate(monday)} still holds ${to} km`
      : `the week of ${humanDate(monday)} goes ${from} km to ${to} km`;
  });
  const breached = results.filter((r) => r.breached);

  return [
    opening(trigger),
    moved.length > 0 ? `${moved.join('; ')}.` : 'Nothing moved.',
    cost.length > 0 ? `Cost: ${cost.join(', ')}.` : '',
    breached.length > 0
      ? `Still outstanding: ${breached.map((r) => `${r.ruleId} -- ${r.detail}`).join(' ')}`
      : 'No guardrail is broken by this.',
  ]
    .filter((part) => part.length > 0)
    .join(' ');
}

function opening(trigger: ReplanTrigger): string {
  switch (trigger.kind) {
    case 'spanner':
      return `Absorbed ${trigger.km} km logged on ${humanDate(trigger.date)}.`;
    case 'soreness':
      return `Soreness ${trigger.severity} reported ${humanDate(trigger.since)}: quality is off until it clears, easy volume and swimming are untouched.`;
    case 'race-added':
      return `${trigger.name} added on ${humanDate(trigger.date)}.`;
    case 'race-cancelled': {
      const race = RACES.find((r) => r.date === trigger.date);
      return `${race?.name ?? 'The race'} on ${humanDate(trigger.date)} is off; the date returns to ordinary planning.`;
    }
    case 'availability-lost':
      return `Lost the ${trigger.slotId} slot on ${humanDate(trigger.date)}; the week is re-placed into what is left.`;
    case 'trend': {
      const pct = round1(
        ((trigger.completedKm - trigger.targetKm) / trigger.targetKm) * 100,
      );
      const direction = pct >= 0 ? 'above' : 'below';
      return `Trailing ${humanDate(trigger.from)} to ${humanDate(trigger.to)}: ${trigger.completedKm} km against a ${trigger.targetKm} km target, ${Math.abs(pct)}% ${direction}. This informs the next conversation and moves nothing by itself.`;
    }
  }
}

function phrase(change: SessionChange): string {
  const day = humanDate(change.date);
  switch (change.field) {
    case 'presence':
      return change.to === null
        ? `${day}: ${String(change.from)} removed`
        : `${day}: ${String(change.to)} added`;
    case 'km':
      return `${day}: ${String(change.from)} km to ${String(change.to)} km`;
    case 'kind':
      return `${day}: ${String(change.from)} becomes ${String(change.to)}`;
    case 'slot':
      return `${day}: moved to the ${String(change.to)} slot`;
  }
}

/** The window length the micro planner holds, straight from config. */
export const ROLLING_WINDOW_DAYS = REPLAN.rollingWindowDays;
