import type {
  AgentContextPacket,
  AiDocumentContextSummary,
  AiDocumentSignalContextSummary,
  AiMetricsContextSummary,
  AiRecoveryContextSummary,
  AiWellbeingContextSummary,
  BuildAgentContextRequest,
  CoachingHierarchySummary,
  ContextBudgetPolicy,
  CorrelationInsightPreviewResponse,
  GetUserContextSliceInput,
  Goal,
  HabitAdherenceCoachingSummary,
  HabitPlanCoachingSummary,
  IntentRouteResult,
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
  clampContextDepth,
  DEFAULT_AGENT_SAFETY_CONSTRAINTS,
  DEFAULT_CONTEXT_BUDGET_POLICY,
  getTodayIsoDateInTimezone,
  getUserContextSliceInputSchema,
  getWeekStartIsoDate,
  habitPlanPayloadSchema,
  hasCompletedOnboardingState,
  INTENT_TO_SLICE_PURPOSE,
  normalizeContextSlicePlan,
  nutritionPlanPayloadSchema,
  summarizeHabitPlanForCoaching,
  summarizePersonalContext,
  summarizeWorkoutPlanForCoaching,
  workoutPlanPayloadSchema,
} from "@health/types";
import { Injectable } from "@nestjs/common";
import { ContextBudgetPolicyService } from "./context-budget-policy.service.js";
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

export interface BuildAgentContextOptions {
  contextBudget?: ContextBudgetPolicy;
}

@Injectable()
export class CoachingContextService {
  constructor(
    private readonly contextBudgetPolicyService: ContextBudgetPolicyService,
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

    const coachingHierarchy = buildCoachingHierarchySummary(profile, goals, weekStart);

    return {
      user,
      profile,
      goals,
      onboardingCompleted:
        user.onboardingCompletedAt != null || hasCompletedOnboardingState(profile, goals),
      coachingHierarchy,
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
    route?: IntentRouteResult,
    options?: BuildAgentContextOptions,
  ): Promise<AgentContextPacket> {
    const intent = route?.intent ?? request.intent ?? "general";
    const budget = options?.contextBudget ?? DEFAULT_CONTEXT_BUDGET_POLICY;
    const normalizedSlicePlan = normalizeContextSlicePlan(
      route?.requiredContextSlices ?? [
        {
          type: request.purpose ?? INTENT_TO_SLICE_PURPOSE[intent],
          depth: request.depth,
          timeRange: request.timeRange,
          includeDocuments: request.includeDocuments,
        },
      ],
    );
    const { slicePlan, notes: budgetNotes } = this.contextBudgetPolicyService.applyBudgetToSlicePlan(
      normalizedSlicePlan,
      budget,
    );
    const [primaryRequest, ...supplementaryRequests] = slicePlan;

    if (!primaryRequest) {
      throw new Error("Context slice plan must include at least one slice.");
    }

    const snapshot = await this.buildSnapshot(auth);
    const activeNutritionPlan =
      slicePlan.some((slice) => slice.type === "nutrition_adaptation")
        ? await this.getActiveNutritionPlanPayload(auth)
        : null;

    const primarySlice = this.contextBudgetPolicyService.applyBudgetToBuiltSlice(
      await this.buildSliceFromRequest(snapshot, primaryRequest, activeNutritionPlan, budget),
      budget,
    );
    const supplementarySlices = await Promise.all(
      supplementaryRequests.map(async (sliceRequest) =>
        this.contextBudgetPolicyService.applyBudgetToBuiltSlice(
          await this.buildSliceFromRequest(snapshot, sliceRequest, activeNutritionPlan, budget),
          budget,
        ),
      ),
    );
    const missingContextNotes = [
      ...collectMissingContextNotes([primarySlice, ...supplementarySlices], slicePlan),
      ...budgetNotes,
    ];

    if (budget.requiresCompression) {
      missingContextNotes.push(
        "Large review context requires compression before full historical detail is available.",
      );
    }

    const uniqueMissingContextNotes = [...new Set(missingContextNotes)].slice(0, 5);
    const sourceRefs = mergeSourceRefs(primarySlice, supplementarySlices);

    return agentContextPacketSchema.parse({
      purpose: primaryRequest.type,
      depth: primarySlice.depth,
      timeRange: primarySlice.timeRange,
      intent,
      generatedAt: new Date().toISOString(),
      slice: primarySlice,
      supplementarySlices,
      missingContextNotes: uniqueMissingContextNotes,
      safetyConstraints: [...DEFAULT_AGENT_SAFETY_CONSTRAINTS],
      sourceRefs,
      routing: route
        ? {
            confidence: route.confidence,
            routingMethod: route.routingMethod,
            llmRouterInvoked: route.routingMethod === "llm_router",
            catalogIntentId: route.catalogIntentId,
            safetyFlags: route.safetyFlags,
            expectedResponseMode: route.expectedResponseMode,
            contextSliceCount: slicePlan.length,
          }
        : undefined,
    });
  }

  private async buildSliceFromRequest(
    snapshot: CoachingContextSnapshot,
    sliceRequest: ReturnType<typeof normalizeContextSlicePlan>[number],
    activeNutritionPlan: NutritionPlanPayload | null,
    budget: ContextBudgetPolicy,
  ): Promise<UserContextSlice> {
    const resolved = resolveSliceOptions(
      getUserContextSliceInputSchema.parse({
        purpose: sliceRequest.type,
        depth: sliceRequest.depth,
        timeRange: sliceRequest.timeRange,
        includeDocuments: sliceRequest.includeDocuments,
      }),
    );
    const depth = clampContextDepth(resolved.depth, budget.maxDepth);
    const includeDocuments = budget.allowDocuments && resolved.includeDocuments;

    return buildUserContextSliceFromSnapshot(
      snapshot,
      {
        purpose: sliceRequest.type,
        depth,
        timeRange: resolved.timeRange,
        includeDocuments,
        includeRawData: false,
      },
      {
        activeNutritionPlan,
        curatedMemories: [],
      },
    );
  }

  toAgentPromptContext(packet: AgentContextPacket): Record<string, unknown> {
    return buildAgentPromptContextFromPacket(packet);
  }
}

function collectMissingContextNotes(
  slices: ReadonlyArray<UserContextSlice>,
  requests: ReturnType<typeof normalizeContextSlicePlan>,
): string[] {
  const notes: string[] = [];

  for (let index = 0; index < slices.length; index += 1) {
    const slice = slices[index];
    const request = requests[index];

    if (!slice || !request) {
      continue;
    }

    if (request.type === "workout_adaptation" && slice.activeWorkoutPlan == null) {
      notes.push("No active workout plan is available for workout adaptation.");
    }

    if (request.type === "nutrition_adaptation" && slice.activeNutritionPlan == null) {
      notes.push("No active nutrition plan is available for nutrition adaptation.");
    }

    if (request.type === "weekly_review" && slice.weeklyProgress == null) {
      notes.push("Weekly progress data is insufficient for a full review.");
    }

    if (
      request.type === "health_context" &&
      request.includeDocuments &&
      (slice.documentContext?.items.length ?? 0) === 0
    ) {
      notes.push("No approved health documents are available.");
    }
  }

  return [...new Set(notes)];
}

function mergeSourceRefs(
  primarySlice: UserContextSlice,
  supplementarySlices: ReadonlyArray<UserContextSlice>,
) {
  const merged = [...primarySlice.sourceRefs];

  for (const slice of supplementarySlices) {
    for (const ref of slice.sourceRefs) {
      if (
        !merged.some(
          (existing) =>
            existing.domain === ref.domain &&
            existing.label === ref.label &&
            existing.referenceId === ref.referenceId,
        )
      ) {
        merged.push(ref);
      }
    }
  }

  return merged;
}
