import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const exercises = pgTable(
  "exercises",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    aliases: jsonb("aliases").$type<string[]>().notNull().default([]),
    primaryMuscles: jsonb("primary_muscles").$type<string[]>().notNull(),
    secondaryMuscles: jsonb("secondary_muscles").$type<string[]>().notNull().default([]),
    equipment: jsonb("equipment").$type<string[]>().notNull(),
    movementPatterns: jsonb("movement_patterns").$type<string[]>().notNull(),
    modalities: jsonb("modalities").$type<string[]>().notNull().default(["strength"]),
    difficulty: text("difficulty").notNull(),
    instructions: jsonb("instructions").$type<string[]>().notNull(),
    safetyNotes: jsonb("safety_notes").$type<string[]>().notNull().default([]),
    media: jsonb("media")
      .$type<{ refs: Array<{ kind: string; url?: string; label?: string }>; fallbackLabel?: string | null }>()
      .notNull()
      .default({ refs: [], fallbackLabel: null }),
    source: text("source").notNull(),
    validationStatus: text("validation_status").notNull().default("validated"),
    status: text("status").notNull().default("active"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    dedupeKey: text("dedupe_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    statusIdx: index("exercises_status_idx").on(table.status),
    normalizedNameIdx: index("exercises_normalized_name_idx").on(table.normalizedName),
    sourceIdx: index("exercises_source_idx").on(table.source),
    userIdIdx: index("exercises_user_id_idx").on(table.userId),
    systemDedupeIdx: uniqueIndex("exercises_system_dedupe_key_idx")
      .on(table.dedupeKey)
      .where(sql`${table.userId} IS NULL`),
    userDedupeIdx: uniqueIndex("exercises_user_dedupe_key_idx").on(
      table.userId,
      table.dedupeKey,
    ),
  }),
);
