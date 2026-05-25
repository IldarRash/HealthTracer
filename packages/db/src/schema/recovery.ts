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

export const recoveryCheckIns = pgTable(
  "recovery_check_ins",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    soreness: integer("soreness").notNull(),
    fatigue: integer("fatigue").notNull(),
    moodScore: integer("mood_score"),
    perceivedStress: integer("perceived_stress"),
    source: text("source").notNull().default("user_entry"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userDateIdx: index("recovery_check_ins_user_date_idx").on(table.userId, table.date),
    userDateUnique: uniqueIndex("recovery_check_ins_user_date_unique").on(
      table.userId,
      table.date,
    ),
  }),
);

export const recoveryContextSnapshots = pgTable(
  "recovery_context_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    band: text("band").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    calculatedAt: timestamp("calculated_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userDateIdx: index("recovery_context_snapshots_user_date_idx").on(table.userId, table.date),
    userDateUnique: uniqueIndex("recovery_context_snapshots_user_date_unique").on(
      table.userId,
      table.date,
    ),
  }),
);
