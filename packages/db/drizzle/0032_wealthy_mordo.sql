ALTER TYPE "public"."proposal_intent" ADD VALUE 'log_workout_activity';--> statement-breakpoint
ALTER TABLE "workout_sessions" ALTER COLUMN "workout_plan_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "workout_sessions" ALTER COLUMN "workout_plan_revision_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD COLUMN "source" text DEFAULT 'planned' NOT NULL;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD COLUMN "activity_type" text;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD COLUMN "estimated_calories" integer;