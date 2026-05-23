ALTER TABLE "recipes" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "external_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "recipes_provider_external_id_idx" ON "recipes" USING btree ("provider","external_id");
