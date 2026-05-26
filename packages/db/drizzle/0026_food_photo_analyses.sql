CREATE TABLE "food_photo_analyses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"image_ref_id" uuid NOT NULL,
	"mime_type" text,
	"storage_key" text,
	"provenance_source" text NOT NULL,
	"provider_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "food_photo_analyses" ADD CONSTRAINT "food_photo_analyses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "food_photo_analyses_user_image_ref_idx" ON "food_photo_analyses" USING btree ("user_id","image_ref_id");--> statement-breakpoint
CREATE INDEX "food_photo_analyses_user_id_idx" ON "food_photo_analyses" USING btree ("user_id");
