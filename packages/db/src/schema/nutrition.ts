import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const nutritionPlans = pgTable(
  "nutrition_plans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    activeRevisionId: uuid("active_revision_id"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("nutrition_plans_user_id_idx").on(table.userId),
  }),
);

export const nutritionPlanRevisions = pgTable(
  "nutrition_plan_revisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    nutritionPlanId: uuid("nutrition_plan_id")
      .notNull()
      .references(() => nutritionPlans.id, { onDelete: "cascade" }),
    revisionNumber: integer("revision_number").notNull(),
    reason: text("reason").notNull(),
    source: text("source").notNull().default("ai_proposal"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    nutritionPlanIdIdx: index("nutrition_plan_revisions_plan_id_idx").on(
      table.nutritionPlanId,
    ),
  }),
);
