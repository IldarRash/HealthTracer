import {
  adaptWorkoutPlanFromProgressChangesSchema,
  adjustNutritionPlanFromProgressChangesSchema,
  habitPlanProposalChangesSchema,
  collectWorkoutPlanExerciseIds,
  createGoalProposalChangesSchema,
  extractHabitPlanPayload,
  extractNutritionPlanPayload,
  getAdjustNutritionPlanProteinFloorErrors,
  getGoalHierarchyValidationErrors,
  getHabitPlanDomainErrors,
  getHabitPlanAdaptationContinuityErrors,
  getHabitPlanIntentStateErrors,
  getNutritionPlanDomainErrors,
  getProgressProvenanceFromProposal,
  getProgressLinkedProvenanceRequiredErrors,
  getRecoveryWorkoutAdaptationVolumeErrors,
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
import { BiomarkersRepository } from "../biomarkers/biomarkers.repository.js";
import { ExercisesService } from "../exercises/exercises.service.js";
import { GoalsRepository } from "../goals/goals.repository.js";
import { toGoal } from "../goals/goal.mapper.js";
import { HabitsRepository } from "../habits/habits.repository.js";
import { HabitsService } from "../habits/habits.service.js";
import { MetricsAiContextService } from "../health-metrics/metrics-ai-context.service.js";
import { ProgressRepository } from "../progress/progress.repository.js";
import { RecoveryContextService } from "../recovery/recovery-context.service.js";
import { UsersRepository } from "../users/users.repository.js";
import { WellbeingCheckInsRepository } from "../wellbeing-check-ins/wellbeing-check-ins.repository.js";
import { NutritionRepository } from "../nutrition/nutrition.repository.js";
import { RecipesRepository } from "../recipes/recipes.repository.js";
import { WorkoutsRepository } from "../workouts/workouts.repository.js";
import { ChatAttachmentsRepository } from "../chat-attachments/chat-attachments.repository.js";
import { toOwnedChatAttachmentRef } from "../chat-attachments/chat-attachment.mapper.js";
import {
  captureWellbeingCheckinProposalPayloadSchema,
  getLogWorkoutActivityDomainErrors,
  getNutritionIncidentDomainErrors,
  getNutritionIncidentImageRefOwnershipErrors,
  getRecipeRecommendationRevisionErrors,
  getSaveBodyAnalysisDomainErrors,
  getWellbeingCheckinProposalDomainErrors,
  getTodayIsoDateInTimezone,
  logNutritionIncidentProposalPayloadSchema,
  logWorkoutActivityProposalPayloadSchema,
  saveBodyAnalysisProposalPayloadSchema,
  getChatAttachmentProposalRefErrors,
} from "@health/types";

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
    private readonly metricsAiContextService: MetricsAiContextService,
    private readonly goalsRepository: GoalsRepository,
    private readonly recoveryContextService: RecoveryContextService,
    private readonly workoutsRepository: WorkoutsRepository,
    private readonly usersRepository: UsersRepository,
    private readonly habitsRepository: HabitsRepository,
    private readonly wellbeingCheckInsRepository: WellbeingCheckInsRepository,
    private readonly nutritionRepository: NutritionRepository,
    private readonly recipesRepository: RecipesRepository,
    private readonly chatAttachmentsRepository: ChatAttachmentsRepository,
    private readonly biomarkersRepository: BiomarkersRepository,
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

  async validateWellbeingCheckinProposalContext(
    userId: string,
    intent: ProposalIntent,
    proposedChanges: unknown,
    options?: { appliedReference?: string | null },
  ): Promise<string[]> {
    if (intent !== "capture_wellbeing_checkin") {
      return [];
    }

    const parsed = captureWellbeingCheckinProposalPayloadSchema.safeParse(proposedChanges);

    if (!parsed.success) {
      return [];
    }

    const user = await this.usersRepository.findByUserId(userId);
    const today = getTodayIsoDateInTimezone(user?.timezone ?? "UTC");
    const existingCheckIn = await this.wellbeingCheckInsRepository.findByUserAndDate(
      userId,
      parsed.data.date,
    );

    return getWellbeingCheckinProposalDomainErrors(parsed.data, today, {
      existingCheckInId: existingCheckIn?.id ?? null,
      appliedReference: options?.appliedReference ?? null,
    });
  }

  async validateNutritionIncidentImageRefOwnership(
    userId: string,
    intent: ProposalIntent,
    proposedChanges: unknown,
  ): Promise<string[]> {
    if (intent !== "log_nutrition_incident") {
      return [];
    }

    const parsed = logNutritionIncidentProposalPayloadSchema.safeParse(proposedChanges);

    if (!parsed.success) {
      return [];
    }

    const imageRefIds = parsed.data.imageRefs.map((ref) => ref.id);

    // vision_llm_estimate: the nutrition domain LLM analysed the food photo directly
    // via the multimodal pipeline — no FoodPhotoAnalysis records exist.  Ownership is
    // established by the chat attachment upload perimeter: each imageRef.id must be an
    // attachment the user uploaded (already ownership-checked at upload time).
    if (parsed.data.provenance.source === "vision_llm_estimate") {
      const ownedAttachmentRows = imageRefIds.length > 0
        ? await this.chatAttachmentsRepository.listByIdsForUser(userId, imageRefIds)
        : [];
      const ownedChatAttachmentIds = ownedAttachmentRows.map((row) => row.id);

      return getNutritionIncidentImageRefOwnershipErrors(parsed.data, [], ownedChatAttachmentIds);
    }

    // food_photo_analysis / dev_stub: validate against stored analysis records.
    const analysisIds = parsed.data.provenance.analysisId ? [parsed.data.provenance.analysisId] : [];
    const ownedAnalyses = await this.nutritionRepository.listOwnedFoodPhotoAnalysesByImageRefIds(
      userId,
      imageRefIds,
    );

    if (analysisIds.length > 0) {
      const ownedAnalysisIds = new Set(ownedAnalyses.map((analysis) => analysis.analysisId));

      for (const analysisId of analysisIds) {
        if (!ownedAnalysisIds.has(analysisId)) {
          const analysisRecord = await this.nutritionRepository.findFoodPhotoAnalysisByIdForUser(
            userId,
            analysisId,
          );

          if (analysisRecord) {
            ownedAnalyses.push({
              analysisId: analysisRecord.id,
              imageRefId: analysisRecord.imageRefId,
            });
          }
        }
      }
    }

    return getNutritionIncidentImageRefOwnershipErrors(parsed.data, ownedAnalyses);
  }

  async validateChatAttachmentProposalRefs(
    userId: string,
    intent: ProposalIntent,
    proposedChanges: unknown,
  ): Promise<string[]> {
    const attachmentRefId = extractAttachmentRefId(proposedChanges);

    if (!attachmentRefId) {
      return [];
    }

    const rows = await this.chatAttachmentsRepository.listByIdsForUser(userId, [attachmentRefId]);
    const ownedAttachments = rows.map(toOwnedChatAttachmentRef);
    const expectedCategory =
      intent === "log_nutrition_incident"
        ? "food_photo"
        : intent === "create_workout_plan" || intent === "adapt_workout_plan"
          ? "workout_attachment"
          : undefined;

    return getChatAttachmentProposalRefErrors({
      attachmentRefId,
      ownedAttachments,
      expectedCategory,
      requireReadyStatus: true,
    });
  }

  async validateNutritionIncidentRecipeRecommendationContext(
    userId: string,
    intent: ProposalIntent,
    proposedChanges: unknown,
  ): Promise<string[]> {
    if (intent !== "log_nutrition_incident") {
      return [];
    }

    const parsed = logNutritionIncidentProposalPayloadSchema.safeParse(proposedChanges);

    if (!parsed.success) {
      return [];
    }

    if (parsed.data.provenance.source !== "recipe_recommendation") {
      return [];
    }

    const recommendationId = parsed.data.provenance.providerId;

    if (!recommendationId) {
      return [
        "proposedChanges.provenance.providerId: Recipe recommendation id is required for recipe-backed nutrition incidents.",
      ];
    }

    const existing = await this.recipesRepository.findRecommendationById(
      userId,
      recommendationId,
    );

    if (!existing) {
      return [
        "proposedChanges.provenance.providerId: Recipe recommendation was not found for this user.",
      ];
    }

    const status = existing.recommendation.status;

    if (status !== "accepted" && status !== "completed") {
      return [
        "proposedChanges.provenance.providerId: Only saved or completed recipe recommendations can be logged as nutrition incidents.",
      ];
    }

    return [];
  }

  async validateRecipeRecommendationProposalContext(
    userId: string,
    intent: ProposalIntent,
    proposedChanges: unknown,
  ): Promise<string[]> {
    if (intent !== "recommend_recipes") {
      return [];
    }

    const parsed = recipeRecommendationProposalPayloadSchema.safeParse(proposedChanges);

    if (!parsed.success) {
      return [];
    }

    const revisionId = parsed.data.relatedNutritionPlanRevisionId;

    if (!revisionId) {
      return [];
    }

    const activePlan = await this.nutritionRepository.findActivePlanByUserId(userId);
    const activeRevisionId = activePlan?.activeRevisionId ?? null;
    const owned = await this.nutritionRepository.findRevisionOwnedByUser(userId, revisionId);

    return getRecipeRecommendationRevisionErrors(revisionId, {
      activeRevisionId,
      revisionOwned: owned != null,
    });
  }

  /**
   * Validates the protein-floor constraint for adjust_nutrition_plan proposals
   * (C4 dietary draft). Fetches the current active revision's proteinGrams from
   * the database so the check is context-aware.
   *
   * Safety floor: when lowering calories, protein must not be cut below the
   * current plan floor. This is enforced even when the user edits the proposal
   * before applying.
   */
  async validateAdjustNutritionProteinFloor(
    userId: string,
    intent: ProposalIntent,
    proposedChanges: unknown,
  ): Promise<string[]> {
    if (intent !== "adjust_nutrition_plan") {
      return [];
    }

    const parsed = adjustNutritionPlanFromProgressChangesSchema.safeParse(proposedChanges);

    if (!parsed.success) {
      return [];
    }

    // Only run the contextual check when the proposal explicitly lowers calories.
    const { plan, fromCaloriesPerDay } = parsed.data;
    const isLoweringCalories =
      fromCaloriesPerDay != null &&
      plan.caloriesPerDay != null &&
      plan.caloriesPerDay < fromCaloriesPerDay;

    if (!isLoweringCalories) {
      return [];
    }

    // Fetch the current active plan's protein floor from the database.
    const activePlan = await this.nutritionRepository.findActivePlanByUserId(userId);
    let currentProteinGrams: number | null = null;

    if (activePlan?.activeRevisionId) {
      const activeRevision = await this.nutritionRepository.findActiveRevisionByPlanId(
        activePlan.id,
        activePlan.activeRevisionId,
      );
      const parsed = nutritionPlanPayloadSchema.safeParse(activeRevision?.payload);

      if (parsed.success) {
        currentProteinGrams = parsed.data.proteinGrams;
      }
    }

    return getAdjustNutritionPlanProteinFloorErrors(parsed.data, currentProteinGrams);
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

      if (ref.type === "biomarker_reading") {
        // Guard before the DB lookup: a non-UUID id can never match a reading
        // and would otherwise error at the Postgres layer.
        const owned = z.string().uuid().safeParse(ref.id).success
          ? await this.biomarkersRepository.findContextEligibleReadingById(userId, ref.id)
          : null;

        if (!owned) {
          errors.push(
            `evidenceRefs[${index}].id: Consented biomarker reading was not found for this user.`,
          );
        }

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

    if (intent === "log_nutrition_incident") {
      const domainErrors = getNutritionIncidentDomainErrors(
        result.data as z.infer<typeof logNutritionIncidentProposalPayloadSchema>,
      );

      if (domainErrors.length > 0) {
        return {
          valid: false,
          errors: domainErrors.map((error) => `proposedChanges: ${error}`),
        };
      }
    }

    if (intent === "log_workout_activity") {
      const domainErrors = getLogWorkoutActivityDomainErrors(
        result.data as z.infer<typeof logWorkoutActivityProposalPayloadSchema>,
      );

      if (domainErrors.length > 0) {
        return {
          valid: false,
          errors: domainErrors.map((error) => `proposedChanges: ${error}`),
        };
      }
    }

    if (intent === "save_body_analysis") {
      const domainErrors = getSaveBodyAnalysisDomainErrors(
        result.data as z.infer<typeof saveBodyAnalysisProposalPayloadSchema>,
      );

      if (domainErrors.length > 0) {
        return {
          valid: false,
          errors: domainErrors.map((error) => `proposedChanges: ${error}`),
        };
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
    case "capture_wellbeing_checkin":
      return captureWellbeingCheckinProposalPayloadSchema;
    case "log_nutrition_incident":
      return logNutritionIncidentProposalPayloadSchema;
    case "log_workout_activity":
      return logWorkoutActivityProposalPayloadSchema;
    case "save_body_analysis":
      return saveBodyAnalysisProposalPayloadSchema;
    default:
      return null;
  }
}

function extractAttachmentRefId(proposedChanges: unknown): string | undefined {
  if (!proposedChanges || typeof proposedChanges !== "object") {
    return undefined;
  }

  const attachmentRefId = (proposedChanges as { attachmentRefId?: unknown }).attachmentRefId;

  return typeof attachmentRefId === "string" ? attachmentRefId : undefined;
}
