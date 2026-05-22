CREATE TABLE "nutrition_adherence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"hydration_liters_consumed" real,
	"meal_completion" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"target_completion" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nutrition_adherence" ADD CONSTRAINT "nutrition_adherence_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "nutrition_adherence_user_date_idx" ON "nutrition_adherence" USING btree ("user_id","date");
