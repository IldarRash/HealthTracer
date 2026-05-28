import { z } from "zod";
import { isoDateSchema } from "./dates.js";
import type { DeterministicProposalTriggersConfig } from "./ai-behavior-config.js";
import { buildDefaultAiBehaviorConfig } from "./ai-behavior-config.js";
import {
  evaluateWellbeingCrisisFromText,
  wellbeingCrisisFlagReasonSchema,
  wellbeingScoreSchema,
  wellbeingTagSchema,
} from "./wellbeing-check-ins.js";
import {
  logNutritionIncidentProposalPayloadSchema,
  type LogNutritionIncidentProposalPayload,
} from "./nutrition-incidents.js";
type ChatProposalDraft = {
  intent: string;
  targetDomain: string;
  title: string;
  reason: string;
  proposedChanges: unknown;
};

export const captureWellbeingCheckinProposalPayloadSchema = z
  .object({
    date: isoDateSchema,
    moodScore: wellbeingScoreSchema,
    stressScore: wellbeingScoreSchema,
    energyLevel: wellbeingScoreSchema.optional(),
    note: z.string().min(1).max(280).nullable().optional(),
    tags: z.array(wellbeingTagSchema).max(8).optional(),
    safetyFlags: z.array(wellbeingCrisisFlagReasonSchema).max(2).optional(),
  })
  .strict();

export type CaptureWellbeingCheckinProposalPayload = z.infer<
  typeof captureWellbeingCheckinProposalPayloadSchema
>;

export function normalizeChatTriggerMessage(message: string): string {
  return message.trim().toLowerCase();
}

function containsPhrase(normalizedMessage: string, phrases: readonly string[]): boolean {
  return phrases.some((phrase) => normalizedMessage.includes(phrase));
}

export function containsLowMoodStressFatigueSignal(
  normalizedMessage: string,
  config: DeterministicProposalTriggersConfig = buildDefaultAiBehaviorConfig()
    .deterministicProposalTriggers,
): boolean {
  return containsPhrase(normalizedMessage, config.wellbeingCheckin.moodPhrases);
}

export function containsNutritionIncidentSignal(
  normalizedMessage: string,
  config: DeterministicProposalTriggersConfig = buildDefaultAiBehaviorConfig()
    .deterministicProposalTriggers,
): boolean {
  return containsPhrase(normalizedMessage, config.nutritionIncident.phrases);
}

export function containsRecipeRecommendationSignal(
  normalizedMessage: string,
  config: DeterministicProposalTriggersConfig = buildDefaultAiBehaviorConfig()
    .deterministicProposalTriggers,
): boolean {
  return containsPhrase(normalizedMessage, config.recipeRecommendation.phrases);
}

export function shouldTriggerWellbeingCheckinProposal(
  message: string,
  hasTodayWellbeingCheckIn: boolean,
  config: DeterministicProposalTriggersConfig = buildDefaultAiBehaviorConfig()
    .deterministicProposalTriggers,
): boolean {
  const triggerConfig = config.wellbeingCheckin;

  if (!triggerConfig.enabled) {
    return false;
  }

  if (triggerConfig.requireNoTodayCheckIn && hasTodayWellbeingCheckIn) {
    return false;
  }

  const normalized = normalizeChatTriggerMessage(message);
  const crisis = evaluateWellbeingCrisisFromText(message);

  if (triggerConfig.skipWhenCrisis && crisis.shouldShowCrisisSupport) {
    return false;
  }

  if (
    triggerConfig.excludeWhenNutritionIncidentSignal &&
    containsNutritionIncidentSignal(normalized, config)
  ) {
    return false;
  }

  if (triggerConfig.excludeContainsPhrases.some((phrase) => normalized.includes(phrase))) {
    return false;
  }

  return containsLowMoodStressFatigueSignal(normalized, config);
}

export function shouldTriggerNutritionIncidentProposal(
  message: string,
  config: DeterministicProposalTriggersConfig = buildDefaultAiBehaviorConfig()
    .deterministicProposalTriggers,
): boolean {
  const triggerConfig = config.nutritionIncident;

  if (!triggerConfig.enabled) {
    return false;
  }

  const normalized = normalizeChatTriggerMessage(message);
  const crisis = evaluateWellbeingCrisisFromText(message);

  if (triggerConfig.skipWhenCrisis && crisis.shouldShowCrisisSupport) {
    return false;
  }

  return containsNutritionIncidentSignal(normalized, config);
}

export function shouldTriggerRecipeRecommendationRequest(
  message: string,
  config: DeterministicProposalTriggersConfig = buildDefaultAiBehaviorConfig()
    .deterministicProposalTriggers,
): boolean {
  const triggerConfig = config.recipeRecommendation;

  if (!triggerConfig.enabled) {
    return false;
  }

  const normalized = normalizeChatTriggerMessage(message);
  const crisis = evaluateWellbeingCrisisFromText(message);

  if (triggerConfig.skipWhenCrisis && crisis.shouldShowCrisisSupport) {
    return false;
  }

  if (
    triggerConfig.excludeWhenNutritionIncidentSignal &&
    containsNutritionIncidentSignal(normalized, config)
  ) {
    return false;
  }

  return containsRecipeRecommendationSignal(normalized, config);
}

export function buildWellbeingCheckinProposal(todayIsoDate: string): ChatProposalDraft {
  return {
    intent: "capture_wellbeing_checkin",
    targetDomain: "general",
    title: "Wellbeing check-in",
    reason:
      "You mentioned feeling off today and have not logged a wellbeing check-in yet. Review and edit before saving.",
    proposedChanges: {
      date: todayIsoDate,
      moodScore: 2,
      stressScore: 3,
      energyLevel: 2,
      note: null,
      tags: [],
      safetyFlags: [],
    } satisfies CaptureWellbeingCheckinProposalPayload,
  };
}

export function buildTextEstimateNutritionIncidentProposal(
  incidentDateTime: string,
): ChatProposalDraft {
  const payload: LogNutritionIncidentProposalPayload =
    logNutritionIncidentProposalPayloadSchema.parse({
      incidentDateTime,
      items: [
        {
          name: "Mixed meal estimate",
          quantity: "1 serving",
          calories: 650,
          proteinGrams: 25,
          carbsGrams: 70,
          fatGrams: 28,
        },
      ],
      estimatedCalories: 650,
      estimatedMacros: {
        proteinGrams: 25,
        carbsGrams: 70,
        fatGrams: 28,
      },
      confidence: "medium",
      provenance: {
        source: "text_estimate",
        providerId: "chat_trigger",
      },
      imageRefs: [],
    });

  return {
    intent: "log_nutrition_incident",
    targetDomain: "nutrition",
    title: "Log nutrition incident",
    reason:
      "Review this estimate, edit items or quantities, or add a food photo before confirming. Nothing is saved until you apply.",
    proposedChanges: payload,
  };
}

export function buildRecipeRecommendationProposal(input: {
  relatedNutritionPlanRevisionId: string | null;
  recommendations: Array<{ recipeId: string; reason: string; fitSummary: string }>;
}): ChatProposalDraft {
  return {
    intent: "recommend_recipes",
    targetDomain: "recipe",
    title: "Recipe ideas for your plan",
    reason:
      "These recipe ideas were selected to fit your active nutrition plan. Review source, confidence, and estimated macros before saving.",
    proposedChanges: input,
  };
}

export function mergeDeterministicChatProposals<T extends ChatProposalDraft>(input: {
  userMessage: string;
  todayIsoDate: string;
  hasTodayWellbeingCheckIn: boolean;
  aiProposals: T[];
  now?: Date;
  triggerConfig?: DeterministicProposalTriggersConfig;
}): Array<T | ChatProposalDraft> {
  const triggerConfig =
    input.triggerConfig ?? buildDefaultAiBehaviorConfig().deterministicProposalTriggers;
  const crisis = evaluateWellbeingCrisisFromText(input.userMessage);

  if (crisis.shouldShowCrisisSupport) {
    return input.aiProposals;
  }

  const merged: Array<T | ChatProposalDraft> = [...input.aiProposals];
  const hasIntent = (intent: string) => merged.some((proposal) => proposal.intent === intent);

  if (
    shouldTriggerWellbeingCheckinProposal(
      input.userMessage,
      input.hasTodayWellbeingCheckIn,
      triggerConfig,
    ) &&
    !hasIntent("capture_wellbeing_checkin")
  ) {
    merged.push(buildWellbeingCheckinProposal(input.todayIsoDate));
  }

  if (
    shouldTriggerNutritionIncidentProposal(input.userMessage, triggerConfig) &&
    !hasIntent("log_nutrition_incident")
  ) {
    merged.push(
      buildTextEstimateNutritionIncidentProposal((input.now ?? new Date()).toISOString()),
    );
  }

  return merged.slice(0, triggerConfig.maxMergedProposals);
}

export const WELLBEING_CHECKIN_STALE_PROPOSAL_DATE_ERROR =
  "proposedChanges.date: A wellbeing check-in already exists for this day and cannot be overwritten by a stale proposal.";

export function parseWellbeingCheckinAppliedReferenceId(
  appliedReference: string | null | undefined,
): string | null {
  const prefix = "wellbeing_checkin:";

  if (!appliedReference?.startsWith(prefix)) {
    return null;
  }

  const checkInId = appliedReference.slice(prefix.length);

  return checkInId.length > 0 ? checkInId : null;
}

export function getWellbeingCheckinProposalDomainErrors(
  payload: CaptureWellbeingCheckinProposalPayload,
  expectedDate: string,
  options?: {
    existingCheckInId?: string | null;
    appliedReference?: string | null;
  },
): string[] {
  const errors: string[] = [];

  if (payload.date !== expectedDate) {
    errors.push("proposedChanges.date: Wellbeing check-in date must match the user's current day.");
  }

  if (payload.safetyFlags?.includes("keyword_match")) {
    errors.push(
      "proposedChanges.safetyFlags: Crisis keyword flags cannot be set through chat proposals.",
    );
  }

  const existingCheckInId = options?.existingCheckInId ?? null;

  if (existingCheckInId) {
    const sameAcceptedProposalRecord =
      options?.appliedReference === `wellbeing_checkin:${existingCheckInId}`;

    if (!sameAcceptedProposalRecord) {
      errors.push(WELLBEING_CHECKIN_STALE_PROPOSAL_DATE_ERROR);
    }
  }

  return errors;
}
