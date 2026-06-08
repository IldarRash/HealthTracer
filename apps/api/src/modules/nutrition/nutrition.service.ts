import type {
  ActiveNutritionPlanResponse,
  LogNutritionIncidentProposalPayload,
  NutritionAdherenceResponse,
  NutritionMealCaloriesReadModel,
  NutritionPlanPayload,
  NutritionPlanRevision,
  TodayNutritionDetail,
  UpsertNutritionAdherenceInput,
} from "@health/types";
import {
  computeMealCaloriesBreakdown,
  getNutritionIncidentDomainErrors,
  getNutritionPlanDomainErrors,
  getTodayIsoDateInTimezone,
  isoDateSchema,
  logNutritionIncidentProposalPayloadSchema,
  nutritionPlanPayloadSchema,
  sumNutritionIncidentMacros,
} from "@health/types";
import { BadRequestException, Injectable } from "@nestjs/common";
import type { HealthDatabaseTransaction } from "../../database/database.types.js";
import type { ClerkAuthContext } from "../../auth.types.js";
import { UsersService } from "../users/users.service.js";
import {
  toNutritionAdherenceRecord,
  toNutritionPlan,
  toNutritionPlanRevision,
} from "./nutrition.mapper.js";
import { NutritionRepository } from "./nutrition.repository.js";

@Injectable()
export class NutritionService {
  constructor(
    private readonly nutritionRepository: NutritionRepository,
    private readonly usersService: UsersService,
  ) {}

  async getCurrentActivePlan(
    auth: ClerkAuthContext,
  ): Promise<ActiveNutritionPlanResponse> {
    const user = await this.usersService.resolveFromAuth(auth);
    const plan = await this.nutritionRepository.findActivePlanByUserId(user.id);

    if (!plan) {
      return { plan: null, activeRevision: null };
    }

    const activeRevision = plan.activeRevisionId
      ? await this.nutritionRepository.findActiveRevisionByPlanId(
          plan.id,
          plan.activeRevisionId,
        )
      : null;

    return {
      plan: toNutritionPlan(plan),
      activeRevision: activeRevision ? toNutritionPlanRevision(activeRevision) : null,
    };
  }

  /**
   * C1 read model: per-meal calorie breakdown for the active nutrition plan.
   *
   * Returns null when there is no active plan or no active revision.
   * The `changed` flag on each meal row is computed by diffing the active revision
   * against the previous revision — it is never stored.
   * This endpoint is strictly read-only; it never mutates plan state.
   */
  async getMealCaloriesBreakdown(
    auth: ClerkAuthContext,
  ): Promise<NutritionMealCaloriesReadModel | null> {
    const user = await this.usersService.resolveFromAuth(auth);
    const plan = await this.nutritionRepository.findActivePlanByUserId(user.id);

    if (!plan?.activeRevisionId) {
      return null;
    }

    const twoRevisions = await this.nutritionRepository.findLatestTwoRevisionsByPlanId(plan.id);
    const [activeRow, previousRow] = twoRevisions;

    if (!activeRow) {
      return null;
    }

    const activeRevision = toNutritionPlanRevision(activeRow);

    const previousPayload = previousRow
      ? toNutritionPlanRevision(previousRow).payload
      : null;

    return computeMealCaloriesBreakdown(
      activeRevision.revisionNumber,
      activeRevision.payload,
      previousPayload,
    );
  }

  async listCurrentRevisions(
    auth: ClerkAuthContext,
  ): Promise<NutritionPlanRevision[]> {
    const user = await this.usersService.resolveFromAuth(auth);
    const revisions = await this.nutritionRepository.listRevisionsByUserId(user.id);

    return revisions.map(toNutritionPlanRevision);
  }

  async getAdherenceForToday(auth: ClerkAuthContext): Promise<NutritionAdherenceResponse> {
    const user = await this.usersService.resolveFromAuth(auth);
    const date = getTodayIsoDateInTimezone(user.timezone);

    return this.getAdherenceForDate(auth, date);
  }

  async upsertAdherenceForToday(
    auth: ClerkAuthContext,
    input: UpsertNutritionAdherenceInput,
  ): Promise<NutritionAdherenceResponse> {
    const user = await this.usersService.resolveFromAuth(auth);
    const date = getTodayIsoDateInTimezone(user.timezone);
    const row = await this.nutritionRepository.upsertAdherenceByUserIdAndDate(
      user.id,
      date,
      input,
    );

    return {
      adherence: toNutritionAdherenceRecord(row),
    };
  }

  async getAdherenceForDate(
    auth: ClerkAuthContext,
    date: string,
  ): Promise<NutritionAdherenceResponse> {
    const parsedDate = parseAdherenceDate(date);
    const user = await this.usersService.resolveFromAuth(auth);
    const row = await this.nutritionRepository.findAdherenceByUserIdAndDate(
      user.id,
      parsedDate,
    );

    return {
      adherence: row ? toNutritionAdherenceRecord(row) : null,
    };
  }

  async getNutritionDayDetail(
    auth: ClerkAuthContext,
    date: string,
  ): Promise<TodayNutritionDetail | null> {
    const parsedDate = parseAdherenceDate(date);
    const user = await this.usersService.resolveFromAuth(auth);
    const plan = await this.nutritionRepository.findActivePlanByUserId(user.id);

    // Fetch incidents regardless of plan — logged incidents are a standalone signal.
    const [activeRevision, adherenceRow, incidentRows] = plan?.activeRevisionId
      ? await Promise.all([
          this.nutritionRepository.findActiveRevisionByPlanId(plan.id, plan.activeRevisionId),
          this.nutritionRepository.findAdherenceByUserIdAndDate(user.id, parsedDate),
          this.nutritionRepository.listIncidentsByUserAndDate(user.id, parsedDate),
        ])
      : [null, null, await this.nutritionRepository.listIncidentsByUserAndDate(user.id, parsedDate)];

    // Require an active plan + revision for plan-level detail.
    if (!plan?.activeRevisionId || !activeRevision) {
      return null;
    }

    // Aggregate confirmed incidents into the eaten block.
    const eaten = buildEatenBlock(incidentRows);

    return {
      date: parsedDate,
      plan: toNutritionPlan(plan),
      activeRevision: toNutritionPlanRevision(activeRevision),
      adherence: adherenceRow ? toNutritionAdherenceRecord(adherenceRow) : null,
      eaten,
    };
  }

  async upsertAdherenceForDate(
    auth: ClerkAuthContext,
    date: string,
    input: UpsertNutritionAdherenceInput,
  ): Promise<NutritionAdherenceResponse> {
    const parsedDate = parseAdherenceDate(date);
    const user = await this.usersService.resolveFromAuth(auth);
    const row = await this.nutritionRepository.upsertAdherenceByUserIdAndDate(
      user.id,
      parsedDate,
      input,
    );

    return {
      adherence: toNutritionAdherenceRecord(row),
    };
  }

  async applyNutritionPlanProposal(
    userId: string,
    payload: NutritionPlanPayload,
    reason: string,
    _intent: "create_nutrition_plan" | "adjust_nutrition_plan",
  ): Promise<string> {
    const parsedPayload = nutritionPlanPayloadSchema.parse(payload);
    const domainErrors = getNutritionPlanDomainErrors(parsedPayload);

    if (domainErrors.length > 0) {
      throw new BadRequestException({
        message: "Nutrition plan payload failed domain validation.",
        validationErrors: domainErrors,
      });
    }

    const existingPlan = await this.nutritionRepository.findActivePlanByUserId(userId);

    if (!existingPlan) {
      const { revision } = await this.nutritionRepository.createPlanWithRevision(
        userId,
        parsedPayload,
        reason,
        "ai_proposal",
      );

      return `nutrition_revision:${revision.id}`;
    }

    const revision = await this.nutritionRepository.appendRevision(
      existingPlan.id,
      parsedPayload,
      reason,
      "ai_proposal",
    );

    return `nutrition_revision:${revision.id}`;
  }

  async applyNutritionIncidentProposal(
    userId: string,
    sourceProposalId: string,
    payload: LogNutritionIncidentProposalPayload,
    tx?: HealthDatabaseTransaction,
  ): Promise<string> {
    const parsedPayload = logNutritionIncidentProposalPayloadSchema.parse(payload);
    const domainErrors = getNutritionIncidentDomainErrors(parsedPayload);

    if (domainErrors.length > 0) {
      throw new BadRequestException({
        message: "Nutrition incident payload failed domain validation.",
        validationErrors: domainErrors,
      });
    }

    const existingIncident = await this.nutritionRepository.findIncidentBySourceProposalId(
      userId,
      sourceProposalId,
      tx,
    );

    if (existingIncident) {
      return existingIncident.id;
    }

    const user = await this.usersService.getUserById(userId);
    const timezone = user?.timezone ?? "UTC";

    const row = await this.nutritionRepository.createIncident(
      userId,
      sourceProposalId,
      parsedPayload,
      tx,
      timezone,
    );

    return row.id;
  }

}

function parseAdherenceDate(date: string): string {
  const parsed = isoDateSchema.safeParse(date);

  if (!parsed.success) {
    throw new BadRequestException("Expected date in YYYY-MM-DD format.");
  }

  return parsed.data;
}

/**
 * Aggregate confirmed nutrition incidents into the `eaten` block for TodayNutritionDetail.
 * Returns null when no incidents are present (null = no incidents, not zero-calories).
 * Delegates macro extraction to `sumNutritionIncidentMacros` (packages/types).
 */
function buildEatenBlock(
  rows: ReadonlyArray<{ estimatedCalories: number; estimatedMacros: Record<string, number> }>,
): { calories: number; proteinGrams: number; carbsGrams: number; fatGrams: number; incidentCount: number } | null {
  return sumNutritionIncidentMacros(rows);
}
