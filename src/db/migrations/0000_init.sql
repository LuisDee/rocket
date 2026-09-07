CREATE TABLE "activities" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"garmin_activity_id" text,
	"strava_activity_id" text,
	"name" text,
	"activity_type" text,
	"start_time_local" timestamp,
	"start_time_gmt" timestamp with time zone,
	"time_zone_id" integer,
	"local_date" date NOT NULL,
	"distance_m" double precision,
	"duration_s" double precision,
	"elapsed_duration_s" double precision,
	"moving_duration_s" double precision,
	"average_speed" double precision,
	"max_speed" double precision,
	"average_hr" real,
	"max_hr" real,
	"elevation_gain_m" real,
	"elevation_loss_m" real,
	"min_elevation_m" real,
	"max_elevation_m" real,
	"is_elevation_corrected" boolean,
	"steps" integer,
	"average_running_cadence" real,
	"max_running_cadence" real,
	"avg_ground_contact_time_ms" real,
	"avg_vertical_oscillation_cm" real,
	"avg_stride_length_cm" real,
	"avg_vertical_ratio" real,
	"avg_power_w" real,
	"max_power_w" real,
	"norm_power_w" real,
	"activity_training_load" real,
	"aerobic_training_effect" real,
	"anaerobic_training_effect" real,
	"training_effect_label" text,
	"calories" real,
	"lap_count" integer,
	"device_id" text,
	"manufacturer" text,
	"shoe_id" text,
	"surface" text,
	"rpe" real,
	"notes" text,
	"streams_ref" text,
	"raw" jsonb,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "check_ins" (
	"id" text PRIMARY KEY NOT NULL,
	"local_date" date NOT NULL,
	"rpe_yesterday" real,
	"soreness" jsonb,
	"sleep" real,
	"motivation" real,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "races" (
	"id" text PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"name" text NOT NULL,
	"distance" text,
	"role" text NOT NULL,
	"droppable" boolean DEFAULT false NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"week_number" integer,
	"type" text NOT NULL,
	"planned_km" real,
	"planned_duration_s" integer,
	"intended_intensity" text,
	"prescribed_shoe" text,
	"surface" text,
	"time_slot" text,
	"status" text DEFAULT 'planned' NOT NULL,
	"fulfilled_by_activity_id" text,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "weeks" (
	"week_number" integer PRIMARY KEY NOT NULL,
	"monday" date NOT NULL,
	"phase" text NOT NULL,
	"target_km" real,
	"long_run_km" real,
	"ramp_exemption" text,
	"note" text,
	"extra" jsonb
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_week_number_weeks_week_number_fk" FOREIGN KEY ("week_number") REFERENCES "public"."weeks"("week_number") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_local_date_idx" ON "activities" USING btree ("local_date");--> statement-breakpoint
CREATE UNIQUE INDEX "activities_garmin_id_key" ON "activities" USING btree ("garmin_activity_id");--> statement-breakpoint
CREATE INDEX "check_ins_local_date_idx" ON "check_ins" USING btree ("local_date");--> statement-breakpoint
CREATE INDEX "sessions_date_idx" ON "sessions" USING btree ("date");