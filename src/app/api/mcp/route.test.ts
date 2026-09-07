/**
 * The gate on the endpoint, not the gate in isolation.
 *
 * The 401 assertions run UNCONDITIONALLY and come first. An auth test that is
 * skipped when a secret is absent is an unarmed gate, and every positive test
 * behind it is then vacuous -- it proves the handler answers, not that anything
 * stops a stranger reaching it.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DELETE, GET, POST } from './[transport]/route';

const TOKEN = 'test-token-not-a-real-secret';
const ENDPOINT = 'https://rocket.test/api/mcp/mcp';

/** A well-formed `initialize`, so a 200 means the MCP layer actually answered. */
function initialise(
  headers: Record<string, string> = {},
  url = ENDPOINT,
): Request {
  return new Request(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...headers,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'test', version: '0.0.0' },
      },
    }),
  });
}

describe('the MCP endpoint', () => {
  beforeEach(() => {
    process.env['MCP_BEARER_TOKEN'] = TOKEN;
  });

  afterEach(() => {
    delete process.env['MCP_BEARER_TOKEN'];
  });

  it('401s a request with no credential at all', async () => {
    const response = await POST(initialise());
    expect(response.status).toBe(401);
  });

  it('401s a wrong bearer', async () => {
    const response = await POST(initialise({ authorization: 'Bearer wrong' }));
    expect(response.status).toBe(401);
  });

  it('401s a bearer that is a prefix of the real one', async () => {
    const response = await POST(
      initialise({ authorization: `Bearer ${TOKEN.slice(0, -1)}` }),
    );
    expect(response.status).toBe(401);
  });

  it('fails closed when the secret is not provisioned', async () => {
    delete process.env['MCP_BEARER_TOKEN'];
    const response = await POST(
      initialise({ authorization: `Bearer ${TOKEN}` }),
    );
    expect(response.status).toBe(401);
  });

  it('does not advertise an OAuth service this app does not host', async () => {
    // A 401 carrying OAuth metadata makes claude.ai attempt dynamic client
    // registration against a sign-in service that is not there, and the
    // connection fails instead of falling back to the token in the URL.
    const response = await POST(initialise());
    expect(response.headers.get('www-authenticate')).toBeNull();
  });

  it('answers a correctly authenticated initialize', async () => {
    const response = await POST(
      initialise({ authorization: `Bearer ${TOKEN}` }),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('rocket');
  });

  it('accepts the secret as a query parameter, which is all claude.ai can send', async () => {
    const response = await POST(initialise({}, `${ENDPOINT}?token=${TOKEN}`));
    expect(response.status).toBe(200);
  });

  it('gates every method the route exports, not only POST', async () => {
    // Streamable HTTP uses GET for the stream and DELETE to end a session. A
    // gate on POST alone leaves two doors open on the same surface.
    expect((await GET(new Request(ENDPOINT))).status).toBe(401);
    expect(
      (await DELETE(new Request(ENDPOINT, { method: 'DELETE' }))).status,
    ).toBe(401);
  });
});
