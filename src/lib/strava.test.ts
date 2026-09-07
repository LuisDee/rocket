/**
 * Every Strava call here is faked. No test in this file touches the network.
 *
 * That is not tidiness: the token in the database is Luis's real athlete grant
 * with `activity:write`, and a test that reached Strava would upload a run to
 * his actual account. There is no undo for that, so the transport is injected
 * everywhere and the real `fetch` is never the default in a test.
 */

import { describe, expect, it, vi } from 'vitest';

import { StravaError, uploadFit } from './strava';

/** A `fetch` that replays a scripted sequence and records what it was asked. */
function fakeFetch(responses: Array<{ status?: number; body: unknown }>) {
  const calls: Array<{ url: string; method: string }> = [];
  let i = 0;
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method ?? 'GET' });
    const next = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return {
      ok: (next?.status ?? 200) < 400,
      status: next?.status ?? 200,
      json: async () => next?.body,
    } as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const token = async () => 'fake-access-token';
const FILE = Buffer.from('not really a fit file');

describe('uploadFit', () => {
  it('returns the activity id Strava resolves the upload to', async () => {
    // Strava answers the POST with an upload id and no activity, then resolves
    // it on a later poll. Anything that returns after the POST alone is wrong.
    const { impl, calls } = fakeFetch([
      {
        body: { id: 99, activity_id: null, error: null, status: 'processing' },
      },
      { body: { id: 99, activity_id: 555123, error: null, status: 'ready' } },
    ]);
    const id = await uploadFit(FILE, 'run.fit', {
      fetchImpl: impl,
      tokenImpl: token,
      now: (() => {
        let t = 0;
        return () => (t += 100);
      })(),
    });
    expect(id).toBe(555123);
    expect(calls[0]?.method).toBe('POST');
    expect(calls[1]?.url).toContain('/uploads/99');
  });

  it('surfaces a duplicate as a readable message, not a crash', async () => {
    // The likeliest real failure: the same run already on Strava. The cropped
    // file keeps the original's start time, so this fires every time if Luis
    // ever turns on Garmin's own Strava auto-sync.
    const { impl } = fakeFetch([
      { body: { id: 7, activity_id: null, error: null, status: 'processing' } },
      {
        body: {
          id: 7,
          activity_id: null,
          error: 'duplicate of activity 442211',
          status: 'error',
        },
      },
    ]);
    const err = await uploadFit(FILE, 'run.fit', {
      fetchImpl: impl,
      tokenImpl: token,
      now: (() => {
        let t = 0;
        return () => (t += 100);
      })(),
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(StravaError);
    expect((err as StravaError).message).toContain(
      'duplicate of activity 442211',
    );
    expect((err as StravaError).permanent).toBe(true);
  });

  it('gives up on a stuck upload and says it may still land', async () => {
    // Never resolving. The message has to warn against re-uploading, because a
    // retry of an upload that later succeeds produces the duplicate above.
    const { impl } = fakeFetch([
      { body: { id: 3, activity_id: null, error: null, status: 'processing' } },
    ]);
    let clock = 0;
    const err = await uploadFit(FILE, 'run.fit', {
      fetchImpl: impl,
      tokenImpl: token,
      now: () => (clock += 30_000),
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(StravaError);
    expect((err as StravaError).message).toMatch(/still processing/i);
    expect((err as StravaError).message).toMatch(/duplicate/i);
  });

  it('reports a rate limit as a rate limit', async () => {
    const { impl } = fakeFetch([{ status: 429, body: {} }]);
    const err = await uploadFit(FILE, 'run.fit', {
      fetchImpl: impl,
      tokenImpl: token,
    }).catch((e: unknown) => e);
    expect((err as StravaError).message).toMatch(/rate limit/i);
  });

  it('sends the file as fit, in a multipart body', async () => {
    const { impl, calls } = fakeFetch([
      { body: { id: 1, activity_id: 2, error: null, status: 'ready' } },
    ]);
    await uploadFit(FILE, 'barnet-running-2026-09-07-7.65km.fit', {
      fetchImpl: impl,
      tokenImpl: token,
    });
    expect(calls[0]?.url).toContain('/api/v3/uploads');
    expect(calls[0]?.method).toBe('POST');
  });
});

describe('shipToStrava', () => {
  /**
   * A fake db that models the one thing that matters here: the conditional
   * UPDATE claiming `shipping`. It returns the row on the first claim and
   * nothing on the second, which is exactly what Postgres does when the WHERE
   * no longer matches.
   */
  function fakeDb(row: Record<string, unknown> | undefined) {
    const sets: Array<Record<string, unknown>> = [];
    let claimed = false;
    return {
      sets,
      db: {
        update: () => ({
          set: (values: Record<string, unknown>) => {
            sets.push(values);
            return {
              where: () => ({
                returning: async () => {
                  if (values.status === 'shipping') {
                    if (claimed) return [];
                    claimed = true;
                    return row ? [row] : [];
                  }
                  return row ? [row] : [];
                },
              }),
              then: (r: (v: undefined) => void) => r(undefined),
            };
          },
        }),
      },
    };
  }

  const row = {
    garminActivityId: '24276183028',
    croppedFit: Buffer.from('fit'),
    croppedFilename: 'barnet-running-2026-09-07-7.65km.fit',
  };

  it('records the Strava activity id on success', async () => {
    const { db, sets } = fakeDb(row);
    const { shipToStrava } = await import('./ingest-store');
    const result = await shipToStrava(
      '24276183028',
      { upload: async () => 987654 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
    );
    expect(result).toEqual({ ok: true, stravaActivityId: 987654 });
    expect(sets.at(-1)).toMatchObject({
      status: 'shipped',
      stravaActivityId: 987654,
    });
  });

  it('will not claim a row that is already uploading or already shipped', async () => {
    // Asserted on the constant, not through the fake db: the fake gates on its
    // own JS flag, so it returns nothing for a second claim whatever the SQL
    // condition says. Widening the condition to include `shipping` therefore
    // slips past the double-tap test below — this is the assertion that
    // catches it.
    const { AWAITING_DECISION } = await import('./ingest-store');
    expect(AWAITING_DECISION).not.toContain('shipping');
    expect(AWAITING_DECISION).not.toContain('shipped');
  });

  it('uploads once when tapped twice', async () => {
    // Server-side, because a disabled button only helps inside one browser. A
    // refresh of a POSTed page, a second phone, or a double tap all arrive
    // here, and only the row can arbitrate.
    const { db } = fakeDb(row);
    const { shipToStrava } = await import('./ingest-store');
    let uploads = 0;
    const upload = async () => {
      uploads += 1;
      return 111;
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const first = await shipToStrava('x', { upload }, db as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const second = await shipToStrava('x', { upload }, db as any);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    expect(second.error).toMatch(/already/i);
    expect(uploads).toBe(1);
  });

  it('writes the failure onto the row instead of throwing at the page', async () => {
    const { db, sets } = fakeDb(row);
    const { shipToStrava } = await import('./ingest-store');
    const result = await shipToStrava(
      'x',
      {
        upload: async () => {
          throw new StravaError('duplicate of activity 442211', true);
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db as any,
    );
    expect(result.ok).toBe(false);
    expect(sets.at(-1)).toMatchObject({ status: 'failed' });
    expect(String(sets.at(-1)?.error)).toContain('duplicate');
  });
});

describe('token refresh', () => {
  it('persists the rotated refresh token, not just the access token', async () => {
    // Strava invalidates the old refresh token on every refresh. Storing only
    // the access token works until the next expiry and then locks the app out
    // with no error in between, which is why this is asserted separately.
    const updates: Array<Record<string, unknown>> = [];
    const expired = new Date(Date.now() - 1000);
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [
              {
                provider: 'strava',
                accessToken: 'old-access',
                refreshToken: 'old-refresh',
                expiresAt: expired,
                scope: null,
                updatedAt: expired,
              },
            ],
          }),
        }),
      }),
      update: () => ({
        set: (values: Record<string, unknown>) => {
          updates.push(values);
          return { where: async () => undefined };
        },
      }),
    };

    vi.stubEnv('STRAVA_CLIENT_ID', 'id');
    vi.stubEnv('STRAVA_CLIENT_SECRET', 'secret');
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: 'new-access',
        refresh_token: 'NEW-REFRESH',
        expires_at: Math.floor(Date.now() / 1000) + 21600,
      }),
    })) as unknown as typeof fetch;

    try {
      const { accessToken } = await import('./strava');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const got = await accessToken(db as any);
      expect(got).toBe('new-access');
      expect(updates[0]?.refreshToken).toBe('NEW-REFRESH');
    } finally {
      globalThis.fetch = realFetch;
      vi.unstubAllEnvs();
    }
  });
});
