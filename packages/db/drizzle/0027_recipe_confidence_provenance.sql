ALTER TABLE "recipes" ADD COLUMN "confidence" text;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "provenance" jsonb;
