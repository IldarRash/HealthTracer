import {
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
import { aiProposals } from "./proposals.js";
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

export const nutritionAdherence = pgTable(
  "nutrition_adherence",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    hydrationLitersConsumed: real("hydration_liters_consumed"),
    mealCompletion: jsonb("meal_completion").$type<unknown[]>().default([]).notNull(),
    targetCompletion: jsonb("target_completion")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    notes: jsonb("notes").$type<string[]>().default([]).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userDateUnique: uniqueIndex("nutrition_adherence_user_date_idx").on(
      table.userId,
      table.date,
    ),
  }),
);

export const foodPhotoAnalyses = pgTable(
  "food_photo_analyses",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    imageRefId: uuid("image_ref_id").notNull(),
    mimeType: text("mime_type"),
    storageKey: text("storage_key"),
    provenanceSource: text("provenance_source").notNull(),
    providerId: text("provider_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userImageRefUnique: uniqueIndex("food_photo_analyses_user_image_ref_idx").on(
      table.userId,
      table.imageRefId,
    ),
    userIdIdx: index("food_photo_analyses_user_id_idx").on(table.userId),
  }),
);

export const nutritionIncidents = pgTable(
  "nutrition_incidents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    incidentDateTime: timestamp("incident_date_time", { withTimezone: true }).notNull(),
    date: date("date").notNull(),
    items: jsonb("items").$type<unknown[]>().notNull(),
    estimatedCalories: integer("estimated_calories").notNull(),
    estimatedMacros: jsonb("estimated_macros").$type<Record<string, number>>().notNull(),
    confidence: text("confidence").notNull(),
    provenance: jsonb("provenance").$type<Record<string, unknown>>().notNull(),
    imageRefs: jsonb("image_refs").$type<unknown[]>().default([]).notNull(),
    userEdits: jsonb("user_edits").$type<Record<string, unknown> | null>(),
    sourceProposalId: uuid("source_proposal_id").references(() => aiProposals.id, {
      onDelete: "set null",
    }),
    source: text("source").notNull().default("ai_proposal"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdDateIdx: index("nutrition_incidents_user_date_idx").on(table.userId, table.date),
    userIdIncidentDateTimeIdx: index("nutrition_incidents_user_incident_dt_idx").on(
      table.userId,
      table.incidentDateTime,
    ),
  }),
);
