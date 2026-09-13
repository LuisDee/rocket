/**
 * The `rocket_` tool surface. docs/specs/04-mcp-surface.md is the contract.
 *
 * Registered against an `McpServer` and given a `Store`, so the whole surface
 * can be driven through `tools/call` in tests with no database.
 *
 * Four conventions, all load-bearing:
 *
 *   1. Handlers NEVER throw -- see `result.ts`. A thrown error is a transport
 *      failure the model cannot recover from; `isError` with readable text lets
 *      it correct itself.
 *   2. `inputSchema` is a PLAIN OBJECT of zod validators, not a wrapping
 *      `z.object()`. That is the SDK v1 calling convention and the most common
 *      porting mistake.
 *   3. Every `.describe()` is written at the model, not at a type checker. It
 *      is the real prompt surface.
 *   4. No rule is expressed here. Guardrails, negotiation and repair are
 *      `src/domain/planner`; this file reshapes rows, calls it, and narrates
 *      what came back.
 *
 * The prefix is frozen: names bake into a connector the moment it is added, and
 * changing one afterwards means re-adding it.
 */

import { randomUUID } from 'node:crypto';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
  BLOCK,
  GUARDRAILS,
  MULTIPLIERS,
  PACE_ESTIMATES,
  SHOES,
  SYNC,
} from '../../config/training';
import { checkInFields, checkInSchema, recordCheckIn } from '../domain/checkin';
import { DAILY_PASS_JOB } from '../jobs/daily-pass';
import { shiftIso } from '../domain/planner/dates';
import { evaluateGuardrails } from '../domain/planner/guardrails';
import {
  propose,
  replan as replanWindow,
  type ProposedChange,
} from '../domain/planner/negotiate';
import type {
  CompletedRun,
  GuardrailResult,
  SessionKind,
} from '../domain/planner/types';
import { scoreReadiness, worstSoreness } from '../domain/readiness';
import type { Store } from '../domain/store';
import type { CheckIn, SessionChanges, SessionRow } from '../domain/types';
import {
  currentWeek,
  daysToRace,
  formatDuration,
  parseIsoDate,
  todayInLondon,
} from '../lib/block';
import { planForDate } from '../lib/plan';
import { fail, ok, reason, type ToolResult } from './result';
import { envelopeOf, keepAsIs, toPlanWindow, windowBounds } from './window';

/** The clock, injected so a test can pin a date. */
export type Clock = { today(): string; now(): Date };

const systemClock: Clock = {
  today: () => todayInLondon(),
  now: () => new Date(),
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isoDate = z.string().regex(DATE_RE, 'expected YYYY-MM-DD');

const SURFACES = Object.keys(MULTIPLIERS.surface) as [string, ...string[]];
const SHOE_IDS = SHOES.inventory.map((s) => s.id) as [string, ...string[]];
const SESSION_TYPES = [
  'easy',
  'quality',
  'long',
  'race',
  'swim',
  'rest',
] as const;

/** The latest check-in's soreness, in the shape the guardrails expect. */
function sorenessOf(checkIn: CheckIn | null) {
  if (checkIn === null) return null;
  const severity = worstSoreness(checkIn.soreness);
  return severity === null ? null : { severity, since: checkIn.localDate };
}

/**
 * Completed runs behind the window: the ramp cap's baseline and the spike
 * rule's denominator.
 *
 * Without this the guardrails fall back to the macro layer's own targets, and a
 * ramp cap comparing a planned week against a planned week always passes --
 * the plan was written to pass it. The lookback is the spike rule's own window
 * (`GUARDRAILS.singleSessionSpikeWindowDays`), which is the longer of the two
 * baselines and so covers the ramp's week as well.
 */
function historyFor(
  store: Store,
  from: string,
  to: string,
): Promise<readonly CompletedRun[]> {
  return store.completedRuns(
    shiftIso(from, -GUARDRAILS.singleSessionSpikeWindowDays),
    to,
  );
}

/** Every guardrail over the whole window. The only path from here to a rule. */
function evaluate(
  rows: readonly SessionRow[],
  checkIn: CheckIn | null = null,
  history: readonly CompletedRun[] = [],
): readonly GuardrailResult[] {
  return evaluateGuardrails({
    window: toPlanWindow(rows),
    history,
    soreness: sorenessOf(checkIn),
  });
}

/**
 * The sentence that keeps `applied_rules` from being misread.
 *
 * Every rule id comes back on every call, breached or not -- that is what makes
 * "enforced" falsifiable rather than assertable. Without saying so, a model
 * narrating the envelope reads a long `applied_rules` as a long list of
 * problems.
 */
function rulesNote(results: readonly GuardrailResult[]): string {
  const breached = results.filter((r) => r.breached).length;
  return (
    `${results.length} guardrail checks ran; applied_rules lists what was ` +
    `EVALUATED, not what fired. ${breached === 0 ? 'None' : String(breached)} breached.`
  );
}

/** `3:50:00-4:00:00` -- a range, never a single time (docs/specs/06). */
function goalBand(): string {
  const { fast, slow } = PACE_ESTIMATES.planningBandSeconds;
  return `${formatDuration(fast)}-${formatDuration(slow)}`;
}

/**
 * The staleness flag REDLINES.md rule 3 requires to be loud, never absent.
 *
 * TWO readings, because they answer different questions and either alone lies.
 * `lastIngestAt` says when an activity last arrived -- but a week of genuine
 * rest looks exactly like a dead sync through that lens. `lastSyncRun` says
 * when the job last RAN and whether it succeeded, which is the reading that
 * separates "nothing to ingest" from "nothing is ingesting". A failed pass with
 * no new activities is invisible without it, and that is precisely the sync
 * that dies quietly during taper.
 */
async function stalenessFlag(store: Store, now: Date): Promise<string> {
  const [last, run] = await Promise.all([
    store.lastIngestAt(),
    store.lastSyncRun(DAILY_PASS_JOB),
  ]);

  const job =
    run === null
      ? 'The daily pass has never run.'
      : run.ok
        ? `Daily pass last succeeded ${hoursAgo(run.ranAt, now)}.`
        : `DAILY PASS FAILING since ${hoursAgo(run.ranAt, now)}: ${run.detail}`;

  const jobStale =
    run !== null && hoursSince(run.ranAt, now) > SYNC.staleAfterHours
      ? ` STALE: no pass in ${String(Math.round(hoursSince(run.ranAt, now)))} hours, past the ${String(SYNC.staleAfterHours)}-hour threshold.`
      : '';

  const ingest =
    last === null
      ? 'No activity has ever been ingested; every activity has to arrive through rocket_log_activity.'
      : `Last ingest ${hoursAgo(last, now)}.`;

  return `${job}${jobStale} ${ingest}`;
}

function hoursSince(at: Date, now: Date): number {
  return (now.getTime() - at.getTime()) / 3_600_000;
}

function hoursAgo(at: Date, now: Date): string {
  return `${String(Math.round(hoursSince(at, now)))} hours ago`;
}

/** Refusals the athlete's override cannot clear: the taper and injury gates. */
function nonOverridable(
  results: readonly GuardrailResult[],
): GuardrailResult[] {
  return results.filter((r) => r.breached && r.blocking && !r.overridable);
}

export function registerRocketTools(
  server: McpServer,
  store: Store,
  clock: Clock = systemClock,
): void {
  /* ------------------------------------------------------- rocket_get_status */

  server.registerTool(
    'rocket_get_status',
    {
      title: "Today's training status",
      description:
        "Open every conversation with this. Today's session, the week, days to the goal " +
        'race, the goal band, the latest readiness reading, open notes and any staleness ' +
        'flag. Cheap, complete and current -- do not assemble this from other tools, and ' +
        'do not work from a remembered version of it.',
      inputSchema: {},
    },
    async (): Promise<ToolResult> => {
      try {
        const today = clock.today();
        const now = clock.now();
        const { from, to } = windowBounds(today);

        const [window, checkIn, notes, historyDays, staleness] =
          await Promise.all([
            store.window(from, to),
            store.latestCheckIn(),
            store.openNotes(today, now),
            store.activityHistoryDays(today),
            stalenessFlag(store, now),
          ]);

        const week = currentWeek(parseIsoDate(today));
        const todaySessions = window.filter((s) => s.date === today);
        // The SAME composition the app renders. Reported the raw rows before, so
        // the assistant said "1 session(s) today" with no zone, pace or structure
        // while the phone showed the whole prescription -- two answers to one
        // question, from the same data.
        const prescribed = await planForDate(store, today);
        const readiness =
          checkIn === null
            ? null
            : {
                ...scoreReadiness(
                  {
                    rpeYesterday: checkIn.rpeYesterday,
                    soreness: checkIn.soreness,
                    sleep: checkIn.sleep,
                    motivation: checkIn.motivation,
                  },
                  historyDays,
                ),
                from_check_in: checkIn.localDate,
                stale: checkIn.localDate !== today,
              };

        const summary =
          `${today}. ${daysToRace(parseIsoDate(today))} days to ${BLOCK.goalRace}, ` +
          `goal band ${goalBand()}. ` +
          (week === null
            ? 'Outside the block.'
            : `Week ${week.week} (${week.phase}), target ${week.targetKm ?? 'n/a'} km.`) +
          (prescribed.today === null
            ? ' Nothing on the calendar for today.'
            : ` Today: ${prescribed.today.zone}, ${String(prescribed.today.km)} km. ${prescribed.today.what}` +
              (prescribed.today.demoted === null
                ? ''
                : ` ${prescribed.today.demoted.reason}`)) +
          (readiness === null
            ? ' No check-in recorded yet.'
            : ` Readiness ${readiness.band}.`) +
          ` ${notes.length} open note(s). ${staleness}`;

        return ok(summary, {
          today,
          days_to_goal_race: daysToRace(parseIsoDate(today)),
          goal_race: {
            name: BLOCK.goalRace,
            date: BLOCK.goalRaceDate,
            band: goalBand(),
          },
          week,
          today_sessions: todaySessions,
          /**
           * Today and the week AS PRESCRIBED -- zone, structure, marathon-pace and
           * threshold content, strides, the gym slot, and what a check-in took
           * away. `today_sessions` above stays because it carries the row ids
           * `rocket_adjust_session` needs; this is what to actually tell him.
           */
          today_prescribed: prescribed.today,
          week_prescribed: prescribed.week,
          plan_source: prescribed.source,
          // Rows, with ids: this is where the model gets the session_id that
          // rocket_adjust_session needs. The planner's own window shape has no
          // key, so a plan can only be pointed at by date without these.
          rolling_window: { from, to, sessions: window },
          readiness,
          open_notes: notes,
          staleness,
        });
      } catch (err) {
        return fail(`Could not read status: ${reason(err)}`);
      }
    },
  );

  /* ---------------------------------------------------- rocket_daily_checkin */

  server.registerTool(
    'rocket_daily_checkin',
    {
      title: "Log this morning's check-in",
      description:
        'Thirty seconds: how yesterday felt, what hurts, sleep, motivation. Recomputes ' +
        'readiness. Every field is optional -- record what Luis actually said rather than ' +
        'pressing for the rest, and never invent a number he did not give.',
      inputSchema: checkInFields,
    },
    async (args): Promise<ToolResult> => {
      try {
        const input = checkInSchema.parse(args);
        const today = clock.today();
        const { checkIn, readiness } = await recordCheckIn(store, input, today);

        const { from, to } = windowBounds(today);
        const [window, history] = await Promise.all([
          store.window(from, to),
          historyFor(store, from, to),
        ]);
        const results = evaluate(window, checkIn, history);

        return ok(
          `Check-in recorded for ${today}. Readiness ${readiness.band} ` +
            `(${readiness.score.toFixed(2)}). ${readiness.rationale}` +
            (readiness.caveat === null ? '' : ` ${readiness.caveat}`) +
            ' No session moved: replanning is a separate, explicit call. If this reading ' +
            'should change the plan, use rocket_replan with a soreness trigger and show ' +
            `Luis the diff. ${rulesNote(results)}`,
          {
            readiness,
            ...envelopeOf(true, results, null, toPlanWindow(window)),
          },
        );
      } catch (err) {
        return fail(`Check-in rejected: ${reason(err)}`);
      }
    },
  );

  /* ----------------------------------------------------- rocket_log_activity */

  server.registerTool(
    'rocket_log_activity',
    {
      title: 'Log an activity by hand',
      description:
        'The manual path, and it works with no integration at all -- use it whenever Luis ' +
        'describes a run rather than waiting for a sync. Surface, elevation and shoe change ' +
        'what a distance costs, so record them when he says them. History is append-only: ' +
        'this row can never be edited afterwards, so ask before guessing a number.',
      inputSchema: {
        type: z
          .enum([
            'running',
            'trail_running',
            'treadmill_running',
            'track_running',
            'swimming',
            'other',
          ])
          .describe(
            "What it was. Garmin's vocabulary, so a synced copy lines up with this one.",
          ),
        date: isoDate
          .optional()
          .describe('Local date, YYYY-MM-DD. Defaults to today.'),
        distance_km: z
          .number()
          .min(0)
          .max(300)
          .optional()
          .describe('Distance in kilometres.'),
        duration_min: z
          .number()
          .min(0)
          .max(1440)
          .optional()
          .describe('Moving time in minutes.'),
        rpe: z
          .number()
          .min(1)
          .max(10)
          .optional()
          .describe(
            'How hard it felt, 1-10. Ask; do not infer it from the pace.',
          ),
        elevation_gain_m: z
          .number()
          .min(0)
          .max(10000)
          .optional()
          .describe('Total ascent in metres.'),
        surface: z
          .enum(SURFACES)
          .optional()
          .describe(
            'Dominant surface. Trail and gravel cost more than road for the same distance.',
          ),
        shoe: z
          .enum(SHOE_IDS)
          .optional()
          .describe(
            'Which shoes. A new shoe carries a novelty cost of its own.',
          ),
        note: z
          .string()
          .max(1000)
          .optional()
          .describe('Anything notable about it.'),
      },
    },
    async (args): Promise<ToolResult> => {
      try {
        const input = logActivitySchema.parse(args);
        const today = clock.today();
        const date = input.date ?? today;

        const activity = {
          id: randomUUID(),
          localDate: date,
          activityType: input.type,
          distanceM:
            input.distance_km === undefined ? null : input.distance_km * 1000,
          durationS:
            input.duration_min === undefined ? null : input.duration_min * 60,
          elevationGainM: input.elevation_gain_m ?? null,
          rpe: input.rpe ?? null,
          shoeId: input.shoe ?? null,
          surface: input.surface ?? null,
          notes: input.note ?? null,
        };
        await store.insertActivity(activity);

        const { from, to } = windowBounds(today, [date]);
        const [window, checkIn, history] = await Promise.all([
          store.window(from, to),
          store.latestCheckIn(),
          historyFor(store, from, to),
        ]);
        const results = evaluate(window, checkIn, history);

        return ok(
          `Logged ${input.type} on ${date}` +
            (input.distance_km === undefined
              ? ''
              : `, ${input.distance_km} km`) +
            '. Training stress is not scored yet -- that arrives with the load engine, so ' +
            'do not narrate a stress figure. If this run was a spanner, call rocket_replan ' +
            `with a spanner trigger to absorb it. ${rulesNote(results)}`,
          {
            activity,
            ...envelopeOf(true, results, null, toPlanWindow(window)),
          },
        );
      } catch (err) {
        return fail(`Activity not logged: ${reason(err)}`);
      }
    },
  );

  /* --------------------------------------------------------- rocket_add_note */

  server.registerTool(
    'rocket_add_note',
    {
      title: 'Write down something that changes the plan',
      description:
        '"I\'m in Leeds Thursday", "calf is tight", "wedding this weekend, no long run". ' +
        'Anything said in conversation that affects planning and is not an activity, a ' +
        'check-in or a schedule rule. Nothing is remembered between conversations unless ' +
        'it is written down here, so write it down as it is said. Notes are context for ' +
        'the negotiation, not commands: a note that should move a session is an argument ' +
        'for rocket_replan, and the diff still comes back for approval.',
      inputSchema: {
        date: isoDate.describe(
          'The day the note is ABOUT, not the day it was said.',
        ),
        kind: z
          .enum(['availability', 'wellness', 'constraint', 'free_text'])
          .describe(
            'availability: where he is or is not. wellness: how the body is. ' +
              'constraint: something the plan must work around. free_text: none of those.',
          ),
        text: z
          .string()
          .min(1)
          .max(1000)
          .describe('His words, not a paraphrase.'),
        expires_at: z
          .string()
          .datetime()
          .optional()
          .describe(
            'ISO timestamp after which this stops surfacing. Set one for anything tied to ' +
              'a day, so it does not clutter every future status; omit it for a standing fact.',
          ),
      },
    },
    async (args): Promise<ToolResult> => {
      try {
        const input = noteSchema.parse(args);
        const note = {
          id: randomUUID(),
          localDate: input.date,
          kind: input.kind,
          text: input.text,
          source: 'chat' as const,
          expiresAt:
            input.expires_at === undefined ? null : new Date(input.expires_at),
        };
        await store.insertNote(note);

        const today = clock.today();
        const { from, to } = windowBounds(today, [input.date]);
        const [window, history] = await Promise.all([
          store.window(from, to),
          historyFor(store, from, to),
        ]);

        return ok(
          `Noted against ${input.date}` +
            (note.expiresAt === null
              ? ' (stands until withdrawn).'
              : `, expiring ${input.expires_at}.`) +
            ' It will surface in rocket_get_status until then. No session moved.',
          {
            note,
            ...envelopeOf(
              true,
              evaluate(window, null, history),
              null,
              toPlanWindow(window),
            ),
          },
        );
      } catch (err) {
        return fail(`Note not recorded: ${reason(err)}`);
      }
    },
  );

  /* --------------------------------------------------- rocket_adjust_session */

  server.registerTool(
    'rocket_adjust_session',
    {
      title: 'Change one session',
      description:
        'A targeted edit: resize it, retype it, or move it to another day. Checked against ' +
        'the WHOLE rolling window rather than the session, because ten individually ' +
        'reasonable edits can walk a compliant week past the ramp cap with every call ' +
        'truthfully reporting success. A refusal comes back with the closest compliant ' +
        'version, so accepting the counter-offer is one more call. Change one thing per ' +
        'call; for anything larger use rocket_replan.',
      inputSchema: {
        session_id: z
          .string()
          .min(1)
          .describe("An id from rocket_get_status's rolling_window."),
        planned_km: z
          .number()
          .min(0)
          .max(100)
          .optional()
          .describe('New distance in kilometres.'),
        type: z.enum(SESSION_TYPES).optional().describe('New session type.'),
        date: isoDate.optional().describe('Move it to this day.'),
        time_slot: z
          .string()
          .max(40)
          .optional()
          .describe(
            'Which slot it runs in, e.g. "weekday-morning", "evening".',
          ),
        note: z.string().max(500).optional().describe('Why it changed.'),
        override: z
          .boolean()
          .optional()
          .describe(
            'Luis has explicitly accepted a guardrail breach. Never set this on his behalf ' +
              'or to get past a refusal: it must be his decision, taken after the cost was ' +
              'stated. It cannot clear the taper or the injury gate, which are not overridable.',
          ),
      },
    },
    async (args): Promise<ToolResult> => {
      try {
        const input = adjustSchema.parse(args);

        const structural = [input.planned_km, input.type, input.date].filter(
          (v) => v !== undefined,
        );
        if (structural.length > 1) {
          return fail(
            'One structural change per call: pass exactly one of planned_km, type or date. ' +
              'Two at once cannot be counter-offered against, because there is no single ' +
              'axis to retreat along. Use rocket_replan for a larger rearrangement.',
          );
        }

        const existing = await store.session(input.session_id);
        if (existing === null) {
          return fail(
            `No session ${input.session_id}. Call rocket_get_status and use an id from ` +
              'its rolling_window.',
          );
        }

        const today = clock.today();
        const { from, to } = windowBounds(today, [
          existing.date,
          input.date ?? existing.date,
        ]);
        const [rows, checkIn, history] = await Promise.all([
          store.window(from, to),
          store.latestCheckIn(),
          historyFor(store, from, to),
        ]);
        const plan = toPlanWindow(rows);
        const options = {
          history,
          soreness: sorenessOf(checkIn),
          ...(input.override === undefined ? {} : { override: input.override }),
        };

        const change = proposedChange(existing, input);
        const dbChanges = sessionChanges(input);
        if (Object.keys(dbChanges).length === 0) {
          return fail(
            'Nothing to change: pass at least one of planned_km, type, date, time_slot or note.',
          );
        }

        // A slot or note edit is invisible to every guardrail -- it moves no
        // kilometres and changes no day -- so it is applied against the window
        // as it stands rather than pushed through a negotiation that has
        // nothing to negotiate.
        if (change === null) {
          await store.updateSession(existing.id, dbChanges);
          const written = await store.window(from, to);
          const results = evaluate(written, checkIn, history);
          return ok(
            `Applied to ${existing.id}: ${describe(dbChanges)}. No guardrail is sensitive ` +
              `to that field. ${rulesNote(results)}`,
            envelopeOf(true, results, null, toPlanWindow(written)),
          );
        }

        const result = propose(plan, change, options);

        if (!result.applied) {
          // Re-evaluated locally only to NARRATE the refusal: the envelope
          // carries rule ids, and `03-planner.md:28` wants the rule stated and
          // its cost quantified, which lives in each result's `detail`.
          const after = evaluate(
            applyLocally(rows, existing.id, dbChanges),
            checkIn,
            history,
          );
          const refusals = after.filter((r) => r.breached && r.blocking);
          const immovable = nonOverridable(after);
          return ok(
            `Refused: ${result.violated_rules.join(', ')}. ` +
              `${refusals.map((r) => `${r.scope}: ${r.detail}`).join(' ')} ` +
              (input.override === true && immovable.length > 0
                ? `Your override does not reach ${immovable
                    .map((r) => r.ruleId)
                    .join(
                      ', ',
                    )} -- the taper and the injury gate are not overridable, ` +
                  `and that is deliberate. ${immovable.map((r) => r.detail).join(' ')} `
                : '') +
              (result.compliant_alternative === null
                ? 'There is no nearer version of this change that clears the window. '
                : `Counter-offer: ${result.compliant_alternative.rationale} `) +
              'Nothing was written.',
            {
              ...result,
              compliant_alternative:
                result.compliant_alternative ??
                keepAsIs(
                  'Leave the session as it is: no nearer version of this change clears ' +
                    'the whole window.',
                ),
            },
          );
        }

        await store.updateSession(existing.id, dbChanges);
        const written = await store.window(from, to);
        const results = evaluate(written, checkIn, history);
        const advisory = results.filter((r) => r.breached);
        return ok(
          `Applied to ${existing.id}: ${describe(dbChanges)}.` +
            (advisory.length === 0
              ? ''
              : ` Advisory, not a refusal: ${advisory.map((r) => r.detail).join(' ')}`) +
            ` ${rulesNote(results)}`,
          envelopeOf(true, results, null, toPlanWindow(written)),
        );
      } catch (err) {
        return fail(`Session not changed: ${reason(err)}`);
      }
    },
  );

  /* ------------------------------------------------------------ rocket_replan */

  server.registerTool(
    'rocket_replan',
    {
      title: 'Replan the window',
      description:
        'The "I feel good, let\'s do 30km today" / "meeting ran over, no lunch run" entry ' +
        "point. `reason` is Luis's own words and is always recorded, so nothing said in " +
        'conversation is lost. `trigger` is what actually moves the plan: pass one when you ' +
        'know what changed, and the deterministic planner repairs the window and returns ' +
        'the diff and its rationale for approval. Without a trigger this records the reason ' +
        'and reports the window unchanged -- it never guesses at a rearrangement.',
      inputSchema: {
        reason: z
          .string()
          .min(1)
          .max(1000)
          .describe(
            "What changed, in Luis's words. Stored verbatim as a note.",
          ),
        trigger: triggerSchema
          .optional()
          .describe(
            'What the planner should repair around. spanner: an unplanned run happened. ' +
              'soreness: the tumble-dryer case, a body signal that should pull load down. ' +
              'race-added / race-cancelled: the calendar moved. availability-lost: a slot ' +
              'is gone on a given day. trend: a trailing over- or under-performance, which ' +
              'informs and never acts by itself.',
          ),
        override: z
          .boolean()
          .optional()
          .describe(
            'Luis has explicitly accepted a guardrail breach. Never set it on his behalf. ' +
              'It cannot clear the taper or the injury gate.',
          ),
      },
    },
    async (args): Promise<ToolResult> => {
      try {
        const input = replanSchema.parse(args);
        const today = clock.today();
        const { from, to } = windowBounds(today);

        await store.insertNote({
          id: randomUUID(),
          localDate: today,
          kind: 'constraint',
          text: input.reason,
          source: 'chat',
          expiresAt: null,
        });

        const [rows, checkIn, history] = await Promise.all([
          store.window(from, to),
          store.latestCheckIn(),
          historyFor(store, from, to),
        ]);
        const plan = toPlanWindow(rows);

        if (input.trigger === undefined) {
          const results = evaluate(rows, checkIn, history);
          const breached = results.filter((r) => r.breached);
          return ok(
            `Reason recorded against ${today}; it will surface in rocket_get_status. ` +
              'No trigger was given, so nothing was rearranged -- the planner does not ' +
              'guess at what a sentence should do to a week. ' +
              (breached.length === 0
                ? `The window ${from} to ${to} breaches nothing. `
                : `Standing findings: ${breached.map((r) => r.detail).join(' ')} `) +
              'Pass a trigger to have the window repaired. ' +
              rulesNote(results),
            envelopeOf(true, results, null, plan),
          );
        }

        const options = {
          history,
          soreness: sorenessOf(checkIn),
          ...(input.override === undefined ? {} : { override: input.override }),
        };
        const result = replanWindow(plan, input.trigger, options);

        if (result.applied) {
          await store.replaceWindow(from, to, result.resulting_window);
        }

        const immovable = nonOverridable(result.guardrails);
        return ok(
          (result.applied
            ? `Replanned ${from} to ${to}. ${result.diff.rationale}`
            : `Refused: ${result.violated_rules.join(', ')}. ${result.diff.rationale} ` +
              'Nothing was written.') +
            (input.override === true && !result.applied && immovable.length > 0
              ? ` Your override does not reach ${immovable
                  .map((r) => r.ruleId)
                  .join(
                    ', ',
                  )}: the taper and the injury gate are not overridable.`
              : '') +
            ` ${rulesNote(result.guardrails)}`,
          result,
        );
      } catch (err) {
        return fail(`Replan failed: ${reason(err)}`);
      }
    },
  );
}

/* ------------------------------------------------------------------ schemas */

const logActivitySchema = z.object({
  type: z.string(),
  date: isoDate.optional(),
  distance_km: z.number().min(0).max(300).optional(),
  duration_min: z.number().min(0).max(1440).optional(),
  rpe: z.number().min(1).max(10).optional(),
  elevation_gain_m: z.number().min(0).max(10000).optional(),
  surface: z.string().optional(),
  shoe: z.string().optional(),
  note: z.string().max(1000).optional(),
});

const noteSchema = z.object({
  date: isoDate,
  kind: z.enum(['availability', 'wellness', 'constraint', 'free_text']),
  text: z.string().min(1).max(1000),
  expires_at: z.string().datetime().optional(),
});

const adjustSchema = z.object({
  session_id: z.string().min(1),
  planned_km: z.number().min(0).max(100).optional(),
  type: z.enum(SESSION_TYPES).optional(),
  date: isoDate.optional(),
  time_slot: z.string().max(40).optional(),
  note: z.string().max(500).optional(),
  override: z.boolean().optional(),
});

/**
 * The trigger union the model may pass. Deliberately NOT annotated with the
 * planner's `ReplanTrigger`: an annotation on a discriminated union costs the
 * inference `.optional()` depends on, and the contract is already checked where
 * it matters -- `replanWindow(plan, input.trigger, ...)` stops compiling the
 * moment either side gains a kind the other lacks.
 */
const triggerSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('spanner'),
    date: isoDate,
    km: z.number().min(0).max(100),
  }),
  z.object({
    kind: z.literal('soreness'),
    severity: z.number().min(0).max(5),
    since: isoDate,
  }),
  z.object({
    kind: z.literal('race-added'),
    date: isoDate,
    name: z.string().min(1).max(200),
    distanceKm: z.number().min(0).max(100),
  }),
  z.object({ kind: z.literal('race-cancelled'), date: isoDate }),
  z.object({
    kind: z.literal('availability-lost'),
    date: isoDate,
    slotId: z.string().min(1).max(60),
  }),
  z.object({
    kind: z.literal('trend'),
    completedKm: z.number().min(0),
    targetKm: z.number().min(0),
    from: isoDate,
    to: isoDate,
  }),
]);

const replanSchema = z.object({
  reason: z.string().min(1).max(1000),
  trigger: triggerSchema.optional(),
  override: z.boolean().optional(),
});

/* ------------------------------------------------------------------ helpers */

type AdjustInput = z.infer<typeof adjustSchema>;

/** The typed change the planner negotiates, or null when nothing it models moved. */
function proposedChange(
  existing: SessionRow,
  input: AdjustInput,
): ProposedChange | null {
  if (input.planned_km !== undefined) {
    return { kind: 'set-km', date: existing.date, km: input.planned_km };
  }
  if (input.type !== undefined) {
    return {
      kind: 'set-type',
      date: existing.date,
      sessionKind: input.type as SessionKind,
    };
  }
  if (input.date !== undefined && input.date !== existing.date) {
    return { kind: 'move', date: existing.date, toDate: input.date };
  }
  return null;
}

/** The same change, as columns. */
function sessionChanges(input: AdjustInput): SessionChanges {
  return {
    ...(input.date === undefined ? {} : { date: input.date }),
    ...(input.planned_km === undefined ? {} : { plannedKm: input.planned_km }),
    ...(input.type === undefined ? {} : { type: input.type }),
    ...(input.time_slot === undefined ? {} : { timeSlot: input.time_slot }),
    ...(input.note === undefined ? {} : { note: input.note }),
  };
}

function applyLocally(
  rows: readonly SessionRow[],
  id: string,
  changes: SessionChanges,
): SessionRow[] {
  return rows.map((row) => (row.id === id ? { ...row, ...changes } : row));
}

function describe(changes: SessionChanges): string {
  return Object.entries(changes)
    .map(([field, value]) => `${field} -> ${String(value)}`)
    .join(', ');
}
