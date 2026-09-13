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

  it('recomputes load over the whole backfilled window, uncaveated', async () => {
    const result = await run(store, fakeBridge());

    expect(result.load).not.toBeNull();
    expect(result.load?.seed.ctl).toBe(LOAD.seed.ctl);
    expect(result.load?.coverage.to).toBe(TODAY);
    expect(result.load?.coverage.from).toBe(shiftIso(LOAD.seed.asOf, 1));
    // Before the 2026-09-08 backfill this asserted the opposite: the window was
    // two days long and REDLINES.md rule 4 required it to say so. It now spans
    // from 2026-03-27, well past one CTL time constant, so a caveat here would
    // be the system apologising for history it actually has. `load.test.ts`
    // keeps the short-window case, which is where rule 4 is still exercised.
    expect(result.load?.coverage.days).toBeGreaterThan(LOAD.ctlWarmUpDays);
    expect(result.load?.warmingUp).toBe(false);
    expect(result.load?.caveat).toBeNull();
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

describe('the weekly rollover cannot undo a gated session', () => {
  // REGRESSION. `replaceWindow` writes 10 days and the horizon check needs 7, so
  // the rollover re-fires a few passes later and regenerates the span wholesale
  // from BLOCK_WEEKS. It was called with NO placement options, so a quality
  // session a morning check-in had gated came back at full prescription days
  // later, with its downgrade note erased and nothing in the coach note to say
  // so. The repair and the regeneration have to agree, or the regeneration wins
  // by being last.
  //
  // Week 3 rather than week 1, because week 1's phase carries no quality budget
  // at all and would pass this test vacuously.
  const week3Clock = {
    today: () => '2026-09-21',
    now: () => new Date('2026-09-21T04:30:00Z'),
  };

  const sore = (severity: number) =>
    store.insertCheckIn({
      id: `ci-${String(severity)}`,
      localDate: '2026-09-21',
      rpeYesterday: 4,
      soreness: [{ location: 'achilles', severity }],
      sleep: 7,
      motivation: 4,
      note: null,
    });

  it('regenerates the window with the standing gate applied', async () => {
    await sore(4);
    await run(store, fakeBridge(), { clock: week3Clock });

    expect(
      store.rows.sessions.filter(
        (r) => r.type === 'quality' && r.date >= '2026-09-21',
      ),
    ).toEqual([]);
    expect(store.rows.sessions.length).toBeGreaterThan(0);
  });

  it('keeps the gate on the NEXT day, when no trigger fires to re-apply it', async () => {
    // The case the in-pass ordering cannot cover, and the one the bug actually
    // bit on. On the day of the check-in the soreness TRIGGER fires and repairs
    // the window after the rollover, so the rollover's own gate is redundant.
    // The day after, the trigger does not fire -- `evaluateTriggers` requires
    // `checkIn.localDate === today` -- while the reading is still inside
    // `READINESS.checkInStaleAfterDays`. If the regeneration ignores the standing
    // gate, that is the pass that hands the threshold session back.
    await sore(4);
    const result = await run(store, fakeBridge(), {
      clock: {
        today: () => '2026-09-22',
        now: () => new Date('2026-09-22T04:30:00Z'),
      },
    });

    // The premise the test rests on: the trigger really does NOT fire, so the
    // only thing that can hold the gate is the regeneration itself.
    const readiness = result.triggers.find((t) => t.id === 'readiness');
    expect(readiness?.fired).toBe(false);
    expect(readiness?.detail).toContain('not today');
    expect(
      store.rows.sessions.filter(
        (r) => r.type === 'quality' && r.date >= '2026-09-21',
      ),
    ).toEqual([]);
    expect(store.rows.sessions.length).toBeGreaterThan(0);
  });

  it('still places the quality session when the reading is below the gate', async () => {
    // The control. Without it the test above passes just as well on a planner
    // that never places quality at all.
    await sore(1);
    await run(store, fakeBridge(), { clock: week3Clock });

    expect(
      store.rows.sessions.filter(
        (r) => r.type === 'quality' && r.date >= '2026-09-21',
      ).length,
    ).toBe(1);
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

describe('the planner runs whether or not the bridge does', () => {
  // REGRESSION, and it was today's live state. `applyTriggers` is the ONLY code
  // path in the repository that inserts a session row (`src/db/seed.mts` seeds
  // none on purpose, and the MCP tools can only repair rows that exist), and the
  // bridge guard threw before reaching it. So with INTERVALS_API_KEY unset the
  // sessions table stayed permanently empty: the assistant answered "Nothing on
  // the calendar for today" on race morning while the app rendered the race.
  // Weekly rollover has no dependency on the bridge at all; it was ordered
  // behind one.
  it('fills the rolling window even with no bridge configured', async () => {
    const result = await run(store, null);

    expect(result.ok).toBe(false);
    expect(result.detail).toContain('INTERVALS_API_KEY');
    expect(store.rows.sessions.length).toBeGreaterThan(0);
    expect(result.replanned).toBe(true);
    expect(result.pushedToWatch).toBe(0);
  });

  it('fills the rolling window even when the bridge is down mid-ingest', async () => {
    const result = await run(store, fakeBridge({ throwOn: 'activities' }));

    expect(result.ok).toBe(false);
    expect(result.detail).toContain('503');
    expect(store.rows.sessions.length).toBeGreaterThan(0);
  });

  it('still withholds the ping and writes the note, so the outage stays loud', async () => {
    const result = await run(store, null);

    expect(result.deadMansSwitch).toBe('withheld-on-failure');
    expect(store.rows.notes.length).toBe(1);
    expect(store.rows.syncRuns[0]?.ok).toBe(false);
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

  it('gives back only the OVERSHOOT, not the whole logged run', async () => {
    // REGRESSION with a number on it. `findSpanner` dates the trigger YESTERDAY
    // and `applyTriggers` replanned a window starting TODAY, so `absorbSpanner`
    // could not see yesterday's plan at all: `planned` came out 0, the overshoot
    // became the WHOLE logged distance, and the give-back stripped roughly twice
    // what it should from the remaining easy days. It also inserted a SECOND row
    // for yesterday, which the next day's window then read as double the
    // kilometres and reported as a spurious ramp breach.
    //
    // 20 km run against 8 km planned is a 12 km overshoot, not a 20 km one.
    // Monday 8 km planned, then 10 km a day for the whole rolling horizon -- the
    // horizon matters, because a window short of it makes the rollover fire and
    // regenerate these rows from config before the spanner ever sees them.
    // The give-back draws only on the easy days still ahead INSIDE Monday's
    // calendar week, so givable is the six days 09-08 to 09-13: 60 km.
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
    for (let i = 1; i <= REPLAN.rollingWindowDays.max; i += 1) {
      store.rows.sessions.push({
        id: `planned-${String(i)}`,
        date: shiftIso(YESTERDAY, i),
        weekNumber: 1,
        type: 'easy',
        plannedKm: 10,
        timeSlot: 'evening',
        status: 'planned',
        note: null,
      });
    }

    await run(
      store,
      fakeBridge({ activities: [{ ...RUN_YESTERDAY, distance: 20_000 }] }),
    );

    // No duplicate: the repaired day now falls inside the span written back.
    const yesterdayRows = store.rows.sessions.filter(
      (r) => r.date === YESTERDAY,
    );
    expect(yesterdayRows).toHaveLength(1);
    expect(yesterdayRows[0]?.plannedKm).toBe(20);

    // 12 km of overshoot against 60 km givable is a factor of 0.8, so each 10 km
    // day becomes 8.0. Under the bug the overshoot read as the whole 20 km, the
    // factor was 0.667, and every day was cut to 6.7 -- roughly 8 km out of a
    // ratified week for no reason.
    const todayKm = store.rows.sessions
      .filter((r) => r.date === TODAY)
      .reduce((sum, r) => sum + (r.plannedKm ?? 0), 0);
    expect(todayKm).toBe(8);
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
