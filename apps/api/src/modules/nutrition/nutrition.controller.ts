import { Controller, Get, UseGuards } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { ClerkAuthGuard } from "../../auth.guard.js";
import { CurrentAuth } from "../../current-auth.decorator.js";
import { NutritionService } from "./nutrition.service.js";

@Controller("nutrition")
@UseGuards(ClerkAuthGuard)
export class NutritionController {
  constructor(private readonly nutritionService: NutritionService) {}

  @Get("active")
  getActivePlan(@CurrentAuth() auth: ClerkAuthContext) {
    return this.nutritionService.getCurrentActivePlan(auth);
  }

  @Get("revisions")
  listRevisions(@CurrentAuth() auth: ClerkAuthContext) {
    return this.nutritionService.listCurrentRevisions(auth);
  }
}
