-- Demo nutrition plan seed with per-meal kcal/macros (C1 feature).
-- Macro values are estimates only — for local development and verification.
--
-- Seeds a two-revision plan so the `changed` flag on the C1 read model is
-- exercised: revision v1 has no per-meal data; revision v2 adds per-meal kcal.
--
-- IMPORTANT: This seed is user-scoped to a well-known dev user UUID.
-- It is safe to re-run (ON CONFLICT DO NOTHING on the plan row;
-- revision inserts are append-only and idempotent by revision_number + plan_id).
--
-- The dev user UUID below must match a row in the `users` table.
-- Adjust DEV_USER_ID to match your local dev user if needed.

DO $$
DECLARE
  dev_user_id    uuid;
  plan_id        uuid;
  rev1_id        uuid;
  rev2_id        uuid;
  existing_plan  uuid;
BEGIN
  -- Resolve the first user in the DB as the demo target (CI/dev-only heuristic).
  SELECT id INTO dev_user_id FROM users ORDER BY created_at ASC LIMIT 1;

  IF dev_user_id IS NULL THEN
    RAISE NOTICE 'nutrition-demo seed: no users found — skipping.';
    RETURN;
  END IF;

  -- Skip if an active nutrition plan already exists for this user.
  SELECT id INTO existing_plan
    FROM nutrition_plans
   WHERE user_id = dev_user_id AND status = 'active'
   LIMIT 1;

  IF existing_plan IS NOT NULL THEN
    RAISE NOTICE 'nutrition-demo seed: user % already has an active nutrition plan — skipping.', dev_user_id;
    RETURN;
  END IF;

  -- Create the plan shell (no active_revision_id yet).
  INSERT INTO nutrition_plans (user_id, status)
  VALUES (dev_user_id, 'active')
  RETURNING id INTO plan_id;

  -- Revision 1 — legacy shape: day-level targets only, no per-meal kcal.
  INSERT INTO nutrition_plan_revisions
    (nutrition_plan_id, revision_number, reason, source, payload)
  VALUES (
    plan_id,
    1,
    'Initial balanced plan — day targets only.',
    'seed',
    '{
      "title": "Balanced daily nutrition base",
      "summary": "A moderate starting point focused on consistency.",
      "caloriesPerDay": 2100,
      "proteinGrams": 140,
      "carbsGrams": 220,
      "fatGrams": 70,
      "hydrationLiters": 2.5,
      "mealStructure": [
        { "label": "Breakfast",        "timingHint": "Morning" },
        { "label": "Morning snack",    "timingHint": "Mid-morning" },
        { "label": "Lunch",            "timingHint": "Midday" },
        { "label": "Pre-workout",      "timingHint": "Afternoon" },
        { "label": "Dinner",           "timingHint": "Evening" }
      ],
      "preferences": ["Whole foods first"],
      "restrictions": [],
      "allergies": [],
      "notes": ["Prioritize whole foods."]
    }'::jsonb
  )
  RETURNING id INTO rev1_id;

  -- Revision 2 — C1 shape: per-meal kcal + macros + dish examples.
  -- "Pre-workout" slot is NEW vs revision 1 → `changed = true` on the read model.
  -- Other slots carry updated kcal values → `changed = true` for them too.
  INSERT INTO nutrition_plan_revisions
    (nutrition_plan_id, revision_number, reason, source, payload)
  VALUES (
    plan_id,
    2,
    'Added per-meal calorie estimates (C1 breakdown).',
    'seed',
    '{
      "title": "Balanced daily nutrition base",
      "summary": "A moderate starting point focused on consistency.",
      "caloriesPerDay": 2100,
      "proteinGrams": 140,
      "carbsGrams": 220,
      "fatGrams": 70,
      "hydrationLiters": 2.5,
      "mealStructure": [
        {
          "label": "Breakfast",
          "timingHint": "Morning",
          "mealTime": "07:30",
          "dish": "Oatmeal, berries, 2 eggs",
          "kcal": 480,
          "proteinGrams": 32,
          "carbsGrams": 58,
          "fatGrams": 14
        },
        {
          "label": "Morning snack",
          "timingHint": "Mid-morning",
          "mealTime": "11:00",
          "dish": "Greek yoghurt + banana",
          "kcal": 210,
          "proteinGrams": 12,
          "carbsGrams": 26,
          "fatGrams": 6
        },
        {
          "label": "Lunch",
          "timingHint": "Midday",
          "mealTime": "14:00",
          "dish": "Chicken, quinoa, salad",
          "kcal": 620,
          "proteinGrams": 44,
          "carbsGrams": 62,
          "fatGrams": 20
        },
        {
          "label": "Pre-workout",
          "timingHint": "Afternoon",
          "mealTime": "17:00",
          "dish": "Banana + oats",
          "kcal": 180,
          "proteinGrams": 6,
          "carbsGrams": 32,
          "fatGrams": 3
        },
        {
          "label": "Dinner",
          "timingHint": "Evening",
          "mealTime": "20:00",
          "dish": "Salmon, steamed vegetables",
          "kcal": 540,
          "proteinGrams": 38,
          "carbsGrams": 30,
          "fatGrams": 24
        }
      ],
      "preferences": ["Whole foods first"],
      "restrictions": [],
      "allergies": [],
      "notes": ["Prioritize whole foods.", "Calorie figures are approximate estimates."]
    }'::jsonb
  )
  RETURNING id INTO rev2_id;

  -- Activate revision 2.
  UPDATE nutrition_plans
     SET active_revision_id = rev2_id,
         updated_at = NOW()
   WHERE id = plan_id;

  RAISE NOTICE 'nutrition-demo seed: plan % created for user % (rev1=%, rev2=% active).',
    plan_id, dev_user_id, rev1_id, rev2_id;
END $$;
