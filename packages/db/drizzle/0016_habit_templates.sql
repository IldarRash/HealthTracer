CREATE TABLE "habit_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"default_target" jsonb NOT NULL,
	"target_constraints" jsonb NOT NULL,
	"default_schedule" jsonb NOT NULL,
	"linked_source_hint" text,
	"default_required" boolean DEFAULT true NOT NULL,
	"default_time_of_day_hint" text,
	"coaching_note_default" text,
	"source" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "habit_templates_slug_idx" ON "habit_templates" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "habit_templates_status_idx" ON "habit_templates" USING btree ("status");
