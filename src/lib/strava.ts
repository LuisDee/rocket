/**
 * The only file in rocket that talks to Strava.
 *
 * `scripts/check_no_strava_api.py` pins that: a Strava hostname anywhere else
 * fails the build. Not because one module is safer than two, but because the
 * override recorded in docs/decisions.md (2026-09-07) is bounded — rocket
 * uploads a file Luis has approved, and does nothing else with the API. A guard
 * that allows the whole tree could not tell the difference a year from now.
 *
 * Reads still go through the Strava MCP connector, which is the route API
 * Policy 3.5 sanctions. Nothing here reads.
 */

import { eq } from 'drizzle-orm';

import { getDb } from '../db/client';
import { oauthTokens } from '../db/ingest-schema';

const TOKEN_URL = 'https://www.strava.com/oauth/token';
const UPLOAD_URL = 'https://www.strava.com/api/v3/uploads';

/** Refresh this far before expiry rather than racing it. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/**
 * Strava processes an upload asynchronously. Seconds in practice; the ceiling
 * exists so a stuck upload surfaces as a message rather than a hung request.
 *
 * ponytail: blocking poll inside the server action. Fine because the action
 * runs on a tap and Vercel allows 60s. If uploads ever routinely take longer,
 * store the upload id and poll on page load instead.
 */
const POLL_INTERVAL_MS = 2000;
const POLL_CEILING_MS = 55_000;

export class StravaError extends Error {
  constructor(
    message: string,
    /** True when retrying cannot help: a duplicate, a rejected file. */
    readonly permanent = false,
  ) {
    super(message);
    this.name = 'StravaError';
  }
}

function credentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new StravaError(
      'STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET are not set. In development they ' +
        'come from pass; in production from the Vercel environment.',
      true,
    );
  }
  return { clientId, clientSecret };
}

type TokenRow = typeof oauthTokens.$inferSelect;

/**
 * A valid access token, refreshing first if it is close to expiry.
 *
 * The refresh token ROTATES: Strava returns a new one and invalidates the old.
 * Persisting it is not bookkeeping — miss it once and the next refresh fails
 * with no warning until the token expires, hours later.
 */
export async function accessToken(db = getDb()): Promise<string> {
  const rows = await db
    .select()
    .from(oauthTokens)
    .where(eq(oauthTokens.provider, 'strava'))
    .limit(1);
  const row: TokenRow | undefined = rows[0];

  if (row === undefined) {
    throw new StravaError(
      'No Strava token stored. Run `npm run strava:auth` and grant access ' +
        'once; the token is then kept in Postgres and refreshed automatically.',
      true,
    );
  }

  if (row.expiresAt.getTime() - Date.now() > REFRESH_MARGIN_MS) {
    return row.accessToken;
  }

  const { clientId, clientSecret } = credentials();
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: row.refreshToken,
    }),
  });
  if (!response.ok) {
    throw new StravaError(
      `Strava refused to refresh the token (${response.status}). The grant ` +
        'may have been revoked; re-run `npm run strava:auth`.',
      response.status === 400 || response.status === 401,
    );
  }
  const body = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_at: number;
  };

  await db
    .update(oauthTokens)
    .set({
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      expiresAt: new Date(body.expires_at * 1000),
      updatedAt: new Date(),
    })
    .where(eq(oauthTokens.provider, 'strava'));

  return body.access_token;
}

/** Store a freshly granted token. Used by the authorise CLI. */
export async function storeToken(
  token: {
    access_token: string;
    refresh_token: string;
    expires_at: number;
    scope?: string;
  },
  db = getDb(),
): Promise<void> {
  const values = {
    provider: 'strava',
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: new Date(token.expires_at * 1000),
    scope: token.scope ?? null,
    updatedAt: new Date(),
  };
  await db.insert(oauthTokens).values(values).onConflictDoUpdate({
    target: oauthTokens.provider,
    set: values,
  });
}

type UploadStatus = {
  id: number;
  activity_id: number | null;
  error: string | null;
  status: string;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Upload a FIT and wait for Strava to turn it into an activity.
 *
 * Two-step by Strava's design: the POST returns an upload id, not an activity,
 * and the file is processed afterwards. Returning the upload id to the caller
 * would just move the waiting somewhere with less context.
 */
export async function uploadFit(
  file: Buffer,
  filename: string,
  options: {
    name?: string;
    description?: string;
    externalId?: string;
    fetchImpl?: typeof fetch;
    tokenImpl?: () => Promise<string>;
    now?: () => number;
  } = {},
): Promise<number> {
  const doFetch = options.fetchImpl ?? fetch;
  const token = await (options.tokenImpl ?? accessToken)();
  const now = options.now ?? Date.now;

  const form = new FormData();
  form.set('file', new Blob([new Uint8Array(file)]), filename);
  form.set('data_type', 'fit');
  if (options.name) form.set('name', options.name);
  if (options.description) form.set('description', options.description);
  if (options.externalId) form.set('external_id', options.externalId);

  const started = now();
  const post = await doFetch(UPLOAD_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });

  if (post.status === 429) {
    throw new StravaError(
      'Strava rate limit reached. It resets every fifteen minutes.',
    );
  }
  const created = (await post.json()) as UploadStatus & { message?: string };
  if (!post.ok) {
    throw new StravaError(
      created.error ??
        created.message ??
        `Strava rejected the upload (${post.status}).`,
      post.status < 500,
    );
  }
  if (created.error) throw new StravaError(created.error, true);
  if (created.activity_id) return created.activity_id;

  // Poll until Strava says what the file became.
  for (;;) {
    if (now() - started > POLL_CEILING_MS) {
      throw new StravaError(
        `Strava is still processing upload ${created.id} after ` +
          `${Math.round(POLL_CEILING_MS / 1000)}s. It may still succeed — ` +
          'check Strava before uploading again, or it will duplicate.',
      );
    }
    await sleep(POLL_INTERVAL_MS);

    const poll = await doFetch(`${UPLOAD_URL}/${created.id}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const state = (await poll.json()) as UploadStatus;
    if (state.error) {
      // "duplicate of activity 123" is the common one and it is not a fault:
      // the file is already there. Say so plainly.
      throw new StravaError(state.error, true);
    }
    if (state.activity_id) return state.activity_id;
  }
}
