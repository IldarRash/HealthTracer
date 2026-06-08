import type { AiProposalRow } from "../chat/chat.repository.js";
import type { ClerkAuthContext } from "../../auth.types.js";
import {
  adaptWorkoutPlanFromProgressChangesSchema,
  adjustNutritionPlanFromProgressChangesSchema,
  captureWellbeingCheckinProposalPayloadSchema,
  createGoalProposalChangesSchema,
  extractHabitPlanPayload,
  extractNutritionPlanPayload,
  generateWeeklyProgressSummarySchema,
  habitPlanProposalChangesSchema,
  logNutritionIncidentProposalPayloadSchema,
  mergeRecoveryMetadataIntoWorkoutPlanProposal,
  nutritionPlanPayloadSchema,
  parseWellbeingCheckinAppliedReferenceId,
  profileProposalChangesSchema,
  recipeRecommendationProposalPayloadSchema,
  saveBodyAnalysisProposalPayloadSchema,
  todayChecklistPayloadSchema,
  updateGoalProposalChangesSchema,
  workoutPlanProposalChangesSchema,
  logWorkoutActivityProposalPayloadSchema,
} from "@health/types";
import { BadRequestException, Injectable } from "@nestjs/common";
import type { HealthDatabaseTransaction } from "../../database/database.types.js";
import { BodyService } from "../body/body.service.js";
import { GoalsService } from "../goals/goals.service.js";
import { HabitsService } from "../habits/habits.service.js";
import { NutritionService } from "../nutrition/nutrition.service.js";
import { ProfilesService } from "../profiles/profiles.service.js";
import { ProgressService } from "../progress/progress.service.js";
import { RecipesService } from "../recipes/recipes.service.js";
import { TodayService } from "../today/today.service.js";
import { WellbeingCheckInsService } from "../wellbeing-check-ins/wellbeing-check-ins.service.js";
import { WorkoutsService } from "../workouts/workouts.service.js";

@Injectable()
export class ProposalApplyService {
  constructor(
    private readonly profilesService: ProfilesService,
    private readonly goalsService: GoalsService,
    private readonly workoutsService: WorkoutsService,
    private readonly nutritionService: NutritionService,
    private readonly habitsService: HabitsService,
    private readonly recipesService: RecipesService,
    private readonly todayService: TodayService,
    private readonly progressService: ProgressService,
    private readonly wellbeingCheckInsService: WellbeingCheckInsService,
    private readonly bodyService: BodyService,
  ) {}

  async applyAcceptedProposal(
    auth: ClerkAuthContext,
    userId: string,
    proposal: AiProposalRow,
    tx?: HealthDatabaseTransaction,
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
        const payload = workoutPlanProposalChangesSchema.parse(proposal.proposedChanges);

        return this.workoutsService.applyWorkoutPlanProposal(
          userId,
          payload,
          proposal.reason,
        );
      }
      case "adapt_workout_plan_from_progress": {
        const changes = adaptWorkoutPlanFromProgressChangesSchema.parse(
          proposal.proposedChanges,
        );
        const payload = mergeRecoveryMetadataIntoWorkoutPlanProposal(changes.plan, {
          recoverySourceRefs: changes.recoverySourceRefs,
          allowVolumeIncrease: changes.allowVolumeIncrease,
        });

        return this.workoutsService.applyWorkoutPlanProposal(
          userId,
          payload,
          proposal.reason,
        );
      }
      case "create_nutrition_plan":
      case "adjust_nutrition_plan": {
        const payload = extractNutritionPlanPayload(
          nutritionPlanPayloadSchema.or(adjustNutritionPlanFromProgressChangesSchema).parse(
            proposal.proposedChanges,
          ),
        );

        return this.nutritionService.applyNutritionPlanProposal(
          userId,
          payload,
          proposal.reason,
          proposal.intent,
        );
      }
      case "create_habit_plan":
      case "adapt_habit_plan": {
        const payload = extractHabitPlanPayload(
          habitPlanProposalChangesSchema.parse(proposal.proposedChanges),
        );

        return this.habitsService.applyHabitPlanProposal(
          userId,
          payload,
          proposal.reason,
          proposal.intent,
        );
      }
      case "recommend_recipes": {
        const payload = recipeRecommendationProposalPayloadSchema.parse(
          proposal.proposedChanges,
        );

        return this.recipesService.applyRecipeRecommendationProposal(
          userId,
          payload,
          proposal.reason,
        );
      }
      case "create_today_checklist": {
        const payload = todayChecklistPayloadSchema.parse(proposal.proposedChanges);

        return this.todayService.applyTodayChecklistProposal(userId, payload);
      }
      case "summarize_progress": {
        const input = generateWeeklyProgressSummarySchema.parse(proposal.proposedChanges ?? {});
        const result = await this.progressService.generateWeeklySummary(auth, {
          weekStart: input.weekStart,
          refresh: true,
        });

        return `summary:${result.summary.id}`;
      }
      case "capture_wellbeing_checkin": {
        const payload = captureWellbeingCheckinProposalPayloadSchema.parse(
          proposal.proposedChanges,
        );
        const tags = [...(payload.tags ?? [])];

        if (payload.energyLevel != null) {
          tags.push(`energy:${payload.energyLevel}`);
        }

        const expectedExistingCheckInId = parseWellbeingCheckinAppliedReferenceId(
          proposal.appliedReference,
        );
        const result = await this.wellbeingCheckInsService.createCheckInForDateIfAbsent(
          auth,
          payload.date,
          {
            moodScore: payload.moodScore,
            stressScore: payload.stressScore,
            tags: tags.length > 0 ? tags : undefined,
            note: payload.note,
            source: "user_entry",
          },
          { expectedExistingCheckInId },
        );

        return `wellbeing_checkin:${result.checkIn.id}`;
      }
      case "log_nutrition_incident": {
        const payload = logNutritionIncidentProposalPayloadSchema.parse(
          proposal.proposedChanges,
        );

        const incidentId = await this.nutritionService.applyNutritionIncidentProposal(
          userId,
          proposal.id,
          payload,
          tx,
        );

        return `nutrition_incident:${incidentId}`;
      }
      case "log_workout_activity": {
        const payload = logWorkoutActivityProposalPayloadSchema.parse(
          proposal.proposedChanges,
        );

        return this.workoutsService.applyLogWorkoutActivityProposal(
          userId,
          payload,
          proposal.reason,
          tx,
        );
      }
      case "save_body_analysis": {
        const payload = saveBodyAnalysisProposalPayloadSchema.parse(
          proposal.proposedChanges,
        );

        return this.bodyService.applyBodyAnalysisProposal(
          userId,
          proposal.id,
          payload,
        );
      }
      default:
        throw new BadRequestException("Unsupported proposal intent.");
    }
  }
}
