import { validateProposalSafety } from "@health/ai";
import type {
  AiProposal,
  CreateRecipeNutritionIncidentProposalInput,
  GenerateRecipeRecommendationsResponse,
  LogNutritionIncidentProposalPayload,
  NutritionPlanPayload,
  RawAiProposal,
  Recipe,
  RecipeListQuery,
  RecipeListResponse,
  UpdateRecipeRecommendationStatusInput,
  UserRecipeRecommendation,
  UserRecipeRecommendationListResponse,
} from "@health/types";
import {
  buildRecipeRecommendationProposal,
  createRecipeNutritionIncidentProposalInputSchema,
  getRecipeRecommendationRevisionErrors,
  logNutritionIncidentProposalPayloadSchema,
  nutritionPlanPayloadSchema,
  recipeRecommendationProposalPayloadSchema,
} from "@health/types";
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { NutritionRepository } from "../nutrition/nutrition.repository.js";
import { toAiProposal } from "../proposals/proposal.mapper.js";
import { ProposalValidationService } from "../proposals/proposal-validation.service.js";
import { ProposalsRepository } from "../proposals/proposals.repository.js";
import { ProfilesRepository } from "../profiles/profiles.repository.js";
import { UsersService } from "../users/users.service.js";
import {
  buildRuleBasedFitSummary,
  collectHardFilters,
  isRecipeCompatibleWithHardFilters,
  scoreRecipeMacroFit,
} from "./recipe-compatibility.js";
import { toRecipe, toUserRecipeRecommendation } from "./recipe.mapper.js";
import { canTransitionRecipeRecommendationStatus } from "./recipe-recommendation-status.js";
import type { CreateRecommendationInput } from "./recipes.repository.js";
import { RecipesRepository } from "./recipes.repository.js";
import { GENERIC_RECIPE_CATALOG_CATEGORIES } from "./generic-recipe-catalog-categories.js";
import type { RecipeCatalogProvider } from "./recipe-catalog-provider.js";
import { RECIPE_CATALOG_PROVIDER } from "./recipe-catalog.tokens.js";

const GENERATED_RECOMMENDATION_LIMIT = 5;

@Injectable()
export class RecipesService {
  constructor(
    private readonly recipesRepository: RecipesRepository,
    private readonly nutritionRepository: NutritionRepository,
    private readonly profilesRepository: ProfilesRepository,
    private readonly usersService: UsersService,
    private readonly proposalsRepository: ProposalsRepository,
    private readonly proposalValidationService: ProposalValidationService,
    @Inject(RECIPE_CATALOG_PROVIDER)
    private readonly recipeCatalogProvider: RecipeCatalogProvider,
  ) {}

  async listRecipes(filters: RecipeListQuery): Promise<RecipeListResponse> {
    const rows = await this.recipesRepository.listActiveRecipes(filters);
    let recipes = rows.map(toRecipe);

    if (filters.compatibleWithRestrictions?.length) {
      const hardFilters = collectHardFilters(filters.compatibleWithRestrictions, [], []);
      recipes = recipes.filter((recipe) =>
        isRecipeCompatibleWithHardFilters(recipe, hardFilters),
      );
    }

    return { recipes };
  }

  async getRecipe(recipeId: string): Promise<Recipe> {
    const row = await this.recipesRepository.findActiveRecipeById(recipeId);

    if (!row) {
      throw new NotFoundException("Recipe not found.");
    }

    return toRecipe(row);
  }

  async listCurrentRecommendations(
    auth: ClerkAuthContext,
  ): Promise<UserRecipeRecommendationListResponse> {
    const user = await this.usersService.resolveFromAuth(auth);
    const rows = await this.recipesRepository.listRecommendationsByUserId(user.id);

    return {
      recommendations: rows.map(({ recommendation, recipe }) =>
        toUserRecipeRecommendation(recommendation, toRecipe(recipe)),
      ),
    };
  }

  async generateCurrentRecommendations(
    auth: ClerkAuthContext,
  ): Promise<GenerateRecipeRecommendationsResponse> {
    const user = await this.usersService.resolveFromAuth(auth);
    const activeContext = await this.resolveActiveNutritionContext(user.id);

    if (!activeContext) {
      return {
        recommendations: [],
        relatedNutritionPlanRevisionId: null,
        limitedReason: "no_active_nutrition_plan",
      };
    }

    const hardFilters = await this.resolveHardFilters(user.id, activeContext.payload);
    await this.ensureProviderCatalogLoaded();
    const catalog = await this.recipesRepository.listActiveRecipes({});
    const compatible = catalog
      .map((row) => ({ row, recipe: toRecipe(row) }))
      .filter(({ recipe }) => isRecipeCompatibleWithHardFilters(recipe, hardFilters))
      .sort(
        (left, right) =>
          scoreRecipeMacroFit(right.recipe.macroEstimates, activeContext.targets) -
          scoreRecipeMacroFit(left.recipe.macroEstimates, activeContext.targets),
      )
      .slice(0, GENERATED_RECOMMENDATION_LIMIT);

    if (compatible.length === 0) {
      return {
        recommendations: [],
        relatedNutritionPlanRevisionId: activeContext.revisionId,
        limitedReason: "no_compatible_recipes",
      };
    }

    const created = await this.createRecommendationsIdempotently(
      compatible.map(({ row, recipe }) => ({
        userId: user.id,
        recipeId: row.id,
        relatedNutritionPlanRevisionId: activeContext.revisionId,
        reason: "Rule-based recommendation from your active nutrition plan.",
        fitSummary: buildRuleBasedFitSummary(
          {
            estimatedCalories: recipe.macroEstimates.estimatedCalories,
            proteinGrams: recipe.macroEstimates.proteinGrams,
            mealTypes: recipe.mealTypes,
          },
          activeContext.targets,
        ),
      })),
    );

    const recipeById = new Map(compatible.map(({ row, recipe }) => [row.id, recipe]));

    return {
      recommendations: created.map((recommendation) =>
        toUserRecipeRecommendation(
          recommendation,
          recipeById.get(recommendation.recipeId),
        ),
      ),
      relatedNutritionPlanRevisionId: activeContext.revisionId,
      limitedReason: null,
    };
  }

  async updateCurrentRecommendationStatus(
    auth: ClerkAuthContext,
    recommendationId: string,
    input: UpdateRecipeRecommendationStatusInput,
  ): Promise<UserRecipeRecommendation> {
    const user = await this.usersService.resolveFromAuth(auth);
    const existing = await this.recipesRepository.findRecommendationById(
      user.id,
      recommendationId,
    );

    if (!existing) {
      throw new NotFoundException("Recipe recommendation not found.");
    }

    const currentStatus = existing.recommendation.status as UserRecipeRecommendation["status"];

    if (!canTransitionRecipeRecommendationStatus(currentStatus, input.status)) {
      throw new BadRequestException(
        `Cannot change recipe recommendation status from ${currentStatus} to ${input.status}.`,
      );
    }

    if (currentStatus === input.status) {
      return toUserRecipeRecommendation(existing.recommendation, toRecipe(existing.recipe));
    }

    const updated = await this.recipesRepository.updateRecommendationStatus(
      user.id,
      recommendationId,
      input.status,
    );

    if (!updated) {
      throw new NotFoundException("Recipe recommendation not found.");
    }

    return toUserRecipeRecommendation(updated, toRecipe(existing.recipe));
  }

  async packChatRecipeRecommendationProposal(auth: ClerkAuthContext) {
    const generated = await this.generateCurrentRecommendations(auth);

    if (generated.limitedReason || generated.recommendations.length === 0) {
      return null;
    }

    return buildRecipeRecommendationProposal({
      relatedNutritionPlanRevisionId: generated.relatedNutritionPlanRevisionId,
      recommendations: generated.recommendations.map((recommendation) => ({
        recipeId: recommendation.recipeId,
        reason: recommendation.reason,
        fitSummary: recommendation.fitSummary,
      })),
    });
  }

  async createNutritionIncidentProposalFromRecommendation(
    auth: ClerkAuthContext,
    recommendationId: string,
    input: CreateRecipeNutritionIncidentProposalInput = {},
  ): Promise<AiProposal> {
    const parsedInput = createRecipeNutritionIncidentProposalInputSchema.parse(input);
    const user = await this.usersService.resolveFromAuth(auth);
    const existing = await this.recipesRepository.findRecommendationById(
      user.id,
      recommendationId,
    );

    if (!existing) {
      throw new NotFoundException("Recipe recommendation not found.");
    }

    const status = existing.recommendation.status;

    if (status !== "accepted" && status !== "completed") {
      throw new BadRequestException(
        "Only saved or completed recipe recommendations can be logged as nutrition incidents.",
      );
    }

    const recipe = toRecipe(existing.recipe);
    const builtPayload = this.buildNutritionIncidentPayloadFromRecipe(
      recipe,
      recommendationId,
    );
    const proposedChanges = this.resolveNutritionIncidentProposedChanges(
      builtPayload,
      recommendationId,
      parsedInput.proposedChanges,
    );
    const threadId = await this.resolveNutritionIncidentProposalThread(
      user.id,
      parsedInput.threadId,
    );
    const rawProposal: RawAiProposal = {
      intent: "log_nutrition_incident",
      targetDomain: "nutrition",
      title: `Log ${recipe.name}`,
      reason:
        "Review this approximate recipe estimate, edit items or quantities if needed, then confirm to add a food log entry. Your nutrition targets stay unchanged.",
      proposedChanges,
    };
    const safetyErrors = validateProposalSafety({
      intent: rawProposal.intent,
      targetDomain: rawProposal.targetDomain,
      title: rawProposal.title,
      reason: rawProposal.reason,
      proposedChanges: rawProposal.proposedChanges,
    });
    const validation = this.proposalValidationService.validateRawProposal(rawProposal);
    const nutritionIncidentImageRefErrors =
      await this.proposalValidationService.validateNutritionIncidentImageRefOwnership(
        user.id,
        rawProposal.intent,
        rawProposal.proposedChanges,
      );
    const nutritionIncidentRecipeRecommendationErrors =
      await this.proposalValidationService.validateNutritionIncidentRecipeRecommendationContext(
        user.id,
        rawProposal.intent,
        rawProposal.proposedChanges,
      );
    const validationErrors = [
      ...safetyErrors,
      ...validation.errors,
      ...nutritionIncidentImageRefErrors,
      ...nutritionIncidentRecipeRecommendationErrors,
    ];
    const validationStatus = validationErrors.length === 0 ? "valid" : "invalid";
    const record = await this.proposalsRepository.createPendingProposal(
      user.id,
      threadId,
      null,
      rawProposal,
      validationStatus,
      validationErrors,
    );

    return toAiProposal(record);
  }

  private buildNutritionIncidentPayloadFromRecipe(
    recipe: Recipe,
    recommendationId: string,
  ): LogNutritionIncidentProposalPayload {
    return logNutritionIncidentProposalPayloadSchema.parse({
      incidentDateTime: new Date().toISOString(),
      items: [
        {
          name: recipe.name,
          quantity: `${recipe.servings} serving${recipe.servings === 1 ? "" : "s"}`,
          calories: recipe.macroEstimates.estimatedCalories,
          proteinGrams: recipe.macroEstimates.proteinGrams,
          carbsGrams: recipe.macroEstimates.carbsGrams,
          fatGrams: recipe.macroEstimates.fatGrams,
        },
      ],
      estimatedCalories: recipe.macroEstimates.estimatedCalories,
      estimatedMacros: {
        proteinGrams: recipe.macroEstimates.proteinGrams,
        carbsGrams: recipe.macroEstimates.carbsGrams,
        fatGrams: recipe.macroEstimates.fatGrams,
      },
      confidence: recipe.confidence,
      provenance: {
        source: "recipe_recommendation",
        providerId: recommendationId,
      },
      imageRefs: [],
    });
  }

  private resolveNutritionIncidentProposedChanges(
    builtPayload: LogNutritionIncidentProposalPayload,
    recommendationId: string,
    override?: LogNutritionIncidentProposalPayload,
  ): LogNutritionIncidentProposalPayload {
    if (!override) {
      return builtPayload;
    }

    const proposedChanges = logNutritionIncidentProposalPayloadSchema.parse(override);

    if (proposedChanges.provenance.source !== "recipe_recommendation") {
      throw new BadRequestException(
        "Recipe nutrition incident proposals must use recipe_recommendation provenance.",
      );
    }

    if (proposedChanges.provenance.providerId !== recommendationId) {
      throw new BadRequestException(
        "proposedChanges.provenance.providerId must match the recipe recommendation id.",
      );
    }

    return proposedChanges;
  }

  private async resolveNutritionIncidentProposalThread(
    userId: string,
    requestedThreadId?: string,
  ): Promise<string> {
    if (requestedThreadId) {
      const thread = await this.proposalsRepository.findThreadById(userId, requestedThreadId);

      if (!thread) {
        throw new NotFoundException("Chat thread not found.");
      }

      return thread.id;
    }

    const thread = await this.proposalsRepository.createThreadForUser(
      userId,
      "Recipe food log",
    );

    return thread.id;
  }

  async applyRecipeRecommendationProposal(
    userId: string,
    payloadInput: unknown,
    proposalReason: string,
  ): Promise<string> {
    const payload = recipeRecommendationProposalPayloadSchema.parse(payloadInput);
    const activeContext = await this.resolveActiveNutritionContext(userId);
    const revisionId =
      payload.relatedNutritionPlanRevisionId ?? activeContext?.revisionId ?? null;

    if (payload.relatedNutritionPlanRevisionId) {
      const revisionErrors = await this.validateRelatedRevisionContext(
        userId,
        payload.relatedNutritionPlanRevisionId,
      );

      if (revisionErrors.length > 0) {
        throw new BadRequestException(revisionErrors[0]);
      }
    }

    let filterPayload: NutritionPlanPayload | undefined = activeContext?.payload;

    if (revisionId) {
      const owned = await this.nutritionRepository.findRevisionOwnedByUser(
        userId,
        revisionId,
      );

      if (!owned) {
        throw new BadRequestException(
          "Related nutrition plan revision was not found for this user.",
        );
      }

      filterPayload = nutritionPlanPayloadSchema.parse(owned.payload);
    }

    const recipeIds = payload.recommendations.map((item) => item.recipeId);
    const recipes = await this.recipesRepository.findActiveRecipesByIds(recipeIds);
    const recipeById = new Map(recipes.map((recipe) => [recipe.id, recipe]));

    if (recipes.length !== recipeIds.length) {
      throw new BadRequestException("One or more proposed recipes were not found.");
    }

    const hardFilters = await this.resolveHardFilters(userId, filterPayload);

    for (const item of payload.recommendations) {
      const recipe = recipeById.get(item.recipeId);

      if (!recipe) {
        continue;
      }

      const mappedRecipe = toRecipe(recipe);

      if (!isRecipeCompatibleWithHardFilters(mappedRecipe, hardFilters)) {
        throw new BadRequestException(
          `Recipe ${mappedRecipe.name} conflicts with known restrictions or allergies.`,
        );
      }
    }

    const created = await this.createRecommendationsIdempotently(
      payload.recommendations.map((item) => ({
        userId,
        recipeId: item.recipeId,
        relatedNutritionPlanRevisionId: revisionId,
        reason: item.reason || proposalReason,
        fitSummary: item.fitSummary,
        status: "pending",
      })),
    );

    if (created.length === 0) {
      throw new BadRequestException("No recipe recommendations were created.");
    }

    return `recipe_recommendation:${created[0]?.id}`;
  }

  private async validateRelatedRevisionContext(userId: string, revisionId: string) {
    const activeContext = await this.resolveActiveNutritionContext(userId);
    const owned = await this.nutritionRepository.findRevisionOwnedByUser(userId, revisionId);

    return getRecipeRecommendationRevisionErrors(revisionId, {
      activeRevisionId: activeContext?.revisionId ?? null,
      revisionOwned: owned != null,
    });
  }

  private async ensureProviderCatalogLoaded(): Promise<void> {
    try {
      const drafts = await this.recipeCatalogProvider.fetchByGenericCategories(
        GENERIC_RECIPE_CATALOG_CATEGORIES,
      );

      if (drafts.length > 0) {
        await this.recipesRepository.upsertProviderRecipes(drafts);
      }
    } catch {
      // Fall back to the local seeded catalog when the external provider is unavailable.
    }
  }

  private async resolveActiveNutritionContext(userId: string) {
    const plan = await this.nutritionRepository.findActivePlanByUserId(userId);

    if (!plan?.activeRevisionId) {
      return null;
    }

    const revision = await this.nutritionRepository.findActiveRevisionByPlanId(
      plan.id,
      plan.activeRevisionId,
    );

    if (!revision) {
      return null;
    }

    const payload = nutritionPlanPayloadSchema.parse(revision.payload);

    return {
      revisionId: revision.id,
      payload,
      targets: {
        caloriesPerDay: payload.caloriesPerDay,
        proteinGrams: payload.proteinGrams,
      },
    };
  }

  private async resolveHardFilters(userId: string, payload?: NutritionPlanPayload) {
    const profile = await this.profilesRepository.findByUserId(userId);

    return collectHardFilters(
      payload?.restrictions ?? [],
      payload?.allergies ?? [],
      profile?.constraints ?? [],
    );
  }

  private async createRecommendationsIdempotently(inputs: CreateRecommendationInput[]) {
    if (inputs.length === 0) {
      return [];
    }

    const userId = inputs[0]!.userId;
    const keys = inputs.map((input) => ({
      recipeId: input.recipeId,
      relatedNutritionPlanRevisionId: input.relatedNutritionPlanRevisionId,
    }));
    const existingOpen = await this.recipesRepository.findOpenRecommendationsByKeys(
      userId,
      keys,
    );
    const existingByKey = new Map(
      existingOpen.map((recommendation) => [
        this.recommendationLookupKey(
          recommendation.recipeId,
          recommendation.relatedNutritionPlanRevisionId,
        ),
        recommendation,
      ]),
    );
    const toCreate = inputs.filter(
      (input) =>
        !existingByKey.has(
          this.recommendationLookupKey(
            input.recipeId,
            input.relatedNutritionPlanRevisionId,
          ),
        ),
    );
    const created =
      toCreate.length > 0
        ? await this.recipesRepository.createRecommendations(toCreate)
        : [];
    const createdByKey = new Map(
      created.map((recommendation) => [
        this.recommendationLookupKey(
          recommendation.recipeId,
          recommendation.relatedNutritionPlanRevisionId,
        ),
        recommendation,
      ]),
    );

    return inputs.map((input) => {
      const lookupKey = this.recommendationLookupKey(
        input.recipeId,
        input.relatedNutritionPlanRevisionId,
      );

      return existingByKey.get(lookupKey) ?? createdByKey.get(lookupKey)!;
    });
  }

  private recommendationLookupKey(
    recipeId: string,
    relatedNutritionPlanRevisionId: string | null,
  ) {
    return `${recipeId}:${relatedNutritionPlanRevisionId ?? "null"}`;
  }
}
