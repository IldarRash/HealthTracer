import {
  adaptWorkoutPlanFromProgressChangesSchema,
  adjustNutritionPlanFromProgressChangesSchema,
  habitPlanProposalChangesSchema,
  collectWorkoutPlanExerciseIds,
  createGoalProposalChangesSchema,
  extractHabitPlanPayload,
  extractNutritionPlanPayload,
  getGoalHierarchyValidationErrors,
  getHabitPlanDomainErrors,
  getHabitPlanAdaptationContinuityErrors,
  getHabitPlanIntentStateErrors,
  getNutritionPlanDomainErrors,
  getProgressProvenanceFromProposal,
  getProgressLinkedProvenanceRequiredErrors,
  getRecoveryWorkoutAdaptationVolumeErrors,
  getTodayIsoDateInTimezone,
  getWorkoutProposalDomainErrors,
  habitPlanPayloadSchema,
  mergeGoalHierarchyState,
  nutritionPlanPayloadSchema,
  profileProposalChangesSchema,
  rawAiProposalSchema,
  recipeRecommendationProposalPayloadSchema,
  stripWorkoutPlanProposalExtras,
  todayChecklistPayloadSchema,
  updateGoalProposalChangesSchema,
  workoutPlanProposalChangesSchema,
  workoutAdaptationIncreasesVolumeOrLoad,
  type AdaptWorkoutPlanFromProgressChanges,
  type CorrelationEvidenceRef,
  type CreateGoalInput,
  type Goal,
  type HabitPlanPayload,
  type ProposalIntent,
  type RawAiProposal,
  type RecoveryContextSourceRef,
  type RecoveryReadinessBand,
  type TodayChecklistPayload,
  type UpdateGoalInput,
  type WorkoutPlanProposalChanges,
  buildHealthMetricAggregateEvidenceId,
  parseHealthMetricAggregateEvidenceId,
  VERIFIABLE_CORRELATION_EVIDENCE_REF_TYPES,
} from "@health/types";
import { containsUnsafeWellnessInsightLanguage } from "@health/types";
import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { DocumentSignalsRepository } from "../documents/document-signals.repository.js";
import { ExercisesService } from "../exercises/exercises.service.js";
import { GoalsRepository } from "../goals/goals.repository.js";
import { toGoal } from "../goals/goal.mapper.js";
import { HabitsRepository } from "../habits/habits.repository.js";
import { HabitsService } from "../habits/habits.service.js";
import { MetricsAiContextService } from "../health-metrics/metrics-ai-context.service.js";
import { ProgressRepository } from "../progress/progress.repository.js";
import { RecoveryContextService } from "../recovery/recovery-context.service.js";
import { UsersRepository } from "../users/users.repository.js";
import { WorkoutsRepository } from "../workouts/workouts.repository.js";

export interface ProposalValidationResult {
  valid: boolean;
  errors: string[];
}

@Injectable()
export class ProposalValidationService {
  constructor(
    private readonly progressRepository: ProgressRepository,
    private readonly exercisesService: ExercisesService,
    private readonly habitsService: HabitsService,
    private readonly documentSignalsRepository: DocumentSignalsRepository,
    private readonly metricsAiContextService: MetricsAiContextService,
    private readonly goalsRepository: GoalsRepository,
    private readonly recoveryContextService: RecoveryContextService,
    private readonly workoutsRepository: WorkoutsRepository,
    private readonly usersRepository: UsersRepository,
    private readonly habitsRepository: HabitsRepository,
  ) {}

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

    const schemaValidation = this.validateStoredProposal(
      envelope.data.intent,
      envelope.data.proposedChanges,
    );
    const evidenceErrors = this.validateCorrelationEvidenceRefs(envelope.data.evidenceRefs);

    if (schemaValidation.errors.length > 0 || evidenceErrors.length > 0) {
      return {
        valid: false,
        errors: [...schemaValidation.errors, ...evidenceErrors],
      };
    }

    return { valid: true, errors: [] };
  }

  validateCorrelationEvidenceRefs(
    evidenceRefs: CorrelationEvidenceRef[] | undefined,
  ): string[] {
    if (!evidenceRefs || evidenceRefs.length === 0) {
      return [];
    }

    const errors: string[] = [];

    for (const [index, ref] of evidenceRefs.entries()) {
      if (containsUnsafeWellnessInsightLanguage(ref.label)) {
        errors.push(
          `evidenceRefs[${index}].label: Evidence label contains unsafe medical wording.`,
        );
      }
    }

    return errors;
  }

  async validateCorrelationEvidenceOwnership(
    userId: string,
    evidenceRefs: CorrelationEvidenceRef[] | undefined,
  ): Promise<string[]> {
    if (!evidenceRefs || evidenceRefs.length === 0) {
      return [];
    }

    const errors: string[] = [];
    const metricSummary =
      evidenceRefs.some((ref) => ref.type === "health_metric_aggregate")
        ? await this.metricsAiContextService.buildSummaryForUser(userId)
        : null;
    const metricEvidenceIds = new Set(
      metricSummary?.items.map((item) =>
        buildHealthMetricAggregateEvidenceId({
          metricType: item.metricType,
          periodStart: item.periodStart,
          periodEnd: item.periodEnd,
        }),
      ) ?? [],
    );

    for (const [index, ref] of evidenceRefs.entries()) {
      if (ref.type === "document_signal") {
        const owned = await this.documentSignalsRepository.findCorrelationEligibleSignalById(
          userId,
          ref.id,
        );

        if (!owned) {
          errors.push(
            `evidenceRefs[${index}].id: Approved document signal was not found for this user.`,
          );
        }

        continue;
      }

      if (ref.type === "weekly_progress_summary") {
        const exists = await this.progressRepository.summaryExistsForUser(userId, ref.id);

        if (!exists) {
          errors.push(
            `evidenceRefs[${index}].id: Weekly progress summary was not found for this user.`,
          );
        }

        continue;
      }

      if (ref.type === "health_metric_aggregate") {
        const parsed = parseHealthMetricAggregateEvidenceId(ref.id);

        if (!parsed || !metricEvidenceIds.has(ref.id)) {
          errors.push(
            `evidenceRefs[${index}].id: Health metric aggregate was not found for this user.`,
          );
        }

        continue;
      }

      if (ref.type === "habit_adherence") {
        errors.push(
          `evidenceRefs[${index}].type: Habit adherence evidence refs cannot be verified yet.`,
        );
        continue;
      }

      if (!VERIFIABLE_CORRELATION_EVIDENCE_REF_TYPES.includes(ref.type)) {
        errors.push(`evidenceRefs[${index}].type: Unsupported evidence reference type.`);
      }
    }

    return errors;
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
      const payload = extractNutritionPlanPayload(
        result.data as Parameters<typeof extractNutritionPlanPayload>[0],
      );
      const domainErrors = getNutritionPlanDomainErrors(payload);

      if (domainErrors.length > 0) {
        return { valid: false, errors: domainErrors };
      }
    }

    if (intent === "create_workout_plan" || intent === "adapt_workout_plan") {
      const domainErrors = getWorkoutProposalDomainErrors(
        result.data as WorkoutPlanProposalChanges,
        { requireStructuredPlan: true },
      );

      if (domainErrors.length > 0) {
        return { valid: false, errors: domainErrors };
      }
    }

    if (intent === "adapt_workout_plan_from_progress") {
      const domainErrors = getWorkoutProposalDomainErrors(
        (result.data as AdaptWorkoutPlanFromProgressChanges).plan,
        { requireStructuredPlan: true },
      );

      if (domainErrors.length > 0) {
        return { valid: false, errors: domainErrors };
      }
    }

    if (intent === "create_habit_plan" || intent === "adapt_habit_plan") {
      const payload = extractHabitPlanPayload(
        result.data as Parameters<typeof extractHabitPlanPayload>[0],
      );
      const domainErrors = getHabitPlanDomainErrors(payload);

      if (domainErrors.length > 0) {
        return { valid: false, errors: domainErrors };
      }
    }

    if (intent === "create_goal") {
      const domainErrors = getGoalProposalDomainErrors(
        result.data as CreateGoalInput,
        [],
      );

      if (domainErrors.length > 0) {
        return { valid: false, errors: domainErrors };
      }
    }

    if (intent === "update_goal") {
      const parsed = result.data as z.infer<typeof updateGoalProposalChangesSchema>;
      const domainErrors = getGoalUpdateProposalDomainErrors(parsed.changes);

      if (domainErrors.length > 0) {
        return { valid: false, errors: domainErrors };
      }
    }

    return { valid: true, errors: [] };
  }

  async validateGoalProposalHierarchy(
    userId: string,
    intent: ProposalIntent,
    proposedChanges: unknown,
  ): Promise<string[]> {
    if (intent !== "create_goal" && intent !== "update_goal") {
      return [];
    }

    const existingGoals = (await this.goalsRepository.listByUserId(userId)).map(toGoal);

    if (intent === "create_goal") {
      const parsed = createGoalProposalChangesSchema.safeParse(proposedChanges);

      if (!parsed.success) {
        return [];
      }

      return getGoalProposalDomainErrors(parsed.data, existingGoals);
    }

    const parsed = updateGoalProposalChangesSchema.safeParse(proposedChanges);

    if (!parsed.success) {
      return [];
    }

    const existingGoal = existingGoals.find((goal) => goal.id === parsed.data.goalId);

    if (!existingGoal) {
      return ["proposedChanges.goalId: Goal was not found for this user."];
    }

    return getGoalProposalDomainErrors(parsed.data.changes, existingGoals, existingGoal);
  }

  async validateTodayChecklistGoalSourceRefs(
    userId: string,
    intent: ProposalIntent,
    proposedChanges: unknown,
  ): Promise<string[]> {
    if (intent !== "create_today_checklist") {
      return [];
    }

    const parsed = todayChecklistPayloadSchema.safeParse(proposedChanges);

    if (!parsed.success) {
      return [];
    }

    return this.getTodayChecklistSourceRefErrors(userId, parsed.data);
  }

  private async getTodayChecklistSourceRefErrors(
    userId: string,
    payload: TodayChecklistPayload,
  ): Promise<string[]> {
    const errors: string[] = [];
    const existingGoals = (await this.goalsRepository.listByUserId(userId)).map(toGoal);

    for (const [index, item] of payload.items.entries()) {
      const source = item.source;

      if (!source) {
        continue;
      }

      if (!source.id) {
        continue;
      }

      const goal = existingGoals.find((entry) => entry.id === source.id);

      if (!goal) {
        errors.push(
          `proposedChanges.items[${index}].source.id: Referenced goal was not found for this user.`,
        );
        continue;
      }

      if (source.type === "goal") {
        if (goal.horizon !== "quarterly" || goal.status !== "active") {
          errors.push(
            `proposedChanges.items[${index}].source.id: Goal source refs must point to an active quarterly goal.`,
          );
        }
      }

      if (source.type === "weekly_focus") {
        if (goal.horizon !== "weekly" || goal.status !== "active") {
          errors.push(
            `proposedChanges.items[${index}].source.id: weekly_focus source refs must point to an active weekly goal.`,
          );
        }
      }
    }

    return errors;
  }

  async validateProvenanceOwnership(
    userId: string,
    intent: ProposalIntent,
    proposedChanges: unknown,
  ): Promise<string[]> {
    if (intent === "adapt_workout_plan_from_progress") {
      const parsed = adaptWorkoutPlanFromProgressChangesSchema.safeParse(proposedChanges);

      if (!parsed.success) {
        return [];
      }

      return this.getProgressProvenanceErrors(userId, parsed.data);
    }

    const provenance = getProgressProvenanceFromProposal(intent, proposedChanges);

    if (!provenance || (!provenance.sourceSummaryId && provenance.sourceTrendObservationIds.length === 0)) {
      return [];
    }

    return this.getProgressProvenanceErrors(userId, provenance);
  }

  validateProgressLinkedProvenanceRequired(
    intent: ProposalIntent,
    proposedChanges: unknown,
  ): string[] {
    return getProgressLinkedProvenanceRequiredErrors(intent, proposedChanges);
  }

  async validateExerciseReferences(
    userId: string,
    intent: ProposalIntent,
    proposedChanges: unknown,
  ): Promise<string[]> {
    const planChanges = extractWorkoutProposalChanges(intent, proposedChanges);

    if (!planChanges) {
      return [];
    }

    const plan = stripWorkoutPlanProposalExtras(planChanges);
    const exerciseIds = collectWorkoutPlanExerciseIds(plan);
    const inaccessibleExerciseIds = await this.exercisesService.findInaccessibleExerciseIds(
      exerciseIds,
      userId,
    );

    return inaccessibleExerciseIds.map(
      (exerciseId) =>
        `proposedChanges: exerciseId "${exerciseId}" was not found in the visible exercise catalog.`,
    );
  }

  async validateHabitTemplateReferences(
    intent: ProposalIntent,
    proposedChanges: unknown,
  ): Promise<string[]> {
    if (intent !== "create_habit_plan" && intent !== "adapt_habit_plan") {
      return [];
    }

    const payload = parseHabitPlanProposalChanges(proposedChanges);

    if (!payload) {
      return [];
    }

    return this.habitsService.getHabitTemplateReferenceErrors(payload);
  }

  async validateHabitPlanProposalState(
    userId: string,
    intent: ProposalIntent,
    proposedChanges: unknown,
  ): Promise<string[]> {
    if (intent !== "create_habit_plan" && intent !== "adapt_habit_plan") {
      return [];
    }

    const payload = parseHabitPlanProposalChanges(proposedChanges);

    if (!payload) {
      return [];
    }

    const existingPlan = await this.habitsRepository.findActivePlanByUserId(userId);
    const errors = getHabitPlanIntentStateErrors(intent, Boolean(existingPlan));

    if (intent !== "adapt_habit_plan" || errors.length > 0 || !existingPlan?.activeRevisionId) {
      return errors;
    }

    const activeRevision = await this.habitsRepository.findActiveRevisionByPlanId(
      existingPlan.id,
      existingPlan.activeRevisionId,
    );

    if (!activeRevision) {
      return [
        ...errors,
        "proposedChanges: adapt_habit_plan requires an active habit plan revision.",
      ];
    }

    const currentPayload = habitPlanPayloadSchema.safeParse(activeRevision.payload);

    if (!currentPayload.success) {
      return [
        ...errors,
        "proposedChanges: adapt_habit_plan requires a readable active habit plan revision.",
      ];
    }

    return [
      ...errors,
      ...getHabitPlanAdaptationContinuityErrors(currentPayload.data, payload),
    ];
  }

  async validateHabitProposalContext(
    userId: string,
    intent: ProposalIntent,
    proposedChanges: unknown,
  ): Promise<string[]> {
    const templateReferenceErrors = await this.validateHabitTemplateReferences(
      intent,
      proposedChanges,
    );
    const planStateErrors = await this.validateHabitPlanProposalState(
      userId,
      intent,
      proposedChanges,
    );

    return [...templateReferenceErrors, ...planStateErrors];
  }

  async validateRecoveryAwareWorkoutAdaptation(
    userId: string,
    intent: ProposalIntent,
    proposedChanges: unknown,
  ): Promise<string[]> {
    if (intent !== "adapt_workout_plan" && intent !== "adapt_workout_plan_from_progress") {
      return [];
    }

    const extracted = extractRecoveryAwareWorkoutAdaptation(proposedChanges, intent);

    if (!extracted) {
      return [];
    }

    const errors: string[] = [];

    for (const [index, ref] of extracted.recoverySourceRefs.entries()) {
      const snapshot = await this.recoveryContextService.computeAndPersistSnapshot(
        userId,
        ref.date,
      );

      if (ref.snapshotId && ref.snapshotId !== snapshot.id) {
        errors.push(
          `proposedChanges.recoverySourceRefs[${index}].snapshotId: Recovery context snapshot is stale for the cited date.`,
        );
      }
    }

    const recoveryBand = await this.resolveRecoveryBandForWorkoutAdaptation(
      userId,
      extracted.recoverySourceRefs,
    );
    const activePlan = await this.workoutsRepository.findActivePlanByUserId(userId);

    if (!activePlan?.activeRevisionId) {
      return errors;
    }

    const activeRevision = await this.workoutsRepository.findRevisionById(
      activePlan.activeRevisionId,
    );

    if (!activeRevision) {
      return errors;
    }

    const currentPlan = stripWorkoutPlanProposalExtras(
      activeRevision.payload as WorkoutPlanProposalChanges,
    );
    const proposedPlan = stripWorkoutPlanProposalExtras(extracted.plan);
    const increasesVolumeOrLoad = workoutAdaptationIncreasesVolumeOrLoad(
      currentPlan,
      proposedPlan,
    );

    errors.push(
      ...getRecoveryWorkoutAdaptationVolumeErrors({
        increasesVolumeOrLoad,
        recoveryBand,
        allowVolumeIncrease: extracted.allowVolumeIncrease,
      }),
    );

    return errors;
  }

  private async resolveRecoveryBandForWorkoutAdaptation(
    userId: string,
    recoverySourceRefs: readonly RecoveryContextSourceRef[],
  ): Promise<RecoveryReadinessBand | null> {
    if (recoverySourceRefs.length > 0) {
      const latestRef = recoverySourceRefs.reduce((latest, ref) =>
        ref.date > latest.date ? ref : latest,
      );
      const snapshot = await this.recoveryContextService.computeAndPersistSnapshot(
        userId,
        latestRef.date,
      );

      return snapshot.band;
    }

    const user = await this.usersRepository.findByUserId(userId);
    const today = getTodayIsoDateInTimezone(user?.timezone ?? "UTC");
    const snapshot = await this.recoveryContextService.computeAndPersistSnapshot(userId, today);

    return snapshot.band;
  }

  private async getProgressProvenanceErrors(
    userId: string,
    payload: {
      sourceSummaryId?: string;
      sourceTrendObservationIds?: readonly string[];
    },
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

    const trendIds = payload.sourceTrendObservationIds ?? [];

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

function getGoalProposalDomainErrors(
  input: CreateGoalInput | UpdateGoalInput,
  existingGoals: Goal[],
  existingGoal?: Goal,
): string[] {
  const merged = mergeGoalHierarchyState(
    existingGoal
      ? {
          horizon: existingGoal.horizon,
          parentGoalId: existingGoal.parentGoalId,
          weekStart: existingGoal.weekStart,
          status: existingGoal.status,
        }
      : {
          horizon: null,
          parentGoalId: null,
          weekStart: null,
          status: "active",
        },
    {
      horizon: input.horizon,
      parentGoalId: input.parentGoalId,
      weekStart: input.weekStart,
      status: "status" in input ? input.status : undefined,
    },
  );

  const parentGoal = merged.parentGoalId
    ? (existingGoals.find((goal) => goal.id === merged.parentGoalId) ?? null)
    : null;

  return getGoalHierarchyValidationErrors({
    merged,
    existingGoals,
    goalId: existingGoal?.id,
    parentGoal,
  });
}

function getGoalUpdateProposalDomainErrors(changes: UpdateGoalInput): string[] {
  const hasHierarchyFields =
    changes.horizon !== undefined ||
    changes.parentGoalId !== undefined ||
    changes.weekStart !== undefined ||
    changes.status !== undefined;

  if (!hasHierarchyFields) {
    return [];
  }

  return getGoalHierarchyValidationErrors({
    merged: mergeGoalHierarchyState(
      {
        horizon: null,
        parentGoalId: null,
        weekStart: null,
        status: "active",
      },
      {
        horizon: changes.horizon,
        parentGoalId: changes.parentGoalId,
        weekStart: changes.weekStart,
        status: changes.status,
      },
    ),
    existingGoals: [],
  });
}

function extractRecoveryAwareWorkoutAdaptation(
  proposedChanges: unknown,
  intent: ProposalIntent,
): {
  plan: WorkoutPlanProposalChanges;
  recoverySourceRefs: RecoveryContextSourceRef[];
  allowVolumeIncrease?: boolean;
} | null {
  if (intent === "adapt_workout_plan") {
    const parsed = workoutPlanProposalChangesSchema.safeParse(proposedChanges);

    if (!parsed.success) {
      return null;
    }

    return {
      plan: parsed.data,
      recoverySourceRefs: parsed.data.adaptationMetadata?.recoverySourceRefs ?? [],
      allowVolumeIncrease: parsed.data.adaptationMetadata?.allowVolumeIncrease,
    };
  }

  const parsed = adaptWorkoutPlanFromProgressChangesSchema.safeParse(proposedChanges);

  if (!parsed.success) {
    return null;
  }

  return {
    plan: parsed.data.plan,
    recoverySourceRefs:
      parsed.data.recoverySourceRefs ??
      parsed.data.plan.adaptationMetadata?.recoverySourceRefs ??
      [],
    allowVolumeIncrease:
      parsed.data.allowVolumeIncrease ?? parsed.data.plan.adaptationMetadata?.allowVolumeIncrease,
  };
}

function extractWorkoutProposalChanges(
  intent: ProposalIntent,
  proposedChanges: unknown,
): WorkoutPlanProposalChanges | null {
  if (intent === "create_workout_plan" || intent === "adapt_workout_plan") {
    const parsed = workoutPlanProposalChangesSchema.safeParse(proposedChanges);
    return parsed.success ? parsed.data : null;
  }

  if (intent === "adapt_workout_plan_from_progress") {
    const parsed = adaptWorkoutPlanFromProgressChangesSchema.safeParse(proposedChanges);
    return parsed.success ? parsed.data.plan : null;
  }

  return null;
}

function parseHabitPlanProposalChanges(proposedChanges: unknown): HabitPlanPayload | null {
  const wrapped = habitPlanProposalChangesSchema.safeParse(proposedChanges);

  if (!wrapped.success) {
    return null;
  }

  return extractHabitPlanPayload(wrapped.data);
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
      return workoutPlanProposalChangesSchema;
    case "adapt_workout_plan_from_progress":
      return adaptWorkoutPlanFromProgressChangesSchema;
    case "create_nutrition_plan":
      return nutritionPlanPayloadSchema;
    case "adjust_nutrition_plan":
      return z.union([
        nutritionPlanPayloadSchema,
        adjustNutritionPlanFromProgressChangesSchema,
      ]);
    case "recommend_recipes":
      return recipeRecommendationProposalPayloadSchema;
    case "create_today_checklist":
      return todayChecklistPayloadSchema;
    case "create_habit_plan":
      return habitPlanPayloadSchema;
    case "adapt_habit_plan":
      return habitPlanProposalChangesSchema;
    case "summarize_progress":
      return null;
    default:
      return null;
  }
}
