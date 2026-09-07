/**
 * The bridge against a fake transport.
 *
 * The personal API key may not exist yet, so this is the whole of the evidence
 * that the client is correct. Each test breaks something a real call would
 * break: the auth scheme, the error path, the upsert key, the no-op case.
 */

import { Buffer } from 'node:buffer';

import { afterEach, describe, expect, it } from 'vitest';

import {
  BridgeError,
  bridgeFromEnv,
  intervalsBridge,
  type PlannedEvent,
  type Transport,
} from './intervals';

type Call = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
};

/** Records what was asked for and answers with what the test supplies. */
function fake(answers: { status?: number; body: string }[]): {
  transport: Transport;
  calls: Call[];
} {
  const calls: Call[] = [];
  let n = 0;
  const transport: Transport = (url, init) => {
    calls.push({
      url,
      method: init?.method ?? 'GET',
      headers: init?.headers ?? {},
      ...(init?.body === undefined ? {} : { body: init.body }),
    });
    const answer = answers[Math.min(n++, answers.length - 1)] ?? { body: '[]' };
    const status = answer.status ?? 200;
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      text: () => Promise.resolve(answer.body),
    });
  };
  return { transport, calls };
}

function bridge(answers: { status?: number; body: string }[]) {
  const { transport, calls } = fake(answers);
  return {
    calls,
    client: intervalsBridge({
      athleteId: 'i9999',
      apiKey: 'not-a-real-key',
      transport,
      baseUrl: 'https://bridge.test/api/v1',
    }),
  };
}

const EVENT: PlannedEvent = {
  external_id: 'sess-1',
  start_date_local: '2026-09-08T00:00:00',
  category: 'WORKOUT',
  type: 'Run',
  name: 'Easy 12.0 km',
  description: 'Conversational.',
};

describe('the intervals.icu bridge', () => {
  it('authenticates as basic API_KEY:<key>, which is the vendor scheme', async () => {
    const { client, calls } = bridge([{ body: '[]' }]);
    await client.wellness('2026-09-01', '2026-09-07');

    const header = calls[0]?.headers['Authorization'];
    expect(header).toBeDefined();
    const [scheme, encoded] = (header ?? '').split(' ');
    expect(scheme).toBe('Basic');
    expect(Buffer.from(encoded ?? '', 'base64').toString('utf8')).toBe(
      'API_KEY:not-a-real-key',
    );
  });

  it('asks the wellness endpoint for the athlete and the date range given', async () => {
    const { client, calls } = bridge([{ body: '[]' }]);
    await client.wellness('2026-09-01', '2026-09-07');
    expect(calls[0]?.url).toBe(
      'https://bridge.test/api/v1/athlete/i9999/wellness?oldest=2026-09-01&newest=2026-09-07',
    );
  });

  it('returns wellness days verbatim, keeping fields it has never heard of', async () => {
    const { client } = bridge([
      {
        body: JSON.stringify([
          { id: '2026-09-06', restingHR: 48, someFutureField: 'kept' },
        ]),
      },
    ]);
    const days = await client.wellness('2026-09-06', '2026-09-06');
    expect(days).toHaveLength(1);
    expect(days[0]?.['restingHR']).toBe(48);
    // The whole point of the open record: G1 has not run, so nothing may be
    // dropped for not matching a schema this repo invented.
    expect(days[0]?.['someFutureField']).toBe('kept');
  });

  it('drops a row with no usable id rather than returning a broken one', async () => {
    const { client } = bridge([
      { body: JSON.stringify([{ id: '2026-09-06' }, { restingHR: 48 }]) },
    ]);
    expect(await client.wellness('2026-09-06', '2026-09-06')).toHaveLength(1);
  });

  it('throws a BridgeError carrying the status when the bridge refuses', async () => {
    const { client } = bridge([{ status: 401, body: 'Unauthorized' }]);
    await expect(client.activities('2026-09-01', '2026-09-07')).rejects.toThrow(
      BridgeError,
    );
  });

  it('never puts the API key in the error message', async () => {
    const { client } = bridge([{ status: 403, body: 'Forbidden' }]);
    const error = await client
      .activities('2026-09-01', '2026-09-07')
      .catch((e: unknown) => e);
    expect(String(error)).not.toContain('not-a-real-key');
    expect(String(error)).toContain('403');
  });

  it('throws rather than returning nothing when the payload is not an array', async () => {
    const { client } = bridge([{ body: '{"error":"nope"}' }]);
    // A silent empty list here would read as "no activities yesterday", which
    // is a real training state and would look like a healthy pass.
    await expect(client.activities('2026-09-01', '2026-09-07')).rejects.toThrow(
      /expected a JSON array/,
    );
  });

  it('throws on a body that is not JSON at all, with a bounded excerpt', async () => {
    const { client } = bridge([{ body: '<html>'.repeat(200) }]);
    const error = await client
      .wellness('2026-09-01', '2026-09-07')
      .catch((e: unknown) => e);
    expect(String(error)).toContain('not JSON');
    expect(String(error).length).toBeLessThan(400);
  });

  it('pushes events to the bulk upsert endpoint keyed on external_id', async () => {
    const { client, calls } = bridge([{ body: '[]' }]);
    const sent = await client.pushEvents([EVENT]);

    expect(sent).toBe(1);
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.url).toBe(
      'https://bridge.test/api/v1/athlete/i9999/events/bulk?upsert=true',
    );
    expect(JSON.parse(calls[0]?.body ?? '[]')).toEqual([EVENT]);
  });

  it('makes no request at all when there is nothing to push', async () => {
    const { client, calls } = bridge([{ body: '[]' }]);
    expect(await client.pushEvents([])).toBe(0);
    expect(calls).toHaveLength(0);
  });
});

describe('bridgeFromEnv', () => {
  afterEach(() => {
    delete process.env['INTERVALS_API_KEY'];
    delete process.env['INTERVALS_ATHLETE_ID'];
  });

  it('is null when the key is absent, so an unconfigured bridge is a state', () => {
    process.env['INTERVALS_ATHLETE_ID'] = 'i9999';
    expect(bridgeFromEnv()).toBeNull();
  });

  it('is null when the athlete id is absent', () => {
    process.env['INTERVALS_API_KEY'] = 'not-a-real-key';
    expect(bridgeFromEnv()).toBeNull();
  });

  it('builds a bridge once both are present', () => {
    process.env['INTERVALS_API_KEY'] = 'not-a-real-key';
    process.env['INTERVALS_ATHLETE_ID'] = 'i9999';
    expect(bridgeFromEnv()).not.toBeNull();
  });
});
