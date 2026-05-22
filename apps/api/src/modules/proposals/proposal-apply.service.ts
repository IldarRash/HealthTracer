import type { AiProposalRow } from "../chat/chat.repository.js";
import type { ClerkAuthContext } from "../../auth.types.js";
import {
  createGoalProposalChangesSchema,
  nutritionPlanPayloadSchema,
  profileProposalChangesSchema,
  todayChecklistPayloadSchema,
  updateGoalProposalChangesSchema,
  workoutPlanPayloadSchema,
} from "@health/types";
import { BadRequestException, Injectable } from "@nestjs/common";
import { GoalsService } from "../goals/goals.service.js";
import { NutritionService } from "../nutrition/nutrition.service.js";
import { ProfilesService } from "../profiles/profiles.service.js";
import { TodayService } from "../today/today.service.js";
import { WorkoutsService } from "../workouts/workouts.service.js";

@Injectable()
export class ProposalApplyService {
  constructor(
    private readonly profilesService: ProfilesService,
    private readonly goalsService: GoalsService,
    private readonly workoutsService: WorkoutsService,
    private readonly nutritionService: NutritionService,
    private readonly todayService: TodayService,
  ) {}

  async applyAcceptedProposal(
    auth: ClerkAuthContext,
    userId: string,
    proposal: AiProposalRow,
  ): Promise<string> {
    switch (proposal.intent) {
      case "update_profile": {
        const changes = profileProposalChangesSchema.parse(proposal.proposedChanges);
        const profile = await this.profilesService.upsertCurrentProfile(auth, changes);

        return `profile:${profile.id}`;
      }
      case "create_goal": {
        const changes = createGoalProposalChangesSchema.parse(proposal.proposedChanges);
        const goal = await this.goalsService.createCurrentGoal(auth, changes);

        return `goal:${goal.id}`;
      }
      case "update_goal": {
        const changes = updateGoalProposalChangesSchema.parse(proposal.proposedChanges);
        const goal = await this.goalsService.updateCurrentGoal(
          auth,
          changes.goalId,
          changes.changes,
        );

        return `goal:${goal.id}`;
      }
      case "create_workout_plan":
      case "adapt_workout_plan": {
        const payload = workoutPlanPayloadSchema.parse(proposal.proposedChanges);

        return this.workoutsService.applyWorkoutPlanProposal(
          userId,
          payload,
          proposal.reason,
          proposal.intent,
        );
      }
      case "create_nutrition_plan":
      case "adjust_nutrition_plan": {
        const payload = nutritionPlanPayloadSchema.parse(proposal.proposedChanges);

        return this.nutritionService.applyNutritionPlanProposal(
          userId,
          payload,
          proposal.reason,
          proposal.intent,
        );
      }
      case "create_today_checklist": {
        const payload = todayChecklistPayloadSchema.parse(proposal.proposedChanges);

        return this.todayService.applyTodayChecklistProposal(userId, payload);
      }
      case "summarize_progress":
        return `summary:${proposal.id}`;
      default:
        throw new BadRequestException("Unsupported proposal intent.");
    }
  }
}
