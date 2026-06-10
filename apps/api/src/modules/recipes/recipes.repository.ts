import { recipes, userRecipeRecommendations } from "@health/db";
import type { RecipeListQuery } from "@health/types";
import { Inject, Injectable } from "@nestjs/common";
import { and, count, desc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { DATABASE } from "../../database/database.tokens.js";
import type { HealthDatabase } from "../../database/database.types.js";
import type { ProviderRecipeDraft } from "./recipe-catalog-provider.js";

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

  async countActiveProviderRecipes(): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(recipes)
      .where(and(eq(recipes.status, "active"), isNotNull(recipes.provider)));

    return row?.value ?? 0;
  }

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

  async findActiveRecipeByProviderExternalId(provider: string, externalId: string) {
    const [recipe] = await this.db
      .select()
      .from(recipes)
      .where(
        and(
          eq(recipes.provider, provider),
          eq(recipes.externalId, externalId),
          eq(recipes.status, "active"),
        ),
      )
      .limit(1);

    return recipe ?? null;
  }

  async upsertProviderRecipes(inputs: ProviderRecipeDraft[]) {
    if (inputs.length === 0) {
      return [];
    }

    const upserted = [];

    for (const input of inputs) {
      const values = {
        provider: input.provider,
        externalId: input.externalId,
        name: input.name,
        description: input.description,
        ingredients: input.ingredients,
        preparationSteps: input.preparationSteps,
        servings: input.servings,
        estimatedCalories: input.macroEstimates.estimatedCalories,
        proteinGrams: input.macroEstimates.proteinGrams,
        carbsGrams: input.macroEstimates.carbsGrams,
        fatGrams: input.macroEstimates.fatGrams,
        fiberGrams: input.macroEstimates.fiberGrams ?? null,
        mealTypes: input.mealTypes,
        tags: input.tags,
        restrictionTags: input.restrictionTags,
        allergenTags: input.allergenTags,
        prepMinutes: input.prepMinutes,
        cookMinutes: input.cookMinutes,
        source: input.source,
        confidence: input.confidence,
        provenance: input.provenance,
        status: "active" as const,
        updatedAt: new Date(),
      };

      const [row] = await this.db
        .insert(recipes)
        .values(values)
        .onConflictDoUpdate({
          target: [recipes.provider, recipes.externalId],
          set: values,
        })
        .returning();

      if (row) {
        upserted.push(row);
      }
    }

    return upserted;
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

  async countWeeklyActivityByUserId(userId: string, weekStart: string, weekEnd: string) {
    const rows = await this.db
      .select({
        status: userRecipeRecommendations.status,
      })
      .from(userRecipeRecommendations)
      .where(
        and(
          eq(userRecipeRecommendations.userId, userId),
          gte(userRecipeRecommendations.shownAt, new Date(`${weekStart}T00:00:00.000Z`)),
          lte(userRecipeRecommendations.shownAt, new Date(`${weekEnd}T23:59:59.999Z`)),
        ),
      );

    return {
      recommendationCount: rows.length,
      savedCount: rows.filter((row) => row.status === "accepted" || row.status === "completed").length,
    };
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
