ALTER TABLE "recipes" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "dedupe_key" text;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recipes_user_id_idx" ON "recipes" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recipes_user_dedupe_key_idx" ON "recipes" USING btree ("user_id","dedupe_key") WHERE "recipes"."user_id" IS NOT NULL;