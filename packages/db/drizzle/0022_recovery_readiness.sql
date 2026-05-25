CREATE TABLE "recovery_check_ins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"soreness" integer NOT NULL,
	"fatigue" integer NOT NULL,
	"mood_score" integer,
	"perceived_stress" integer,
	"source" text DEFAULT 'user_entry' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recovery_context_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"band" text NOT NULL,
	"payload" jsonb NOT NULL,
	"calculated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recovery_check_ins" ADD CONSTRAINT "recovery_check_ins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_context_snapshots" ADD CONSTRAINT "recovery_context_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recovery_check_ins_user_date_idx" ON "recovery_check_ins" USING btree ("user_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "recovery_check_ins_user_date_unique" ON "recovery_check_ins" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "recovery_context_snapshots_user_date_idx" ON "recovery_context_snapshots" USING btree ("user_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "recovery_context_snapshots_user_date_unique" ON "recovery_context_snapshots" USING btree ("user_id","date");
