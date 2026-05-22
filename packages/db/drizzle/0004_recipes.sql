ALTER TYPE "public"."proposal_target_domain" ADD VALUE IF NOT EXISTS 'recipe';--> statement-breakpoint
ALTER TYPE "public"."proposal_intent" ADD VALUE IF NOT EXISTS 'recommend_recipes';--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"ingredients" jsonb NOT NULL,
	"preparation_steps" jsonb NOT NULL,
	"servings" integer NOT NULL,
	"estimated_calories" integer NOT NULL,
	"protein_grams" integer NOT NULL,
	"carbs_grams" integer NOT NULL,
	"fat_grams" integer NOT NULL,
	"fiber_grams" integer,
	"meal_types" jsonb NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"restriction_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"allergen_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"prep_minutes" integer,
	"cook_minutes" integer,
	"source" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_recipe_recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"recipe_id" uuid NOT NULL,
	"related_nutrition_plan_revision_id" uuid,
	"reason" text NOT NULL,
	"fit_summary" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"shown_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_recipe_recommendations" ADD CONSTRAINT "user_recipe_recommendations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_recipe_recommendations" ADD CONSTRAINT "user_recipe_recommendations_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_recipe_recommendations" ADD CONSTRAINT "user_recipe_recommendations_related_nutrition_plan_revision_id_nutrition_plan_revisions_id_fk" FOREIGN KEY ("related_nutrition_plan_revision_id") REFERENCES "public"."nutrition_plan_revisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recipes_status_idx" ON "recipes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "user_recipe_recommendations_user_id_idx" ON "user_recipe_recommendations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_recipe_recommendations_user_status_idx" ON "user_recipe_recommendations" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "user_recipe_recommendations_recipe_id_idx" ON "user_recipe_recommendations" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "user_recipe_recommendations_related_revision_idx" ON "user_recipe_recommendations" USING btree ("related_nutrition_plan_revision_id");
