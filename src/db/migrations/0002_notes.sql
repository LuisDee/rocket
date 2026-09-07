CREATE TABLE "notes" (
	"id" text PRIMARY KEY NOT NULL,
	"local_date" date NOT NULL,
	"kind" text NOT NULL,
	"text" text NOT NULL,
	"source" text NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "notes_local_date_idx" ON "notes" USING btree ("local_date");--> statement-breakpoint
-- `notes` is deliberately MUTABLE: a note is a statement about the near future
-- that gets corrected ("actually it's Wednesday") or withdrawn, unlike an
-- activity or a check-in, which are history and carry the append-only triggers.
--
-- The default privileges set in 0001 grant SELECT and INSERT to every future
-- table, which is the right default -- a new table should not become mutable by
-- accident. It means a mutable table has to say so, and without this grant the
-- app could write a note and never fix one.
GRANT SELECT, INSERT, UPDATE, DELETE ON notes TO app_rw;
