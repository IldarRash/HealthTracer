import {
  date,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const dailyChecklists = pgTable(
  "daily_checklists",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    items: jsonb("items").$type<Record<string, unknown>[]>().notNull(),
    source: text("source").notNull().default("ai_proposal"),
    feedback: jsonb("feedback").$type<Record<string, unknown> | null>(),
    adherenceScore: numeric("adherence_score", { precision: 5, scale: 4 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userDateIdx: index("daily_checklists_user_date_idx").on(table.userId, table.date),
    userDateUnique: uniqueIndex("daily_checklists_user_date_unique").on(
      table.userId,
      table.date,
    ),
  }),
);
