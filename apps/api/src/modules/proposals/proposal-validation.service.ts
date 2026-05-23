import {
  adaptWorkoutPlanFromProgressChangesSchema,
  createGoalProposalChangesSchema,
  getNutritionPlanDomainErrors,
  nutritionPlanPayloadSchema,
  profileProposalChangesSchema,
  rawAiProposalSchema,
  recipeRecommendationProposalPayloadSchema,
  todayChecklistPayloadSchema,
  updateGoalProposalChangesSchema,
  workoutPlanPayloadSchema,
  type AdaptWorkoutPlanFromProgressChanges,
  type NutritionPlanPayload,
  type ProposalIntent,
  type RawAiProposal,
} from "@health/types";
import { Injectable } from "@nestjs/common";
import type { z } from "zod";
import { ProgressRepository } from "../progress/progress.repository.js";

export interface ProposalValidationResult {
  valid: boolean;
  errors: string[];
}

@Injectable()
export class ProposalValidationService {
  constructor(private readonly progressRepository: ProgressRepository) {}

  validateRawProposal(proposal: RawAiProposal): ProposalValidationResult {
    const envelope = rawAiProposalSchema.safeParse(proposal);

    if (!envelope.success) {
      return {
        valid: false,
        errors: envelope.error.issues.map(
          (issue) => `${issue.path.join(".") || "proposal"}: ${issue.message}`,
        ),
      };
    }

    return this.validateStoredProposal(envelope.data.intent, envelope.data.proposedChanges);
  }

  validateStoredProposal(
    intent: ProposalIntent,
    proposedChanges: unknown,
  ): ProposalValidationResult {
    const schema = getChangesSchemaForIntent(intent);

    if (!schema) {
      return { valid: true, errors: [] };
    }

    const result = schema.safeParse(proposedChanges);

    if (!result.success) {
      return {
        valid: false,
        errors: result.error.issues.map(
          (issue) => `${issue.path.join(".") || "proposedChanges"}: ${issue.message}`,
        ),
      };
    }

    if (
      intent === "create_nutrition_plan" ||
      intent === "adjust_nutrition_plan"
    ) {
      const domainErrors = getNutritionPlanDomainErrors(
        result.data as NutritionPlanPayload,
      );

      if (domainErrors.length > 0) {
        return { valid: false, errors: domainErrors };
      }
    }

    return { valid: true, errors: [] };
  }

  async validateProvenanceOwnership(
    userId: string,
    intent: ProposalIntent,
    proposedChanges: unknown,
  ): Promise<string[]> {
    if (intent !== "adapt_workout_plan_from_progress") {
      return [];
    }

    const parsed = adaptWorkoutPlanFromProgressChangesSchema.safeParse(proposedChanges);

    if (!parsed.success) {
      return [];
    }

    return this.getProgressProvenanceErrors(userId, parsed.data);
  }

  private async getProgressProvenanceErrors(
    userId: string,
    payload: AdaptWorkoutPlanFromProgressChanges,
  ): Promise<string[]> {
    const errors: string[] = [];

    if (payload.sourceSummaryId) {
      const summaryExists = await this.progressRepository.summaryExistsForUser(
        userId,
        payload.sourceSummaryId,
      );

      if (!summaryExists) {
        errors.push(
          "proposedChanges.sourceSummaryId: Weekly progress summary was not found for this user.",
        );
      }
    }

    const trendIds = payload.sourceTrendObservationIds;

    if (trendIds.length > 0) {
      const ownedTrends = await this.progressRepository.findTrendsOwnedByUser(
        userId,
        trendIds,
      );

      if (ownedTrends.length !== trendIds.length) {
        errors.push(
          "proposedChanges.sourceTrendObservationIds: One or more cited trend observations were not found for this user.",
        );
      } else if (payload.sourceSummaryId) {
        const mismatched = ownedTrends.some(
          (trend) => trend.summaryId !== payload.sourceSummaryId,
        );

        if (mismatched) {
          errors.push(
            "proposedChanges.sourceTrendObservationIds: One or more cited trend observations do not belong to the cited weekly progress summary.",
          );
        }
      }
    }

    return errors;
  }
}

function getChangesSchemaForIntent(
  intent: ProposalIntent,
): z.ZodType | null {
  switch (intent) {
    case "update_profile":
      return profileProposalChangesSchema;
    case "create_goal":
      return createGoalProposalChangesSchema;
    case "update_goal":
      return updateGoalProposalChangesSchema;
    case "create_workout_plan":
    case "adapt_workout_plan":
      return workoutPlanPayloadSchema;
    case "adapt_workout_plan_from_progress":
      return adaptWorkoutPlanFromProgressChangesSchema;
    case "create_nutrition_plan":
    case "adjust_nutrition_plan":
      return nutritionPlanPayloadSchema;
    case "recommend_recipes":
      return recipeRecommendationProposalPayloadSchema;
    case "create_today_checklist":
      return todayChecklistPayloadSchema;
    case "summarize_progress":
      return null;
    default:
      return null;
  }
}
