import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const migrationChecks = pgTable("migration_checks", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
