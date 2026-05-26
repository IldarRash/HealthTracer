ALTER TYPE "public"."proposal_intent" ADD VALUE IF NOT EXISTS 'capture_wellbeing_checkin';--> statement-breakpoint
ALTER TYPE "public"."proposal_intent" ADD VALUE IF NOT EXISTS 'log_nutrition_incident';--> statement-breakpoint
CREATE TABLE "nutrition_incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"incident_date_time" timestamp with time zone NOT NULL,
	"date" date NOT NULL,
	"items" jsonb NOT NULL,
	"estimated_calories" integer NOT NULL,
	"estimated_macros" jsonb NOT NULL,
	"confidence" text NOT NULL,
	"provenance" jsonb NOT NULL,
	"image_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"user_edits" jsonb,
	"source_proposal_id" uuid,
	"source" text DEFAULT 'ai_proposal' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nutrition_incidents" ADD CONSTRAINT "nutrition_incidents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nutrition_incidents" ADD CONSTRAINT "nutrition_incidents_source_proposal_id_ai_proposals_id_fk" FOREIGN KEY ("source_proposal_id") REFERENCES "public"."ai_proposals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "nutrition_incidents_user_date_idx" ON "nutrition_incidents" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "nutrition_incidents_user_incident_dt_idx" ON "nutrition_incidents" USING btree ("user_id","incident_date_time");
