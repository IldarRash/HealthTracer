ALTER TYPE "public"."proposal_intent" ADD VALUE 'save_body_analysis';--> statement-breakpoint
ALTER TYPE "public"."proposal_target_domain" ADD VALUE 'body';--> statement-breakpoint
CREATE TABLE "body_composition_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"source" text DEFAULT 'chat' NOT NULL,
	"fat_pct_min" real,
	"fat_pct_max" real,
	"muscle_tone" text,
	"weight_kg" real,
	"weight_self_reported" integer DEFAULT 1 NOT NULL,
	"strong_groups" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"weak_groups" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"muscle_map" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"fat_pct_trend" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"analysis_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_proposal_id" uuid,
	"disclaimer" text DEFAULT 'примерная визуальная оценка по фото, не замер состава тела и не диагноз' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "body_composition_analyses" ADD CONSTRAINT "body_composition_analyses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "body_composition_analyses" ADD CONSTRAINT "body_composition_analyses_source_proposal_id_ai_proposals_id_fk" FOREIGN KEY ("source_proposal_id") REFERENCES "public"."ai_proposals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "body_composition_analyses_user_id_idx" ON "body_composition_analyses" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "body_composition_analyses_user_date_idx" ON "body_composition_analyses" USING btree ("user_id","date");