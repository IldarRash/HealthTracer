CREATE TABLE "weekly_progress_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"week_end" date NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"data_status" text NOT NULL,
	"source_aggregates" jsonb NOT NULL,
	"deferred_domains" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"user_message" text NOT NULL,
	"superseded_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trend_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"summary_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"week_end" date NOT NULL,
	"domain" text NOT NULL,
	"trend_type" text NOT NULL,
	"direction" text NOT NULL,
	"data_sufficiency" text NOT NULL,
	"supporting_aggregate" jsonb NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "weekly_progress_summaries" ADD CONSTRAINT "weekly_progress_summaries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trend_observations" ADD CONSTRAINT "trend_observations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trend_observations" ADD CONSTRAINT "trend_observations_summary_id_weekly_progress_summaries_id_fk" FOREIGN KEY ("summary_id") REFERENCES "public"."weekly_progress_summaries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "weekly_progress_summaries_user_week_idx" ON "weekly_progress_summaries" USING btree ("user_id","week_start");--> statement-breakpoint
CREATE INDEX "weekly_progress_summaries_user_generated_idx" ON "weekly_progress_summaries" USING btree ("user_id","generated_at");--> statement-breakpoint
CREATE INDEX "trend_observations_summary_id_idx" ON "trend_observations" USING btree ("summary_id");--> statement-breakpoint
CREATE INDEX "trend_observations_user_week_domain_idx" ON "trend_observations" USING btree ("user_id","week_start","domain");
