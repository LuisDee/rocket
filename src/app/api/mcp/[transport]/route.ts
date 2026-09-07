/**
 * The MCP endpoint. Streamable HTTP, stateless, static bearer.
 *
 * Mounted the way DoHardThings mounts it (`app/api/mcp/[transport]/route.ts`),
 * on the stack DoHardThings runs in production against the real claude.ai
 * connector: `mcp-handler@1.1.0` + `@modelcontextprotocol/sdk@1.29.0`, both
 * pinned exact. `mcp-handler@1.1.0`'s peer asks for SDK 1.26.0 and this is
 * 1.29.0 -- an unmet peer, resolved by an `overrides` entry in `package.json`,
 * because the combination that is proven in production beats the combination
 * the peer range describes (ledger F22).
 *
 * `basePath` MUST match where this route lives, which makes the URL to hand a
 * client `/api/mcp/mcp`. No Redis: that is only needed for SSE session
 * resumability, which the 2026-07-28 spec revision removed the session id for
 * and which we do not use.
 *
 * `nodejs` runtime because `pg` needs it. Tools are registered inside the
 * initialiser callback, holding no state in module scope, so the handler is
 * safe under instance reuse.
 */

import { createMcpHandler } from 'mcp-handler';

import { postgresStore } from '../../../../domain/store';
import { isAuthorised } from '../../../../mcp/auth';
import { registerRocketTools } from '../../../../mcp/tools';

export const runtime = 'nodejs';
export const maxDuration = 60;

const handler = createMcpHandler(
  (server) => {
    registerRocketTools(server, postgresStore());
  },
  {
    serverInfo: { name: 'rocket', version: '1.0.0' },
    capabilities: { tools: {} },
  },
  {
    basePath: '/api/mcp',
    maxDuration: 60,
    verboseLogs: false,
  },
);

/** A plain 401. Deliberately no `WWW-Authenticate` -- see `mcp/auth.ts`. */
function unauthorised(): Response {
  return new Response(
    JSON.stringify({
      error: 'invalid_token',
      error_description: 'Authorization required',
    }),
    { status: 401, headers: { 'content-type': 'application/json' } },
  );
}

async function gated(req: Request): Promise<Response> {
  if (!isAuthorised(req)) return unauthorised();
  return handler(req);
}

export { gated as GET, gated as POST, gated as DELETE };
