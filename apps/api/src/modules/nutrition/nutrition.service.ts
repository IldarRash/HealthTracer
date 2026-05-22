import type {
  ActiveNutritionPlanResponse,
  NutritionPlanPayload,
  NutritionPlanRevision,
} from "@health/types";
import { Injectable } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { UsersService } from "../users/users.service.js";
import { toNutritionPlan, toNutritionPlanRevision } from "./nutrition.mapper.js";
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

  async applyNutritionPlanProposal(
    userId: string,
    payload: NutritionPlanPayload,
    reason: string,
    _intent: "create_nutrition_plan" | "adjust_nutrition_plan",
  ): Promise<string> {
    const existingPlan = await this.nutritionRepository.findActivePlanByUserId(userId);

    if (!existingPlan) {
      const { revision } = await this.nutritionRepository.createPlanWithRevision(
        userId,
        payload,
        reason,
        "ai_proposal",
      );

      return `nutrition_revision:${revision.id}`;
    }

    const revision = await this.nutritionRepository.appendRevision(
      existingPlan.id,
      payload,
      reason,
      "ai_proposal",
    );

    return `nutrition_revision:${revision.id}`;
  }
}
