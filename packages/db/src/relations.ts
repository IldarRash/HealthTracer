import { relations } from "drizzle-orm";
import {
  aiProposals,
  chatMessages,
  chatThreads,
  dailyChecklists,
  goals,
  nutritionPlanRevisions,
  nutritionPlans,
  userProfiles,
  users,
  workoutPlanRevisions,
  workoutPlans,
  workoutSessions,
} from "./schema/index.js";

export const usersRelations = relations(users, ({ many, one }) => ({
  profile: one(userProfiles, {
    fields: [users.id],
    references: [userProfiles.userId],
  }),
  goals: many(goals),
  chatThreads: many(chatThreads),
  proposals: many(aiProposals),
  workoutPlans: many(workoutPlans),
  workoutSessions: many(workoutSessions),
  nutritionPlans: many(nutritionPlans),
  dailyChecklists: many(dailyChecklists),
}));

export const userProfilesRelations = relations(userProfiles, ({ one }) => ({
  user: one(users, {
    fields: [userProfiles.userId],
    references: [users.id],
  }),
}));

export const goalsRelations = relations(goals, ({ one }) => ({
  user: one(users, {
    fields: [goals.userId],
    references: [users.id],
  }),
}));

export const chatThreadsRelations = relations(chatThreads, ({ many, one }) => ({
  user: one(users, {
    fields: [chatThreads.userId],
    references: [users.id],
  }),
  messages: many(chatMessages),
  proposals: many(aiProposals),
}));

export const chatMessagesRelations = relations(chatMessages, ({ many, one }) => ({
  thread: one(chatThreads, {
    fields: [chatMessages.threadId],
    references: [chatThreads.id],
  }),
  proposals: many(aiProposals),
}));

export const aiProposalsRelations = relations(aiProposals, ({ one }) => ({
  user: one(users, {
    fields: [aiProposals.userId],
    references: [users.id],
  }),
  thread: one(chatThreads, {
    fields: [aiProposals.threadId],
    references: [chatThreads.id],
  }),
  sourceMessage: one(chatMessages, {
    fields: [aiProposals.sourceMessageId],
    references: [chatMessages.id],
  }),
}));

export const workoutPlansRelations = relations(workoutPlans, ({ many, one }) => ({
  user: one(users, {
    fields: [workoutPlans.userId],
    references: [users.id],
  }),
  revisions: many(workoutPlanRevisions),
  sessions: many(workoutSessions),
}));

export const workoutPlanRevisionsRelations = relations(
  workoutPlanRevisions,
  ({ one }) => ({
    plan: one(workoutPlans, {
      fields: [workoutPlanRevisions.workoutPlanId],
      references: [workoutPlans.id],
    }),
  }),
);

export const workoutSessionsRelations = relations(workoutSessions, ({ one }) => ({
  user: one(users, {
    fields: [workoutSessions.userId],
    references: [users.id],
  }),
  plan: one(workoutPlans, {
    fields: [workoutSessions.workoutPlanId],
    references: [workoutPlans.id],
  }),
  revision: one(workoutPlanRevisions, {
    fields: [workoutSessions.workoutPlanRevisionId],
    references: [workoutPlanRevisions.id],
  }),
}));

export const nutritionPlansRelations = relations(nutritionPlans, ({ many, one }) => ({
  user: one(users, {
    fields: [nutritionPlans.userId],
    references: [users.id],
  }),
  revisions: many(nutritionPlanRevisions),
}));

export const nutritionPlanRevisionsRelations = relations(
  nutritionPlanRevisions,
  ({ one }) => ({
    plan: one(nutritionPlans, {
      fields: [nutritionPlanRevisions.nutritionPlanId],
      references: [nutritionPlans.id],
    }),
  }),
);

export const dailyChecklistsRelations = relations(dailyChecklists, ({ one }) => ({
  user: one(users, {
    fields: [dailyChecklists.userId],
    references: [users.id],
  }),
}));
