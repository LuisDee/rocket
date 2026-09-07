# neon-persistence

**Scope boundary:** stand up Postgres persistence on Neon and load the training
plan into it. Covers: the Drizzle schema for five tables, the connection module,
the initial migration, a custom migration carrying the append-only guards, an
idempotent seeder reading `config/training.ts`, a JSON export of the
human-entered tables, and an integration suite that runs against a real
database. Does NOT cover: wellness snapshots, availability rules, plan
revisions, the load engine, the MCP surface, any Garmin or Strava sync path, or
reading the database from the app's pages -- the home screen keeps rendering
from `config/training.ts` until something needs otherwise.

**References:** `REDLINES.md` rule 2 (logged history is append-only, enforced in
Postgres, not by convention); `docs/specs/01-domain-model.md` for the entities;
`tools/garmin_probe/CATALOGUE.md` for the real Garmin field names the activity
table must accommodate; `docs/ci-gates.md` rows "Append-only training history"
and "Integration tests actually run in CI".

**Alternative rejected:** Prisma, because its drift remedy is `migrate reset`,
which drops and recreates and so destroys triggers and ACLs -- the two things
this schema depends on. The Neon HTTP driver (`@neondatabase/serverless`),
because it cannot do interactive transactions and we need "insert activity +
insert decision-log row" to be atomic; it is now the fallback for platforms
without Fluid-style pooling. A three-layer guard including an `sql_drop` event
trigger, because it blocks legitimate teardown including migrations and needs a
deliberately awkward escape hatch; two layers binding two different actors carry
the value for a single-user app. Rules and RLS, because both were tested and
**fail silently** -- a rule reported `UPDATE 0` and left the row intact, which is
worse than no guard at all.

**Interface touched:** new `src/db/`; `package.json` (four exact-pinned
dependencies and three scripts); `tsconfig.json` (`allowImportingTsExtensions`,
so a `node`-run CLI can import the config that owns the thresholds);
`vitest.config.mts` (exclude the integration pattern from the unit run);
`.github/workflows/check.yml` (one job with a digest-pinned Postgres service);
`.env.example`; `docs/ci-gates.md`. Reads `config/training.ts` but does not
write it -- `volume-block` owns that file concurrently.

**Acceptance criteria:**

- `UPDATE` and `DELETE` on `activities` and `check_ins` are refused for both the
  application role and the table owner, asserted on SQLSTATE rather than message
  text, and `TRUNCATE` is refused too.
- Every guard trigger reports `tgenabled = 'A'`, so a trigger recreated without
  `ENABLE ALWAYS` is caught as well as one deleted outright.
- `UPDATE` on `sessions` succeeds: the plan is mutable, history is not.
- The integration suite THROWS when `DATABASE_URL` is absent rather than
  skipping, so an absent database is a red build and not a green one.
- Seeding twice leaves the same row counts as seeding once.
- The unit suite (`npm run test`) still passes without a database.
- Every gate green, and both new ledger rows name an enforcer that resolves.

**Assumptions:**

- The app will eventually connect as `app_rw` rather than as the table owner.
  Until a deployment exists there is no `app_rw` password and no third
  connection string, so the migration creates the role `NOLOGIN` and the tests
  exercise the grant layer via `SET ROLE`. Giving it a password is a documented
  one-liner at deploy time, deliberately kept out of a committed migration so no
  secret is ever generated inside version control.
- `attachDatabasePool()` matters only on Vercel Fluid compute, which does not
  exist yet. It is wired now because retrofitting the connection module later is
  the more expensive order, and it is guarded so it is inert off-Vercel.
- Per-second activity streams stay out of Postgres. One measured 588 KB against
  a 0.5 GB free tier, and they are re-fetchable from Garmin, so the table stores
  a reference. Verified, not assumed: `activity_streams` is 587,968 bytes in
  `CATALOGUE.md`.
- `config/training.ts` is being rewritten concurrently by `volume-block` with
  the 60/80/100/80/60 block. The seeder reads whatever shape is on disk at run
  time and tolerates `BLOCK_WEEKS` gaining a per-day layer.

---

## Checklist

- [ ] Spike the two guard layers against Neon specifically, not stock Postgres
- [ ] Schema: five tables, activity columns drawn from the real catalogue
- [ ] Connection module: `pg` Pool, `max: 3`, pooled host, `attachDatabasePool`
- [ ] Initial migration, generated
- [ ] Custom migration: role, grants, default privileges, both trigger layers
- [ ] Idempotent seeder reading `config/training.ts`
- [ ] JSON export of the human-entered tables
- [ ] Integration suite, `globalSetup` that throws on a missing `DATABASE_URL`
- [ ] Prove each guard by breaking it, watching it fail, reverting
- [ ] CI job with a digest-pinned `postgres:18` service
- [ ] Two ledger rows flipped to IMPLEMENTED with the violations recorded

## Commits

(populated as work lands)
