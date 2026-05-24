CREATE TABLE "habit_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"active_revision_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "habit_plan_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"habit_plan_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"reason" text NOT NULL,
	"source" text DEFAULT 'ai_proposal' NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "habit_completions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"habit_definition_id" uuid NOT NULL,
	"date" date NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"progress_value" real,
	"source_checklist_item_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "habit_plans" ADD CONSTRAINT "habit_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_plan_revisions" ADD CONSTRAINT "habit_plan_revisions_habit_plan_id_habit_plans_id_fk" FOREIGN KEY ("habit_plan_id") REFERENCES "public"."habit_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_completions" ADD CONSTRAINT "habit_completions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "habit_plans_user_id_idx" ON "habit_plans" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "habit_plans_user_active_idx" ON "habit_plans" USING btree ("user_id") WHERE "status" = 'active';--> statement-breakpoint
CREATE INDEX "habit_plan_revisions_plan_id_idx" ON "habit_plan_revisions" USING btree ("habit_plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "habit_plan_revisions_plan_revision_idx" ON "habit_plan_revisions" USING btree ("habit_plan_id", "revision_number");--> statement-breakpoint
CREATE UNIQUE INDEX "habit_plan_revisions_plan_id_id_idx" ON "habit_plan_revisions" USING btree ("habit_plan_id", "id");--> statement-breakpoint
CREATE UNIQUE INDEX "habit_completions_user_definition_date_idx" ON "habit_completions" USING btree ("user_id", "habit_definition_id", "date");--> statement-breakpoint
CREATE INDEX "habit_completions_user_date_idx" ON "habit_completions" USING btree ("user_id", "date");--> statement-breakpoint
ALTER TABLE "habit_plans"
  ADD CONSTRAINT "habit_plans_active_revision_same_plan_fk"
  FOREIGN KEY ("id", "active_revision_id")
  REFERENCES "public"."habit_plan_revisions" ("habit_plan_id", "id")
  ON DELETE RESTRICT
  ON UPDATE NO ACTION;--> statement-breakpoint
ALTER TYPE "public"."proposal_intent" ADD VALUE IF NOT EXISTS 'create_habit_plan';--> statement-breakpoint
ALTER TYPE "public"."proposal_intent" ADD VALUE IF NOT EXISTS 'adapt_habit_plan';
