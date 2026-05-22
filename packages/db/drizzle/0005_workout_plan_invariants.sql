DO $$
DECLARE
  duplicate_revision_groups integer;
BEGIN
  SELECT COUNT(*) INTO duplicate_revision_groups
  FROM (
    SELECT 1
    FROM "workout_plan_revisions"
    GROUP BY "workout_plan_id", "revision_number"
    HAVING COUNT(*) > 1
  ) AS duplicates;

  IF duplicate_revision_groups > 0 THEN
    RAISE EXCEPTION
      'Migration 0005_workout_plan_invariants: found duplicate workout_plan_revisions.revision_number values for the same workout_plan_id. Deduplicate revision numbers before rerunning migrations.';
  END IF;

  CREATE UNIQUE INDEX IF NOT EXISTS "workout_plan_revisions_plan_revision_idx"
    ON "workout_plan_revisions" USING btree ("workout_plan_id", "revision_number");
END $$;
--> statement-breakpoint
DO $$
DECLARE
  duplicate_active_plan_users integer;
BEGIN
  SELECT COUNT(*) INTO duplicate_active_plan_users
  FROM (
    SELECT 1
    FROM "workout_plans"
    WHERE "status" = 'active'
    GROUP BY "user_id"
    HAVING COUNT(*) > 1
  ) AS duplicates;

  IF duplicate_active_plan_users > 0 THEN
    RAISE EXCEPTION
      'Migration 0005_workout_plan_invariants: found multiple active workout_plans for at least one user. Archive or merge duplicate active plans before rerunning migrations.';
  END IF;

  CREATE UNIQUE INDEX IF NOT EXISTS "workout_plans_user_active_idx"
    ON "workout_plans" USING btree ("user_id")
    WHERE "status" = 'active';
END $$;
--> statement-breakpoint
DO $$
DECLARE
  orphaned_active_revision_plans integer;
BEGIN
  SELECT COUNT(*) INTO orphaned_active_revision_plans
  FROM "workout_plans" AS wp
  WHERE wp."active_revision_id" IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM "workout_plan_revisions" AS wpr
      WHERE wpr."id" = wp."active_revision_id"
    );

  IF orphaned_active_revision_plans > 0 THEN
    RAISE EXCEPTION
      'Migration 0005_workout_plan_invariants: found workout_plans.active_revision_id values that do not reference an existing revision. Clear or repair orphan active_revision_id values before rerunning migrations.';
  END IF;

  ALTER TABLE "workout_plans"
    ADD CONSTRAINT "workout_plans_active_revision_id_workout_plan_revisions_id_fk"
    FOREIGN KEY ("active_revision_id")
    REFERENCES "public"."workout_plan_revisions"("id")
    ON DELETE SET NULL
    ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
