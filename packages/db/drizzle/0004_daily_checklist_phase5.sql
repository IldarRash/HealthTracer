ALTER TABLE "daily_checklists" ADD COLUMN "feedback" jsonb;--> statement-breakpoint
ALTER TABLE "daily_checklists" ADD COLUMN "adherence_score" numeric(5, 4);--> statement-breakpoint
CREATE UNIQUE INDEX "daily_checklists_user_date_unique" ON "daily_checklists" USING btree ("user_id","date");
