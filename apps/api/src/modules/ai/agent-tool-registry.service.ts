import type {
  AgentToolCallRequest,
  AgentToolCallResult,
  AgentToolName,
  ActivePlanDetail,
  RecentAdherenceResult,
  SearchExerciseCatalogResult,
  SearchRecipeCatalogResult,
} from "@health/types";
import {
  activePlanDetailSchema,
  agentGetUserContextSliceToolResultSchema,
  agentGetWeeklyProgressContextToolResultSchema,
  agentToolCallRequestSchema,
  agentToolCallResultSchema,
  getActivePlanDetailInputSchema,
  getRecentAdherenceInputSchema,
  getUserContextSliceInputSchema,
  recentAdherenceResultSchema,
  searchExerciseCatalogInputSchema,
  searchExerciseCatalogResultSchema,
  searchRecipeCatalogInputSchema,
  searchRecipeCatalogResultSchema,
} from "@health/types";
import {
  exerciseDifficultySchema,
  exerciseEquipmentSchema,
  exerciseMuscleSchema,
  recipeMealTypeSchema,
} from "@health/types";
import type { ZodError } from "zod";
import { Injectable } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { CoachingContextService } from "../coaching-context/coaching-context.service.js";
import { ContextBudgetPolicyService } from "../coaching-context/context-budget-policy.service.js";
import { ExercisesService } from "../exercises/exercises.service.js";
import { RecipesService } from "../recipes/recipes.service.js";
import { WorkoutsService } from "../workouts/workouts.service.js";
import { NutritionService } from "../nutrition/nutrition.service.js";

const CATALOG_SEARCH_LIMIT = 10 as const;

@Injectable()
export class AgentToolRegistryService {
  // ContextBudgetPolicyService is injected but no longer used by this service directly.
  // Keeping the injection so downstream NestJS wiring does not change; it remains
  // available if document-context tooling is reinstated behind the deferred consent gate.
  constructor(
    private readonly coachingContextService: CoachingContextService,
    private readonly _contextBudgetPolicyService: ContextBudgetPolicyService,
    private readonly exercisesService: ExercisesService,
    private readonly recipesService: RecipesService,
    private readonly workoutsService: WorkoutsService,
    private readonly nutritionService: NutritionService,
  ) {}

  listAvailableTools(): AgentToolName[] {
    // getDocumentContext is intentionally excluded: under the code-level
    // allowDocuments=false context-budget floor it always returns empty,
    // so advertising it to domain LLMs would promise a capability that
    // runtime cannot deliver. Document context is intentionally unavailable
    // in chat; the consent-scoped design is deferred.
    return [
      "getUserContextSlice",
      "getWeeklyProgressContext",
      "searchExerciseCatalog",
      "searchRecipeCatalog",
      "getActivePlanDetail",
      "getRecentAdherence",
    ];
  }

  /**
   * Execute a tool request from a domain loop after executor allowlist checks.
   */
  async executeTool(
    auth: ClerkAuthContext,
    request: AgentToolCallRequest,
  ): Promise<AgentToolCallResult> {
    const parsedRequest = agentToolCallRequestSchema.safeParse(request);

    if (!parsedRequest.success) {
      return this.invalidToolCallResult(parsedRequest.error);
    }

    return this.executeValidatedTool(auth, parsedRequest.data);
  }

  private async executeValidatedTool(
    auth: ClerkAuthContext,
    request: AgentToolCallRequest,
  ): Promise<AgentToolCallResult> {
    switch (request.tool) {
      case "getUserContextSlice":
        return this.executeGetUserContextSlice(auth, request.input);
      case "getWeeklyProgressContext":
        return this.executeGetWeeklyProgressContext(auth);
      case "searchExerciseCatalog":
        return this.executeSearchExerciseCatalog(auth, request.input);
      case "searchRecipeCatalog":
        return this.executeSearchRecipeCatalog(request.input);
      case "getActivePlanDetail":
        return this.executeGetActivePlanDetail(auth, request.input);
      case "getRecentAdherence":
        return this.executeGetRecentAdherence(auth, request.input);
      default: {
        const _exhaustive: never = request.tool;
        return this.unsupportedToolResult(_exhaustive);
      }
    }
  }

  private invalidToolCallResult(error: ZodError): AgentToolCallResult {
    return agentToolCallResultSchema.parse({
      tool: "getUserContextSlice",
      ok: false,
      errors: error.issues.map(
        (issue) => `${issue.path.join(".") || "request"}: ${issue.message}`,
      ),
    });
  }

  private unsupportedToolResult(tool: string): AgentToolCallResult {
    return agentToolCallResultSchema.parse({
      tool: "getUserContextSlice",
      ok: false,
      errors: [`Unsupported tool: ${tool}`],
    });
  }

  private async executeGetUserContextSlice(
    auth: ClerkAuthContext,
    input: Record<string, unknown>,
  ): Promise<AgentToolCallResult> {
    const parsed = getUserContextSliceInputSchema.safeParse(input);

    if (!parsed.success) {
      return agentToolCallResultSchema.parse({
        tool: "getUserContextSlice",
        ok: false,
        errors: parsed.error.issues.map(
          (issue) => `${issue.path.join(".") || "input"}: ${issue.message}`,
        ),
      });
    }

    const slice = await this.coachingContextService.getUserContextSlice(auth, parsed.data);
    const validated = agentGetUserContextSliceToolResultSchema.safeParse(slice);

    if (!validated.success) {
      return agentToolCallResultSchema.parse({
        tool: "getUserContextSlice",
        ok: false,
        errors: validated.error.issues.map(
          (issue) => `${issue.path.join(".") || "result"}: ${issue.message}`,
        ),
      });
    }

    return agentToolCallResultSchema.parse({
      tool: "getUserContextSlice",
      ok: true,
      result: validated.data,
    });
  }

  private async executeGetWeeklyProgressContext(
    auth: ClerkAuthContext,
  ): Promise<AgentToolCallResult> {
    const slice = await this.coachingContextService.getUserContextSlice(auth, {
      purpose: "weekly_review",
      includeRawData: false,
      includeDocuments: false,
    });

    const result = slice.weeklyProgress ?? null;
    const validated = agentGetWeeklyProgressContextToolResultSchema.safeParse(result);

    if (!validated.success) {
      return agentToolCallResultSchema.parse({
        tool: "getWeeklyProgressContext",
        ok: false,
        errors: validated.error.issues.map(
          (issue) => `${issue.path.join(".") || "result"}: ${issue.message}`,
        ),
      });
    }

    return agentToolCallResultSchema.parse({
      tool: "getWeeklyProgressContext",
      ok: true,
      result: validated.data,
    });
  }

  // ---------------------------------------------------------------------------
  // Slice B — new read-only context tools
  // All are ownership-scoped via the auth context.
  // ---------------------------------------------------------------------------

  private async executeSearchExerciseCatalog(
    auth: ClerkAuthContext,
    input: Record<string, unknown>,
  ): Promise<AgentToolCallResult> {
    const parsed = searchExerciseCatalogInputSchema.safeParse(input);

    if (!parsed.success) {
      return agentToolCallResultSchema.parse({
        tool: "searchExerciseCatalog",
        ok: false,
        errors: parsed.error.issues.map(
          (issue) => `${issue.path.join(".") || "input"}: ${issue.message}`,
        ),
      });
    }

    const { query, muscle, equipment, difficulty, limit } = parsed.data;

    // Safely coerce free-text filter values to typed enums — silently drop invalid values
    // so the tool degrades to a broader search rather than erroring on unknown strings.
    const primaryMuscle = muscle
      ? exerciseMuscleSchema.safeParse(muscle).success
        ? exerciseMuscleSchema.parse(muscle)
        : undefined
      : undefined;
    const equipmentList = equipment
      ? exerciseEquipmentSchema.safeParse(equipment).success
        ? [exerciseEquipmentSchema.parse(equipment)]
        : undefined
      : undefined;
    const typedDifficulty = difficulty
      ? exerciseDifficultySchema.safeParse(difficulty).success
        ? exerciseDifficultySchema.parse(difficulty)
        : undefined
      : undefined;

    // Reuse ExercisesService.listExercises which is already ownership-scoped
    // (public catalog + user's custom exercises). Pass auth for user-owned entries.
    const response = await this.exercisesService.listExercises(
      {
        search: query,
        primaryMuscle,
        equipment: equipmentList,
        difficulty: typedDifficulty,
        includeUserCreated: true,
      },
      auth,
    );

    const capped = response.exercises.slice(0, limit ?? CATALOG_SEARCH_LIMIT);
    const result: SearchExerciseCatalogResult = {
      items: capped.map((ex) => ({
        id: ex.id,
        name: ex.name,
        primaryMuscles: ex.primaryMuscles ?? [],
        equipment: ex.equipment ?? [],
        difficulty: ex.difficulty ?? null,
        hasMedia: Boolean(ex.media?.refs?.length),
      })),
      total: capped.length,
    };

    const validated = searchExerciseCatalogResultSchema.safeParse(result);

    if (!validated.success) {
      return agentToolCallResultSchema.parse({
        tool: "searchExerciseCatalog",
        ok: false,
        errors: validated.error.issues.map(
          (issue) => `${issue.path.join(".") || "result"}: ${issue.message}`,
        ),
      });
    }

    return agentToolCallResultSchema.parse({
      tool: "searchExerciseCatalog",
      ok: true,
      result: validated.data,
    });
  }

  private async executeSearchRecipeCatalog(
    input: Record<string, unknown>,
  ): Promise<AgentToolCallResult> {
    const parsed = searchRecipeCatalogInputSchema.safeParse(input);

    if (!parsed.success) {
      return agentToolCallResultSchema.parse({
        tool: "searchRecipeCatalog",
        ok: false,
        errors: parsed.error.issues.map(
          (issue) => `${issue.path.join(".") || "input"}: ${issue.message}`,
        ),
      });
    }

    const { mealType, tags, limit } = parsed.data;

    // Safely coerce free-text mealType to the typed enum — silently drop invalid values
    // so the tool degrades to an unfiltered meal-type search rather than erroring.
    const typedMealType = mealType
      ? recipeMealTypeSchema.safeParse(mealType).success
        ? recipeMealTypeSchema.parse(mealType)
        : undefined
      : undefined;

    // RecipesService.listRecipes is read-only (no ownership requirement for public catalog).
    // Restriction filtering is done post-fetch using existing compatibility helpers inside
    // the service's listRecipes call.
    const response = await this.recipesService.listRecipes({
      mealType: typedMealType,
      tags: tags,
      compatibleWithRestrictions: parsed.data.restrictions,
    });

    const capped = response.recipes.slice(0, limit ?? CATALOG_SEARCH_LIMIT);
    const result: SearchRecipeCatalogResult = {
      items: capped.map((recipe) => ({
        id: recipe.id,
        name: recipe.name,
        mealTypes: recipe.mealTypes ?? [],
        estimatedCalories: recipe.macroEstimates?.estimatedCalories ?? null,
        proteinGrams: recipe.macroEstimates?.proteinGrams ?? null,
        carbsGrams: recipe.macroEstimates?.carbsGrams ?? null,
        fatGrams: recipe.macroEstimates?.fatGrams ?? null,
        tags: recipe.tags ?? [],
        confidence: recipe.confidence ?? null,
      })),
      total: capped.length,
    };

    const validated = searchRecipeCatalogResultSchema.safeParse(result);

    if (!validated.success) {
      return agentToolCallResultSchema.parse({
        tool: "searchRecipeCatalog",
        ok: false,
        errors: validated.error.issues.map(
          (issue) => `${issue.path.join(".") || "result"}: ${issue.message}`,
        ),
      });
    }

    return agentToolCallResultSchema.parse({
      tool: "searchRecipeCatalog",
      ok: true,
      result: validated.data,
    });
  }

  private async executeGetActivePlanDetail(
    auth: ClerkAuthContext,
    input: Record<string, unknown>,
  ): Promise<AgentToolCallResult> {
    const parsed = getActivePlanDetailInputSchema.safeParse(input);

    if (!parsed.success) {
      return agentToolCallResultSchema.parse({
        tool: "getActivePlanDetail",
        ok: false,
        errors: parsed.error.issues.map(
          (issue) => `${issue.path.join(".") || "input"}: ${issue.message}`,
        ),
      });
    }

    let planDetail: ActivePlanDetail;

    if (parsed.data.domain === "workout") {
      const planResponse = await this.workoutsService.getCurrentActivePlan(auth);
      const revision = planResponse.activeRevision;
      const sessions = planResponse.sessions ?? [];
      // Count unique days from session payloads for a concise bounded summary.
      const dayCount = revision?.payload
        ? countWorkoutPlanDays(revision.payload as Record<string, unknown>)
        : null;

      planDetail = {
        domain: "workout",
        planId: planResponse.plan?.id ?? null,
        revisionId: revision?.id ?? null,
        title: revision?.payload
          ? ((revision.payload as Record<string, unknown>).title as string | null | undefined) ?? null
          : null,
        summary: revision?.payload
          ? buildWorkoutPlanSummary(revision.payload as Record<string, unknown>, sessions.length)
          : null,
        dayCount,
        sessionCount: sessions.length,
        caloriesPerDay: null,
        macroSummary: null,
      };
    } else {
      const planResponse = await this.nutritionService.getCurrentActivePlan(auth);
      const revision = planResponse.activeRevision;
      const payload = revision?.payload as Record<string, unknown> | null | undefined;

      planDetail = {
        domain: "nutrition",
        planId: planResponse.plan?.id ?? null,
        revisionId: revision?.id ?? null,
        title: payload?.title as string | null ?? null,
        summary: payload ? buildNutritionPlanSummary(payload) : null,
        dayCount: null,
        sessionCount: null,
        caloriesPerDay: (payload?.caloriesPerDay as number | null | undefined) ?? null,
        macroSummary: payload
          ? {
              proteinGrams: (payload.proteinGrams as number | null | undefined) ?? null,
              carbsGrams: (payload.carbsGrams as number | null | undefined) ?? null,
              fatGrams: (payload.fatGrams as number | null | undefined) ?? null,
            }
          : null,
      };
    }

    const validated = activePlanDetailSchema.safeParse(planDetail);

    if (!validated.success) {
      return agentToolCallResultSchema.parse({
        tool: "getActivePlanDetail",
        ok: false,
        errors: validated.error.issues.map(
          (issue) => `${issue.path.join(".") || "result"}: ${issue.message}`,
        ),
      });
    }

    return agentToolCallResultSchema.parse({
      tool: "getActivePlanDetail",
      ok: true,
      result: validated.data,
    });
  }

  private async executeGetRecentAdherence(
    auth: ClerkAuthContext,
    input: Record<string, unknown>,
  ): Promise<AgentToolCallResult> {
    const parsed = getRecentAdherenceInputSchema.safeParse(input);

    if (!parsed.success) {
      return agentToolCallResultSchema.parse({
        tool: "getRecentAdherence",
        ok: false,
        errors: parsed.error.issues.map(
          (issue) => `${issue.path.join(".") || "input"}: ${issue.message}`,
        ),
      });
    }

    // Reuse the weekly_review slice which already aggregates workout execution,
    // habit adherence, and nutrition data from the progress module. This keeps the
    // tool thin and avoids duplicating aggregation logic.
    const slice = await this.coachingContextService.getUserContextSlice(auth, {
      purpose: "weekly_review",
      includeRawData: false,
      includeDocuments: false,
    });

    const workoutExecution = slice.recentWorkoutExecution ?? null;
    const habitAdherence = slice.recentHabitAdherence ?? null;

    // Compute habit adherence percent from plan summary fields.
    // habitAdherencePlanSummarySchema has: scheduled, completed, skipped, missed.
    // No requiredCompletionRate used here — we compute a raw completion rate.
    const habitAdherencePercent =
      habitAdherence && habitAdherence.scheduled > 0
        ? Math.round((habitAdherence.completed / habitAdherence.scheduled) * 100)
        : null;

    const result: RecentAdherenceResult = {
      periodDays: 7,
      workout: workoutExecution
        ? {
            plannedCount: workoutExecution.plannedCount,
            completedCount: workoutExecution.completedCount,
            adherencePercent: workoutExecution.adherencePercent ?? null,
          }
        : null,
      nutrition: null, // Nutrition daily log adherence is not yet tracked in the progress aggregate.
      habits: habitAdherence
        ? {
            activeCount: habitAdherence.scheduled,
            adherencePercent: habitAdherencePercent,
          }
        : null,
    };

    const validated = recentAdherenceResultSchema.safeParse(result);

    if (!validated.success) {
      return agentToolCallResultSchema.parse({
        tool: "getRecentAdherence",
        ok: false,
        errors: validated.error.issues.map(
          (issue) => `${issue.path.join(".") || "result"}: ${issue.message}`,
        ),
      });
    }

    return agentToolCallResultSchema.parse({
      tool: "getRecentAdherence",
      ok: true,
      result: validated.data,
    });
  }
}

// ---------------------------------------------------------------------------
// Module-level helpers — bounded plan summaries for getActivePlanDetail
// ---------------------------------------------------------------------------

function countWorkoutPlanDays(payload: Record<string, unknown>): number | null {
  const days = payload.days;

  if (Array.isArray(days)) {
    return days.length;
  }

  return null;
}

function buildWorkoutPlanSummary(
  payload: Record<string, unknown>,
  sessionCount: number,
): string | null {
  const title = payload.title as string | null | undefined;
  const days = payload.days;
  const dayCount = Array.isArray(days) ? days.length : null;

  if (!title && !dayCount) {
    return null;
  }

  const parts: string[] = [];

  if (title) {
    parts.push(title);
  }

  if (dayCount != null) {
    parts.push(`${dayCount} training days`);
  }

  if (sessionCount > 0) {
    parts.push(`${sessionCount} sessions logged`);
  }

  return parts.join("; ");
}

function buildNutritionPlanSummary(payload: Record<string, unknown>): string | null {
  const cals = payload.caloriesPerDay as number | null | undefined;
  const protein = payload.proteinGrams as number | null | undefined;
  const restrictions = payload.restrictions as string[] | null | undefined;

  const parts: string[] = [];

  if (cals != null) {
    parts.push(`${cals} kcal/day`);
  }

  if (protein != null) {
    parts.push(`${protein}g protein`);
  }

  if (restrictions?.length) {
    parts.push(`restrictions: ${restrictions.slice(0, 3).join(", ")}`);
  }

  return parts.length > 0 ? parts.join("; ") : null;
}
