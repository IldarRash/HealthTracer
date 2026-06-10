-- Guard: reject if any user already has multiple active nutrition plans.
DO $$
DECLARE
  duplicate_active_plan_users integer;
BEGIN
  SELECT COUNT(*) INTO duplicate_active_plan_users
  FROM (
    SELECT 1
    FROM "nutrition_plans"
    WHERE "status" = 'active'
    GROUP BY "user_id"
    HAVING COUNT(*) > 1
  ) AS duplicates;

  IF duplicate_active_plan_users > 0 THEN
    RAISE EXCEPTION
      'Migration 0035_nutrition_plan_invariants: found multiple active nutrition_plans for at least one user. Archive or merge duplicate active plans before rerunning migrations.';
  END IF;

  CREATE UNIQUE INDEX IF NOT EXISTS "nutrition_plans_user_active_idx"
    ON "nutrition_plans" USING btree ("user_id")
    WHERE "status" = 'active';
END $$;
--> statement-breakpoint
-- Guard: reject if any plan already has duplicate revision_number values.
DO $$
DECLARE
  duplicate_revision_groups integer;
BEGIN
  SELECT COUNT(*) INTO duplicate_revision_groups
  FROM (
    SELECT 1
    FROM "nutrition_plan_revisions"
    GROUP BY "nutrition_plan_id", "revision_number"
    HAVING COUNT(*) > 1
  ) AS duplicates;

  IF duplicate_revision_groups > 0 THEN
    RAISE EXCEPTION
      'Migration 0035_nutrition_plan_invariants: found duplicate nutrition_plan_revisions.revision_number values for the same nutrition_plan_id. Deduplicate revision numbers before rerunning migrations.';
  END IF;

  CREATE UNIQUE INDEX IF NOT EXISTS "nutrition_plan_revisions_plan_revision_idx"
    ON "nutrition_plan_revisions" USING btree ("nutrition_plan_id", "revision_number");
END $$;
--> statement-breakpoint
-- Composite (plan_id, id) unique index — prerequisite for the same-plan FK below.
CREATE UNIQUE INDEX IF NOT EXISTS "nutrition_plan_revisions_plan_id_id_idx"
  ON "nutrition_plan_revisions" USING btree ("nutrition_plan_id", "id");
--> statement-breakpoint
-- Guard: reject if any active_revision_id points across plan boundaries.
DO $$
DECLARE
  cross_plan_active_revision_count integer;
BEGIN
  SELECT COUNT(*) INTO cross_plan_active_revision_count
  FROM "nutrition_plans" AS np
  INNER JOIN "nutrition_plan_revisions" AS npr
    ON npr."id" = np."active_revision_id"
  WHERE np."active_revision_id" IS NOT NULL
    AND npr."nutrition_plan_id" <> np."id";

  IF cross_plan_active_revision_count > 0 THEN
    RAISE EXCEPTION
      'Migration 0035_nutrition_plan_invariants: found nutrition_plans.active_revision_id values pointing to revisions owned by a different plan. Repair cross-plan active_revision_id pointers before rerunning migrations.';
  END IF;
END $$;
--> statement-breakpoint
-- Drop the loose single-column FK on active_revision_id if it exists (not yet present,
-- but guard with IF EXISTS for idempotency across environments).
ALTER TABLE "nutrition_plans"
  DROP CONSTRAINT IF EXISTS "nutrition_plans_active_revision_id_nutrition_plan_revisions_id_fk";
--> statement-breakpoint
-- Same-plan composite FK: active_revision_id must reference a revision owned by this plan.
ALTER TABLE "nutrition_plans"
  ADD CONSTRAINT "nutrition_plans_active_revision_same_plan_fk"
  FOREIGN KEY ("id", "active_revision_id")
  REFERENCES "public"."nutrition_plan_revisions" ("nutrition_plan_id", "id")
  ON DELETE RESTRICT
  ON UPDATE NO ACTION;
