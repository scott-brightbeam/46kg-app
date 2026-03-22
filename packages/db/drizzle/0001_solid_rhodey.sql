CREATE TABLE "healthkit_workouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ingest_event_id" uuid,
	"source_record_id" varchar(255) NOT NULL,
	"workout_name" varchar(255) NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"duration_seconds" integer,
	"location" varchar(100),
	"is_indoor" boolean,
	"distance_value" numeric(12, 3),
	"distance_unit" varchar(32),
	"active_energy_value" numeric(12, 3),
	"active_energy_unit" varchar(32),
	"total_energy_value" numeric(12, 3),
	"total_energy_unit" varchar(32),
	"avg_heart_rate" numeric(8, 2),
	"max_heart_rate" numeric(8, 2),
	"payload" jsonb NOT NULL,
	"superseded_by" uuid,
	"canonical" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "healthkit_workouts" ADD CONSTRAINT "healthkit_workouts_ingest_event_id_ingest_events_id_fk" FOREIGN KEY ("ingest_event_id") REFERENCES "ingest_events"("id") ON DELETE no action ON UPDATE no action;