/**
 * The tool surface, driven the way a model drives it.
 *
 * Every assertion goes through `tools/call` on a real MCP `Client` over an
 * in-memory transport, NOT by invoking the handler functions. That is the whole
 * point of the harness: calling a handler directly exercises neither the
 * zod-to-JSON-schema generation the model actually reads, nor the result
 * wrapping, nor the `isError` path -- so a schema that cannot be generated and
 * a result shape the client rejects both pass a direct-invocation test.
 *
 * The store is in memory, so this needs no database and runs in `npm run test`.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { beforeEach, describe, expect, it } from 'vitest';

import { LOAD, READINESS, SYNC } from '../../config/training';
import { memoryStore, type MemoryStore } from '../domain/store-memory';
import type { SessionRow } from '../domain/types';
import { DAILY_PASS_JOB } from '../jobs/daily-pass';
import { planForDate } from '../lib/plan';
import { registerRocketTools } from './tools';

/** A Monday inside the block, so the window covers real weeks. */
const TODAY = '2026-09-14';

function session(
  over: Partial<SessionRow> & { id: string; date: string },
): SessionRow {
  return {
    weekNumber: null,
    type: 'easy',
    plannedKm: 10,
    timeSlot: 'evening',
    status: 'planned',
    note: null,
    ...over,
  };
}

async function connect(store: MemoryStore): Promise<Client> {
  const server = new McpServer({ name: 'rocket-test', version: '0.0.0' });
  registerRocketTools(server, store, {
    today: () => TODAY,
    now: () => new Date(`${TODAY}T07:00:00Z`),
  });

  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '0.0.0' });
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return client;
}

type CallResult = {
  content: { type: string; text: string }[];
  isError?: boolean;
};

async function call(
  client: Client,
  name: string,
  args: Record<string, unknown> = {},
): Promise<CallResult> {
  return (await client.callTool({ name, arguments: args })) as CallResult;
}

function text(result: CallResult): string {
  return result.content.map((c) => c.text).join('\n');
}

/** The JSON payload a tool returns after its human-readable summary. */
function payload(result: CallResult): Record<string, unknown> {
  const body = text(result);
  const start = body.indexOf('{');
  expect(start, `no payload in: ${body}`).toBeGreaterThan(-1);
  return JSON.parse(body.slice(start)) as Record<string, unknown>;
}

let store: MemoryStore;
let client: Client;

beforeEach(async () => {
  store = memoryStore();
  client = await connect(store);
});

describe('the assistant and the app answer the same question the same way', () => {
  // The outstanding item on `tasks/prescribe-drives-the-plan.md`: "a test asserts
  // today's session is identical whether read through the page, the daily pass or
  // the MCP tool."
  //
  // It used to be structurally impossible for them to agree. The app recomputed
  // the week from BLOCK_WEEKS and never read a session row; this tool read the
  // rows and reported bare kilometres and a type. Both now go through
  // `lib/plan.planForDate`, and what this test defends is that the tool did not
  // quietly keep its own copy.
  it('reports today’s prescription, and it is the one the app renders', async () => {
    store.rows.sessions.push(
      session({ id: 'q', date: TODAY, type: 'quality', plannedKm: 7.6 }),
    );

    const status = payload(await call(client, 'rocket_get_status'));
    const app = await planForDate(store, TODAY);

    expect(status.today_prescribed).toEqual(
      JSON.parse(JSON.stringify(app.today)),
    );
    expect(status.plan_source).toBe('stored');
    // And the human-readable summary carries it too, so a model that reads only
    // the sentence is not told something different from the payload.
    expect(text(await call(client, 'rocket_get_status'))).toContain(
      app.today?.what ?? '@@never@@',
    );
  });

  it('stops saying "nothing on the calendar" when a plan exists in config only', async () => {
    // The bridge outage left `sessions` empty, and the tool answered "Nothing on
    // the calendar for today" on race morning while the app rendered the race.
    const status = payload(await call(client, 'rocket_get_status'));

    expect(status.plan_source).toBe('config');
    expect(status.today_prescribed).not.toBeNull();
    expect(text(await call(client, 'rocket_get_status'))).not.toContain(
      'Nothing on the calendar',
    );
  });

  it('tells the model a gated session was changed, and why', async () => {
    store.rows.sessions.push(
      session({ id: 'q', date: TODAY, type: 'quality', plannedKm: 7.6 }),
    );
    await store.insertCheckIn({
      id: 'ci',
      localDate: TODAY,
      rpeYesterday: 5,
      soreness: [
        { location: 'achilles', severity: READINESS.sorenessBlocksQuality },
      ],
      sleep: 8,
      motivation: 4,
      note: null,
    });

    const body = text(await call(client, 'rocket_get_status'));
    const status = payload(await call(client, 'rocket_get_status'));
    const today = status.today_prescribed as { zone: string; demoted: unknown };

    expect(today.zone).toBe('easy');
    expect(today.demoted).not.toBeNull();
    expect(body).toContain('gates quality work');
  });
});

describe('the surface itself', () => {
  it('offers exactly the six M1 tools, every one prefixed rocket_', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'rocket_add_note',
      'rocket_adjust_session',
      'rocket_daily_checkin',
      'rocket_get_status',
      'rocket_log_activity',
      'rocket_replan',
    ]);
  });

  it('publishes a generated input schema for every tool, not an empty shape', async () => {
    // The plain-object inputSchema convention silently produces a schema with no
    // properties if it is wrapped in z.object(), and a model then calls every
    // tool with no arguments. This is that failure, caught.
    const { tools } = await client.listTools();
    const checkin = tools.find((t) => t.name === 'rocket_daily_checkin');
    expect(Object.keys(checkin?.inputSchema.properties ?? {}).sort()).toEqual([
      'motivation',
      'note',
      'rpe_yesterday',
      'sleep',
      'soreness',
    ]);
  });
});

describe('bad input never becomes a transport failure', () => {
  it('returns isError naming the field, and the connection survives it', async () => {
    const bad = await call(client, 'rocket_daily_checkin', {
      rpe_yesterday: 99,
    });

    expect(bad.isError).toBe(true);
    expect(text(bad)).toContain('rpe_yesterday');
    expect(store.rows.checkIns).toHaveLength(0);

    // The recovery is the assertion: a thrown handler would have taken the
    // transport down and this second call would never return.
    const good = await call(client, 'rocket_daily_checkin', {
      rpe_yesterday: 4,
    });
    expect(good.isError).toBeUndefined();
    expect(store.rows.checkIns).toHaveLength(1);
  });

  it('refuses an unknown session rather than throwing', async () => {
    const result = await call(client, 'rocket_adjust_session', {
      session_id: 'does-not-exist',
      planned_km: 10,
    });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('rocket_get_status');
  });
});

describe('rocket_daily_checkin', () => {
  it('persists the check-in and scores it', async () => {
    const result = await call(client, 'rocket_daily_checkin', {
      rpe_yesterday: 3,
      sleep: 8,
      motivation: 4,
      soreness: [{ location: 'calf', severity: 1 }],
    });

    expect(store.rows.checkIns).toHaveLength(1);
    expect(store.rows.checkIns[0]?.localDate).toBe(TODAY);
    const body = payload(result) as {
      readiness: { band: string; score: number };
    };
    expect(body.readiness.band).toBe('green');
    expect(body.readiness.score).toBeGreaterThan(READINESS.greenFloor);
  });

  it('states its own insufficiency while history is short of a CTL constant', async () => {
    const result = await call(client, 'rocket_daily_checkin', { sleep: 8 });
    const body = payload(result) as {
      readiness: { insufficientHistory: boolean; caveat: string };
    };
    expect(body.readiness.insufficientHistory).toBe(true);
    expect(body.readiness.caveat).toContain(String(LOAD.ctlWarmUpDays));
    expect(text(result)).toContain('Provisional');
  });

  it('gates quality on soreness at the configured severity', async () => {
    const result = await call(client, 'rocket_daily_checkin', {
      soreness: [
        { location: 'achilles', severity: READINESS.sorenessBlocksQuality },
      ],
    });
    const body = payload(result) as { readiness: { qualityBlocked: boolean } };
    expect(body.readiness.qualityBlocked).toBe(true);
  });
});

describe('rocket_log_activity', () => {
  it('logs a run with no integration configured at all', async () => {
    const result = await call(client, 'rocket_log_activity', {
      type: 'running',
      distance_km: 12.5,
      duration_min: 63,
      rpe: 5,
      surface: 'road',
      shoe: 'daily-trainer',
    });

    expect(result.isError).toBeUndefined();
    expect(store.rows.activities).toHaveLength(1);
    expect(store.rows.activities[0]?.distanceM).toBe(12500);
    expect(store.rows.activities[0]?.durationS).toBe(3780);
    expect(payload(result)['applied']).toBe(true);
  });

  it('never claims a stress figure it cannot compute', async () => {
    const result = await call(client, 'rocket_log_activity', {
      type: 'running',
      distance_km: 10,
    });
    expect(text(result)).toContain('not scored yet');
  });
});

describe('rocket_add_note', () => {
  it('turns a sentence into a row that rocket_get_status surfaces', async () => {
    await call(client, 'rocket_add_note', {
      date: '2026-09-17',
      kind: 'availability',
      text: 'In Leeds Thursday',
    });

    const status = payload(await call(client, 'rocket_get_status'));
    const notes = status['open_notes'] as { text: string; kind: string }[];
    expect(notes).toHaveLength(1);
    expect(notes[0]?.text).toBe('In Leeds Thursday');
    expect(notes[0]?.kind).toBe('availability');
  });

  it('drops a note once it has expired', async () => {
    await call(client, 'rocket_add_note', {
      date: '2026-09-17',
      kind: 'availability',
      text: 'Withdrawn by then',
      expires_at: '2026-09-14T06:00:00.000Z',
    });

    const status = payload(await call(client, 'rocket_get_status'));
    expect(status['open_notes']).toHaveLength(0);
  });
});

describe('rocket_get_status', () => {
  it('opens with the block, the band and the loud absence of a sync', async () => {
    const status = payload(await call(client, 'rocket_get_status'));

    expect(status['today']).toBe(TODAY);
    expect(typeof status['days_to_goal_race']).toBe('number');
    expect((status['goal_race'] as { band: string }).band).toMatch(
      /^\d:\d\d:\d\d-\d:\d\d:\d\d$/,
    );
    expect(status['staleness']).toContain('No activity has ever been ingested');
    expect(status['readiness']).toBeNull();
  });

  it('carries session ids, so the next call can name one', async () => {
    store.rows.sessions.push(session({ id: 'sess-1', date: TODAY }));
    const status = payload(await call(client, 'rocket_get_status'));
    const window = status['rolling_window'] as { sessions: { id: string }[] };
    expect(window.sessions.map((s) => s.id)).toContain('sess-1');
  });

  it('surfaces a FAILED daily pass, which no activity count can reveal', async () => {
    // REDLINES.md rule 3. A failed pull that ingested nothing is
    // indistinguishable from a genuine rest day through `lastIngestAt` alone,
    // and that is exactly the sync that dies quietly during taper.
    await store.recordSyncRun({
      id: 'run-1',
      job: DAILY_PASS_JOB,
      ranAt: new Date(`${TODAY}T04:30:00Z`),
      ok: false,
      detail: 'Daily pass FAILED: intervals.icu 503: upstream down',
      summary: null,
    });

    const status = payload(await call(client, 'rocket_get_status'));
    expect(status['staleness']).toContain('DAILY PASS FAILING');
    expect(status['staleness']).toContain('503');
  });

  it('flags a pass that has not run inside the staleness threshold', async () => {
    await store.recordSyncRun({
      id: 'run-2',
      job: DAILY_PASS_JOB,
      ranAt: new Date(
        Date.parse(`${TODAY}T07:00:00Z`) -
          (SYNC.staleAfterHours + 1) * 3_600_000,
      ),
      ok: true,
      detail: 'Daily pass fine, but long ago.',
      summary: null,
    });

    const status = payload(await call(client, 'rocket_get_status'));
    expect(status['staleness']).toContain('STALE');
    expect(status['staleness']).toContain(String(SYNC.staleAfterHours));
  });
});

describe('the write envelope', () => {
  it('carries all five fields, with violated a subset of applied', async () => {
    const result = payload(
      await call(client, 'rocket_add_note', {
        date: TODAY,
        kind: 'free_text',
        text: 'anything',
      }),
    );

    expect(Object.keys(result)).toEqual(
      expect.arrayContaining([
        'applied',
        'applied_rules',
        'violated_rules',
        'compliant_alternative',
        'resulting_window',
      ]),
    );
    const applied = result['applied_rules'] as string[];
    const violated = result['violated_rules'] as string[];
    expect(applied.length).toBeGreaterThan(0);
    for (const id of violated) expect(applied).toContain(id);
  });
});

describe('rocket_adjust_session validates the whole window, not the session', () => {
  /**
   * Two complete weeks, both compliant as they stand. Week one runs 45 km under
   * a 47 km ceiling; week two runs 55 km under the 60 km target whose declared
   * ramp exemption covers it -- and covers it only AS AUTHORED, so a kilometre
   * above target puts the week back over the cap.
   */
  beforeEach(() => {
    for (let i = 0; i < 5; i += 1) {
      store.rows.sessions.push(
        session({ id: `a${i}`, date: shift('2026-09-07', i), plannedKm: 9 }),
      );
      store.rows.sessions.push(
        session({ id: `b${i}`, date: shift(TODAY, i), plannedKm: 11 }),
      );
    }
  });

  it('refuses an edit whose breach lands in a different week, and writes nothing', async () => {
    // The session edited lives in the week of 7 September. The rule it breaks
    // belongs to the week of 14 September, which the call never mentions. A
    // session-scoped validator passes this move.
    const result = await call(client, 'rocket_adjust_session', {
      session_id: 'a0',
      date: '2026-09-19',
    });
    const body = payload(result);

    expect(body['applied']).toBe(false);
    expect(body['violated_rules']).toContain('weekly-ramp-cap');
    expect(text(result)).toContain('week of 2026-09-14');
    expect(text(result)).toContain('Nothing was written');
    expect(store.rows.sessions.find((s) => s.id === 'a0')?.date).toBe(
      '2026-09-07',
    );
  });

  it('never dead-ends: a refusal with no nearer version still carries an alternative', async () => {
    const body = payload(
      await call(client, 'rocket_adjust_session', {
        session_id: 'a0',
        date: '2026-09-19',
      }),
    );
    const alternative = body['compliant_alternative'] as {
      changes: unknown[];
      rationale: string;
    } | null;

    expect(alternative).not.toBeNull();
    expect(alternative?.rationale).toContain('Leave the session as it is');
  });

  it('counter-offers the largest distance the whole window accepts', async () => {
    const body = payload(
      await call(client, 'rocket_adjust_session', {
        session_id: 'b0',
        planned_km: 30,
      }),
    );

    expect(body['applied']).toBe(false);
    const alternative = body['compliant_alternative'] as {
      changes: { field: string; to: number }[];
      rationale: string;
    };
    // The other four days of that week hold 44 km against a 60 km target, so
    // 16 km is the most this session can take.
    expect(alternative.changes.find((c) => c.field === 'km')?.to).toBe(16);
  });

  it('applies a change the whole window accepts', async () => {
    const result = await call(client, 'rocket_adjust_session', {
      session_id: 'b0',
      planned_km: 13,
    });
    const body = payload(result);

    expect(body['applied']).toBe(true);
    expect(body['violated_rules']).toEqual([]);
    expect(store.rows.sessions.find((s) => s.id === 'b0')?.plannedKm).toBe(13);
  });

  it('refuses two structural changes in one call rather than guessing', async () => {
    const result = await call(client, 'rocket_adjust_session', {
      session_id: 'b0',
      planned_km: 11,
      date: '2026-09-16',
    });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('One structural change per call');
  });

  it('applies a slot change no guardrail is sensitive to', async () => {
    const body = payload(
      await call(client, 'rocket_adjust_session', {
        session_id: 'b0',
        time_slot: 'weekday-morning',
      }),
    );
    expect(body['applied']).toBe(true);
    expect(store.rows.sessions.find((s) => s.id === 'b0')?.timeSlot).toBe(
      'weekday-morning',
    );
  });
});

describe('the guardrails measure the plan against what was actually run', () => {
  /**
   * The failure this catches: a ramp cap comparing a planned week against a
   * planned week always passes, because the plan was written to pass it. The
   * baseline has to come from completed activities.
   *
   * The week of 14 September is RUN, not planned -- 25 km of it, and no session
   * row exists for it at all. The week of 21 September is planned at 40 km.
   * Push one of its days to 20 km and the week reaches 52 km, which is +108 %
   * on what was actually run. A planner reading only the plan has nothing to
   * compare against and waves it through.
   */
  beforeEach(() => {
    for (let i = 0; i < 5; i += 1) {
      store.rows.activities.push({
        id: `run-${i}`,
        localDate: shift(TODAY, i),
        activityType: 'running',
        distanceM: 5000,
        durationS: 1800,
        elevationGainM: null,
        rpe: null,
        shoeId: null,
        surface: null,
        notes: null,
      });
      store.rows.sessions.push(
        session({ id: `c${i}`, date: shift('2026-09-21', i), plannedKm: 8 }),
      );
    }
  });

  it('refuses against the week that was run, and writes nothing', async () => {
    const result = await call(client, 'rocket_adjust_session', {
      session_id: 'c0',
      planned_km: 20,
    });
    const body = payload(result);

    expect(body['applied']).toBe(false);
    expect(body['violated_rules']).toContain('weekly-ramp-cap');
    expect(text(result)).toContain('Nothing was written');
    expect(store.rows.sessions.find((s) => s.id === 'c0')?.plannedKm).toBe(8);
  });

  it('names the completed kilometres it measured against', async () => {
    // 25 km run, not the 60 km the macro layer planned for that week. If the
    // history were dropped this sentence would carry the plan's own number.
    const result = await call(client, 'rocket_adjust_session', {
      session_id: 'c0',
      planned_km: 20,
    });
    expect(text(result)).toContain('25 km');
  });
});

describe('the two flags the athlete cannot argue with', () => {
  it('refuses an override against the taper and explains why it does not reach', async () => {
    // Week of 12 October is protected: the final two weeks take nothing above
    // target, and `overridable: false` means an explicit override is answered
    // rather than obeyed.
    for (let i = 0; i < 5; i += 1) {
      store.rows.sessions.push(
        session({ id: `t${i}`, date: shift('2026-10-12', i), plannedKm: 12 }),
      );
    }

    const body = payload(
      await call(client, 'rocket_adjust_session', {
        session_id: 't0',
        planned_km: 40,
        override: true,
      }),
    );

    expect(body['applied']).toBe(false);
    expect(body['violated_rules']).toContain('protected-taper');
  });

  it('warns about a single-session spike without refusing it', async () => {
    // Advisory by construction: the goal marathon is over this mark against
    // every long run that can precede it, so a blocking version refuses the
    // race the block exists for.
    store.rows.activities.push({
      id: 'short',
      localDate: '2026-09-10',
      activityType: 'running',
      distanceM: 6000,
      durationS: 2400,
      elevationGainM: null,
      rpe: null,
      shoeId: null,
      surface: null,
      notes: null,
    });
    store.rows.sessions.push(
      session({ id: 'spike', date: '2026-09-16', plannedKm: 8 }),
    );

    const body = payload(
      await call(client, 'rocket_adjust_session', {
        session_id: 'spike',
        planned_km: 12,
      }),
    );

    expect(body['applied']).toBe(true);
    expect(body['violated_rules']).toContain('single-session-spike');
  });
});

describe('rocket_replan', () => {
  it('records the reason even when no trigger tells it what to repair', async () => {
    const result = await call(client, 'rocket_replan', {
      reason: 'Meeting ran over, no lunch run',
    });

    expect(store.rows.notes).toHaveLength(1);
    expect(store.rows.notes[0]?.text).toBe('Meeting ran over, no lunch run');
    expect(text(result)).toContain('nothing was rearranged');
  });

  it('does not pretend applied_rules means rules that fired', async () => {
    const result = await call(client, 'rocket_replan', { reason: 'anything' });
    expect(text(result)).toContain('EVALUATED');
  });
});

describe('no tool accepts a plan the model composed', () => {
  /**
   * REDLINES.md rule 8: session and week rows are written only by the
   * deterministic planner, and every MCP write is a typed, guardrail-validated
   * intent. The property holds today because nobody has yet added a convenient
   * tool that breaks it -- which is an accident, not a gate, until something
   * checks.
   *
   * This reads the published schemas rather than the source, so a tool added
   * anywhere fails it. The deliberate violation that proves it bites: give any
   * tool a `sessions` array of `{date, km}` and this goes red.
   */
  const FORBIDDEN_NAMES = [
    'sessions',
    'plan',
    'schedule',
    'week',
    'weeks',
    'days',
    'window',
  ];

  it('publishes no parameter that is a plan, a session list or a schedule', async () => {
    const { tools } = await client.listTools();

    for (const tool of tools) {
      const properties = (tool.inputSchema.properties ?? {}) as Record<
        string,
        { type?: string; items?: { properties?: Record<string, unknown> } }
      >;

      for (const [name, schema] of Object.entries(properties)) {
        expect(
          FORBIDDEN_NAMES,
          `${tool.name} publishes a parameter called ${name}`,
        ).not.toContain(name.toLowerCase());

        // Shape, not just naming: an array of dated objects IS a schedule
        // whatever the field is called.
        if (schema.type === 'array') {
          const itemFields = Object.keys(schema.items?.properties ?? {});
          expect(
            itemFields.includes('date'),
            `${tool.name}.${name} is an array of dated objects, which is a schedule`,
          ).toBe(false);
        }
      }
    }
  });

  it('writes a session only through a single typed change', async () => {
    // rocket_adjust_session is the one tool that edits a session row, and it
    // takes one session id and one field. Nothing else may grow the ability.
    const { tools } = await client.listTools();
    const withSessionId = tools.filter((t) =>
      Object.keys(t.inputSchema.properties ?? {}).includes('session_id'),
    );
    expect(withSessionId.map((t) => t.name)).toEqual(['rocket_adjust_session']);
  });
});

function shift(iso: string, days: number): string {
  const at = new Date(`${iso}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}
