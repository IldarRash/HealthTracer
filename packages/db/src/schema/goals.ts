import { sql } from "drizzle-orm";
import {
  date,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const goalTypeEnum = pgEnum("goal_type", [
  "fat_loss",
  "muscle_gain",
  "maintenance",
  "endurance",
  "general_wellness",
]);

export const goalStatusEnum = pgEnum("goal_status", [
  "active",
  "paused",
  "completed",
  "archived",
]);

export const goalPriorityEnum = pgEnum("goal_priority", ["primary", "secondary"]);

export const goalHorizonEnum = pgEnum("goal_horizon", ["quarterly", "weekly", "daily"]);

export const goals = pgTable(
  "goals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: goalTypeEnum("type").notNull(),
    status: goalStatusEnum("status").notNull().default("active"),
    priority: goalPriorityEnum("priority").notNull().default("secondary"),
    title: text("title").notNull(),
    target: jsonb("target").$type<Record<string, unknown>>().notNull().default({}),
    horizon: goalHorizonEnum("horizon"),
    parentGoalId: uuid("parent_goal_id").references((): AnyPgColumn => goals.id, {
      onDelete: "set null",
    }),
    weekStart: date("week_start"),
    startDate: date("start_date"),
    targetDate: date("target_date"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("goals_user_id_idx").on(table.userId),
    userStatusIdx: index("goals_user_status_idx").on(table.userId, table.status),
    parentGoalIdx: index("goals_parent_goal_id_idx").on(table.parentGoalId),
    userActiveQuarterlyIdx: uniqueIndex("goals_user_active_quarterly_idx")
      .on(table.userId)
      .where(sql`${table.status} = 'active' AND ${table.horizon} = 'quarterly'`),
  }),
);
