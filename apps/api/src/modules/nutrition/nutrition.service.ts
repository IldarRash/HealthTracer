import type {
  ActiveNutritionPlanResponse,
  NutritionAdherenceResponse,
  NutritionPlanPayload,
  NutritionPlanRevision,
  TodayNutritionDetail,
  UpsertNutritionAdherenceInput,
} from "@health/types";
import {
  getNutritionPlanDomainErrors,
  isoDateSchema,
  nutritionPlanPayloadSchema,
} from "@health/types";
import { BadRequestException, Injectable } from "@nestjs/common";
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

  async listCurrentRevisions(
    auth: ClerkAuthContext,
  ): Promise<NutritionPlanRevision[]> {
    const user = await this.usersService.resolveFromAuth(auth);
    const revisions = await this.nutritionRepository.listRevisionsByUserId(user.id);

    return revisions.map(toNutritionPlanRevision);
  }

  async getAdherenceForToday(auth: ClerkAuthContext): Promise<NutritionAdherenceResponse> {
    const user = await this.usersService.resolveFromAuth(auth);
    const date = getDateInTimezone(user.timezone);

    return this.getAdherenceForDate(auth, date);
  }

  async upsertAdherenceForToday(
    auth: ClerkAuthContext,
    input: UpsertNutritionAdherenceInput,
  ): Promise<NutritionAdherenceResponse> {
    const user = await this.usersService.resolveFromAuth(auth);
    const date = getDateInTimezone(user.timezone);
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

    if (!plan?.activeRevisionId) {
      return null;
    }

    const [activeRevision, adherenceRow] = await Promise.all([
      this.nutritionRepository.findActiveRevisionByPlanId(plan.id, plan.activeRevisionId),
      this.nutritionRepository.findAdherenceByUserIdAndDate(user.id, parsedDate),
    ]);

    if (!activeRevision) {
      return null;
    }

    return {
      date: parsedDate,
      plan: toNutritionPlan(plan),
      activeRevision: toNutritionPlanRevision(activeRevision),
      adherence: adherenceRow ? toNutritionAdherenceRecord(adherenceRow) : null,
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
}

function parseAdherenceDate(date: string): string {
  const parsed = isoDateSchema.safeParse(date);

  if (!parsed.success) {
    throw new BadRequestException("Expected date in YYYY-MM-DD format.");
  }

  return parsed.data;
}

function getDateInTimezone(timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  }
}
