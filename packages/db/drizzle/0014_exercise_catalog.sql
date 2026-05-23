CREATE TABLE "exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"primary_muscles" jsonb NOT NULL,
	"secondary_muscles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"equipment" jsonb NOT NULL,
	"movement_patterns" jsonb NOT NULL,
	"difficulty" text NOT NULL,
	"instructions" jsonb NOT NULL,
	"safety_notes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" text NOT NULL,
	"validation_status" text DEFAULT 'validated' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"user_id" uuid,
	"dedupe_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exercises_status_idx" ON "exercises" USING btree ("status");--> statement-breakpoint
CREATE INDEX "exercises_normalized_name_idx" ON "exercises" USING btree ("normalized_name");--> statement-breakpoint
CREATE INDEX "exercises_source_idx" ON "exercises" USING btree ("source");--> statement-breakpoint
CREATE INDEX "exercises_user_id_idx" ON "exercises" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "exercises_system_dedupe_key_idx" ON "exercises" USING btree ("dedupe_key") WHERE "user_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "exercises_user_dedupe_key_idx" ON "exercises" USING btree ("user_id","dedupe_key");
