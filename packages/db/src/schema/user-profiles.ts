import {
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const activityLevelEnum = pgEnum("activity_level", [
  "sedentary",
  "lightly_active",
  "moderately_active",
  "very_active",
  "athlete",
]);

export const trainingExperienceEnum = pgEnum("training_experience", [
  "beginner",
  "intermediate",
  "advanced",
]);

export type StoredLongevityDirection = {
  statement: string;
  tags: string[];
};

export type StoredCoachingNote = {
  text: string;
  category?: "preference" | "constraint" | "context" | "motivation";
};

export const userProfiles = pgTable(
  "user_profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    birthDate: date("birth_date"),
    heightCm: integer("height_cm"),
    baselineWeightKg: numeric("baseline_weight_kg", {
      precision: 5,
      scale: 2,
      mode: "number",
    }),
    activityLevel: activityLevelEnum("activity_level"),
    trainingExperience: trainingExperienceEnum("training_experience"),
    preferences: jsonb("preferences").$type<string[]>().notNull().default([]),
    constraints: jsonb("constraints").$type<string[]>().notNull().default([]),
    longevityDirection: jsonb("longevity_direction").$type<StoredLongevityDirection | null>(),
    longevityDirectionTags: jsonb("longevity_direction_tags")
      .$type<string[]>()
      .notNull()
      .default([]),
    coachingNotes: jsonb("coaching_notes").$type<StoredCoachingNote[]>().notNull().default([]),
    onboardingDraft: jsonb("onboarding_draft").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: uniqueIndex("user_profiles_user_id_idx").on(table.userId),
  }),
);
