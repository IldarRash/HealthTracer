import type {
  AiDocumentContextSummary,
  AiMetricsContextSummary,
  Goal,
  User,
  UserProfile,
  WeeklyProgressSummaryResponse,
  WorkoutPlanCoachingSummary,
} from "@health/types";
import {
  summarizeWorkoutPlanForCoaching,
  workoutPlanPayloadSchema,
} from "@health/types";
import { Injectable } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { DocumentsService } from "../documents/documents.service.js";
import { GoalsService } from "../goals/goals.service.js";
import { MetricsAiContextService } from "../health-metrics/metrics-ai-context.service.js";
import { NutritionRepository } from "../nutrition/nutrition.repository.js";
import { ProgressService } from "../progress/progress.service.js";
import { ProfilesService } from "../profiles/profiles.service.js";
import { UsersService } from "../users/users.service.js";
import { WorkoutsRepository } from "../workouts/workouts.repository.js";

export interface CoachingContextSnapshot {
  user: User;
  profile: UserProfile | null;
  goals: Goal[];
  activeWorkoutRevisionId: string | null;
  activeWorkoutPlanSummary: WorkoutPlanCoachingSummary | null;
  activeNutritionRevisionId: string | null;
  weeklyProgressSummary: WeeklyProgressSummaryResponse | null;
  documentContext: AiDocumentContextSummary;
  metricsSummary: AiMetricsContextSummary;
}

@Injectable()
export class CoachingContextService {
  constructor(
    private readonly usersService: UsersService,
    private readonly profilesService: ProfilesService,
    private readonly goalsService: GoalsService,
    private readonly workoutsRepository: WorkoutsRepository,
    private readonly nutritionRepository: NutritionRepository,
    private readonly progressService: ProgressService,
    private readonly documentsService: DocumentsService,
    private readonly metricsAiContextService: MetricsAiContextService,
  ) {}

  async buildSnapshot(auth: ClerkAuthContext): Promise<CoachingContextSnapshot> {
    const user = await this.usersService.resolveFromAuth(auth);
    const [
      profile,
      goals,
      workoutPlan,
      nutritionPlan,
      weeklyProgressSummary,
      documentContext,
      metricsSummary,
    ] = await Promise.all([
      this.profilesService.getCurrentProfile(auth),
      this.goalsService.listCurrentGoals(auth),
      this.workoutsRepository.findActivePlanByUserId(user.id),
      this.nutritionRepository.findActivePlanByUserId(user.id),
      this.progressService.getLatestSummarySnapshot(user.id),
      this.documentsService.buildDocumentContextSummary(user.id),
      this.metricsAiContextService.buildSummaryForUser(user.id),
    ]);

    let activeWorkoutPlanSummary: WorkoutPlanCoachingSummary | null = null;

    if (workoutPlan?.activeRevisionId) {
      const activeRevision = await this.workoutsRepository.findActiveRevisionByPlanId(
        workoutPlan.id,
        workoutPlan.activeRevisionId,
      );
      const parsedPayload = workoutPlanPayloadSchema.safeParse(activeRevision?.payload);

      if (parsedPayload.success) {
        activeWorkoutPlanSummary = summarizeWorkoutPlanForCoaching(parsedPayload.data);
      }
    }

    return {
      user,
      profile,
      goals,
      activeWorkoutRevisionId: workoutPlan?.activeRevisionId ?? null,
      activeWorkoutPlanSummary,
      activeNutritionRevisionId: nutritionPlan?.activeRevisionId ?? null,
      weeklyProgressSummary,
      documentContext,
      metricsSummary,
    };
  }

  toPromptContext(snapshot: CoachingContextSnapshot): Record<string, unknown> {
    return {
      user: {
        id: snapshot.user.id,
        timezone: snapshot.user.timezone,
        displayName: snapshot.user.displayName,
      },
      profile: snapshot.profile
        ? {
            activityLevel: snapshot.profile.activityLevel,
            trainingExperience: snapshot.profile.trainingExperience,
            preferences: snapshot.profile.preferences,
            constraints: snapshot.profile.constraints,
          }
        : null,
      goals: snapshot.goals.map((goal) => ({
        id: goal.id,
        type: goal.type,
        status: goal.status,
        priority: goal.priority,
        title: goal.title,
      })),
      activeWorkoutRevisionId: snapshot.activeWorkoutRevisionId,
      activeWorkoutPlan: snapshot.activeWorkoutPlanSummary,
      activeNutritionRevisionId: snapshot.activeNutritionRevisionId,
      weeklyProgressSummary: snapshot.weeklyProgressSummary
        ? {
            weekStart: snapshot.weeklyProgressSummary.summary.weekStart,
            weekEnd: snapshot.weeklyProgressSummary.summary.weekEnd,
            dataStatus: snapshot.weeklyProgressSummary.summary.dataStatus,
            userMessage: snapshot.weeklyProgressSummary.summary.userMessage,
            workout: snapshot.weeklyProgressSummary.summary.sourceAggregates.workout,
            deferredDomains: snapshot.weeklyProgressSummary.summary.deferredDomains.map(
              (domain) => ({
                domain: domain.domain,
                message: domain.message,
              }),
            ),
            trends: snapshot.weeklyProgressSummary.trends.map((trend) => ({
              id: trend.id,
              domain: trend.domain,
              trendType: trend.trendType,
              direction: trend.direction,
              dataSufficiency: trend.dataSufficiency,
              message: trend.message,
            })),
          }
        : null,
      documentContext: snapshot.documentContext,
      metricsSummary: snapshot.metricsSummary,
    };
  }
}
