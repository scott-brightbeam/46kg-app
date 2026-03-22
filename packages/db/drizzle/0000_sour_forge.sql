CREATE TYPE "public"."access_category" AS ENUM('exercise', 'nutrition', 'weight', 'engagement_status');--> statement-breakpoint
CREATE TYPE "public"."day_of_week" AS ENUM('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday');--> statement-breakpoint
CREATE TYPE "public"."engagement_status_value" AS ENUM('green', 'amber', 'red');--> statement-breakpoint
CREATE TYPE "public"."meal_logging_method" AS ENUM('photo', 'barcode', 'text', 'quick_log');--> statement-breakpoint
CREATE TYPE "public"."score_type" AS ENUM('workout_adherence', 'effort', 'recovery', 'consistency');--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('health_auto_export', 'hevy', 'strava', 'google_calendar', 'telegram', 'manual');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'trainer', 'nutritionist');--> statement-breakpoint
CREATE TABLE "access_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_user_id" uuid NOT NULL,
	"practitioner_user_id" uuid NOT NULL,
	"category" "access_category" NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_by_user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "access_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practitioner_user_id" uuid NOT NULL,
	"subject_user_id" uuid NOT NULL,
	"category" "access_category" NOT NULL,
	"request_path" varchar(255) NOT NULL,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ingest_event_id" uuid,
	"source_record_id" varchar(255) NOT NULL,
	"external_calendar_id" varchar(255) NOT NULL,
	"title" varchar(255) NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checkin_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"responded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"field" varchar(100) NOT NULL,
	"value_text" text NOT NULL,
	"source_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" varchar(50) NOT NULL,
	"channel" varchar(50) DEFAULT 'telegram' NOT NULL,
	"content" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_date" timestamp with time zone NOT NULL,
	"summary" text NOT NULL,
	"workout_plan" jsonb,
	"meal_plan" jsonb,
	"recovery_context" jsonb,
	"source_snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dashboard_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"config_key" varchar(100) NOT NULL,
	"config_value" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dashboard_config_config_key_unique" UNIQUE("config_key")
);
--> statement-breakpoint
CREATE TABLE "day_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day_of_week" "day_of_week" NOT NULL,
	"activity_type" varchar(100) NOT NULL,
	"intensity" varchar(50),
	"preferred_time" varchar(50),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dedup_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canonical_source_table" varchar(100) NOT NULL,
	"canonical_record_id" uuid NOT NULL,
	"superseded_source_table" varchar(100) NOT NULL,
	"superseded_record_id" uuid NOT NULL,
	"overlap_score" numeric(5, 2) NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "engagement_statuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"effective_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "engagement_status_value" NOT NULL,
	"reasons" jsonb NOT NULL,
	"created_by" "source_kind" DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "health_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ingest_event_id" uuid,
	"metric_type" varchar(100) NOT NULL,
	"source_record_id" varchar(255),
	"observed_at" timestamp with time zone NOT NULL,
	"unit" varchar(50),
	"value_numeric" numeric(12, 4),
	"payload" jsonb NOT NULL,
	"superseded_by" uuid,
	"canonical" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hevy_workouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ingest_event_id" uuid,
	"source_record_id" varchar(255) NOT NULL,
	"routine_name" varchar(255),
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"duration_seconds" integer,
	"payload" jsonb NOT NULL,
	"superseded_by" uuid,
	"canonical" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingest_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "source_kind" NOT NULL,
	"source_record_id" varchar(255),
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb NOT NULL,
	"validation_status" varchar(50) NOT NULL,
	"processing_status" varchar(50) NOT NULL,
	"replayable" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meal_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"description" text NOT NULL,
	"calories" numeric(8, 2) NOT NULL,
	"protein" numeric(8, 2),
	"carbs" numeric(8, 2),
	"fat" numeric(8, 2),
	"fibre" numeric(8, 2),
	"confidence" numeric(5, 2),
	"method" "meal_logging_method" NOT NULL,
	"source_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meal_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"week_start" timestamp with time zone NOT NULL,
	"plan" jsonb NOT NULL,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metric_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"score_type" "score_type" NOT NULL,
	"version" varchar(50) NOT NULL,
	"formula" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pantry_inventory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_name" varchar(255) NOT NULL,
	"quantity_text" varchar(255),
	"storage_area" varchar(100),
	"expires_at" timestamp with time zone,
	"source_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processed_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "source_kind" NOT NULL,
	"external_update_id" varchar(255) NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload_hash" varchar(128)
);
--> statement-breakpoint
CREATE TABLE "scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"score_date" timestamp with time zone NOT NULL,
	"score_type" "score_type" NOT NULL,
	"value" numeric(8, 3) NOT NULL,
	"confidence" numeric(5, 2),
	"formula_version" varchar(50) NOT NULL,
	"provenance" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shopping_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meal_plan_id" uuid,
	"list_text" text NOT NULL,
	"structured_items" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_freshness" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "source_kind" NOT NULL,
	"last_successful_ingest_at" timestamp with time zone,
	"last_attempted_ingest_at" timestamp with time zone,
	"last_status" varchar(50),
	"last_error" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_freshness_source_unique" UNIQUE("source")
);
--> statement-breakpoint
CREATE TABLE "source_precedence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_type" varchar(100) NOT NULL,
	"canonical_source" "source_kind" NOT NULL,
	"fallback_source" "source_kind",
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_precedence_activity_type_unique" UNIQUE("activity_type")
);
--> statement-breakpoint
CREATE TABLE "strava_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ingest_event_id" uuid,
	"source_record_id" varchar(255) NOT NULL,
	"activity_type" varchar(100) NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"distance_meters" numeric(12, 2),
	"payload" jsonb NOT NULL,
	"superseded_by" uuid,
	"canonical" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(320) NOT NULL,
	"display_name" varchar(255) NOT NULL,
	"role" "user_role" NOT NULL,
	"password_hash" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "weight_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"kilograms" numeric(6, 2) NOT NULL,
	"source" "source_kind" NOT NULL,
	"flagged" boolean DEFAULT false NOT NULL,
	"source_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_subject_user_id_users_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_practitioner_user_id_users_id_fk" FOREIGN KEY ("practitioner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_log" ADD CONSTRAINT "access_log_practitioner_user_id_users_id_fk" FOREIGN KEY ("practitioner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_log" ADD CONSTRAINT "access_log_subject_user_id_users_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_ingest_event_id_ingest_events_id_fk" FOREIGN KEY ("ingest_event_id") REFERENCES "public"."ingest_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_metrics" ADD CONSTRAINT "health_metrics_ingest_event_id_ingest_events_id_fk" FOREIGN KEY ("ingest_event_id") REFERENCES "public"."ingest_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hevy_workouts" ADD CONSTRAINT "hevy_workouts_ingest_event_id_ingest_events_id_fk" FOREIGN KEY ("ingest_event_id") REFERENCES "public"."ingest_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_lists" ADD CONSTRAINT "shopping_lists_meal_plan_id_meal_plans_id_fk" FOREIGN KEY ("meal_plan_id") REFERENCES "public"."meal_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strava_activities" ADD CONSTRAINT "strava_activities_ingest_event_id_ingest_events_id_fk" FOREIGN KEY ("ingest_event_id") REFERENCES "public"."ingest_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "processed_updates_provider_external_update_unique" ON "processed_updates" USING btree ("provider","external_update_id");