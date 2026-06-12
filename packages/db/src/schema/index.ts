import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
export * from "./body-composition.js";
export * from "./chat.js";
export * from "./chat-attachments.js";
export * from "./goals.js";
export * from "./habits.js";
export * from "./nutrition.js";
export * from "./progress.js";
export * from "./proposals.js";
export * from "./recipes.js";
export * from "./today.js";
export * from "./user-profiles.js";
export * from "./users.js";
export * from "./workouts.js";
export * from "./device-metrics.js";
export * from "./biomarkers.js";
export * from "./exercises.js";
export * from "./wellbeing-check-ins.js";
export * from "./recovery.js";
export * from "./subscriptions.js";

export const migrationChecks = pgTable("migration_checks", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
