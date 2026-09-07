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
  // Both schema files, or drizzle-kit cannot see what it is asked to diff.
  // `ingested_activities` sat in ingest-schema.ts with no migration for two days
  // because this key named only schema.ts: the table was declared, typechecked
  // and queried by the approval screen, and did not exist on the server.
  schema: ['./src/db/schema.ts', './src/db/ingest-schema.ts'],
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED ?? '' },
  strict: true,
  verbose: true,
});
