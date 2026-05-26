DO $$
BEGIN
  DELETE FROM "workout_sessions" AS ws
  WHERE ws."id" IN (
    SELECT ranked."id"
    FROM (
      SELECT
        "id",
        ROW_NUMBER() OVER (
          PARTITION BY "user_id", "workout_plan_id", "workout_plan_revision_id", "planned_date"
          ORDER BY "updated_at" DESC, "created_at" DESC, "id" DESC
        ) AS row_num
      FROM "workout_sessions"
    ) AS ranked
    WHERE ranked.row_num > 1
  );
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workout_sessions_user_plan_revision_date_unique" ON "workout_sessions" USING btree ("user_id","workout_plan_id","workout_plan_revision_id","planned_date");
