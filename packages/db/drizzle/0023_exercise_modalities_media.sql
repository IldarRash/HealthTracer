ALTER TABLE "exercises" ADD COLUMN "modalities" jsonb DEFAULT '["strength"]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "media" jsonb DEFAULT '{"refs":[],"fallbackLabel":null}'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "exercises"
SET "modalities" = '["conditioning"]'::jsonb
WHERE "movement_patterns" @> '["cardio"]'::jsonb;--> statement-breakpoint
UPDATE "exercises"
SET "modalities" = '["mobility","wellness"]'::jsonb
WHERE "normalized_name" IN ('cat cow', 'world greatest stretch', '90 90 hip switch', 'foam roll quads');--> statement-breakpoint
UPDATE "exercises"
SET "modalities" = '["yoga","mobility"]'::jsonb
WHERE "normalized_name" IN ('downward dog', 'warrior ii', 'child pose');--> statement-breakpoint
UPDATE "exercises"
SET "modalities" = '["plyometrics","athletic_performance"]'::jsonb
WHERE "normalized_name" IN ('box jump', 'broad jump', 'depth jump', 'skater hop');--> statement-breakpoint
UPDATE "exercises"
SET "modalities" = '["athletic_performance","conditioning"]'::jsonb
WHERE "normalized_name" IN ('medicine ball slam', 'agility ladder drill');--> statement-breakpoint
UPDATE "exercises"
SET "modalities" = '["wellness","mobility"]'::jsonb
WHERE "normalized_name" IN ('diaphragmatic breathing', 'gentle neck mobility');--> statement-breakpoint
UPDATE "exercises"
SET "media" = '{"refs":[],"fallbackLabel":"Demonstration coming soon"}'::jsonb
WHERE "media" = '{"refs":[],"fallbackLabel":null}'::jsonb;
