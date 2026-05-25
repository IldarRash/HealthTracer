CREATE TYPE "public"."goal_horizon" AS ENUM('quarterly', 'weekly', 'daily');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "onboarding_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "longevity_direction" jsonb;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "longevity_direction_tags" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "coaching_notes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "onboarding_draft" jsonb;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "horizon" "goal_horizon";--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "parent_goal_id" uuid;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "week_start" date;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_parent_goal_id_goals_id_fk" FOREIGN KEY ("parent_goal_id") REFERENCES "public"."goals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "goals_parent_goal_id_idx" ON "goals" USING btree ("parent_goal_id");
