import type {
  AgentContextPacket,
  AiDocumentContextSummary,
  AiDocumentSignalContextSummary,
  AiMetricsContextSummary,
  AiRecoveryContextSummary,
  AiWellbeingContextSummary,
  BuildAgentContextRequest,
  CoachingHierarchySummary,
  CorrelationInsightPreviewResponse,
  GetUserContextSliceInput,
  Goal,
  HabitAdherenceCoachingSummary,
  HabitPlanCoachingSummary,
  NutritionPlanPayload,
  PersonalContextSummary,
  User,
  UserContextSlice,
  UserProfile,
  WeeklyProgressSummaryResponse,
  WorkoutPlanCoachingSummary,
} from "@health/types";
import {
  agentContextPacketSchema,
  buildCoachingHierarchySummary,
  DEFAULT_AGENT_SAFETY_CONSTRAINTS,
  getTodayIsoDateInTimezone,
  getUserContextSliceInputSchema,
  getWeekStartIsoDate,
  habitPlanPayloadSchema,
  INTENT_TO_SLICE_PURPOSE,
  nutritionPlanPayloadSchema,
  summarizeHabitPlanForCoaching,
  summarizePersonalContext,
  summarizeWorkoutPlanForCoaching,
  workoutPlanPayloadSchema,
} from "@health/types";
import { Injectable } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { buildAgentPromptContextFromPacket } from "./agent-prompt-context.js";
import { buildUserContextSliceFromSnapshot, resolveSliceOptions } from "./user-context-slice.builder.js";
import { DocumentsService } from "../documents/documents.service.js";
import { DocumentSignalsService } from "../documents/document-signals.service.js";
import { CorrelationsService } from "../documents/correlations.service.js";
import { GoalsService } from "../goals/goals.service.js";
import { HabitsRepository } from "../habits/habits.repository.js";
import { HabitsService } from "../habits/habits.service.js";
import { MetricsAiContextService } from "../health-metrics/metrics-ai-context.service.js";
import { RecoveryAiContextService } from "../recovery/recovery-ai-context.service.js";
import { WellbeingAiContextService } from "../wellbeing-check-ins/wellbeing-ai-context.service.js";
import { NutritionRepository } from "../nutrition/nutrition.repository.js";
import { ProgressService } from "../progress/progress.service.js";
import { ProfilesService } from "../profiles/profiles.service.js";
import { UsersService } from "../users/users.service.js";
import { WorkoutsRepository } from "../workouts/workouts.repository.js";

export interface CoachingContextSnapshot {
  user: User;
  profile: UserProfile | null;
  goals: Goal[];
  onboardingCompleted: boolean;
  coachingHierarchy: CoachingHierarchySummary;
  personalContextSummary: PersonalContextSummary;
  activeWorkoutRevisionId: string | null;
  activeWorkoutPlanSummary: WorkoutPlanCoachingSummary | null;
  activeNutritionRevisionId: string | null;
  activeHabitRevisionId: string | null;
  activeHabitPlanSummary: HabitPlanCoachingSummary | null;
  recentHabitAdherenceSummary: HabitAdherenceCoachingSummary | null;
  weeklyProgressSummary: WeeklyProgressSummaryResponse | null;
  documentContext: AiDocumentContextSummary;
  documentSignalContext: AiDocumentSignalContextSummary;
  correlationInsights: CorrelationInsightPreviewResponse;
  metricsSummary: AiMetricsContextSummary;
  wellbeingSummary: AiWellbeingContextSummary;
  recoveryContext: AiRecoveryContextSummary;
}

@Injectable()
export class CoachingContextService {
  constructor(
    private readonly usersService: UsersService,
    private readonly profilesService: ProfilesService,
    private readonly goalsService: GoalsService,
    private readonly workoutsRepository: WorkoutsRepository,
    private readonly nutritionRepository: NutritionRepository,
    private readonly habitsRepository: HabitsRepository,
    private readonly habitsService: HabitsService,
    private readonly progressService: ProgressService,
    private readonly documentsService: DocumentsService,
    private readonly documentSignalsService: DocumentSignalsService,
    private readonly correlationsService: CorrelationsService,
    private readonly metricsAiContextService: MetricsAiContextService,
    private readonly wellbeingAiContextService: WellbeingAiContextService,
    private readonly recoveryAiContextService: RecoveryAiContextService,
  ) {}

  async buildSnapshot(auth: ClerkAuthContext): Promise<CoachingContextSnapshot> {
    const user = await this.usersService.resolveFromAuth(auth);
    const [
      profile,
      goals,
      workoutPlan,
      nutritionPlan,
      habitPlan,
      weeklyProgressSummary,
      documentContext,
      documentSignalContext,
      correlationInsights,
      metricsSummary,
      wellbeingSummary,
      recoveryContext,
    ] = await Promise.all([
      this.profilesService.getCurrentProfile(auth),
      this.goalsService.listCurrentGoals(auth),
      this.workoutsRepository.findActivePlanByUserId(user.id),
      this.nutritionRepository.findActivePlanByUserId(user.id),
      this.habitsRepository.findActivePlanByUserId(user.id),
      this.progressService.getLatestSummarySnapshot(user.id),
      this.documentsService.buildDocumentContextSummary(user.id),
      this.documentSignalsService.buildSignalContextSummary(user.id),
      this.correlationsService.previewInsights(auth),
      this.metricsAiContextService.buildSummaryForUser(user.id),
      this.wellbeingAiContextService.buildSummaryForUser(user.id, user.timezone),
      this.recoveryAiContextService.buildSummaryForUser(user.id, user.timezone),
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

    let activeHabitPlanSummary: HabitPlanCoachingSummary | null = null;

    if (habitPlan?.activeRevisionId) {
      const activeRevision = await this.habitsRepository.findActiveRevisionByPlanId(
        habitPlan.id,
        habitPlan.activeRevisionId,
      );
      const parsedPayload = habitPlanPayloadSchema.safeParse(activeRevision?.payload);

      if (parsedPayload.success) {
        activeHabitPlanSummary = summarizeHabitPlanForCoaching(parsedPayload.data);
      }
    }

    const recentHabitAdherenceSummary = await this.habitsService.getRecentAdherenceForCoaching(
      user.id,
      user.timezone,
    );
    const weekStart = getWeekStartIsoDate(getTodayIsoDateInTimezone(user.timezone));

    return {
      user,
      profile,
      goals,
      onboardingCompleted: user.onboardingCompletedAt != null,
      coachingHierarchy: buildCoachingHierarchySummary(profile, goals, weekStart),
      personalContextSummary: summarizePersonalContext(profile),
      activeWorkoutRevisionId: workoutPlan?.activeRevisionId ?? null,
      activeWorkoutPlanSummary,
      activeNutritionRevisionId: nutritionPlan?.activeRevisionId ?? null,
      activeHabitRevisionId: habitPlan?.activeRevisionId ?? null,
      activeHabitPlanSummary,
      recentHabitAdherenceSummary,
      weeklyProgressSummary,
      documentContext,
      documentSignalContext,
      correlationInsights,
      metricsSummary,
      wellbeingSummary,
      recoveryContext,
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
            longevityDirection: snapshot.profile.longevityDirection,
            coachingNotes: snapshot.profile.coachingNotes,
          }
        : null,
      onboardingCompleted: snapshot.onboardingCompleted,
      coachingHierarchy: snapshot.coachingHierarchy,
      personalContextSummary: snapshot.personalContextSummary,
      goals: snapshot.goals.map((goal) => ({
        id: goal.id,
        type: goal.type,
        status: goal.status,
        priority: goal.priority,
        title: goal.title,
        horizon: goal.horizon,
        weekStart: goal.weekStart,
      })),
      activeWorkoutRevisionId: snapshot.activeWorkoutRevisionId,
      activeWorkoutPlan: snapshot.activeWorkoutPlanSummary,
      activeNutritionRevisionId: snapshot.activeNutritionRevisionId,
      activeHabitRevisionId: snapshot.activeHabitRevisionId,
      activeHabitPlan: snapshot.activeHabitPlanSummary,
      recentHabitAdherenceSummary: snapshot.recentHabitAdherenceSummary,
      weeklyProgressSummary: snapshot.weeklyProgressSummary
        ? {
            weekStart: snapshot.weeklyProgressSummary.summary.weekStart,
            weekEnd: snapshot.weeklyProgressSummary.summary.weekEnd,
            dataStatus: snapshot.weeklyProgressSummary.summary.dataStatus,
            userMessage: snapshot.weeklyProgressSummary.summary.userMessage,
            workout: snapshot.weeklyProgressSummary.summary.sourceAggregates.workout,
            today: snapshot.weeklyProgressSummary.summary.sourceAggregates.today,
            nutrition: snapshot.weeklyProgressSummary.summary.sourceAggregates.nutrition,
            habits: snapshot.weeklyProgressSummary.summary.sourceAggregates.habits,
            recovery: snapshot.weeklyProgressSummary.summary.sourceAggregates.recovery,
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
      documentSignalContext: snapshot.documentSignalContext,
      correlationInsights: {
        insights: snapshot.correlationInsights.insights.slice(0, 3),
        generatedAt: snapshot.correlationInsights.generatedAt,
        dataStatus: snapshot.correlationInsights.dataStatus,
      },
      metricsSummary: snapshot.metricsSummary,
      wellbeingSummary: snapshot.wellbeingSummary,
      recoveryContext: snapshot.recoveryContext,
    };
  }

  async getActiveNutritionPlanPayload(
    auth: ClerkAuthContext,
  ): Promise<NutritionPlanPayload | null> {
    const user = await this.usersService.resolveFromAuth(auth);
    const nutritionPlan = await this.nutritionRepository.findActivePlanByUserId(user.id);

    if (!nutritionPlan?.activeRevisionId) {
      return null;
    }

    const activeRevision = await this.nutritionRepository.findActiveRevisionByPlanId(
      nutritionPlan.id,
      nutritionPlan.activeRevisionId,
    );
    const parsedPayload = nutritionPlanPayloadSchema.safeParse(activeRevision?.payload);

    return parsedPayload.success ? parsedPayload.data : null;
  }

  async getUserContextSlice(
    auth: ClerkAuthContext,
    input: GetUserContextSliceInput,
  ): Promise<UserContextSlice> {
    const normalized = getUserContextSliceInputSchema.parse(input);
    const snapshot = await this.buildSnapshot(auth);
    const activeNutritionPlan =
      normalized.purpose === "nutrition_adaptation"
        ? await this.getActiveNutritionPlanPayload(auth)
        : null;

    return buildUserContextSliceFromSnapshot(snapshot, normalized, {
      activeNutritionPlan,
      curatedMemories: [],
    });
  }

  async buildAgentContext(
    auth: ClerkAuthContext,
    request: BuildAgentContextRequest,
  ): Promise<AgentContextPacket> {
    const intent = request.intent ?? "general";
    const purpose = request.purpose ?? INTENT_TO_SLICE_PURPOSE[intent];
    const resolved = resolveSliceOptions(
      getUserContextSliceInputSchema.parse({
        purpose,
        depth: request.depth,
        timeRange: request.timeRange,
        includeDocuments: request.includeDocuments,
      }),
    );

    const slice = await this.getUserContextSlice(auth, {
      purpose,
      depth: resolved.depth,
      timeRange: resolved.timeRange,
      includeDocuments: resolved.includeDocuments,
      includeRawData: false,
    });

    return agentContextPacketSchema.parse({
      purpose,
      depth: resolved.depth,
      timeRange: resolved.timeRange,
      intent,
      generatedAt: new Date().toISOString(),
      slice,
      safetyConstraints: [...DEFAULT_AGENT_SAFETY_CONSTRAINTS],
      sourceRefs: slice.sourceRefs,
    });
  }

  toAgentPromptContext(packet: AgentContextPacket): Record<string, unknown> {
    return buildAgentPromptContextFromPacket(packet);
  }
}
