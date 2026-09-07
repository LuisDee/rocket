/**
 * The adapter between the `sessions` table and the planner's vocabulary.
 *
 * The planner reasons about `{date, km, kind, slot}` and knows nothing about a
 * database -- deliberately, and the boundary is worth protecting. But a tool
 * that edits ONE session needs something to address it by, and the planner's
 * shape has no key. So the mapping lives here, on the I/O side, and the planner
 * stays ignorant.
 *
 * Nothing in this file expresses a guardrail. Every rule is evaluated by
 * `domain/planner/guardrails.ts`; this only reshapes rows and assembles the
 * envelope the spec's write contract defines.
 */

import { REPLAN } from '../../config/training';
import { mondayOf, shiftIso } from '../domain/planner/dates';
import type {
  Diff,
  GuardrailResult,
  PlanWindow,
  PlannedSession,
  RuleId,
  SessionKind,
  WriteResult,
} from '../domain/planner/types';
import type { SessionRow } from '../domain/types';

/**
 * `steady` is a running session the planner has no separate kind for, so it
 * maps onto `easy`: both carry aerobic kilometres and neither spends the
 * quality budget. Anything unrecognised maps to `easy` as well rather than
 * throwing -- a row with an odd type must not take the whole window down.
 */
const KINDS: Record<string, SessionKind> = {
  easy: 'easy',
  steady: 'easy',
  quality: 'quality',
  long: 'long',
  race: 'race',
  swim: 'swim',
  rest: 'rest',
};

export function toPlannerSession(row: SessionRow): PlannedSession {
  return {
    date: row.date,
    km: row.plannedKm ?? 0,
    kind: KINDS[row.type] ?? 'easy',
    slot: row.timeSlot,
    ...(row.note === null ? {} : { note: row.note }),
  };
}

export function toPlanWindow(rows: readonly SessionRow[]): PlanWindow {
  return rows.map(toPlannerSession);
}

/**
 * The bounds every write is validated over: whole Monday-to-Sunday weeks
 * spanning today through the far end of the rolling window, widened to take in
 * any date the call itself touches.
 *
 * Whole weeks because a week-scoped rule cannot be applied to half a week's
 * kilometres -- a partial total reads as compliant against a full week's cap,
 * which is the shape of a check that looks correct and is not.
 */
export function windowBounds(
  today: string,
  touching: readonly string[] = [],
): { from: string; to: string } {
  const starts = [today, ...touching].map(mondayOf).sort();
  const ends = [
    shiftIso(today, REPLAN.rollingWindowDays.max),
    ...touching,
  ].sort();
  return {
    from: starts[0] ?? mondayOf(today),
    to: shiftIso(mondayOf(ends[ends.length - 1] ?? today), 6),
  };
}

export function appliedRules(results: readonly GuardrailResult[]): RuleId[] {
  return [...new Set(results.map((r) => r.ruleId))].sort();
}

export function violatedRules(results: readonly GuardrailResult[]): RuleId[] {
  return [
    ...new Set(results.filter((r) => r.breached).map((r) => r.ruleId)),
  ].sort();
}

/** Breaches that refuse the write, as opposed to the advisory ones. */
export function blocking(
  results: readonly GuardrailResult[],
): GuardrailResult[] {
  return results.filter((r) => r.breached && r.blocking);
}

/**
 * The five-field envelope (`docs/specs/04-mcp-surface.md`).
 *
 * `compliant_alternative` is never null on a refusal: where no rearrangement
 * satisfies the rule -- the taper gate is the clear case -- the counter-offer
 * is "keep the session as it is", expressed as a real alternative with no
 * changes in it. Tools never dead-end, and an absent counter-offer is a
 * dead-end wearing a different name.
 */
export function envelopeOf(
  applied: boolean,
  results: readonly GuardrailResult[],
  compliantAlternative: Diff | null,
  window: PlanWindow,
): WriteResult {
  return {
    applied,
    applied_rules: appliedRules(results),
    violated_rules: violatedRules(results),
    compliant_alternative: compliantAlternative,
    resulting_window: window,
  };
}

/** The no-op counter-offer, for a refusal nothing smaller would fix. */
export function keepAsIs(rationale: string): Diff {
  return { changes: [], rationale };
}
