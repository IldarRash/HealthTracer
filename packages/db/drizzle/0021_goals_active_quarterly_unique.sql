CREATE UNIQUE INDEX IF NOT EXISTS "goals_user_active_quarterly_idx" ON "goals" ("user_id") WHERE "status" = 'active' AND "horizon" = 'quarterly';
