-- Rename recipe macro columns to per-serving names.
-- All values already represent per-serving amounts; this makes the contract explicit.
ALTER TABLE "recipes" RENAME COLUMN "estimated_calories" TO "calories_per_serving";
--> statement-breakpoint
ALTER TABLE "recipes" RENAME COLUMN "protein_grams" TO "protein_grams_per_serving";
--> statement-breakpoint
ALTER TABLE "recipes" RENAME COLUMN "carbs_grams" TO "carbs_grams_per_serving";
--> statement-breakpoint
ALTER TABLE "recipes" RENAME COLUMN "fat_grams" TO "fat_grams_per_serving";
--> statement-breakpoint
ALTER TABLE "recipes" RENAME COLUMN "fiber_grams" TO "fiber_grams_per_serving";
