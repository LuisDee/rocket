/**
 * The database connection.
 *
 * `pg` Pool over TCP to Neon's POOLED host, not the Neon HTTP driver. That
 * recommendation reversed in 2026: with Fluid compute an instance stays warm
 * and multiplexes requests, so one TCP pool is established once and reused,
 * and the HTTP driver became the fallback for platforms without Fluid-style
 * pooling. It also cannot do interactive transactions, and we need "insert
 * activity + insert its decision-log row" to be atomic. Most search results
 * still say otherwise; they are stale.
 *
 * TWO URLs, and mixing them up is the classic failure:
 *   DATABASE_URL           pooled (-pooler host)  -- the app, always
 *   DATABASE_URL_UNPOOLED  direct host            -- migrations only
 * PgBouncer's transaction mode cannot run the session-level operations a
 * migration needs, which is why the direct URL exists at all.
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from './schema';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. The app reads the pooled URL; migrations read ` +
        `DATABASE_URL_UNPOOLED. Both live in pass, never in the repo.`,
    );
  }
  return value;
}

/**
 * Module scope on purpose: one pool per warm instance, established once.
 * `max: 3` because this is a single-user app and Neon's free tier is not the
 * place to discover connection exhaustion.
 */
let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: required('DATABASE_URL'), max: 3 });
    void attachToVercel(pool);
  }
  return pool;
}

/**
 * Drains idle clients before Fluid suspends an instance, which is what keeps
 * the connection count bounded. Inert anywhere that is not Vercel, and
 * deliberately soft-failing: a missing optional integration must never be the
 * reason the app cannot talk to its database.
 */
async function attachToVercel(p: Pool): Promise<void> {
  if (!process.env.VERCEL) return;
  try {
    const { attachDatabasePool } = await import('@vercel/functions');
    attachDatabasePool(p);
  } catch (error) {
    console.warn(
      'attachDatabasePool unavailable; connections will not drain on suspend',
      error,
    );
  }
}

export function getDb() {
  return drizzle(getPool(), { schema });
}

export { schema };
