import {
  createGoalProposalChangesSchema,
  nutritionPlanPayloadSchema,
  profileProposalChangesSchema,
  rawAiProposalSchema,
  todayChecklistPayloadSchema,
  updateGoalProposalChangesSchema,
  workoutPlanPayloadSchema,
  type ProposalIntent,
  type RawAiProposal,
} from "@health/types";
import { Injectable } from "@nestjs/common";
import type { z } from "zod";

export interface ProposalValidationResult {
  valid: boolean;
  errors: string[];
}

@Injectable()
export class ProposalValidationService {
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

    return { valid: true, errors: [] };
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
    case "create_nutrition_plan":
    case "adjust_nutrition_plan":
      return nutritionPlanPayloadSchema;
    case "create_today_checklist":
      return todayChecklistPayloadSchema;
    case "summarize_progress":
      return null;
    default:
      return null;
  }
}
