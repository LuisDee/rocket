-- Append-only enforcement for `activities` and `check_ins`.
--
-- REDLINES.md rule 2: "Enforced in Postgres, not by convention." Training
-- history is the one artefact here that cannot be regenerated -- you cannot
-- re-run week 3 -- so this is the single genuinely irreversible decision in the
-- project. It goes in from the first migration because retrofitting a guard
-- onto a table that already holds data is the painful case.
--
-- TWO LAYERS, because each binds a DIFFERENT ACTOR and neither is sufficient:
--
--   1. Privilege revoke  -> binds the APPLICATION role.  SQLSTATE 42501.
--      Void against the table owner, who can simply re-grant to itself.
--   2. ENABLE ALWAYS trigger -> binds the OWNER too.     SQLSTATE 23001.
--
-- Verified against THIS database (Neon, PostgreSQL 18.6) on 2026-09-06, not
-- against stock Postgres and assumed to carry over:
--   - owner UPDATE       -> refused by the trigger
--   - owner TRUNCATE     -> SUCCEEDED until the statement-level trigger below
--                           was added. A row-level BEFORE UPDATE OR DELETE
--                           trigger does NOT fire on TRUNCATE. Without the
--                           second trigger the table can be emptied silently.
--   - app_rw UPDATE      -> permission denied
--   - app_rw INSERT      -> allowed
--   - both triggers      -> tgenabled = 'A'
--
-- REJECTED, with evidence: rules (`DO INSTEAD NOTHING`) and RLS with no UPDATE
-- policy. Both FAIL SILENTLY -- the rule reported `UPDATE 0` and left the row
-- intact, which is worse than no guard because it looks like it worked.
--
-- ALSO REJECTED: an `sql_drop` event trigger protecting the tables by name.
-- It blocks legitimate teardown, including a future migration that needs to
-- drop one of these tables, and needs a deliberately awkward escape hatch. Its
-- protection is against an actor who is already running DDL as the owner --
-- someone who can equally drop the event trigger first. Two layers binding two
-- actors carry the value for a single-user app; the third was ceremony.

--------------------------------------------------------------------- role ---
-- Created NOLOGIN and without a password on purpose: a committed migration
-- must never generate a credential. Giving it a login at deploy time is a
-- documented one-liner in .env.example.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rw') THEN
    CREATE ROLE app_rw NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO app_rw;

-- History: read and append, nothing else. This is the layer that binds the app.
GRANT SELECT, INSERT ON activities TO app_rw;
GRANT SELECT, INSERT ON check_ins  TO app_rw;

-- Plan: fully mutable. The plan changing IS the product.
GRANT SELECT, INSERT, UPDATE, DELETE ON weeks    TO app_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON sessions TO app_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON races    TO app_rw;

-- A table added later defaults to append-only rather than to full rights.
-- Failing closed is the right default for a history store.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT ON TABLES TO app_rw;

-- Needed for `SET ROLE app_rw`, which is how the integration suite exercises
-- the grant layer without a second connection string. On Neon the owner is NOT
-- implicitly a member of a role it creates -- verified: `SET ROLE` returned
-- "permission denied to set role" until this grant existed.
GRANT app_rw TO CURRENT_USER;

----------------------------------------------------------------- triggers ---

CREATE OR REPLACE FUNCTION refuse_history_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'append-only: % on %.% is refused. Training history cannot be regenerated '
    '(REDLINES.md rule 2). Correct a record by inserting a superseding row.',
    TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END $$;

-- ENABLE ALWAYS, not merely ENABLED: an ENABLED trigger is skipped when
-- session_replication_role is 'replica'. That switch needs superuser, which
-- the Neon owner is not, so this is defence in depth rather than the only
-- thing standing in the way -- but a trigger recreated without ALWAYS is a
-- silent downgrade, which is why the tests assert tgenabled = 'A'.

CREATE TRIGGER activities_append_only
  BEFORE UPDATE OR DELETE ON activities
  FOR EACH ROW EXECUTE FUNCTION refuse_history_mutation();
ALTER TABLE activities ENABLE ALWAYS TRIGGER activities_append_only;

CREATE TRIGGER check_ins_append_only
  BEFORE UPDATE OR DELETE ON check_ins
  FOR EACH ROW EXECUTE FUNCTION refuse_history_mutation();
ALTER TABLE check_ins ENABLE ALWAYS TRIGGER check_ins_append_only;

-- TRUNCATE is a separate statement-level trigger because the row-level one
-- above does not fire for it. This is not theoretical: on this database
-- TRUNCATE succeeded against a table carrying the row-level trigger.

CREATE TRIGGER activities_no_truncate
  BEFORE TRUNCATE ON activities
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_history_mutation();
ALTER TABLE activities ENABLE ALWAYS TRIGGER activities_no_truncate;

CREATE TRIGGER check_ins_no_truncate
  BEFORE TRUNCATE ON check_ins
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_history_mutation();
ALTER TABLE check_ins ENABLE ALWAYS TRIGGER check_ins_no_truncate;
