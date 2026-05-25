CREATE TABLE "wellbeing_check_ins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"mood_score" integer NOT NULL,
	"stress_score" integer NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note" text,
	"source" text DEFAULT 'user_entry' NOT NULL,
	"crisis_flag_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wellbeing_check_ins" ADD CONSTRAINT "wellbeing_check_ins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wellbeing_check_ins_user_date_idx" ON "wellbeing_check_ins" USING btree ("user_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "wellbeing_check_ins_user_date_unique" ON "wellbeing_check_ins" USING btree ("user_id","date");
