/**
 * Row shapes shared by the store, the guardrail evaluator, the MCP tools and
 * the PWA. Kept dependency-free so the pure half of the domain never has to
 * import the database to know what a session looks like.
 */

/**
 * A row of the `sessions` table.
 *
 * Distinct from the planner's own `PlannedSession` (`planner/types.ts`), and
 * deliberately so: the planner reasons about `{date, km, kind, slot}` and has
 * no notion of a primary key, while a tool that edits one session needs
 * something to address it by. `mcp/window.ts` maps between the two.
 */
export type SessionRow = {
  readonly id: string;
  readonly date: string;
  readonly weekNumber: number | null;
  /** easy | steady | quality | long | swim | rest | race */
  readonly type: string;
  readonly plannedKm: number | null;
  readonly timeSlot: string | null;
  /** planned | done | modified | skipped */
  readonly status: string;
  readonly note: string | null;
};

/** The typed changes `rocket_adjust_session` accepts. Nothing free-form. */
export type SessionChanges = {
  readonly date?: string;
  readonly type?: string;
  readonly plannedKm?: number;
  readonly timeSlot?: string;
  readonly note?: string;
};

export type CheckIn = {
  readonly id: string;
  readonly localDate: string;
  readonly rpeYesterday: number | null;
  readonly soreness: readonly { location: string; severity: number }[] | null;
  readonly sleep: number | null;
  readonly motivation: number | null;
  readonly note: string | null;
};

export type LoggedActivity = {
  readonly id: string;
  readonly localDate: string;
  readonly activityType: string;
  readonly distanceM: number | null;
  readonly durationS: number | null;
  readonly elevationGainM: number | null;
  readonly rpe: number | null;
  readonly shoeId: string | null;
  readonly surface: string | null;
  readonly notes: string | null;
};

export type Note = {
  readonly id: string;
  readonly localDate: string;
  readonly kind: 'availability' | 'wellness' | 'constraint' | 'free_text';
  readonly text: string;
  readonly source: 'chat' | 'checkin' | 'cron';
  readonly expiresAt: Date | null;
};

/**
 * An activity arriving from the bridge rather than typed in by hand.
 *
 * Wider than `LoggedActivity` because the bridge supplies more, and narrower
 * than the `activities` table because most of what it supplies is not worth a
 * typed column -- `raw` carries the rest, per the schema's standing rule that a
 * field nobody thought to type must not need re-ingesting later.
 *
 * `id` is `icu:<upstream id>`, which is what makes ingest idempotent: a second
 * pass over the same day conflicts on the primary key and inserts nothing.
 */
export type IngestedActivity = {
  readonly id: string;
  readonly source: string;
  readonly localDate: string;
  readonly name: string | null;
  readonly activityType: string | null;
  readonly startTimeLocal: Date | null;
  readonly distanceM: number | null;
  readonly durationS: number | null;
  readonly elapsedDurationS: number | null;
  readonly averageHr: number | null;
  readonly maxHr: number | null;
  readonly elevationGainM: number | null;
  readonly calories: number | null;
  /** The source's own training-load figure. An independent oracle on ours. */
  readonly activityTrainingLoad: number | null;
  readonly raw: unknown;
};

/**
 * One run of a scheduled job. REDLINES.md rule 3's first layer.
 *
 * Written whether the pass succeeded or failed, and written OUTSIDE any
 * transaction so the failure row survives the throw that caused it.
 */
export type SyncRun = {
  readonly id: string;
  readonly job: string;
  readonly ranAt: Date;
  readonly ok: boolean;
  readonly detail: string;
  readonly summary: unknown;
};
