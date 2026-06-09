-- Demo nutrition plan with a 7-day weekly matrix for local dev / C2 week-plan rendering.
-- Safe to re-run: upserts are scoped to the fixed plan/revision IDs.
-- Requires a user row with id 'b0000001-0000-4000-8000-000000000001' (or adjust
-- the user_id to match a local dev user).  The seed is intentionally owner-agnostic
-- at the SQL level — it inserts with the well-known dev user UUID used by other
-- seed scripts.  Weekly kcal values are approximate estimates only.

-- Only insert if user exists (safe no-op when not found).
DO $$
DECLARE
  v_plan_id   uuid := 'c2000001-0000-4000-8000-000000000001';
  v_rev_id    uuid := 'c2000001-0000-4000-8000-000000000002';
  v_user_id   uuid := 'b0000001-0000-4000-8000-000000000001';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = v_user_id) THEN
    RAISE NOTICE 'Demo user % not found — skipping nutrition week-plan seed.', v_user_id;
    RETURN;
  END IF;

  -- Upsert plan row.
  INSERT INTO nutrition_plans (id, user_id, active_revision_id, status)
  VALUES (
    v_plan_id,
    v_user_id,
    v_rev_id,
    'active'
  )
  ON CONFLICT (id) DO UPDATE
    SET active_revision_id = EXCLUDED.active_revision_id,
        updated_at          = now();

  -- Upsert revision with weekly matrix payload.
  INSERT INTO nutrition_plan_revisions (id, nutrition_plan_id, revision_number, reason, source, payload)
  VALUES (
    v_rev_id,
    v_plan_id,
    8,
    'Demo weekly plan seed — v8 with full 7-day matrix',
    'seed',
    '{
      "title": "Balanced weekly nutrition base",
      "summary": "A consistent whole-foods plan with a structured 7-day matrix. Calorie figures are approximate estimates.",
      "caloriesPerDay": 2200,
      "proteinGrams": 140,
      "carbsGrams": 220,
      "fatGrams": 70,
      "hydrationLiters": 2.5,
      "mealStructure": [
        { "label": "Завтрак",  "timingHint": "07:30", "kcal": 450, "dish": "Овсянка + яйца" },
        { "label": "Обед",     "timingHint": "13:00", "kcal": 650, "dish": "Индейка, гречка" },
        { "label": "Перекус",  "timingHint": "16:00", "kcal": 250, "dish": "Творог, ягоды" },
        { "label": "Ужин",     "timingHint": "19:30", "kcal": 600, "dish": "Треска, овощи" }
      ],
      "preferences": ["Цельные продукты", "Меньше сахара"],
      "restrictions": [],
      "allergies": ["Орехи — только без арахиса"],
      "notes": ["Калории в коридоре ±10% от цели — это норма."],
      "weeklyPlan": [
        { "weekday": 1, "breakfast": "Овсянка + яйца", "lunch": "Индейка, гречка",  "snack": "Творог, ягоды",  "dinner": "Треска, овощи",    "kcal": 2040 },
        { "weekday": 2, "breakfast": "Яичница, тост",  "lunch": "Куриный суп",      "snack": "Яблоко",         "dinner": "Говядина, рис",    "kcal": 2100 },
        { "weekday": 3, "breakfast": "Гречка, яйца",   "lunch": "Лосось, овощи",    "snack": "Кефир",          "dinner": "Куриная грудка",   "kcal": 2050 },
        { "weekday": 4, "breakfast": "Омлет, хлеб",    "lunch": "Тефтели, картофель","snack": "Творог",         "dinner": "Минтай, брокколи", "kcal": 2200 },
        { "weekday": 5, "breakfast": "Овсянка, банан",  "lunch": "Индейка, булгур",  "snack": "Орех-микс*",     "dinner": "Куриное филе",     "kcal": 2080 },
        { "weekday": 6, "breakfast": "Блины, ягоды",    "lunch": "Говядина, гречка", "snack": "Протеиновый батончик", "dinner": "Лосось, рис", "kcal": 2400 },
        { "weekday": 7, "breakfast": "Яичница, томаты", "lunch": "Куриный бульон",   "snack": "Кефир, фрукты",  "dinner": "Запечённые овощи", "kcal": 1950 }
      ]
    }'::jsonb
  )
  ON CONFLICT (id) DO UPDATE
    SET payload = EXCLUDED.payload,
        reason  = EXCLUDED.reason;

  RAISE NOTICE 'Demo nutrition week-plan seed applied (plan %, rev %).', v_plan_id, v_rev_id;
END $$;
