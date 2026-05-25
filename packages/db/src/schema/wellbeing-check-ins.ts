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

export const wellbeingCheckIns = pgTable(
  "wellbeing_check_ins",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    moodScore: integer("mood_score").notNull(),
    stressScore: integer("stress_score").notNull(),
    tags: jsonb("tags").$type<string[]>().default([]).notNull(),
    note: text("note"),
    source: text("source").notNull().default("user_entry"),
    crisisFlagReasons: jsonb("crisis_flag_reasons").$type<string[]>().default([]).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userDateIdx: index("wellbeing_check_ins_user_date_idx").on(table.userId, table.date),
    userDateUnique: uniqueIndex("wellbeing_check_ins_user_date_unique").on(
      table.userId,
      table.date,
    ),
  }),
);
