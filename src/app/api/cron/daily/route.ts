/**
 * The daily pass's trigger. One cron, once a day.
 *
 * Vercel Hobby cron is best-effort: it fires within about an hour of its slot,
 * is never retried, and a missed run leaves no log -- which is why the alarm
 * cannot be raised by this route. It is raised by the ABSENCE of the
 * dead-man's-switch ping that a successful pass makes as its final step
 * (`src/jobs/daily-pass.ts`, REDLINES.md rule 3).
 *
 * Two callers, one gate. Vercel Cron presents `Authorization: Bearer
 * $CRON_SECRET`; a human running it by hand presents the same secret. Vercel
 * documents `CRON_SECRET` as the mechanism, and it is checked here rather than
 * trusting the `x-vercel-*` headers, which a client can send.
 *
 * FAIL-CLOSED, like `/api/mcp`: with the secret unset nothing authenticates and
 * the route is dormant rather than open. It writes to an append-only history
 * and pushes to the athlete's own watch calendar, so an open one is not a
 * curiosity, it is a vandalism surface.
 *
 * SCHEDULED 03:30 UTC (`vercel.json`), which is 04:30 British Summer Time and
 * 03:30 GMT. Hobby's delivery window is about an hour, so the worst case is
 * 05:30 local -- still before a 06:00 run, which is the only deadline this job
 * has: the whole point of the outbound leg is that the wrist agrees with the
 * plan BEFORE the athlete follows it. The block ends 2026-10-24, a day before
 * the clocks change, so the BST reading is the one that matters.
 *
 * The response status mirrors the pass: 200 for a green pass, 500 for a failed
 * one, so a platform-level view agrees with our own heartbeat row instead of
 * reporting a healthy job that did nothing.
 */

import { runDailyPass } from '../../../../jobs/daily-pass';
import { postgresStore } from '../../../../domain/store';
import { bridgeFromEnv } from '../../../../integrations/intervals';
import { todayInLondon } from '../../../../lib/block';

export const runtime = 'nodejs';
export const maxDuration = 60;
/** Never cached: it is a write, and a cached 200 would be a silent no-op. */
export const dynamic = 'force-dynamic';

function authorised(req: Request): boolean {
  const expected = process.env['CRON_SECRET'];
  if (!expected) return false;
  return req.headers.get('authorization') === `Bearer ${expected}`;
}

export async function GET(req: Request): Promise<Response> {
  if (!authorised(req)) {
    return Response.json({ error: 'Authorization required' }, { status: 401 });
  }

  const result = await runDailyPass({
    store: postgresStore(),
    bridge: bridgeFromEnv(),
    clock: { today: () => todayInLondon(), now: () => new Date() },
    healthcheckUrl: process.env['HEALTHCHECK_PING_URL'] ?? null,
  });

  return Response.json(result, { status: result.ok ? 200 : 500 });
}
