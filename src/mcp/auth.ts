import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * The MCP endpoint is an internet-reachable WRITE surface: every tool call ends
 * up in the training history, which is append-only and therefore unrepairable.
 * Its only gate is one shared secret.
 *
 * Accepted either as `Authorization: Bearer <token>` (Claude Code, the API
 * connector, scripts) or as `?token=` (the claude.ai custom-connector UI has no
 * header field, so the secret rides in the URL there). Use a URL-safe token:
 * a base64 secret containing `+`, `/` or `=` breaks on paste, because `+`
 * decodes to a space in a query string.
 *
 * FAIL-CLOSED: with `MCP_BEARER_TOKEN` unset nothing authenticates and the
 * surface is dormant, rather than open. No OAuth is advertised -- an
 * unauthenticated 401 carrying OAuth metadata makes claude.ai attempt dynamic
 * client registration against a sign-in service this app does not host, and the
 * connection fails instead of falling back. OAuth is post-race work.
 *
 * REDLINES.md rule 5: the secret is never in source and never carries a
 * `NEXT_PUBLIC_` prefix. There is no `server-only` import guarding that, because
 * pulling in a package to express it is a dependency for a comment -- the module
 * is reached only from a route handler and from tests.
 */

/** Constant-time compare of fixed-length digests, so neither the secret's
 *  content nor its length leaks through timing. */
function safeEqual(a: string, b: string): boolean {
  const ah = createHash('sha256').update(a, 'utf8').digest();
  const bh = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(ah, bh);
}

function presentedToken(req: Request): string | undefined {
  const auth = req.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice('Bearer '.length).trim();
    if (token) return token;
  }
  try {
    return new URL(req.url).searchParams.get('token') ?? undefined;
  } catch {
    return undefined;
  }
}

/** True when this request carries the shared secret. False when unprovisioned. */
export function isAuthorised(req: Request): boolean {
  const expected = process.env['MCP_BEARER_TOKEN'];
  if (!expected) return false;
  const presented = presentedToken(req);
  return presented !== undefined && safeEqual(presented, expected);
}
