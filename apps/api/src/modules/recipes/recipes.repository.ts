import { recipes, userRecipeRecommendations } from "@health/db";
import type { RecipeListQuery } from "@health/types";
import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { DATABASE } from "../../database/database.tokens.js";
import type { HealthDatabase } from "../../database/database.types.js";

export interface CreateRecommendationInput {
  userId: string;
  recipeId: string;
  relatedNutritionPlanRevisionId: string | null;
  reason: string;
  fitSummary: string;
  status?: "pending" | "accepted";
}

export interface RecommendationLookupKey {
  recipeId: string;
  relatedNutritionPlanRevisionId: string | null;
}

const OPEN_RECOMMENDATION_STATUSES = ["pending", "accepted"] as const;

@Injectable()
export class RecipesRepository {
  constructor(@Inject(DATABASE) private readonly db: HealthDatabase) {}

  async listActiveRecipes(filters: RecipeListQuery) {
    const conditions = [eq(recipes.status, "active")];

    if (filters.mealType) {
      conditions.push(
        sql`${recipes.mealTypes} @> ${JSON.stringify([filters.mealType])}::jsonb`,
      );
    }

    if (filters.tags?.length) {
      for (const tag of filters.tags) {
        conditions.push(sql`${recipes.tags} @> ${JSON.stringify([tag])}::jsonb`);
      }
    }

    if (filters.minEstimatedCalories !== undefined) {
      conditions.push(gte(recipes.estimatedCalories, filters.minEstimatedCalories));
    }

    if (filters.maxEstimatedCalories !== undefined) {
      conditions.push(lte(recipes.estimatedCalories, filters.maxEstimatedCalories));
    }

    if (filters.minProteinGrams !== undefined) {
      conditions.push(gte(recipes.proteinGrams, filters.minProteinGrams));
    }

    if (filters.maxProteinGrams !== undefined) {
      conditions.push(lte(recipes.proteinGrams, filters.maxProteinGrams));
    }

    return this.db
      .select()
      .from(recipes)
      .where(and(...conditions))
      .orderBy(desc(recipes.updatedAt));
  }

  async findActiveRecipeById(recipeId: string) {
    const [recipe] = await this.db
      .select()
      .from(recipes)
      .where(and(eq(recipes.id, recipeId), eq(recipes.status, "active")))
      .limit(1);

    return recipe ?? null;
  }

  async findActiveRecipesByIds(recipeIds: string[]) {
    if (recipeIds.length === 0) {
      return [];
    }

    return this.db
      .select()
      .from(recipes)
      .where(and(inArray(recipes.id, recipeIds), eq(recipes.status, "active")));
  }

  async listRecommendationsByUserId(userId: string) {
    return this.db
      .select({
        recommendation: userRecipeRecommendations,
        recipe: recipes,
      })
      .from(userRecipeRecommendations)
      .innerJoin(recipes, eq(userRecipeRecommendations.recipeId, recipes.id))
      .where(eq(userRecipeRecommendations.userId, userId))
      .orderBy(desc(userRecipeRecommendations.shownAt));
  }

  async findRecommendationById(userId: string, recommendationId: string) {
    const [row] = await this.db
      .select({
        recommendation: userRecipeRecommendations,
        recipe: recipes,
      })
      .from(userRecipeRecommendations)
      .innerJoin(recipes, eq(userRecipeRecommendations.recipeId, recipes.id))
      .where(
        and(
          eq(userRecipeRecommendations.id, recommendationId),
          eq(userRecipeRecommendations.userId, userId),
        ),
      )
      .limit(1);

    return row ?? null;
  }

  async findOpenRecommendationsByKeys(
    userId: string,
    keys: RecommendationLookupKey[],
  ) {
    if (keys.length === 0) {
      return [];
    }

    const recipeIds = [...new Set(keys.map((key) => key.recipeId))];

    const rows = await this.db
      .select()
      .from(userRecipeRecommendations)
      .where(
        and(
          eq(userRecipeRecommendations.userId, userId),
          inArray(userRecipeRecommendations.recipeId, recipeIds),
          inArray(userRecipeRecommendations.status, [...OPEN_RECOMMENDATION_STATUSES]),
        ),
      );

    return rows.filter((row) =>
      keys.some(
        (key) =>
          key.recipeId === row.recipeId &&
          key.relatedNutritionPlanRevisionId === row.relatedNutritionPlanRevisionId,
      ),
    );
  }

  async createRecommendations(inputs: CreateRecommendationInput[]) {
    if (inputs.length === 0) {
      return [];
    }

    return this.db
      .insert(userRecipeRecommendations)
      .values(
        inputs.map((input) => ({
          userId: input.userId,
          recipeId: input.recipeId,
          relatedNutritionPlanRevisionId: input.relatedNutritionPlanRevisionId,
          reason: input.reason,
          fitSummary: input.fitSummary,
          status: input.status ?? "pending",
          shownAt: new Date(),
        })),
      )
      .returning();
  }

  async updateRecommendationStatus(
    userId: string,
    recommendationId: string,
    status: "accepted" | "dismissed" | "completed",
  ) {
    const now = new Date();

    const [updated] = await this.db
      .update(userRecipeRecommendations)
      .set({
        status,
        decidedAt: now,
        completedAt: status === "completed" ? now : null,
        updatedAt: now,
      })
      .where(
        and(
          eq(userRecipeRecommendations.id, recommendationId),
          eq(userRecipeRecommendations.userId, userId),
        ),
      )
      .returning();

    return updated ?? null;
  }
}
