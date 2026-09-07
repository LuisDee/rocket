/**
 * The intervals.icu bridge. One file, three calls, no SDK.
 *
 * Decided 2026-09-07 (`docs/specs/05-integrations.md`): the partner bridge is
 * the primary Garmin path. It holds genuine Garmin partner OAuth, issues a
 * self-serve personal API key, relays wellness within minutes of a watch sync,
 * and carries the outbound calendar push -- so both legs of the daily pass ride
 * one credential and rocket calls Garmin from nothing.
 *
 * `tools/garmin_probe/` stays as a MANUAL fallback for deep pulls and backfill.
 * Nothing here ever touches it, and the daily job must never call Garmin
 * directly: its per-account 429 locks the account for 48-72 hours.
 *
 * THE TRANSPORT IS INJECTED. Every path below is driven end to end in
 * `npm run test` against a fake, because the personal API key may not exist
 * yet and "we will test it when the key arrives" is how a leg ships untested.
 * The only thing the key adds is a real socket.
 *
 * THE REQUEST SHAPES ARE UNVERIFIED against a live account -- they come from
 * the vendor's own forum guide, not from a response anyone here has seen. That
 * is precisely what Decision gate G1 exists to close, and it is why
 * `scripts/probe-g1.mts` reports the key set it OBSERVES rather than asserting
 * the one this file expects. A wellness day is deliberately typed as an open
 * record: no typed column anywhere in this repo may lean on a bridge-supplied
 * field until the probe has run.
 */

import { Buffer } from 'node:buffer';

/** `globalThis.fetch`, or a fake with the same shape. */
export type Transport = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

/**
 * One day of wellness, exactly as the bridge returned it.
 *
 * An open record on purpose. `id` is the only field this repo relies on (the
 * bridge keys a wellness day by its `YYYY-MM-DD` date) because it is the only
 * one the vendor's own examples show unambiguously. `hrv`, `restingHR`,
 * `sleepScore` and `bodyBattery` are what G1 is about, and until the probe
 * returns they are hypotheses, not fields.
 */
export type WellnessDay = { readonly id: string } & Record<string, unknown>;

/**
 * One activity from the bridge.
 *
 * Only the fields the load engine and the guardrails actually consume are
 * named. Everything else survives in `raw` -- the schema comment on
 * `activities.raw` is the standing instruction: a field we did not think to
 * type must not need re-ingesting later.
 */
export type BridgeActivity = {
  readonly id: string;
  readonly start_date_local?: string;
  readonly type?: string;
  readonly name?: string;
  readonly distance?: number;
  readonly moving_time?: number;
  readonly elapsed_time?: number;
  readonly total_elevation_gain?: number;
  readonly average_heartrate?: number;
  readonly max_heartrate?: number;
  readonly calories?: number;
  readonly icu_training_load?: number;
} & Record<string, unknown>;

/**
 * A planned session on its way to the wrist.
 *
 * Words, not compiled steps. "Easy 12 km, conversational, road trainer" is the
 * whole prescription, and `05-integrations.md` puts structured steps, pace and
 * HR targets out of scope until after 2026-10-24: this block is easy volume
 * with one quality session and one long run, which a Fenix 8 user runs to pace
 * or to feel. A compiler buys nothing and costs a compiler.
 *
 * `external_id` is OUR session id. It is the upsert key, which is what makes a
 * re-push of an unchanged plan a no-op upstream instead of a duplicate.
 */
export type PlannedEvent = {
  readonly external_id: string;
  readonly start_date_local: string;
  readonly category: 'WORKOUT';
  readonly type: string;
  readonly name: string;
  readonly description: string;
  readonly moving_time?: number;
};

export interface Bridge {
  /** Wellness days over an inclusive `YYYY-MM-DD` range. */
  wellness(oldest: string, newest: string): Promise<WellnessDay[]>;
  /** Activities over an inclusive `YYYY-MM-DD` range. */
  activities(oldest: string, newest: string): Promise<BridgeActivity[]>;
  /** Upsert planned sessions onto the calendar. Returns how many were sent. */
  pushEvents(events: readonly PlannedEvent[]): Promise<number>;
}

export type BridgeConfig = {
  readonly athleteId: string;
  readonly apiKey: string;
  readonly transport?: Transport;
  readonly baseUrl?: string;
};

const DEFAULT_BASE = 'https://intervals.icu/api/v1';

/**
 * The bridge's own error type, so a caller can tell "the bridge said no" from
 * "our code is broken" without string-matching a message.
 *
 * The message carries the status and a short body excerpt and NEVER the
 * credential (REDLINES.md rule 5). The Authorization header is built at the
 * call site and is not reachable from here.
 */
export class BridgeError extends Error {
  readonly status: number;
  readonly detail: string;

  constructor(status: number, detail: string) {
    super(`intervals.icu ${String(status)}: ${detail}`);
    // Plain fields, not TypeScript parameter properties: `scripts/probe-g1.mts`
    // runs through Node's strip-only type removal, which rejects them.
    this.name = 'BridgeError';
    this.status = status;
    this.detail = detail;
  }
}

export function intervalsBridge(config: BridgeConfig): Bridge {
  const base = config.baseUrl ?? DEFAULT_BASE;
  const transport = config.transport ?? globalThis.fetch.bind(globalThis);

  // Basic auth with the literal username `API_KEY` and the personal key as the
  // password. That is the vendor's scheme, not a placeholder.
  const authorization =
    'Basic ' +
    Buffer.from(`API_KEY:${config.apiKey}`, 'utf8').toString('base64');

  async function call(
    path: string,
    init?: { method: string; body: string },
  ): Promise<unknown> {
    const headers: Record<string, string> = { Authorization: authorization };
    if (init) headers['Content-Type'] = 'application/json';

    const response = await transport(
      `${base}/athlete/${config.athleteId}${path}`,
      {
        ...(init ? { method: init.method, body: init.body } : {}),
        headers,
      },
    );

    const body = await response.text();
    if (!response.ok) {
      throw new BridgeError(response.status, excerpt(body));
    }
    return body === '' ? null : parse(body);
  }

  async function list(path: string): Promise<Record<string, unknown>[]> {
    const payload = await call(path);
    if (!Array.isArray(payload)) {
      throw new BridgeError(
        200,
        `expected a JSON array, got ${typeOf(payload)}`,
      );
    }
    return payload.filter(isRecord);
  }

  return {
    async wellness(oldest, newest) {
      const rows = await list(`/wellness?oldest=${oldest}&newest=${newest}`);
      return rows.filter(hasStringId);
    },

    async activities(oldest, newest) {
      const rows = await list(`/activities?oldest=${oldest}&newest=${newest}`);
      return rows.filter(hasStringId);
    },

    async pushEvents(events) {
      if (events.length === 0) return 0;
      // Bulk with `upsert=true` keyed on `external_id`: one request whether the
      // plan changed or not, and re-sending an unchanged day updates in place
      // rather than stacking a second event on the watch. A delete-by-range
      // would have been simpler and would also remove events this system did
      // not write.
      await call('/events/bulk?upsert=true', {
        method: 'POST',
        body: JSON.stringify(events),
      });
      return events.length;
    },
  };
}

/**
 * The bridge from the environment, or null when it is not configured.
 *
 * Null rather than a throw: `docs/specs/00-overview.md` invariant 2 says every
 * feature works on cached data and manual check-ins alone, so an unconfigured
 * bridge must be a reported state the daily pass carries into its coach note,
 * not a crash. The key may legitimately not exist yet.
 */
export function bridgeFromEnv(transport?: Transport): Bridge | null {
  const apiKey = process.env.INTERVALS_API_KEY;
  const athleteId = process.env.INTERVALS_ATHLETE_ID;
  if (!apiKey || !athleteId) return null;
  return intervalsBridge({
    apiKey,
    athleteId,
    ...(transport ? { transport } : {}),
  });
}

/** Names of the environment variables the bridge needs. For error messages. */
export const BRIDGE_ENV = [
  'INTERVALS_API_KEY',
  'INTERVALS_ATHLETE_ID',
] as const;

function parse(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    throw new BridgeError(200, `response was not JSON: ${excerpt(body)}`);
  }
}

/** Bounded, so a 500-page HTML error page cannot become a log entry. */
function excerpt(body: string): string {
  const trimmed = body.trim().replace(/\s+/g, ' ');
  return trimmed.length > 200 ? `${trimmed.slice(0, 200)}...` : trimmed;
}

function typeOf(value: unknown): string {
  return value === null ? 'null' : typeof value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasStringId(
  row: Record<string, unknown>,
): row is { id: string } & Record<string, unknown> {
  return typeof row.id === 'string' && row.id !== '';
}
