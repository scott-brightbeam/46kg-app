CREATE TYPE "hevy_event_type" AS ENUM('updated', 'deleted');--> statement-breakpoint
CREATE TABLE "hevy_routines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ingest_event_id" uuid,
	"snapshot_key" varchar(255) NOT NULL,
	"source_record_id" varchar(255) NOT NULL,
	"title" varchar(255) NOT NULL,
	"folder_id" integer,
	"updated_at_remote" timestamp with time zone,
	"created_at_remote" timestamp with time zone,
	"exercise_count" integer,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hevy_workout_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ingest_event_id" uuid,
	"event_key" varchar(255) NOT NULL,
	"event_type" "hevy_event_type" NOT NULL,
	"workout_source_record_id" varchar(255) NOT NULL,
	"event_occurred_at" timestamp with time zone NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hevy_workouts" ADD COLUMN "snapshot_key" varchar(255);--> statement-breakpoint
ALTER TABLE "hevy_workouts" ADD COLUMN "title" varchar(255);--> statement-breakpoint
ALTER TABLE "hevy_workouts" ADD COLUMN "routine_id" varchar(255);--> statement-breakpoint
ALTER TABLE "hevy_workouts" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "hevy_workouts" ADD COLUMN "updated_at_remote" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "hevy_workouts" ADD COLUMN "created_at_remote" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "hevy_workouts" ADD COLUMN "exercise_count" integer;--> statement-breakpoint
ALTER TABLE "hevy_routines" ADD CONSTRAINT "hevy_routines_ingest_event_id_ingest_events_id_fk" FOREIGN KEY ("ingest_event_id") REFERENCES "ingest_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hevy_workout_events" ADD CONSTRAINT "hevy_workout_events_ingest_event_id_ingest_events_id_fk" FOREIGN KEY ("ingest_event_id") REFERENCES "ingest_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hevy_routines_snapshot_key_unique" ON "hevy_routines" USING btree ("snapshot_key");--> statement-breakpoint
CREATE UNIQUE INDEX "hevy_workout_events_event_key_unique" ON "hevy_workout_events" USING btree ("event_key");--> statement-breakpoint
CREATE UNIQUE INDEX "hevy_workouts_snapshot_key_unique" ON "hevy_workouts" USING btree ("snapshot_key");--> statement-breakpoint
UPDATE "hevy_workouts"
SET
	"snapshot_key" = concat("source_record_id", ':legacy:', "id"),
	"title" = coalesce("routine_name", '(untitled workout)')
WHERE "snapshot_key" IS NULL OR "title" IS NULL;--> statement-breakpoint
ALTER TABLE "hevy_workouts" ALTER COLUMN "snapshot_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "hevy_workouts" ALTER COLUMN "title" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "hevy_workouts" DROP COLUMN "routine_name";
