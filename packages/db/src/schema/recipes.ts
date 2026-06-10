import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { nutritionPlanRevisions } from "./nutrition.js";
import { users } from "./users.js";

export const recipes = pgTable(
  "recipes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    ingredients: jsonb("ingredients").$type<Record<string, unknown>[]>().notNull(),
    preparationSteps: jsonb("preparation_steps").$type<string[]>().notNull(),
    servings: integer("servings").notNull(),
    estimatedCalories: integer("estimated_calories").notNull(),
    proteinGrams: integer("protein_grams").notNull(),
    carbsGrams: integer("carbs_grams").notNull(),
    fatGrams: integer("fat_grams").notNull(),
    fiberGrams: integer("fiber_grams"),
    mealTypes: jsonb("meal_types").$type<string[]>().notNull(),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    restrictionTags: jsonb("restriction_tags").$type<string[]>().notNull().default([]),
    allergenTags: jsonb("allergen_tags").$type<string[]>().notNull().default([]),
    prepMinutes: integer("prep_minutes"),
    cookMinutes: integer("cook_minutes"),
    source: text("source").notNull(),
    provider: text("provider"),
    externalId: text("external_id"),
    confidence: text("confidence"),
    provenance: jsonb("provenance").$type<Record<string, unknown>>(),
    status: text("status").notNull().default("active"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    dedupeKey: text("dedupe_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    statusIdx: index("recipes_status_idx").on(table.status),
    userIdIdx: index("recipes_user_id_idx").on(table.userId),
    providerExternalIdx: uniqueIndex("recipes_provider_external_id_idx").on(
      table.provider,
      table.externalId,
    ),
    userDedupeIdx: uniqueIndex("recipes_user_dedupe_key_idx")
      .on(table.userId, table.dedupeKey)
      .where(sql`${table.userId} IS NOT NULL`),
  }),
);

export const userRecipeRecommendations = pgTable(
  "user_recipe_recommendations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    relatedNutritionPlanRevisionId: uuid("related_nutrition_plan_revision_id").references(
      () => nutritionPlanRevisions.id,
      { onDelete: "set null" },
    ),
    reason: text("reason").notNull(),
    fitSummary: text("fit_summary").notNull(),
    status: text("status").notNull().default("pending"),
    shownAt: timestamp("shown_at", { withTimezone: true }).defaultNow().notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("user_recipe_recommendations_user_id_idx").on(table.userId),
    userStatusIdx: index("user_recipe_recommendations_user_status_idx").on(
      table.userId,
      table.status,
    ),
    recipeIdIdx: index("user_recipe_recommendations_recipe_id_idx").on(table.recipeId),
    relatedRevisionIdx: index(
      "user_recipe_recommendations_related_revision_idx",
    ).on(table.relatedNutritionPlanRevisionId),
  }),
);
