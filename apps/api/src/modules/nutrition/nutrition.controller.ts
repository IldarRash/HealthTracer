import { upsertNutritionAdherenceSchema } from "@health/types";
import { Body, Controller, Get, Param, Put, UseGuards } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { ClerkAuthGuard } from "../../auth.guard.js";
import { parseBody } from "../../common/zod.js";
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

  /**
   * GET /nutrition/grocery-list
   * Returns the grocery list derived from the active nutrition revision.
   * Ownership-scoped: only returns data for the authenticated user.
   * Never writes to the database — the list is a pure projection.
   * Returns a well-formed empty body when no active plan exists.
   */
  @Get("grocery-list")
  getGroceryList(@CurrentAuth() auth: ClerkAuthContext) {
    return this.nutritionService.getGroceryList(auth);
  }

  @Get("adherence/today")
  getTodayAdherence(@CurrentAuth() auth: ClerkAuthContext) {
    return this.nutritionService.getAdherenceForToday(auth);
  }

  @Put("adherence/today")
  upsertTodayAdherence(
    @CurrentAuth() auth: ClerkAuthContext,
    @Body() body: unknown,
  ) {
    return this.nutritionService.upsertAdherenceForToday(
      auth,
      parseBody(upsertNutritionAdherenceSchema, body),
    );
  }

  @Get("adherence/:date")
  getAdherenceByDate(
    @CurrentAuth() auth: ClerkAuthContext,
    @Param("date") date: string,
  ) {
    return this.nutritionService.getAdherenceForDate(auth, date);
  }

  @Put("adherence/:date")
  upsertAdherenceByDate(
    @CurrentAuth() auth: ClerkAuthContext,
    @Param("date") date: string,
    @Body() body: unknown,
  ) {
    return this.nutritionService.upsertAdherenceForDate(
      auth,
      date,
      parseBody(upsertNutritionAdherenceSchema, body),
    );
  }

}
