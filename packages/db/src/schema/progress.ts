import {
  date,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const weeklyProgressSummaries = pgTable(
  "weekly_progress_summaries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    weekStart: date("week_start").notNull(),
    weekEnd: date("week_end").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow().notNull(),
    dataStatus: text("data_status").notNull(),
    sourceAggregates: jsonb("source_aggregates")
      .$type<Record<string, unknown>>()
      .notNull(),
    deferredDomains: jsonb("deferred_domains")
      .$type<unknown[]>()
      .default([])
      .notNull(),
    userMessage: text("user_message").notNull(),
    supersededById: uuid("superseded_by_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userWeekIdx: index("weekly_progress_summaries_user_week_idx").on(
      table.userId,
      table.weekStart,
    ),
    userGeneratedIdx: index("weekly_progress_summaries_user_generated_idx").on(
      table.userId,
      table.generatedAt,
    ),
  }),
);

export const trendObservations = pgTable(
  "trend_observations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    summaryId: uuid("summary_id")
      .notNull()
      .references(() => weeklyProgressSummaries.id, { onDelete: "cascade" }),
    weekStart: date("week_start").notNull(),
    weekEnd: date("week_end").notNull(),
    domain: text("domain").notNull(),
    trendType: text("trend_type").notNull(),
    direction: text("direction").notNull(),
    dataSufficiency: text("data_sufficiency").notNull(),
    supportingAggregate: jsonb("supporting_aggregate")
      .$type<Record<string, unknown>>()
      .notNull(),
    message: text("message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    summaryIdx: index("trend_observations_summary_id_idx").on(table.summaryId),
    userWeekDomainIdx: index("trend_observations_user_week_domain_idx").on(
      table.userId,
      table.weekStart,
      table.domain,
    ),
  }),
);
