import type {
  AgentLoopOutputInput,
  AgentToolCallResult,
  AiStructuredOutputInput,
  IntentCatalogEntry,
  LlmIntentRouterOutputInput,
} from "@health/types";
import {
  buildContextSliceRequestForIntent,
  isWeeklyReviewChatMessage,
  normalizeContextSlicePlan,
  resolveDefaultExpectedResponseMode,
  serializeIntentCatalogForRouter,
} from "@health/types";
import {
  hasActiveHabitPlanInContext,
  isHabitAdaptCue,
  isHabitRelatedMessage,
  stubAdaptHabitPlan,
  stubCreateHabitPlan,
} from "./stub-habit-plan.js";
import {
  buildWellbeingCoachReply,
  isWellbeingRelatedMessage,
  parseWellbeingSummaryFromContext,
} from "./stub-wellbeing.js";
import { buildStubWeeklyReviewCoachOutput } from "./stub-weekly-review.js";
import {
  buildStubProposalRevisionOutput,
  parseStubProposalRevisionContext,
} from "./stub-proposal-revision.js";
import {
  stubProgressAdaptedWorkoutPlan,
  stubReducedLoadWorkoutPlan,
  stubRemoveExerciseWorkoutPlan,
  stubStructuredWorkoutPlan,
  stubSwapExerciseWorkoutPlan,
} from "./stub-workout-plan.js";

export interface IntentRouterRequest {
  readonly userMessage: string;
  readonly recentMessages: ReadonlyArray<{
    readonly role: "user" | "assistant" | "system";
    readonly content: string;
  }>;
  readonly intentCatalog?: ReadonlyArray<{
    readonly id: string;
    readonly description: string;
    readonly routerGuidance: string;
    readonly examples: readonly string[];
  }>;
}

export interface CoachAiRequest {
  readonly userMessage: string;
  readonly recentMessages: ReadonlyArray<{
    readonly role: "user" | "assistant" | "system";
    readonly content: string;
  }>;
  readonly coachingContext: Record<string, unknown>;
  readonly agentMetadata?: {
    readonly purpose: string;
    readonly intent: string;
    readonly catalogIntentId?: string;
    readonly depth: string;
    readonly timeRange: string;
    readonly safetyConstraints: readonly string[];
    readonly expectedResponseMode?: string;
    readonly safetyFlags?: readonly string[];
    readonly missingContextNotes?: readonly string[];
    readonly intentDefinition?: IntentCatalogEntry;
    readonly allowedTools?: readonly string[];
    readonly allowedProposalIntents?: readonly string[];
  };
}

export interface CoachAiLoopRequest extends CoachAiRequest {
  readonly iteration: number;
  readonly maxIterations: number;
  readonly priorToolResults: ReadonlyArray<AgentToolCallResult>;
}

export interface CoachAiProvider {
  generateIntentRoute(request: IntentRouterRequest): Promise<LlmIntentRouterOutputInput>;
  generateAgentLoopStep(request: CoachAiLoopRequest): Promise<AgentLoopOutputInput>;
  generateCoachResponse(request: CoachAiRequest): Promise<AiStructuredOutputInput>;
}

const SAFE_DEFAULT_REPLY =
  "Thanks for sharing that. I can help with wellness coaching, habit planning, and structured suggestions you can review before anything changes.";

/** Seed fixture recipe id from packages/db/drizzle/seeds/recipes.sql */
const STUB_RECIPE_ID = "a1000001-0000-4000-8000-000000000001";

function stubCoachOutput(value: unknown): AiStructuredOutputInput {
  return value as AiStructuredOutputInput;
}

function buildPreparedAttachmentWorkoutReply(
  request: CoachAiRequest,
): AiStructuredOutputInput | null {
  const catalogIntentId =
    request.agentMetadata?.catalogIntentId ?? request.agentMetadata?.intent;

  if (catalogIntentId !== "attachment_workout") {
    return null;
  }

  const attachmentTurn = request.coachingContext.attachmentTurn;

  if (!attachmentTurn || typeof attachmentTurn !== "object") {
    return null;
  }

  const preparedProposals = (attachmentTurn as { preparedProposals?: unknown })
    .preparedProposals;

  if (!Array.isArray(preparedProposals) || preparedProposals.length === 0) {
    return null;
  }

  const todayChecklistProposal = preparedProposals.find(
    (proposal) =>
      proposal &&
      typeof proposal === "object" &&
      (proposal as { intent?: unknown }).intent === "create_today_checklist",
  ) as { title?: string } | undefined;

  if (!todayChecklistProposal) {
    return null;
  }

  const proposalTitle =
    typeof todayChecklistProposal.title === "string"
      ? todayChecklistProposal.title
      : "Today workout checklist";

  return {
    reply: `I reviewed your training attachment and prepared "${proposalTitle}" for your approval. Review the proposal card below before anything is saved to Today.`,
    proposals: [],
  };
}

export class StubCoachAiProvider implements CoachAiProvider {
  async generateIntentRoute(request: IntentRouterRequest): Promise<LlmIntentRouterOutputInput> {
    const normalized = request.userMessage.toLowerCase();
    const catalog = request.intentCatalog ?? serializeIntentCatalogForRouter();

    if (
      normalized.includes("not losing weight") ||
      normalized.includes("not seeing results") ||
      (normalized.includes("hungry") && normalized.includes("tired"))
    ) {
      return {
        catalogIntentId: "adjust_nutrition",
        confidence: 0.84,
        routingMethod: "llm_router",
        requiredContextSlices: normalizeContextSlicePlan([
          buildContextSliceRequestForIntent("adjust_nutrition"),
          { type: "weekly_review", depth: "medium", timeRange: "7d" },
        ]),
        safetyFlags: ["hunger", "fatigue"],
        expectedResponseMode: "recommendation_with_optional_proposal",
      };
    }

    if (
      normalized.includes("feel off") ||
      normalized.includes("completely off") ||
      normalized.includes("routine is not")
    ) {
      return {
        catalogIntentId: "adjust_workout",
        confidence: 0.82,
        routingMethod: "llm_router",
        requiredContextSlices: normalizeContextSlicePlan([
          buildContextSliceRequestForIntent("adjust_workout"),
          { type: "daily_checkin", depth: "small", timeRange: "7d" },
        ]),
        safetyFlags: ["fatigue", "stress"],
        expectedResponseMode: "recommendation_with_optional_proposal",
      };
    }

    if (isWeeklyReviewChatMessage(request.userMessage)) {
      return {
        catalogIntentId: "review_progress",
        confidence: 0.93,
        routingMethod: "llm_router",
        requiredContextSlices: [buildContextSliceRequestForIntent("review_progress")],
        safetyFlags: [],
        expectedResponseMode: "recommendation_with_optional_proposal",
      };
    }

    const fallbackId = catalog[0]?.id ?? "general";

    return {
      catalogIntentId: fallbackId as LlmIntentRouterOutputInput["catalogIntentId"],
      confidence: 0.78,
      routingMethod: "llm_router",
      requiredContextSlices: [buildContextSliceRequestForIntent("general")],
      safetyFlags: [],
      expectedResponseMode: resolveDefaultExpectedResponseMode("general"),
    };
  }

  async generateAgentLoopStep(request: CoachAiLoopRequest): Promise<AgentLoopOutputInput> {
    const catalogIntentId = request.agentMetadata?.catalogIntentId ?? request.agentMetadata?.intent;

    if (
      catalogIntentId === "review_progress" &&
      request.iteration < request.maxIterations &&
      !request.priorToolResults.some(
        (result) => result.tool === "getWeeklyProgressContext" && result.ok,
      )
    ) {
      return {
        kind: "tool_request",
        tool: "getWeeklyProgressContext",
        input: {},
        rationale: "Weekly progress context is needed before summarizing the user's week.",
      };
    }

    const coachOutput = await this.generateCoachResponse(request);

    return {
      kind: "final_answer",
      reply: coachOutput.reply,
      proposals: coachOutput.proposals ?? [],
    };
  }

  async generateCoachResponse(request: CoachAiRequest): Promise<AiStructuredOutputInput> {
    const revision = parseStubProposalRevisionContext(request.coachingContext);
    if (revision) {
      return stubCoachOutput(
        buildStubProposalRevisionOutput(revision, request.coachingContext),
      );
    }

    const preparedAttachmentReply = buildPreparedAttachmentWorkoutReply(request);
    if (preparedAttachmentReply) {
      return stubCoachOutput(preparedAttachmentReply);
    }

    const normalized = request.userMessage.toLowerCase();

    if (isWeeklyReviewChatMessage(request.userMessage)) {
      return stubCoachOutput(buildStubWeeklyReviewCoachOutput(request.coachingContext));
    }

    if (normalized.includes("workout") || normalized.includes("training")) {
      if (
        normalized.includes("progress") ||
        normalized.includes("completion") ||
        normalized.includes("weekly")
      ) {
        return stubCoachOutput({
          reply:
            "Based on your recent weekly training patterns, I drafted a lighter revision you can review first. Nothing changes until you accept the proposal.",
          proposals: [
            {
              intent: "adapt_workout_plan_from_progress",
              targetDomain: "workout",
              title: "Reduce load based on weekly progress",
              reason:
                "Your recent completion pattern suggests a lighter week could support consistency.",
              proposedChanges: stubProgressAdaptedWorkoutPlan,
            },
          ],
        });
      }

      if (normalized.includes("remove")) {
        return stubCoachOutput({
          reply:
            "I can remove that exercise from your active plan. Review the revised program before anything changes.",
          proposals: [
            {
              intent: "adapt_workout_plan",
              targetDomain: "workout",
              title: "Remove a conditioning exercise",
              reason: "This keeps the weekly structure while simplifying Wednesday work.",
              proposedChanges: stubRemoveExerciseWorkoutPlan,
            },
          ],
        });
      }

      if (normalized.includes("swap") || normalized.includes("replace")) {
        return stubCoachOutput({
          reply:
            "I can swap that exercise for a band-friendly option. Review the proposal before it updates your plan.",
          proposals: [
            {
              intent: "adapt_workout_plan",
              targetDomain: "workout",
              title: "Swap a pulling exercise",
              reason: "This keeps pulling work available with minimal equipment.",
              proposedChanges: stubSwapExerciseWorkoutPlan,
            },
          ],
        });
      }

      if (
        normalized.includes("reduce") ||
        normalized.includes("easier") ||
        normalized.includes("adapt") ||
        normalized.includes("lighter")
      ) {
        return stubCoachOutput({
          reply:
            "I drafted a lighter version of your current plan you can review first. Nothing changes until you accept the proposal.",
          proposals: [
            {
              intent: "adapt_workout_plan",
              targetDomain: "workout",
              title: "Reduce load for this week",
              reason: "This lowers recommended load while keeping your weekly structure intact.",
              proposedChanges: stubReducedLoadWorkoutPlan,
            },
          ],
        });
      }

      return stubCoachOutput({
        reply:
          "I can suggest a simple strength plan you can review first. Nothing changes until you accept the proposal.",
        proposals: [
          {
            intent: "create_workout_plan",
            targetDomain: "workout",
            title: "Start a three day strength plan",
            reason: "This gives you a repeatable weekly structure to build consistency.",
            proposedChanges: stubStructuredWorkoutPlan,
          },
        ],
      });
    }

    if (normalized.includes("recipe")) {
      return stubCoachOutput({
        reply:
          "Here are recipe ideas that fit your current plan. Review them before anything is saved.",
        proposals: [
          {
            intent: "recommend_recipes",
            targetDomain: "recipe",
            title: "Breakfast recipe ideas for your plan",
            reason: "These options align with your current estimated nutrition targets.",
            proposedChanges: {
              recommendations: [
                {
                  recipeId: STUB_RECIPE_ID,
                  reason: "High-protein breakfast with estimated macro fit.",
                  fitSummary: "Estimated macros align with your active plan.",
                },
              ],
            },
          },
        ],
      });
    }

    if (normalized.includes("nutrition") || normalized.includes("meal")) {
      return stubCoachOutput({
        reply:
          "Here is a starter nutrition plan outline you can approve or reject before it is saved.",
        proposals: [
          {
            intent: "create_nutrition_plan",
            targetDomain: "nutrition",
            title: "Balanced daily nutrition base",
            reason: "This provides a simple macro and hydration starting point.",
            proposedChanges: {
              title: "Balanced daily nutrition base",
              summary: "A moderate starting point focused on consistency.",
              caloriesPerDay: 2200,
              proteinGrams: 140,
              carbsGrams: 220,
              fatGrams: 70,
              hydrationLiters: 2.5,
              mealStructure: [{ label: "Breakfast", timingHint: null }],
              notes: ["Prioritize whole foods and regular meal timing."],
            },
          },
        ],
      });
    }

    if (isHabitRelatedMessage(normalized)) {
      const hasActivePlan = hasActiveHabitPlanInContext(request.coachingContext);

      if (isHabitAdaptCue(normalized)) {
        return stubCoachOutput({
          reply:
            "I drafted an updated habit plan you can review first. Nothing changes until you accept the proposal.",
          proposals: [
            {
              intent: "adapt_habit_plan",
              targetDomain: "general",
              title: "Adjust your daily habits",
              reason: "This keeps your existing habit structure while applying the requested change.",
              proposedChanges: stubAdaptHabitPlan(normalized, request.coachingContext),
            },
          ],
        });
      }

      if (hasActivePlan) {
        return stubCoachOutput({
          reply:
            "You already have an active habit plan. Ask me to adjust, pause, or remove specific habits if you want to change it.",
          proposals: [],
        });
      }

      return stubCoachOutput({
        reply:
          "I can suggest a starter daily habit plan you can review first. Nothing changes until you accept the proposal.",
        proposals: [
          {
            intent: "create_habit_plan",
            targetDomain: "general",
            title: "Start a daily wellness habit plan",
            reason: "Small repeatable habits can support hydration, movement, and recovery routines.",
            proposedChanges: stubCreateHabitPlan,
          },
        ],
      });
    }

    if (normalized.includes("today") || normalized.includes("checklist")) {
      return stubCoachOutput({
        reply: "I drafted a Today checklist you can review before it is saved.",
        proposals: [
          {
            intent: "create_today_checklist",
            targetDomain: "today",
            title: "Today wellness checklist",
            reason: "Small daily actions can support your active goals.",
            proposedChanges: {
              date: new Date().toISOString().slice(0, 10),
              items: [
                { label: "Drink water", kind: "hydration", completed: false },
                { label: "Move for 20 minutes", kind: "workout", completed: false },
              ],
            },
          },
        ],
      });
    }

    if (isWellbeingRelatedMessage(normalized)) {
      const summary = parseWellbeingSummaryFromContext(request.coachingContext);

      return stubCoachOutput({
        reply: buildWellbeingCoachReply(
          summary ?? {
            latestDate: null,
            latestMoodScore: null,
            latestStressScore: null,
            windowDays: 7,
            windowStart: null,
            windowEnd: null,
            checkInCount: 0,
            moodAverage: null,
            stressAverage: null,
            moodTrendDirection: "unknown",
            stressTrendDirection: "unknown",
            currentStreak: 0,
            dataSufficiency: "insufficient",
            generatedAt: new Date().toISOString(),
          },
        ),
        proposals: [],
      });
    }

    if (
      normalized.includes("cheat meal") ||
      normalized.includes("forgot to log") ||
      normalized.includes("i ate this")
    ) {
      return stubCoachOutput({
        reply:
          "I can help you log this as a nutrition incident with editable estimates. Review the proposal, adjust items, or add a food photo before confirming.",
        proposals: [],
      });
    }

    return stubCoachOutput({
      reply: SAFE_DEFAULT_REPLY,
      proposals: [],
    });
  }
}
