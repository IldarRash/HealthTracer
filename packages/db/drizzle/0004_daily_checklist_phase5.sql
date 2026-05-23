ALTER TABLE "daily_checklists" ADD COLUMN IF NOT EXISTS "feedback" jsonb;--> statement-breakpoint
ALTER TABLE "daily_checklists" ADD COLUMN IF NOT EXISTS "adherence_score" numeric(5, 4);--> statement-breakpoint
DO $$
BEGIN
  DELETE FROM "daily_checklists" AS dc
  WHERE dc."id" IN (
    SELECT ranked."id"
    FROM (
      SELECT
        "id",
        ROW_NUMBER() OVER (
          PARTITION BY "user_id", "date"
          ORDER BY "updated_at" DESC, "created_at" DESC, "id" DESC
        ) AS row_num
      FROM "daily_checklists"
    ) AS ranked
    WHERE ranked.row_num > 1
  );
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "daily_checklists_user_date_unique" ON "daily_checklists" USING btree ("user_id","date");
