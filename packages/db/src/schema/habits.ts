import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const habitPlans = pgTable(
  "habit_plans",
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
    userIdIdx: index("habit_plans_user_id_idx").on(table.userId),
    userActiveIdx: uniqueIndex("habit_plans_user_active_idx")
      .on(table.userId)
      .where(sql`${table.status} = 'active'`),
  }),
);

export const habitPlanRevisions = pgTable(
  "habit_plan_revisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    habitPlanId: uuid("habit_plan_id")
      .notNull()
      .references(() => habitPlans.id, { onDelete: "cascade" }),
    revisionNumber: integer("revision_number").notNull(),
    reason: text("reason").notNull(),
    source: text("source").notNull().default("ai_proposal"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    habitPlanIdIdx: index("habit_plan_revisions_plan_id_idx").on(table.habitPlanId),
    planRevisionNumberIdx: uniqueIndex("habit_plan_revisions_plan_revision_idx").on(
      table.habitPlanId,
      table.revisionNumber,
    ),
    planIdRevisionIdIdx: uniqueIndex("habit_plan_revisions_plan_id_id_idx").on(
      table.habitPlanId,
      table.id,
    ),
  }),
);

export const habitTemplates = pgTable(
  "habit_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    category: text("category").notNull(),
    defaultTarget: jsonb("default_target").$type<Record<string, unknown>>().notNull(),
    targetConstraints: jsonb("target_constraints").$type<Record<string, unknown>>().notNull(),
    defaultSchedule: jsonb("default_schedule").$type<Record<string, unknown>>().notNull(),
    linkedSourceHint: text("linked_source_hint"),
    defaultRequired: boolean("default_required").notNull().default(true),
    defaultTimeOfDayHint: text("default_time_of_day_hint"),
    coachingNoteDefault: text("coaching_note_default"),
    source: text("source").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    slugIdx: uniqueIndex("habit_templates_slug_idx").on(table.slug),
    statusIdx: index("habit_templates_status_idx").on(table.status),
  }),
);

export const habitCompletions = pgTable(
  "habit_completions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    habitDefinitionId: uuid("habit_definition_id").notNull(),
    date: date("date").notNull(),
    status: text("status").notNull().default("pending"),
    progressValue: real("progress_value"),
    sourceChecklistItemId: uuid("source_checklist_item_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userDefinitionDateUnique: uniqueIndex("habit_completions_user_definition_date_idx").on(
      table.userId,
      table.habitDefinitionId,
      table.date,
    ),
    userDateIdx: index("habit_completions_user_date_idx").on(table.userId, table.date),
  }),
);
