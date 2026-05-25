import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { chatMessages, chatThreads } from "./chat.js";
import { users } from "./users.js";

export const proposalStatusEnum = pgEnum("proposal_status", [
  "pending",
  "accepted",
  "rejected",
  "superseded",
]);

export const proposalValidationStatusEnum = pgEnum("proposal_validation_status", [
  "pending_validation",
  "valid",
  "invalid",
]);

export const proposalTargetDomainEnum = pgEnum("proposal_target_domain", [
  "profile",
  "goal",
  "workout",
  "nutrition",
  "recipe",
  "today",
  "general",
]);

export type ProposalEvidenceRefRow = {
  type: string;
  id: string;
  label: string;
};

export const proposalIntentEnum = pgEnum("proposal_intent", [
  "update_profile",
  "create_goal",
  "update_goal",
  "create_workout_plan",
  "adapt_workout_plan",
  "adapt_workout_plan_from_progress",
  "create_nutrition_plan",
  "adjust_nutrition_plan",
  "recommend_recipes",
  "create_today_checklist",
  "summarize_progress",
  "create_habit_plan",
  "adapt_habit_plan",
]);

export const aiProposals = pgTable(
  "ai_proposals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => chatThreads.id, { onDelete: "cascade" }),
    sourceMessageId: uuid("source_message_id").references(() => chatMessages.id, {
      onDelete: "set null",
    }),
    intent: proposalIntentEnum("intent").notNull(),
    targetDomain: proposalTargetDomainEnum("target_domain").notNull(),
    title: text("title").notNull(),
    reason: text("reason").notNull(),
    evidenceRefs: jsonb("evidence_refs").$type<ProposalEvidenceRefRow[] | null>(),
    proposedChanges: jsonb("proposed_changes")
      .$type<Record<string, unknown>>()
      .notNull(),
    status: proposalStatusEnum("status").notNull().default("pending"),
    validationStatus: proposalValidationStatusEnum("validation_status")
      .notNull()
      .default("pending_validation"),
    validationErrors: jsonb("validation_errors").$type<string[]>().notNull().default([]),
    userDecisionAt: timestamp("user_decision_at", { withTimezone: true }),
    appliedReference: text("applied_reference"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("ai_proposals_user_id_idx").on(table.userId),
    threadIdIdx: index("ai_proposals_thread_id_idx").on(table.threadId),
    userStatusIdx: index("ai_proposals_user_status_idx").on(
      table.userId,
      table.status,
    ),
  }),
);
