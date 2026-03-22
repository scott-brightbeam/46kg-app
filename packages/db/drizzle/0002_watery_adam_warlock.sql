CREATE TYPE "public"."oauth_provider" AS ENUM('strava', 'google_calendar');--> statement-breakpoint
CREATE TABLE "oauth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "oauth_provider" NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"token_type" varchar(50),
	"scope" text,
	"expires_at" timestamp with time zone,
	"subject_id" varchar(255),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_tokens_provider_unique" UNIQUE("provider")
);
--> statement-breakpoint
ALTER TABLE "strava_activities" ADD COLUMN "name" varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE "strava_activities" ADD COLUMN "sport_type" varchar(100);--> statement-breakpoint
ALTER TABLE "strava_activities" ADD COLUMN "start_date_local" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "strava_activities" ADD COLUMN "timezone" varchar(128);--> statement-breakpoint
ALTER TABLE "strava_activities" ADD COLUMN "moving_time_seconds" integer;--> statement-breakpoint
ALTER TABLE "strava_activities" ADD COLUMN "elapsed_time_seconds" integer;--> statement-breakpoint
ALTER TABLE "strava_activities" ADD COLUMN "total_elevation_gain_meters" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "strava_activities" ADD COLUMN "average_speed" numeric(12, 3);--> statement-breakpoint
ALTER TABLE "strava_activities" ADD COLUMN "max_speed" numeric(12, 3);--> statement-breakpoint
ALTER TABLE "strava_activities" ADD COLUMN "average_heartrate" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "strava_activities" ADD COLUMN "max_heartrate" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "strava_activities" ADD COLUMN "summary_polyline" text;--> statement-breakpoint
CREATE UNIQUE INDEX "strava_activities_source_record_id_unique" ON "strava_activities" USING btree ("source_record_id");