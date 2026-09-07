/**
 * The daily pass, end to end over a fake transport and an in-memory store.
 *
 * The personal API key does not exist yet, so this is the evidence that the job
 * is finished. Every test below breaks something a real morning would break --
 * and the ones that matter most are the failure tests, because REDLINES.md
 * rule 3 is about what happens when the bridge is down at 05:30 during taper,
 * not about what happens when it works.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { LOAD, REPLAN, SYNC } from '../../config/training';
import { memoryStore, type MemoryStore } from '../domain/store-memory';
import { shiftIso } from '../domain/planner/dates';
import type {
  Bridge,
  BridgeActivity,
  PlannedEvent,
  WellnessDay,
} from '../integrations/intervals';
import { DAILY_PASS_JOB, runDailyPass, toEvent } from './daily-pass';

/** Inside week 1 of the block (`BLOCK.blockStart` is 2026-09-07). */
const TODAY = '2026-09-08';
const YESTERDAY = '2026-09-07';

const clock = {
  today: () => TODAY,
  now: () => new Date('2026-09-08T04:30:00Z'),
};

type FakeBridge = Bridge & {
  readonly pushed: PlannedEvent[][];
};

function fakeBridge(
  over: {
    activities?: BridgeActivity[];
    wellness?: WellnessDay[];
    throwOn?: 'activities' | 'wellness' | 'push';
  } = {},
): FakeBridge {
  const pushed: PlannedEvent[][] = [];
  return {
    pushed,
    activities: (): Promise<BridgeActivity[]> =>
      over.throwOn === 'activities'
        ? Promise.reject(new Error('intervals.icu 503: upstream down'))
        : Promise.resolve(over.activities ?? []),
    wellness: (): Promise<WellnessDay[]> =>
      over.throwOn === 'wellness'
        ? Promise.reject(new Error('intervals.icu 401: bad key'))
        : Promise.resolve(over.wellness ?? []),
    pushEvents: (events): Promise<number> => {
      if (over.throwOn === 'push') {
        return Promise.reject(
          new Error('intervals.icu 500: calendar write failed'),
        );
      }
      pushed.push([...events]);
      return Promise.resolve(events.length);
    },
  };
}

function run(store: MemoryStore, bridge: Bridge | null, extra = {}) {
  return runDailyPass({ store, bridge, clock, ...extra });
}

const RUN_YESTERDAY: BridgeActivity = {
  id: 'i5001',
  start_date_local: `${YESTERDAY}T18:05:00`,
  type: 'Run',
  name: 'Evening Run',
  distance: 12_000,
  moving_time: 3600,
  icu_training_load: 95,
};

let store: MemoryStore;

beforeEach(() => {
  store = memoryStore();
});

describe('the daily pass, when everything works', () => {
  it('ingests activities and stores wellness verbatim', async () => {
    const bridge = fakeBridge({
      activities: [RUN_YESTERDAY],
      wellness: [{ id: YESTERDAY, restingHR: 48, unknownFuture: 'kept' }],
    });

    const result = await run(store, bridge);

    expect(result.ok).toBe(true);
    expect(result.ingested).toEqual({ activities: 1, wellnessDays: 1 });
    expect(store.rows.ingested[0]?.id).toBe('icu:i5001');
    // Garmin's `typeKey` vocabulary, not the bridge's CamelCase -- otherwise
    // every run silently drops out of the ramp baseline.
    expect(store.rows.ingested[0]?.activityType).toBe('running');
    expect(store.rows.ingested[0]?.localDate).toBe(YESTERDAY);
    // Verbatim: G1 has not run, so nothing may be dropped for not matching a
    // schema this repo invented.
    expect(store.rows.wellness.get(YESTERDAY)).toEqual({
      id: YESTERDAY,
      restingHR: 48,
      unknownFuture: 'kept',
    });
  });

  it('asks the bridge for a window wider than yesterday, because the cron is best-effort', async () => {
    const asked: string[] = [];
    const bridge: Bridge = {
      activities: (oldest, newest) => {
        asked.push(`${oldest}..${newest}`);
        return Promise.resolve([]);
      },
      wellness: () => Promise.resolve([]),
      pushEvents: (events) => Promise.resolve(events.length),
    };

    await run(store, bridge);

    expect(asked).toEqual([
      `${shiftIso(TODAY, -SYNC.ingestLookbackDays)}..${TODAY}`,
    ]);
  });

  it('inserts nothing on a second pass over the same activities', async () => {
    const bridge = fakeBridge({ activities: [RUN_YESTERDAY] });

    const first = await run(store, bridge);
    const second = await run(store, bridge);

    expect(first.ingested.activities).toBe(1);
    expect(second.ingested.activities).toBe(0);
    expect(store.rows.ingested).toHaveLength(1);
  });

  it('recomputes load from the seed, and returns the window it covers', async () => {
    const result = await run(store, fakeBridge());

    expect(result.load).not.toBeNull();
    expect(result.load?.seed.ctl).toBe(LOAD.seed.ctl);
    expect(result.load?.coverage.to).toBe(TODAY);
    expect(result.load?.coverage.from).toBe(shiftIso(LOAD.seed.asOf, 1));
    // REDLINES.md rule 4: thin history states its own insufficiency.
    expect(result.load?.warmingUp).toBe(true);
    expect(result.load?.caveat).not.toBeNull();
  });

  it('reports every one of the five replan triggers, including the invisible two', async () => {
    const result = await run(store, fakeBridge());

    expect(result.triggers.map((t) => t.id).sort()).toEqual([
      'availability',
      'readiness',
      'spanner',
      'user-request',
      'weekly-rollover',
    ]);
    // Named rather than omitted: a trigger a cron structurally cannot see is a
    // gap a reader has to be told about.
    const availability = result.triggers.find((t) => t.id === 'availability');
    expect(availability?.fired).toBe(false);
    expect(availability?.detail).toContain('not observable by a cron');
  });

  it('fills the rolling window when it is short of the planner horizon', async () => {
    const result = await run(store, fakeBridge());

    const rollover = result.triggers.find((t) => t.id === 'weekly-rollover');
    expect(rollover?.fired).toBe(true);
    expect(result.replanned).toBe(true);

    const horizon = shiftIso(TODAY, REPLAN.rollingWindowDays.min - 1);
    const dates = new Set(store.rows.sessions.map((s) => s.date));
    for (let day = TODAY; day <= horizon; day = shiftIso(day, 1)) {
      expect(dates.has(day)).toBe(true);
    }
  });

  it('writes exactly one dated coach note naming what it found', async () => {
    const result = await run(
      store,
      fakeBridge({ activities: [RUN_YESTERDAY] }),
    );

    expect(store.rows.notes).toHaveLength(1);
    const note = store.rows.notes[0];
    expect(note?.localDate).toBe(TODAY);
    expect(note?.source).toBe('cron');
    expect(note?.text).toBe(result.detail);
    expect(note?.text).toContain('CTL');
  });

  it('writes a heartbeat row for the run', async () => {
    await run(store, fakeBridge());

    expect(store.rows.syncRuns).toHaveLength(1);
    expect(store.rows.syncRuns[0]?.job).toBe(DAILY_PASS_JOB);
    expect(store.rows.syncRuns[0]?.ok).toBe(true);
  });

  it('pings the dead-man’s switch as the last step, and only then', async () => {
    const pinged: string[] = [];
    const result = await run(store, fakeBridge(), {
      healthcheckUrl: 'https://hc.test/abc',
      ping: (url: string) => {
        pinged.push(url);
        return Promise.resolve();
      },
    });

    expect(result.deadMansSwitch).toBe('pinged');
    expect(pinged).toEqual(['https://hc.test/abc']);
  });

  it('says so rather than pretending, when no switch is configured', async () => {
    const result = await run(store, fakeBridge());
    expect(result.deadMansSwitch).toBe('not-configured');
  });

  it('does not fail the pass when the ping itself fails', async () => {
    const result = await run(store, fakeBridge(), {
      healthcheckUrl: 'https://hc.test/abc',
      ping: () => Promise.reject(new Error('network')),
    });
    // The work landed and is recorded. The alarm will fire, which is the
    // correct direction to fail.
    expect(result.ok).toBe(true);
    expect(result.deadMansSwitch).toBe('ping-failed');
  });
});

describe('the plan on the wrist', () => {
  it('pushes one event per planned session, keyed on the session id', async () => {
    const bridge = fakeBridge();
    const result = await run(store, bridge);

    const events = bridge.pushed.at(-1) ?? [];
    expect(result.pushedToWatch).toBe(events.length);
    expect(events.length).toBeGreaterThan(0);
    expect(new Set(events.map((e) => e.external_id)).size).toBe(events.length);

    const sessionIds = new Set(store.rows.sessions.map((s) => s.id));
    for (const event of events)
      expect(sessionIds.has(event.external_id)).toBe(true);
  });

  it('pushes only the configured horizon, not the whole block', async () => {
    const bridge = fakeBridge();
    await run(store, bridge);

    const events = bridge.pushed.at(-1) ?? [];
    const last = shiftIso(TODAY, SYNC.watchPushDays - 1);
    for (const event of events) {
      expect(event.start_date_local.slice(0, 10) >= TODAY).toBe(true);
      expect(event.start_date_local.slice(0, 10) <= last).toBe(true);
    }
  });

  it('does not put a rest day on the watch', async () => {
    const bridge = fakeBridge();
    await run(store, bridge);

    const restDates = new Set(
      store.rows.sessions.filter((s) => s.type === 'rest').map((s) => s.date),
    );
    const pushedDates = (bridge.pushed.at(-1) ?? []).map((e) =>
      e.start_date_local.slice(0, 10),
    );
    for (const date of pushedDates) expect(restDates.has(date)).toBe(false);
  });

  it('carries the prescription as words, which is the whole outbound contract', () => {
    const event = toEvent({
      id: 'sess-1',
      date: '2026-09-09',
      weekNumber: 1,
      type: 'easy',
      plannedKm: 12,
      timeSlot: 'evening',
      status: 'planned',
      note: null,
    });

    expect(event.name).toBe('Easy 12.0 km');
    expect(event.category).toBe('WORKOUT');
    expect(event.type).toBe('Run');
    expect(event.start_date_local).toBe('2026-09-09T00:00:00');
    expect(event.description).toContain('Conversational');
    // No compiled steps, no pace or HR targets: out of scope until after
    // 2026-10-24 (`docs/specs/05-integrations.md`).
    expect(event).not.toHaveProperty('file_contents_base64');
  });

  it('sends a swim as a swim, so the watch does not prescribe a run', () => {
    const event = toEvent({
      id: 'sess-2',
      date: '2026-09-10',
      weekNumber: 1,
      type: 'swim',
      plannedKm: 0,
      timeSlot: 'evening',
      status: 'planned',
      note: null,
    });
    expect(event.type).toBe('Swim');
    expect(event.name).toBe('Swim');
  });
});

describe('the daily pass fails loudly', () => {
  it('records a failed heartbeat when the bridge is down', async () => {
    const result = await run(store, fakeBridge({ throwOn: 'activities' }));

    expect(result.ok).toBe(false);
    expect(store.rows.syncRuns).toHaveLength(1);
    expect(store.rows.syncRuns[0]?.ok).toBe(false);
    expect(store.rows.syncRuns[0]?.detail).toContain('503');
  });

  it('still writes a coach note, because a silent morning is the failure', async () => {
    await run(store, fakeBridge({ throwOn: 'wellness' }));

    expect(store.rows.notes).toHaveLength(1);
    expect(store.rows.notes[0]?.text).toContain('FAILED');
    expect(store.rows.notes[0]?.text).toContain('401');
  });

  it('withholds the dead-man’s switch ping, so the alarm fires', async () => {
    const pinged: string[] = [];
    const result = await run(store, fakeBridge({ throwOn: 'activities' }), {
      healthcheckUrl: 'https://hc.test/abc',
      ping: (url: string) => {
        pinged.push(url);
        return Promise.resolve();
      },
    });

    expect(result.deadMansSwitch).toBe('withheld-on-failure');
    expect(pinged).toEqual([]);
  });

  it('fails the pass when the watch push fails, rather than reporting a green run', async () => {
    const result = await run(store, fakeBridge({ throwOn: 'push' }));

    // The outbound leg is not optional decoration: a plan that adapts and a
    // watch showing yesterday's session is the failure F19 names.
    expect(result.ok).toBe(false);
    expect(result.detail).toContain('calendar write failed');
  });

  it('reports an unconfigured bridge as a failed pass naming the variables', async () => {
    const result = await run(store, null);

    expect(result.ok).toBe(false);
    expect(result.detail).toContain('INTERVALS_API_KEY');
    expect(result.detail).toContain('INTERVALS_ATHLETE_ID');
    expect(result.deadMansSwitch).toBe('withheld-on-failure');
    // Manual logging is untouched: spec invariant 2 means the outage degrades
    // the system, it does not stop it.
    expect(result.detail).toContain('Manual logging');
  });

  it('never throws, because the heartbeat is downstream of the failure', async () => {
    const exploding = {
      ...fakeBridge(),
      activities: () => {
        throw new Error('synchronous explosion');
      },
    };
    await expect(run(store, exploding)).resolves.toMatchObject({ ok: false });
  });
});

describe('replan triggers the pass can actually see', () => {
  it('absorbs an unplanned run that deviates from the day’s plan', async () => {
    store.rows.sessions.push({
      id: 'planned-yesterday',
      date: YESTERDAY,
      weekNumber: 1,
      type: 'easy',
      plannedKm: 8,
      timeSlot: 'evening',
      status: 'planned',
      note: null,
    });

    // 20 km against 8 km planned: 150% deviation, far past the threshold.
    const result = await run(
      store,
      fakeBridge({
        activities: [{ ...RUN_YESTERDAY, distance: 20_000 }],
      }),
    );

    const spanner = result.triggers.find((t) => t.id === 'spanner');
    expect(spanner?.fired).toBe(true);
    expect(spanner?.detail).toContain('20 km');
    expect(result.replanned).toBe(true);
  });

  it('leaves the plan alone when yesterday matched it', async () => {
    store.rows.sessions.push({
      id: 'planned-yesterday',
      date: YESTERDAY,
      weekNumber: 1,
      type: 'easy',
      plannedKm: 12,
      timeSlot: 'evening',
      status: 'planned',
      note: null,
    });

    const result = await run(
      store,
      fakeBridge({ activities: [RUN_YESTERDAY] }),
    );

    const spanner = result.triggers.find((t) => t.id === 'spanner');
    expect(spanner?.fired).toBe(false);
    expect(spanner?.detail).toContain(String(REPLAN.spannerDeviationPct));
  });

  it('downgrades quality when today’s check-in reports soreness', async () => {
    await store.insertCheckIn({
      id: 'ci-1',
      localDate: TODAY,
      rpeYesterday: 8,
      soreness: [{ location: 'calf', severity: 4 }],
      sleep: 5,
      motivation: 2,
      note: null,
    });

    const result = await run(store, fakeBridge());

    const readiness = result.triggers.find((t) => t.id === 'readiness');
    expect(readiness?.fired).toBe(true);
    expect(readiness?.detail).toContain('soreness 4');
    expect(
      store.rows.sessions.filter(
        (s) => s.date >= TODAY && s.type === 'quality',
      ),
    ).toHaveLength(0);
  });

  it('surfaces an amber with no soreness instead of auto-repairing it', async () => {
    await store.insertCheckIn({
      id: 'ci-2',
      localDate: TODAY,
      rpeYesterday: 7,
      soreness: [],
      sleep: 4,
      motivation: 2,
      note: null,
    });

    const result = await run(store, fakeBridge());

    const readiness = result.triggers.find((t) => t.id === 'readiness');
    expect(readiness?.fired).toBe(false);
    expect(readiness?.detail).toContain('not auto-repaired');
  });

  it('does not act on yesterday’s check-in', async () => {
    await store.insertCheckIn({
      id: 'ci-3',
      localDate: YESTERDAY,
      rpeYesterday: 9,
      soreness: [{ location: 'calf', severity: 5 }],
      sleep: 4,
      motivation: 1,
      note: null,
    });

    const result = await run(store, fakeBridge());

    const readiness = result.triggers.find((t) => t.id === 'readiness');
    expect(readiness?.fired).toBe(false);
    expect(readiness?.detail).toContain('not today');
  });
});
