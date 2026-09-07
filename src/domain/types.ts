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
