CREATE TABLE "ingested_activities" (
	"garmin_activity_id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"activity_name" text,
	"started_at" timestamp with time zone,
	"original_fit" "bytea",
	"cropped_fit" "bytea",
	"cropped_filename" text,
	"crop_summary" jsonb,
	"forensic_report" jsonb,
	"strava_activity_id" bigint,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ingested_activities_status_idx" ON "ingested_activities" USING btree ("status");
--> statement-breakpoint
-- The default privileges set in 0001 grant SELECT and INSERT to every future
-- table, so a new table arrives immutable and cannot become mutable by
-- accident. This one is a work queue whose entire purpose is to change state:
-- pending -> reviewed -> shipped, or -> failed. Without UPDATE it would accept
-- a row and then refuse every transition, and the approval screen's "mark as
-- uploaded" would fail with a permission error rather than anything legible.
--
-- No append-only trigger here, deliberately. `activities` and `check_ins` hold
-- history that cannot be regenerated; this holds a queue whose loss costs a
-- re-pull from Garmin. DELETE is granted for the same reason: a row for an
-- activity Luis deleted upstream should be removable.
GRANT SELECT, INSERT, UPDATE, DELETE ON ingested_activities TO app_rw;
