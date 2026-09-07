import { defineConfig } from 'drizzle-kit';

/**
 * Migrations run against the DIRECT host, never the pooled one: PgBouncer's
 * transaction mode cannot run the session-level operations a migration needs.
 *
 * `drizzle-kit push` is never used against this database. Push diffs the schema
 * straight onto the server, which would drop the append-only triggers and
 * grants in `0001_append_only_guards.sql` without either generating a migration
 * or telling anyone. Generate, review, migrate.
 */
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED ?? '' },
  strict: true,
  verbose: true,
});
