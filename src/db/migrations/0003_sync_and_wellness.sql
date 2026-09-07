CREATE TABLE "sync_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"job" text NOT NULL,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ok" boolean NOT NULL,
	"detail" text NOT NULL,
	"summary" jsonb
);
--> statement-breakpoint
CREATE TABLE "wellness_raw" (
	"local_date" date PRIMARY KEY NOT NULL,
	"raw" jsonb NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "sync_runs_ran_at_idx" ON "sync_runs" USING btree ("ran_at");--> statement-breakpoint
-- `sync_runs` is append-in-practice but NOT append-only-by-guard: it is
-- operational telemetry rather than training history, so it is absent from
-- `APPEND_ONLY_TABLES` and the 0001 triggers do not reach it. The default
-- privileges from 0001 already grant SELECT and INSERT on every future table,
-- which is exactly what this one needs -- nothing updates a heartbeat.
--
-- `wellness_raw` is UPSERTED, so it needs UPDATE, and a table that is mutable
-- has to say so out loud (the same reasoning as `notes` in 0002). A wellness
-- day is re-stated by the bridge as the day's overnight data lands, and it is
-- re-fetchable from the source, so restating one destroys nothing.
--
-- DELETE is granted with it for one reason: this table exists to be REPLACED.
-- Decision gate G1 forbids a typed wellness schema until the probe has read a
-- real payload; once it has, the typed table is derived from these rows and
-- these rows are dropped. Withholding DELETE would mean a migration that has to
-- re-grant it, which is a permission decision made by whoever is in a hurry.
GRANT SELECT, INSERT, UPDATE, DELETE ON wellness_raw TO app_rw;
