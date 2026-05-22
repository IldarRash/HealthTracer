import { sql } from "drizzle-orm";
import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

// Same-plan active revision integrity is enforced in migration
// 0012_workout_active_revision_same_plan via composite FK (id, active_revision_id).

export const workoutPlans = pgTable(
  "workout_plans",
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
    userIdIdx: index("workout_plans_user_id_idx").on(table.userId),
    userActiveIdx: uniqueIndex("workout_plans_user_active_idx")
      .on(table.userId)
      .where(sql`${table.status} = 'active'`),
  }),
);

export const workoutPlanRevisions = pgTable(
  "workout_plan_revisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workoutPlanId: uuid("workout_plan_id")
      .notNull()
      .references(() => workoutPlans.id, { onDelete: "cascade" }),
    revisionNumber: integer("revision_number").notNull(),
    reason: text("reason").notNull(),
    source: text("source").notNull().default("ai_proposal"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    workoutPlanIdIdx: index("workout_plan_revisions_plan_id_idx").on(
      table.workoutPlanId,
    ),
    planRevisionNumberIdx: uniqueIndex("workout_plan_revisions_plan_revision_idx").on(
      table.workoutPlanId,
      table.revisionNumber,
    ),
    planIdRevisionIdIdx: uniqueIndex("workout_plan_revisions_plan_id_id_idx").on(
      table.workoutPlanId,
      table.id,
    ),
  }),
);

export const workoutSessions = pgTable(
  "workout_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workoutPlanId: uuid("workout_plan_id")
      .notNull()
      .references(() => workoutPlans.id, { onDelete: "cascade" }),
    workoutPlanRevisionId: uuid("workout_plan_revision_id")
      .notNull()
      .references(() => workoutPlanRevisions.id, { onDelete: "cascade" }),
    plannedDate: date("planned_date").notNull(),
    title: text("title").notNull(),
    status: text("status").notNull().default("planned"),
    exercises: jsonb("exercises").$type<unknown[]>().default([]).notNull(),
    feedback: jsonb("feedback").$type<Record<string, unknown>>().default({}).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userPlannedDateIdx: index("workout_sessions_user_planned_date_idx").on(
      table.userId,
      table.plannedDate,
    ),
    planRevisionIdx: index("workout_sessions_plan_revision_idx").on(
      table.workoutPlanRevisionId,
    ),
  }),
);
