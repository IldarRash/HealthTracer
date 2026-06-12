import {
  computeRecipeMacrosInputSchema,
  createRecipeInputSchema,
  createRecipeNutritionIncidentProposalInputSchema,
  recipeListQuerySchema,
  updateRecipeInputSchema,
  updateRecipeRecommendationStatusSchema,
} from "@health/types";
import { Controller, Delete, Get, Param, Patch, Post, Query, Body, UseGuards } from "@nestjs/common";
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
    minCaloriesPerServing: query.minCaloriesPerServing,
    maxCaloriesPerServing: query.maxCaloriesPerServing,
    minProteinGramsPerServing: query.minProteinGramsPerServing,
    maxProteinGramsPerServing: query.maxProteinGramsPerServing,
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
  listRecipes(@CurrentAuth() auth: ClerkAuthContext, @Query() query: Record<string, unknown>) {
    return this.recipesService.listRecipes(parseRecipeListQuery(query), auth);
  }

  @Post()
  createRecipe(@CurrentAuth() auth: ClerkAuthContext, @Body() body: unknown) {
    return this.recipesService.createRecipe(auth, parseBody(createRecipeInputSchema, body));
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

  @Post("recommendations/:recommendationId/nutrition-incident-proposal")
  createNutritionIncidentProposal(
    @CurrentAuth() auth: ClerkAuthContext,
    @Param("recommendationId") recommendationId: string,
    @Body() body: unknown,
  ) {
    return this.recipesService.createNutritionIncidentProposalFromRecommendation(
      auth,
      recommendationId,
      parseBody(createRecipeNutritionIncidentProposalInputSchema, body ?? {}),
    );
  }

  @Post("compute-macros")
  computeMacros(@CurrentAuth() _auth: ClerkAuthContext, @Body() body: unknown) {
    return this.recipesService.computeMacros(parseBody(computeRecipeMacrosInputSchema, body));
  }

  @Patch(":recipeId")
  updateRecipe(
    @CurrentAuth() auth: ClerkAuthContext,
    @Param("recipeId") recipeId: string,
    @Body() body: unknown,
  ) {
    return this.recipesService.updateRecipe(auth, recipeId, parseBody(updateRecipeInputSchema, body));
  }

  @Delete(":recipeId")
  deleteRecipe(
    @CurrentAuth() auth: ClerkAuthContext,
    @Param("recipeId") recipeId: string,
  ) {
    return this.recipesService.deleteRecipe(auth, recipeId);
  }

  @Get(":recipeId")
  getRecipe(@Param("recipeId") recipeId: string) {
    return this.recipesService.getRecipe(recipeId);
  }
}
