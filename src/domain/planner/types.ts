/**
 * The planner's vocabulary. No thresholds live here -- every number this
 * module's consumers apply is read from `config/training.ts` at evaluation
 * time (REDLINES.md rule 1).
 */

import { GUARDRAIL_RULE_IDS } from '../../../config/training';

/**
 * A stable guardrail id. A wire contract: `violated_rules[]` carries these, not
 * sentences, because an id survives rewording and is matchable in an eval
 * (`docs/specs/04-mcp-surface.md:44`).
 */
export type RuleId = keyof typeof GUARDRAIL_RULE_IDS;

export const ALL_RULE_IDS = Object.keys(GUARDRAIL_RULE_IDS) as RuleId[];

/**
 * `swim` carries zero running kilometres and is never touched by a repair --
 * it is the session Loop B has to leave alone (`00-overview.md:11`, "swim
 * volume unaffected, zero impact"). `rest` is a day deliberately held empty,
 * distinct from a day with no row at all.
 */
export type SessionKind =
  'easy' | 'quality' | 'long' | 'race' | 'swim' | 'rest';

export type PlannedSession = {
  readonly date: string;
  /** Running kilometres. Zero for rest and swim. */
  readonly km: number;
  readonly kind: SessionKind;
  /** Slot id from `AVAILABILITY.runSlots`, or null when the day carries no run. */
  readonly slot: string | null;
  readonly note?: string;
};

/** The rolling window. Guardrails are evaluated over ALL of it, never one row. */
export type PlanWindow = readonly PlannedSession[];

/** One run that actually happened. Shape shared with `singleSessionSpikes()`. */
export type CompletedRun = {
  readonly date: string;
  readonly km: number;
};

/**
 * The result of evaluating one guardrail over one scope.
 *
 * Never a bare boolean: a caller has to be able to state the rule, quantify the
 * cost of breaking it and offer the closest compliant alternative
 * (`docs/specs/03-planner.md:28`), and none of that is reconstructible from a
 * `false`. `coverage` is REDLINES.md's computed-aggregate rule applied here --
 * a ramp figure returned without the window it covers is wrong without looking
 * wrong.
 */
export type GuardrailResult = {
  readonly ruleId: RuleId;
  /** What was measured: `week of 2026-09-14`, a date, or `window`. */
  readonly scope: string;
  /** The configured limit, on the same scale as `observed`. */
  readonly threshold: number | null;
  readonly observed: number | null;
  readonly unit: 'pct' | 'km' | 'days' | 'sessions' | 'severity';
  readonly breached: boolean;
  /** A breach refuses the write. False means advisory: named, costed, allowed. */
  readonly blocking: boolean;
  /** The athlete may override everything except the taper and injury gates. */
  readonly overridable: boolean;
  /** The span the figures were computed over, and how many of its days were visible. */
  readonly coverage: {
    readonly from: string;
    readonly to: string;
    readonly days: number;
  };
  /** One sentence, cost quantified, for the athlete rather than the log. */
  readonly detail: string;
};

export type SessionChange = {
  readonly date: string;
  readonly field: 'km' | 'kind' | 'slot' | 'presence';
  readonly from: string | number | null;
  readonly to: string | number | null;
};

/** A change set plus the plain-language sentence that explains it. */
export type Diff = {
  readonly changes: readonly SessionChange[];
  readonly rationale: string;
};

/**
 * The envelope every write returns (`docs/specs/04-mcp-surface.md:31-51`).
 *
 * Snake_case because it is a wire shape read by an LLM mid-conversation, not an
 * internal type. `applied` is the field that separates "your request was
 * refused" from "your request changed nothing" -- the two serialise to an
 * identical diff, and a model asked to narrate an ambiguous result fills the
 * gap with optimism.
 */
export type WriteResult = {
  readonly applied: boolean;
  /** Every rule actually evaluated. Makes "enforced" falsifiable, not assertable. */
  readonly applied_rules: readonly RuleId[];
  /** Always a subset of `applied_rules`: a rule cannot be violated unevaluated. */
  readonly violated_rules: readonly RuleId[];
  readonly compliant_alternative: Diff | null;
  /** The window as it stands after the call, applied or refused. */
  readonly resulting_window: PlanWindow;
};

/** A replan additionally names what moved and what it cost. */
export type ReplanResult = WriteResult & {
  readonly diff: Diff;
  readonly guardrails: readonly GuardrailResult[];
};
