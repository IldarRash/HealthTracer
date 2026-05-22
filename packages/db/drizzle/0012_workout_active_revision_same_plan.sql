DO $$
DECLARE
  cross_plan_active_revision_count integer;
BEGIN
  SELECT COUNT(*) INTO cross_plan_active_revision_count
  FROM "workout_plans" AS wp
  INNER JOIN "workout_plan_revisions" AS wpr
    ON wpr."id" = wp."active_revision_id"
  WHERE wp."active_revision_id" IS NOT NULL
    AND wpr."workout_plan_id" <> wp."id";

  IF cross_plan_active_revision_count > 0 THEN
    RAISE EXCEPTION
      'Migration 0012_workout_active_revision_same_plan: found workout_plans.active_revision_id values pointing to revisions owned by a different plan. Repair cross-plan active_revision_id pointers before rerunning migrations.';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "workout_plans"
  DROP CONSTRAINT IF EXISTS "workout_plans_active_revision_id_workout_plan_revisions_id_fk";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workout_plan_revisions_plan_id_id_idx"
  ON "workout_plan_revisions" USING btree ("workout_plan_id", "id");
--> statement-breakpoint
ALTER TABLE "workout_plans"
  ADD CONSTRAINT "workout_plans_active_revision_same_plan_fk"
  FOREIGN KEY ("id", "active_revision_id")
  REFERENCES "public"."workout_plan_revisions" ("workout_plan_id", "id")
  ON DELETE RESTRICT
  ON UPDATE NO ACTION;
