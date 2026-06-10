/**
 * ai-proposal.ts — Proposal domain schemas.
 *
 * Extracted from index.ts so that chat-turn.ts (and transitively
 * chat-turn-stream.ts) can import aiProposalSchema without going through the
 * barrel index.ts, which would create a circular dependency:
 *   index.ts → (re-export) chat-turn-stream.ts → chatTurnResponseSchema → index.ts
 *
 * This module imports only from dedicated sub-modules, never from index.ts.
 */

import { z } from "zod";
import { isoDateTimeSchema, isoDateSchema } from "./dates.js";
import { proposalCorrelationEvidenceRefsSchema } from "./document-signals.js";
import { habitPlanPayloadSchema } from "./habits.js";
import { recoveryContextSourceRefSchema } from "./recovery.js";
import { todayChecklistPayloadSchema } from "./today.js";
import { captureWellbeingCheckinProposalPayloadSchema } from "./chat-action-proposals.js";
import { logNutritionIncidentProposalPayloadSchema } from "./nutrition-incidents.js";
import {
  adaptWorkoutPlanFromProgressChangesSchema,
  logWorkoutActivityProposalPayloadSchema,
  workoutPlanProposalChangesSchema,
} from "./workouts.js";
import { saveBodyAnalysisProposalPayloadSchema } from "./body-composition.js";
import {
  activityLevelSchema,
  goalPrioritySchema,
  goalStatusSchema,
  goalTypeSchema,
  trainingExperienceSchema,
} from "./user-enums.js";
import {
  longevityDirectionSchema,
  coachingNotesSchema,
  goalHorizonsStoredOnGoalsSchema,
} from "./goal-hierarchy.js";
import {
  nutritionPlanPayloadSchema,
} from "./nutrition-meal.js";

// Re-export the canonical nutrition plan payload schema from its sub-module.
export { nutritionPlanPayloadSchema } from "./nutrition-meal.js";
export type { NutritionPlanPayload } from "./nutrition-meal.js";

// ---------------------------------------------------------------------------
// Enums shared across the proposal domain
// ---------------------------------------------------------------------------

export const proposalStatusSchema = z.enum([
  "pending",
  "accepted",
  "rejected",
  "superseded",
]);

export type ProposalStatus = z.infer<typeof proposalStatusSchema>;

export const proposalValidationStatusSchema = z.enum([
  "pending_validation",
  "valid",
  "invalid",
]);

export type ProposalValidationStatus = z.infer<typeof proposalValidationStatusSchema>;

/**
 * Classifies a proposal validation failure into one of five buckets for
 * structured logging and turn metadata. Priority: safety > schema > ownership > other.
 *
 * - `safety`            — unsafe medical/diagnostic wording in proposal text fields
 * - `schema`            — Zod parse failure or domain-rule violation (validateRawProposal)
 * - `ownership`         — referenced resource not owned by the user (provenance, evidence refs, etc.)
 * - `unsupported-intent` — intent was not in the allowed capability catalog
 * - `other`             — any combination that does not map to the above
 */
export const proposalValidationFailureClassSchema = z.enum([
  "safety",
  "schema",
  "ownership",
  "unsupported-intent",
  "other",
]);

export type ProposalValidationFailureClass = z.infer<
  typeof proposalValidationFailureClassSchema
>;

/**
 * Classify a proposal validation failure from its named error buckets.
 * Takes pre-split error arrays so the classification is deterministic and testable.
 *
 * @param safetyErrors         — from validateProposalSafety (unsafe language)
 * @param schemaErrors         — from validateRawProposal / validateStoredProposal
 * @param ownershipErrors      — from validateCorrelationEvidenceOwnership,
 *                               validateProvenanceOwnership, validateChatAttachmentProposalRefs,
 *                               validateNutritionIncidentImageRefOwnership, etc.
 * @param unsupportedIntentErrors — when the intent is not in the active capability catalog
 */
export function classifyProposalValidationFailure({
  safetyErrors,
  schemaErrors,
  ownershipErrors,
  unsupportedIntentErrors,
}: {
  safetyErrors: readonly string[];
  schemaErrors: readonly string[];
  ownershipErrors: readonly string[];
  unsupportedIntentErrors?: readonly string[];
}): ProposalValidationFailureClass {
  if (safetyErrors.length > 0) {
    return "safety";
  }

  if (schemaErrors.length > 0) {
    return "schema";
  }

  if (ownershipErrors.length > 0) {
    return "ownership";
  }

  if (unsupportedIntentErrors && unsupportedIntentErrors.length > 0) {
    return "unsupported-intent";
  }

  return "other";
}

export const proposalTargetDomainSchema = z.enum([
  "profile",
  "goal",
  "workout",
  "nutrition",
  "recipe",
  "today",
  "general",
  "body",
]);

export type ProposalTargetDomain = z.infer<typeof proposalTargetDomainSchema>;

export const proposalIntentSchema = z.enum([
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
  "capture_wellbeing_checkin",
  "log_nutrition_incident",
  "log_workout_activity",
  "save_body_analysis",
]);

export type ProposalIntent = z.infer<typeof proposalIntentSchema>;

// ---------------------------------------------------------------------------
// Profile proposal payload schema
// Mirrors upsertUserProfileSchema.strict() from index.ts using sub-module deps.
// Must stay in sync with upsertUserProfileSchema in index.ts.
// ---------------------------------------------------------------------------

export const profileProposalChangesSchema = z
  .object({
    birthDate: isoDateSchema.nullable().optional(),
    heightCm: z.number().int().positive().max(260).nullable().optional(),
    baselineWeightKg: z.number().positive().max(500).nullable().optional(),
    activityLevel: activityLevelSchema.nullable().optional(),
    trainingExperience: trainingExperienceSchema.nullable().optional(),
    preferences: z.array(z.string().min(1).max(160)).max(30).optional(),
    constraints: z.array(z.string().min(1).max(160)).max(30).optional(),
    longevityDirection: longevityDirectionSchema.nullable().optional(),
    longevityDirectionTags: z.array(z.string().min(1).max(80)).max(10).optional(),
    coachingNotes: coachingNotesSchema.optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Goal proposal payload schemas
// Mirror createGoalSchema / updateGoalSchema from index.ts.
// ---------------------------------------------------------------------------

const goalTargetSchema = z.record(z.string(), z.unknown());

export const createGoalProposalChangesSchema = z.object({
  type: goalTypeSchema,
  priority: goalPrioritySchema.default("secondary"),
  title: z.string().min(1).max(160),
  target: goalTargetSchema.default({}),
  horizon: goalHorizonsStoredOnGoalsSchema.nullable().optional(),
  parentGoalId: z.string().uuid().nullable().optional(),
  weekStart: isoDateSchema.nullable().optional(),
  startDate: isoDateSchema.nullable().optional(),
  targetDate: isoDateSchema.nullable().optional(),
});

export const updateGoalProposalChangesSchema = z.object({
  goalId: z.string().uuid(),
  changes: z.object({
    type: goalTypeSchema.optional(),
    status: goalStatusSchema.optional(),
    priority: goalPrioritySchema.optional(),
    title: z.string().min(1).max(160).optional(),
    target: goalTargetSchema.optional(),
    horizon: goalHorizonsStoredOnGoalsSchema.nullable().optional(),
    parentGoalId: z.string().uuid().nullable().optional(),
    weekStart: isoDateSchema.nullable().optional(),
    startDate: isoDateSchema.nullable().optional(),
    targetDate: isoDateSchema.nullable().optional(),
  }),
});

// ---------------------------------------------------------------------------
// Nutrition proposal payload schemas (imports from nutrition-meal.ts)
// ---------------------------------------------------------------------------

export const nutritionSwapItemSchema = z.object({
  /** Original dish/ingredient label being replaced. */
  from: z.string().min(1).max(240),
  /** Replacement dish/ingredient label. */
  to: z.string().min(1).max(240),
  /** Approximate calorie/macro saving from this swap (informational only). */
  save: z.string().min(1).max(240).optional(),
});

export type NutritionSwapItem = z.infer<typeof nutritionSwapItemSchema>;

export const adjustNutritionPlanFromProgressChangesSchema = z.object({
  plan: nutritionPlanPayloadSchema,
  sourceSummaryId: z.string().uuid().optional(),
  sourceTrendObservationIds: z.array(z.string().uuid()).max(10).default([]),
  /** Calorie target of the plan being replaced (for before/after display). */
  fromCaloriesPerDay: z.number().int().positive().max(10000).optional(),
  /** Swap list describing the substitutions this proposal makes (C4 DiffRow). */
  swaps: z.array(nutritionSwapItemSchema).max(20).optional(),
});

export type AdjustNutritionPlanFromProgressChanges = z.infer<typeof adjustNutritionPlanFromProgressChangesSchema>;

export const nutritionPlanProposalChangesSchema = z.union([
  nutritionPlanPayloadSchema,
  adjustNutritionPlanFromProgressChangesSchema,
]);

export type NutritionPlanProposalChanges = z.infer<typeof nutritionPlanProposalChangesSchema>;

// ---------------------------------------------------------------------------
// Habit plan proposal changes
// ---------------------------------------------------------------------------

export const adaptHabitPlanFromProgressChangesSchema = z.object({
  plan: habitPlanPayloadSchema,
  sourceSummaryId: z.string().uuid().optional(),
  sourceTrendObservationIds: z.array(z.string().uuid()).max(10).default([]),
  recoverySourceRefs: z.array(recoveryContextSourceRefSchema).max(5).optional(),
});

export type AdaptHabitPlanFromProgressChanges = z.infer<typeof adaptHabitPlanFromProgressChangesSchema>;

export const habitPlanProposalChangesSchema = z.union([
  adaptHabitPlanFromProgressChangesSchema,
  habitPlanPayloadSchema,
]);

export type HabitPlanProposalChanges = z.infer<typeof habitPlanProposalChangesSchema>;

// ---------------------------------------------------------------------------
// Recipe recommendation proposal payload
// ---------------------------------------------------------------------------

export const recipeRecommendationItemProposalSchema = z.object({
  recipeId: z.string().uuid(),
  reason: z.string().min(1).max(1000),
  fitSummary: z.string().min(1).max(500),
});

export type RecipeRecommendationItemProposal = z.infer<typeof recipeRecommendationItemProposalSchema>;

export const recipeRecommendationProposalPayloadSchema = z.object({
  relatedNutritionPlanRevisionId: z.string().uuid().nullable().optional(),
  recommendations: z.array(recipeRecommendationItemProposalSchema).min(1).max(10),
});

export type RecipeRecommendationProposalPayload = z.infer<
  typeof recipeRecommendationProposalPayloadSchema
>;

export const emptyProposalChangesSchema = z.object({}).strict();

// ---------------------------------------------------------------------------
// rawAiProposalSchema — discriminated union used by the AI structured output
// ---------------------------------------------------------------------------

const proposalTitleReasonFields = {
  title: z.string().min(1).max(160),
  reason: z.string().min(1).max(1000),
  evidenceRefs: proposalCorrelationEvidenceRefsSchema.optional(),
};

export const rawAiProposalSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("update_profile"),
    targetDomain: proposalTargetDomainSchema,
    ...proposalTitleReasonFields,
    proposedChanges: profileProposalChangesSchema,
  }),
  z.object({
    intent: z.literal("create_goal"),
    targetDomain: proposalTargetDomainSchema,
    ...proposalTitleReasonFields,
    proposedChanges: createGoalProposalChangesSchema,
  }),
  z.object({
    intent: z.literal("update_goal"),
    targetDomain: proposalTargetDomainSchema,
    ...proposalTitleReasonFields,
    proposedChanges: updateGoalProposalChangesSchema,
  }),
  z.object({
    intent: z.literal("create_workout_plan"),
    targetDomain: proposalTargetDomainSchema,
    ...proposalTitleReasonFields,
    proposedChanges: workoutPlanProposalChangesSchema,
  }),
  z.object({
    intent: z.literal("adapt_workout_plan"),
    targetDomain: proposalTargetDomainSchema,
    ...proposalTitleReasonFields,
    proposedChanges: workoutPlanProposalChangesSchema,
  }),
  z.object({
    intent: z.literal("adapt_workout_plan_from_progress"),
    targetDomain: proposalTargetDomainSchema,
    ...proposalTitleReasonFields,
    proposedChanges: adaptWorkoutPlanFromProgressChangesSchema,
  }),
  z.object({
    intent: z.literal("create_nutrition_plan"),
    targetDomain: proposalTargetDomainSchema,
    ...proposalTitleReasonFields,
    proposedChanges: nutritionPlanPayloadSchema,
  }),
  z.object({
    intent: z.literal("adjust_nutrition_plan"),
    targetDomain: proposalTargetDomainSchema,
    ...proposalTitleReasonFields,
    proposedChanges: nutritionPlanProposalChangesSchema,
  }),
  z.object({
    intent: z.literal("recommend_recipes"),
    targetDomain: proposalTargetDomainSchema,
    ...proposalTitleReasonFields,
    proposedChanges: recipeRecommendationProposalPayloadSchema,
  }),
  z.object({
    intent: z.literal("create_today_checklist"),
    targetDomain: proposalTargetDomainSchema,
    ...proposalTitleReasonFields,
    proposedChanges: todayChecklistPayloadSchema,
  }),
  z.object({
    intent: z.literal("create_habit_plan"),
    targetDomain: proposalTargetDomainSchema,
    ...proposalTitleReasonFields,
    proposedChanges: habitPlanPayloadSchema,
  }),
  z.object({
    intent: z.literal("adapt_habit_plan"),
    targetDomain: proposalTargetDomainSchema,
    ...proposalTitleReasonFields,
    proposedChanges: habitPlanProposalChangesSchema,
  }),
  z.object({
    intent: z.literal("summarize_progress"),
    targetDomain: proposalTargetDomainSchema,
    ...proposalTitleReasonFields,
    proposedChanges: emptyProposalChangesSchema,
  }),
  z.object({
    intent: z.literal("capture_wellbeing_checkin"),
    targetDomain: proposalTargetDomainSchema,
    ...proposalTitleReasonFields,
    proposedChanges: captureWellbeingCheckinProposalPayloadSchema,
  }),
  z.object({
    intent: z.literal("log_nutrition_incident"),
    targetDomain: proposalTargetDomainSchema,
    ...proposalTitleReasonFields,
    proposedChanges: logNutritionIncidentProposalPayloadSchema,
  }),
  z.object({
    intent: z.literal("log_workout_activity"),
    targetDomain: proposalTargetDomainSchema,
    ...proposalTitleReasonFields,
    proposedChanges: logWorkoutActivityProposalPayloadSchema,
  }),
  z.object({
    intent: z.literal("save_body_analysis"),
    targetDomain: proposalTargetDomainSchema,
    ...proposalTitleReasonFields,
    proposedChanges: saveBodyAnalysisProposalPayloadSchema,
  }),
]);

export type RawAiProposal = z.infer<typeof rawAiProposalSchema>;

export const chatProposalRevisionSchema = z.object({
  supersededProposalId: z.string().uuid(),
  originalProposal: rawAiProposalSchema,
  modificationFeedback: z.string().min(1).max(2000),
});

export type ChatProposalRevision = z.infer<typeof chatProposalRevisionSchema>;

// ---------------------------------------------------------------------------
// aiProposalSchema — persisted proposal shape with per-intent proposedChanges
// validation.
// ---------------------------------------------------------------------------

const aiProposalCoreSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  threadId: z.string().uuid(),
  sourceMessageId: z.string().uuid().nullable(),
  intent: proposalIntentSchema,
  targetDomain: proposalTargetDomainSchema,
  title: z.string().min(1).max(160),
  reason: z.string().min(1).max(1000),
  evidenceRefs: proposalCorrelationEvidenceRefsSchema.optional(),
  proposedChanges: z.unknown(),
  status: proposalStatusSchema,
  validationStatus: proposalValidationStatusSchema,
  validationErrors: z.array(z.string().min(1).max(500)).default([]),
  userDecisionAt: isoDateTimeSchema.nullable(),
  appliedReference: z.string().min(1).max(200).nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

type AiProposalPersistedFields = Omit<
  z.infer<typeof aiProposalCoreSchema>,
  "intent" | "proposedChanges"
>;

export type AiProposal = AiProposalPersistedFields & RawAiProposal;

export function getProposedChangesSchemaForIntent(intent: ProposalIntent): z.ZodTypeAny {
  switch (intent) {
    case "update_profile":
      return profileProposalChangesSchema;
    case "create_goal":
      return createGoalProposalChangesSchema;
    case "update_goal":
      return updateGoalProposalChangesSchema;
    case "create_workout_plan":
    case "adapt_workout_plan":
      return workoutPlanProposalChangesSchema;
    case "adapt_workout_plan_from_progress":
      return adaptWorkoutPlanFromProgressChangesSchema;
    case "create_nutrition_plan":
      return nutritionPlanPayloadSchema;
    case "adjust_nutrition_plan":
      return nutritionPlanProposalChangesSchema;
    case "recommend_recipes":
      return recipeRecommendationProposalPayloadSchema;
    case "create_today_checklist":
      return todayChecklistPayloadSchema;
    case "create_habit_plan":
      return habitPlanPayloadSchema;
    case "adapt_habit_plan":
      return habitPlanProposalChangesSchema;
    case "summarize_progress":
      return emptyProposalChangesSchema;
    case "capture_wellbeing_checkin":
      return captureWellbeingCheckinProposalPayloadSchema;
    case "log_nutrition_incident":
      return logNutritionIncidentProposalPayloadSchema;
    case "log_workout_activity":
      return logWorkoutActivityProposalPayloadSchema;
    case "save_body_analysis":
      return saveBodyAnalysisProposalPayloadSchema;
    default: {
      const _exhaustive: never = intent;
      return _exhaustive;
    }
  }
}

function addProposedChangesIssues(
  intent: ProposalIntent,
  proposedChanges: unknown,
  ctx: z.RefinementCtx,
) {
  const schema = getProposedChangesSchemaForIntent(intent);
  const result = schema.safeParse(proposedChanges);

  if (!result.success) {
    for (const issue of result.error.issues) {
      ctx.addIssue({
        ...issue,
        path: ["proposedChanges", ...issue.path],
      });
    }
  }
}

export const aiProposalSchema = aiProposalCoreSchema.superRefine((proposal, ctx) => {
  addProposedChangesIssues(proposal.intent, proposal.proposedChanges, ctx);
}) as z.ZodType<AiProposal>;

export const aiStructuredOutputSchema = z.object({
  reply: z.string().min(1).max(8000),
  proposals: z.array(rawAiProposalSchema).max(5).default([]),
});

export type AiStructuredOutput = z.infer<typeof aiStructuredOutputSchema>;
export type AiStructuredOutputInput = z.input<typeof aiStructuredOutputSchema>;

// ---------------------------------------------------------------------------
// Proposal decision / modify schemas
// ---------------------------------------------------------------------------

export const proposalDecisionSchema = z
  .object({
    decision: z.enum(["accept", "reject", "modify"]),
    modificationFeedback: z.string().min(1).max(2000).optional(),
    proposedChanges: z.unknown().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.decision === "modify" && !value.modificationFeedback?.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "modificationFeedback is required when decision is modify.",
        path: ["modificationFeedback"],
      });
    }

    if (value.decision !== "accept" && value.proposedChanges !== undefined) {
      ctx.addIssue({
        code: "custom",
        message: "proposedChanges is only supported when decision is accept.",
        path: ["proposedChanges"],
      });
    }
  });

export type ProposalDecisionInput = z.infer<typeof proposalDecisionSchema>;

export const proposalModifyResponseSchema = z.object({
  proposal: aiProposalSchema,
  revisionContext: z.object({
    supersededProposalId: z.string().uuid(),
    originalIntent: proposalIntentSchema,
    originalTitle: z.string().min(1).max(160),
    originalReason: z.string().min(1).max(1000),
    modificationFeedback: z.string().min(1).max(2000),
    nextAction: z.literal("send_chat_message"),
    suggestedUserMessage: z.string().min(1).max(4000),
  }),
});

export type ProposalModifyResponse = z.infer<typeof proposalModifyResponseSchema>;
