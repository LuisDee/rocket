/**
 * The gate on the cron route.
 *
 * The 401 assertions run UNCONDITIONALLY and come first, for the same reason as
 * `src/app/api/mcp/route.test.ts`: an auth test that skips when the secret is
 * absent is an unarmed gate. This route writes into an append-only history and
 * pushes to the athlete's own watch calendar, so an open one is a vandalism
 * surface rather than a curiosity.
 *
 * The authorised path is deliberately NOT driven here. It would need a
 * database, and `runDailyPass` is already driven end to end over an in-memory
 * store in `src/jobs/daily-pass.test.ts` -- the route's own job is the gate and
 * the status mapping, which is what this file asserts.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GET } from './route';

const SECRET = 'test-cron-secret-not-a-real-one';
const ENDPOINT = 'https://rocket.test/api/cron/daily';

function request(headers: Record<string, string> = {}): Request {
  return new Request(ENDPOINT, { method: 'GET', headers });
}

describe('the daily cron route', () => {
  beforeEach(() => {
    process.env['CRON_SECRET'] = SECRET;
  });

  afterEach(() => {
    delete process.env['CRON_SECRET'];
  });

  it('401s a request with no credential at all', async () => {
    expect((await GET(request())).status).toBe(401);
  });

  it('401s a wrong bearer', async () => {
    expect((await GET(request({ authorization: 'Bearer wrong' }))).status).toBe(
      401,
    );
  });

  it('401s a token presented in the query string', async () => {
    // Unlike the MCP endpoint, this route has no connector UI to accommodate,
    // so the credential never belongs in a URL where it lands in access logs.
    const response = await GET(
      new Request(`${ENDPOINT}?token=${SECRET}`, { method: 'GET' }),
    );
    expect(response.status).toBe(401);
  });

  it('401s when the secret is not provisioned, rather than running open', async () => {
    delete process.env['CRON_SECRET'];
    expect(
      (await GET(request({ authorization: `Bearer ${SECRET}` }))).status,
    ).toBe(401);
    expect((await GET(request())).status).toBe(401);
  });

  it('does not trust Vercel’s own headers in place of the secret', async () => {
    // `x-vercel-*` headers are client-settable. Trusting them would make the
    // gate decorative.
    const response = await GET(
      request({ 'x-vercel-signature': 'anything', 'x-vercel-id': 'anything' }),
    );
    expect(response.status).toBe(401);
  });
});
