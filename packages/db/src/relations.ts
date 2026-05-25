import { relations } from "drizzle-orm";
import {
  aiProposals,
  chatMessages,
  chatThreads,
  dailyChecklists,
  deviceConnections,
  deviceConsents,
  exercises,
  healthDocumentSummaries,
  healthDocuments,
  documentSignals,
  goals,
  healthMetricAggregates,
  healthMetricSnapshots,
  nutritionPlanRevisions,
  nutritionPlans,
  nutritionAdherence,
  recipes,
  trendObservations,
  userProfiles,
  userRecipeRecommendations,
  users,
  weeklyProgressSummaries,
  workoutPlanRevisions,
  workoutPlans,
  workoutSessions,
  wellbeingCheckIns,
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
  nutritionAdherence: many(nutritionAdherence),
  dailyChecklists: many(dailyChecklists),
  recipeRecommendations: many(userRecipeRecommendations),
  exercises: many(exercises),
  deviceConsents: many(deviceConsents),
  deviceConnections: many(deviceConnections),
  healthMetricSnapshots: many(healthMetricSnapshots),
  healthMetricAggregates: many(healthMetricAggregates),
  wellbeingCheckIns: many(wellbeingCheckIns),
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
  parentGoal: one(goals, {
    fields: [goals.parentGoalId],
    references: [goals.id],
    relationName: "goalHierarchy",
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

export const nutritionAdherenceRelations = relations(nutritionAdherence, ({ one }) => ({
  user: one(users, {
    fields: [nutritionAdherence.userId],
    references: [users.id],
  }),
}));

export const dailyChecklistsRelations = relations(dailyChecklists, ({ one }) => ({
  user: one(users, {
    fields: [dailyChecklists.userId],
    references: [users.id],
  }),
}));

export const weeklyProgressSummariesRelations = relations(
  weeklyProgressSummaries,
  ({ many, one }) => ({
    user: one(users, {
      fields: [weeklyProgressSummaries.userId],
      references: [users.id],
    }),
    trends: many(trendObservations),
  }),
);

export const trendObservationsRelations = relations(trendObservations, ({ one }) => ({
  user: one(users, {
    fields: [trendObservations.userId],
    references: [users.id],
  }),
  summary: one(weeklyProgressSummaries, {
    fields: [trendObservations.summaryId],
    references: [weeklyProgressSummaries.id],
  }),
}));

export const recipesRelations = relations(recipes, ({ many }) => ({
  recommendations: many(userRecipeRecommendations),
}));

export const exercisesRelations = relations(exercises, ({ one }) => ({
  user: one(users, {
    fields: [exercises.userId],
    references: [users.id],
  }),
}));

export const userRecipeRecommendationsRelations = relations(
  userRecipeRecommendations,
  ({ one }) => ({
    user: one(users, {
      fields: [userRecipeRecommendations.userId],
      references: [users.id],
    }),
    recipe: one(recipes, {
      fields: [userRecipeRecommendations.recipeId],
      references: [recipes.id],
    }),
    relatedNutritionPlanRevision: one(nutritionPlanRevisions, {
      fields: [userRecipeRecommendations.relatedNutritionPlanRevisionId],
      references: [nutritionPlanRevisions.id],
    }),
  }),
);

export const deviceConsentsRelations = relations(deviceConsents, ({ many, one }) => ({
  user: one(users, {
    fields: [deviceConsents.userId],
    references: [users.id],
  }),
  connections: many(deviceConnections),
  snapshots: many(healthMetricSnapshots),
  aggregates: many(healthMetricAggregates),
}));

export const deviceConnectionsRelations = relations(deviceConnections, ({ one, many }) => ({
  user: one(users, {
    fields: [deviceConnections.userId],
    references: [users.id],
  }),
  consent: one(deviceConsents, {
    fields: [deviceConnections.consentId],
    references: [deviceConsents.id],
  }),
  snapshots: many(healthMetricSnapshots),
}));

export const healthMetricSnapshotsRelations = relations(healthMetricSnapshots, ({ one }) => ({
  user: one(users, {
    fields: [healthMetricSnapshots.userId],
    references: [users.id],
  }),
  consent: one(deviceConsents, {
    fields: [healthMetricSnapshots.consentId],
    references: [deviceConsents.id],
  }),
  deviceConnection: one(deviceConnections, {
    fields: [healthMetricSnapshots.deviceConnectionId],
    references: [deviceConnections.id],
  }),
}));

export const healthMetricAggregatesRelations = relations(healthMetricAggregates, ({ one }) => ({
  user: one(users, {
    fields: [healthMetricAggregates.userId],
    references: [users.id],
  }),
  consent: one(deviceConsents, {
    fields: [healthMetricAggregates.consentId],
    references: [deviceConsents.id],
  }),
}));

export const healthDocumentsRelations = relations(healthDocuments, ({ many, one }) => ({
  user: one(users, {
    fields: [healthDocuments.userId],
    references: [users.id],
  }),
  summaries: many(healthDocumentSummaries),
  signals: many(documentSignals),
}));

export const documentSignalsRelations = relations(documentSignals, ({ one }) => ({
  user: one(users, {
    fields: [documentSignals.userId],
    references: [users.id],
  }),
  document: one(healthDocuments, {
    fields: [documentSignals.healthDocumentId],
    references: [healthDocuments.id],
  }),
}));

export const healthDocumentSummariesRelations = relations(
  healthDocumentSummaries,
  ({ one }) => ({
    user: one(users, {
      fields: [healthDocumentSummaries.userId],
      references: [users.id],
    }),
    document: one(healthDocuments, {
      fields: [healthDocumentSummaries.healthDocumentId],
      references: [healthDocuments.id],
    }),
  }),
);
