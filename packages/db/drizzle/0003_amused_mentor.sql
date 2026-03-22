CREATE TABLE "sync_cursors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "source_kind" NOT NULL,
	"cursor_key" varchar(255) NOT NULL,
	"cursor_value" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "status" varchar(50);--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "event_type" varchar(50);--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "is_all_day" boolean;--> statement-breakpoint
CREATE UNIQUE INDEX "sync_cursors_source_cursor_key_unique" ON "sync_cursors" USING btree ("source","cursor_key");