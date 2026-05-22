import {
  recipeListQuerySchema,
  updateRecipeRecommendationStatusSchema,
} from "@health/types";
import { Controller, Get, Param, Patch, Post, Query, Body, UseGuards } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { ClerkAuthGuard } from "../../auth.guard.js";
import { parseBody } from "../../common/zod.js";
import { CurrentAuth } from "../../current-auth.decorator.js";
import { RecipesService } from "./recipes.service.js";

function parseRecipeListQuery(query: Record<string, unknown>) {
  const parsed = recipeListQuerySchema.safeParse({
    mealType: query.mealType,
    tags: typeof query.tags === "string" ? query.tags.split(",").filter(Boolean) : query.tags,
    compatibleWithRestrictions:
      typeof query.compatibleWithRestrictions === "string"
        ? query.compatibleWithRestrictions.split(",").filter(Boolean)
        : query.compatibleWithRestrictions,
    minEstimatedCalories: query.minEstimatedCalories,
    maxEstimatedCalories: query.maxEstimatedCalories,
    minProteinGrams: query.minProteinGrams,
    maxProteinGrams: query.maxProteinGrams,
  });

  if (!parsed.success) {
    return recipeListQuerySchema.parse({});
  }

  return parsed.data;
}

@Controller("recipes")
@UseGuards(ClerkAuthGuard)
export class RecipesController {
  constructor(private readonly recipesService: RecipesService) {}

  @Get()
  listRecipes(@Query() query: Record<string, unknown>) {
    return this.recipesService.listRecipes(parseRecipeListQuery(query));
  }

  @Get("recommendations")
  listRecommendations(@CurrentAuth() auth: ClerkAuthContext) {
    return this.recipesService.listCurrentRecommendations(auth);
  }

  @Post("recommendations/generate")
  generateRecommendations(@CurrentAuth() auth: ClerkAuthContext) {
    return this.recipesService.generateCurrentRecommendations(auth);
  }

  @Patch("recommendations/:recommendationId/status")
  updateRecommendationStatus(
    @CurrentAuth() auth: ClerkAuthContext,
    @Param("recommendationId") recommendationId: string,
    @Body() body: unknown,
  ) {
    return this.recipesService.updateCurrentRecommendationStatus(
      auth,
      recommendationId,
      parseBody(updateRecipeRecommendationStatusSchema, body),
    );
  }

  @Get(":recipeId")
  getRecipe(@Param("recipeId") recipeId: string) {
    return this.recipesService.getRecipe(recipeId);
  }
}
