# neon-apply-and-seed

**Scope boundary:** take the schema `neon-persistence` wrote and make it real
against the live Neon database. Covers: applying the outstanding migration,
proving the append-only guards bite against Neon specifically (not stock
Postgres), an idempotent seeder loading `BLOCK_WEEKS` and `RACES` from
`config/training.ts`, confirming `notes` is writable, an integration suite that
fails rather than skips without a database, and a timestamped JSON export of the
tables that cannot be regenerated. Does NOT cover: writing `sessions` rows (the
deterministic planner owns those -- REDLINES.md rule 8), any Garmin or Strava
ingest path, reading the database from the app's pages, or changing the schema.
The home screen keeps rendering from `config/training.ts`.

**References:** `REDLINES.md` rule 2 (logged history is append-only, enforced in
Postgres, not by convention) and rule 5 (no secret in source);
`tasks/neon-persistence.md`, whose header is frozen and whose checklist this
finishes; `src/db/migrations/0001_append_only_guards.sql`, which claims a
verification against Neon that left no artefact; `docs/ci-gates.md` rows
"Append-only training history" and "Integration tests actually run in CI".

**Alternative rejected:** `drizzle-kit push` to reconcile the database, because
push diffs the schema straight onto the server and would drop the triggers and
grants in 0001 without generating a migration or telling anyone -- the two
things this schema depends on are invisible to the schema differ. A `skipIf`
guard on the integration suite, because a suite that skips reports green having
tested nothing; the setup throws instead. Exporting every table, because `weeks`
and `races` are a pure projection of a version-controlled config file and
backing them up is backing up git.

**Interface touched:** `package.json` (four scripts, no new dependencies);
`tsconfig.json` (`allowImportingTsExtensions`, so a node-run CLI can import the
config that owns the thresholds); `vitest.config.mts` (integration pattern
excluded from the unit run); new `vitest.integration.config.mts`; new
`src/db/seed.mts`, `src/db/export.mts`, `src/db/integration-setup.ts` and two
`*.integration.test.ts` files; `.github/workflows/check.yml` (one job with a
digest-pinned Postgres service); `.gitignore` (`backups/`, and a negation so
`.env.example` is committable); new `.env.example`; `docs/ci-gates.md`;
`docs/decisions.md`. Reads `config/training.ts` and never writes it.

**Acceptance criteria:**

- Every migration in `meta/_journal.json` is recorded in
  `drizzle.__drizzle_migrations`, and `notes` exists.
- Against the live Neon database, asserted on SQLSTATE and not on message text:
  `UPDATE activities` as `app_rw` gives 42501; as the table owner gives 23001;
  `DELETE check_ins` gives 23001; `TRUNCATE` is refused; `INSERT` and `SELECT`
  as `app_rw` succeed; `UPDATE sessions` succeeds; all four guard triggers
  report `tgenabled = 'A'`.
- `app_rw` can UPDATE and DELETE a `notes` row, so a note can be corrected or
  withdrawn.
- Seeding twice leaves seven `weeks` and five `races`, the dropped Dorney entry
  included.
- The integration suite throws on a missing `DATABASE_URL` rather than skipping.
- The unit suite still passes with no database in the environment.
- `npm run db:export` writes a timestamped JSON file the export test can parse.
- Every gate green; both ledger rows name an enforcer that resolves and record
  the deliberate violation used to prove them.

**Assumptions:**

- The brief says none of the three migrations has ever run. The database
  disagrees: `drizzle.__drizzle_migrations` holds rows for 0000 and 0001 and all
  four guard triggers are present. The database is taken as truth (AGENTS.md
  section 1) -- only 0002 is applied, and this discrepancy is reported rather
  than papered over by re-running anything.
- `races.distance` is `text` while `config/training.ts` carries a numeric
  `distanceKm`. The number is stored as its own string rather than migrating the
  column: a spec value does not get a migration written to accommodate it, and
  nothing reads the column yet.
- `races.role` is documented in `schema.ts` as `goal | rehearsal | sharpener |
easy | absorbed`, but the config emits `tune-up` and `dropped`. There is no
  CHECK constraint, so the seed carries the config's vocabulary through and the
  comment is the stale artefact. Flagged, not silently reconciled.
- The seeder writes `weeks` rows, which REDLINES.md rule 8 reserves to the
  deterministic planner. Taken as compliant: the seeder is a mechanical
  projection of a version-controlled config, not a model-authored plan, and the
  rule's target is a free-form schedule arriving from an LLM.
- No `app_rw` password exists and none is created here -- the migration made the
  role `NOLOGIN` on purpose so no committed artefact ever generates a
  credential. The grant layer is therefore exercised through `SET LOCAL ROLE`
  inside a transaction, which is also what keeps it safe over the pooled host.
- `sessions` stays empty. Nothing generates session rows yet, and inventing them
  here would be the planner writing itself.

---

## Checklist

- [x] Verify what the three migrations actually contain and what the database
      already has
- [x] Apply the outstanding migration with `drizzle-kit migrate` over the
      unpooled URL
- [x] Prove each guard against Neon, on SQLSTATE, including whether the owner
      can bypass
- [x] Idempotent seeder for `BLOCK_WEEKS` and `RACES`
- [x] Confirm `notes` carries an explicit UPDATE/DELETE grant and exercise it
- [x] Integration suite with a `globalSetup` that throws on a missing
      `DATABASE_URL`
- [x] Timestamped JSON export command
- [x] CI job with a digest-pinned Postgres service
- [x] Break each guard on purpose, watch it catch, revert; record in the ledger
- [x] Two ledger rows and a decision entry
- [x] All gates green

## Commits

(populated as work lands)
