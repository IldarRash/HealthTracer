import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { aiProposals } from "./proposals.js";
import { users } from "./users.js";

/**
 * Stores body-composition analysis results derived from AI chat.
 * Numbers only — photos are NEVER stored here.
 * Each row is immutable (insert-only from accepted proposals).
 */
export const bodyCompositionAnalyses = pgTable(
  "body_composition_analyses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Calendar date of the analysis (user-local, ISO-8601). */
    date: date("date").notNull(),
    /** Always 'chat' — identifies the ingestion path. */
    source: text("source").notNull().default("chat"),
    /** Estimated fat percentage lower bound (visual estimate, not a medical measurement). */
    fatPctMin: real("fat_pct_min"),
    /** Estimated fat percentage upper bound (visual estimate, not a medical measurement). */
    fatPctMax: real("fat_pct_max"),
    /** Estimated muscle tone: 'above_average' | 'average' | 'below_average'. */
    muscleTone: text("muscle_tone"),
    /** User-self-reported weight in kg (optional; not derived from photo). */
    weightKg: real("weight_kg"),
    /** True when weightKg is self-reported by the user rather than measured. */
    weightSelfReported: integer("weight_self_reported").notNull().default(1),
    /** Muscle groups that appear strong (e.g. ["chest", "shoulders"]). */
    strongGroups: jsonb("strong_groups").$type<string[]>().notNull().default([]),
    /** Muscle groups that appear weak (e.g. ["lower_back", "glutes"]). */
    weakGroups: jsonb("weak_groups").$type<string[]>().notNull().default([]),
    /**
     * Per-group tone map: { [group]: "strong" | "mid" | "weak" }.
     * Keys are canonical muscle-group slugs.
     */
    muscleMap: jsonb("muscle_map")
      .$type<Record<string, "strong" | "mid" | "weak">>()
      .notNull()
      .default({}),
    /**
     * 8-week fat% trend array (oldest → newest), each entry { weekStart: ISODate, fatPctMid: number }.
     * Maintained by the service when a new analysis is accepted.
     */
    fatPctTrend: jsonb("fat_pct_trend")
      .$type<Array<{ weekStart: string; fatPctMid: number }>>()
      .notNull()
      .default([]),
    /** Ordered history of prior analysis ids for this user (most recent last). */
    analysisHistory: jsonb("analysis_history")
      .$type<string[]>()
      .notNull()
      .default([]),
    /** Source proposal id that created this record (for traceability). */
    sourceProposalId: uuid("source_proposal_id").references(() => aiProposals.id, {
      onDelete: "set null",
    }),
    /** Safety/wellness disclaimer text. Always rendered on body cards. */
    disclaimer: text("disclaimer")
      .notNull()
      .default(
        "примерная визуальная оценка по фото, не замер состава тела и не диагноз",
      ),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("body_composition_analyses_user_id_idx").on(table.userId),
    userDateIdx: index("body_composition_analyses_user_date_idx").on(
      table.userId,
      table.date,
    ),
  }),
);
