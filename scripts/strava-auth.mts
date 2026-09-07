/**
 * One-time Strava authorisation.
 *
 *   npm run strava:auth              print the URL to open
 *   npm run strava:auth -- <code>    exchange the code from the redirect
 *
 * Needed because the athlete token was lost: it lived in the gitignored
 * `tools/strava_probe/out/token.json` and that directory was deleted on
 * 2026-09-07 on API Policy grounds. The token now lives in Postgres, so this
 * should be the last time it is needed.
 *
 * Plain `pg` rather than the app's drizzle client, matching src/db/seed.mts:
 * a CLI has no business pulling Next and @vercel/functions into its import
 * graph to run one INSERT.
 */
import { Pool } from 'pg';

const id = process.env.STRAVA_CLIENT_ID;
const secret = process.env.STRAVA_CLIENT_SECRET;
if (!id || !secret) {
  console.error('STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET must be set.');
  process.exit(1);
}

const code = process.argv[2];

if (!code) {
  // activity:write is what an upload needs. read_all is requested too because a
  // new grant REPLACES the old one rather than merging with it, so asking for
  // write alone would silently drop the read scope.
  const url =
    'https://www.strava.com/oauth/authorize' +
    `?client_id=${id}` +
    '&redirect_uri=http://localhost/exchange_token' +
    '&response_type=code&approval_prompt=force' +
    '&scope=activity:read_all,activity:write,read';
  console.log('Open this, tick EVERY box, then re-run with the code= value:\n');
  console.log(url);
  console.log(
    '\nThe page will fail to load. The code in the address bar is still good.',
  );
  process.exit(0);
}

const res = await fetch('https://www.strava.com/oauth/token', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    client_id: id,
    client_secret: secret,
    code,
    grant_type: 'authorization_code',
  }),
});
const body = (await res.json()) as {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scope?: string;
  athlete?: { id: number };
};
if (!res.ok) {
  console.error(`Strava refused the exchange (${res.status}):`, body);
  process.exit(1);
}

// Assert the scope GRANTED, not the one requested. Strava lets the athlete
// untick a box on the consent screen and the failure is otherwise invisible
// until the first upload fails. This exact check caught a downgrade before.
const scopes = String(body.scope ?? '').split(/[\s,]+/);
if (!scopes.includes('activity:write')) {
  console.error(
    `activity:write was NOT granted (got: ${body.scope}). Re-run and tick every box.`,
  );
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}
const pool = new Pool({ connectionString: url, max: 1 });
await pool.query(
  `insert into oauth_tokens (provider, access_token, refresh_token, expires_at, scope, updated_at)
   values ('strava', $1, $2, to_timestamp($3), $4, now())
   on conflict (provider) do update set
     access_token = excluded.access_token,
     refresh_token = excluded.refresh_token,
     expires_at = excluded.expires_at,
     scope = excluded.scope,
     updated_at = now()`,
  [body.access_token, body.refresh_token, body.expires_at, body.scope ?? null],
);
await pool.end();
console.log(`stored. athlete ${body.athlete?.id}, scope: ${body.scope}`);
