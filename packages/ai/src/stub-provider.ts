import type {
  AgentLoopOutputInput,
  AgentToolCallResult,
  AiStructuredOutputInput,
  DomainLlmStepOutputInput,
  DomainLlmStepRequest,
  FinalDecisionOutputInput,
  FinalDecisionRequest,
  IntentCatalogEntry,
  RouterDecisionOutputInput,
  RouterDecisionRequest,
} from "@health/types";
import {
  createFallbackFinalDecision,
  isWeeklyReviewChatMessage,
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
    readonly messageUnderstandingSummary?: Record<string, unknown>;
    readonly responseModeExecutor?: {
      readonly mode: string;
      readonly handlerPath: string;
      readonly maxLoopIterations: number;
      readonly allowToolLoop: boolean;
      readonly useContextExpansionMetadata: boolean;
    };
  };
}

export interface CoachAiLoopRequest extends CoachAiRequest {
  readonly iteration: number;
  readonly maxIterations: number;
  readonly priorToolResults: ReadonlyArray<AgentToolCallResult>;
}

export interface CoachAiProvider {
  generateAgentLoopStep(request: CoachAiLoopRequest): Promise<AgentLoopOutputInput>;
  generateCoachResponse(request: CoachAiRequest): Promise<AiStructuredOutputInput>;
  // Phase 2 — parallel-domain pipeline methods (dark; not called by orchestrator yet)
  generateRouterDecision(request: RouterDecisionRequest): Promise<RouterDecisionOutputInput>;
  generateDomainStep(request: DomainLlmStepRequest): Promise<DomainLlmStepOutputInput>;
  generateFinalDecision(request: FinalDecisionRequest): Promise<FinalDecisionOutputInput>;
}

const SAFE_DEFAULT_REPLY =
  "Thanks for sharing that. I can help with wellness coaching, habit planning, and structured suggestions you can review before anything changes.";

/** Seed fixture recipe id from packages/db/drizzle/seeds/recipes.sql */
const STUB_RECIPE_ID = "a1000001-0000-4000-8000-000000000001";

function stubCoachOutput(value: unknown): AiStructuredOutputInput {
  return value as AiStructuredOutputInput;
}

export class StubCoachAiProvider implements CoachAiProvider {
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

  // ---------------------------------------------------------------------------
  // Phase 2 — parallel-domain pipeline stubs
  // These are deterministic stubs used in tests. Not called by the orchestrator yet.
  // ---------------------------------------------------------------------------

  async generateRouterDecision(request: RouterDecisionRequest): Promise<RouterDecisionOutputInput> {
    const normalized = request.normalizedText.toLowerCase();
    const selectedDomains: RouterDecisionOutputInput["selectedDomains"] = [];

    // Reuse keyword-routing signals from existing preprocessor
    if (
      request.preprocessor.simpleSignals.workout ||
      normalized.includes("workout") ||
      normalized.includes("training") ||
      normalized.includes("exercise")
    ) {
      selectedDomains.push({
        domain: "workout",
        confidence: 0.8,
        intentHints: ["adjust_workout", "create_workout_plan"],
        toolHints: [],
        signalHints: ["request_change"],
      });
    }

    if (
      request.preprocessor.simpleSignals.nutrition ||
      normalized.includes("nutrition") ||
      normalized.includes("meal") ||
      normalized.includes("food") ||
      normalized.includes("recipe")
    ) {
      selectedDomains.push({
        domain: "nutrition",
        confidence: 0.75,
        intentHints: ["create_nutrition_plan", "recommend_recipes"],
        toolHints: [],
        signalHints: ["request_change"],
      });
    }

    // Attachment hints may route to health domain (consent-gated, context-only)
    const hasMedicalAttachment = request.attachmentHints.some(
      (h) => h.category === "medical_document",
    );

    if (
      hasMedicalAttachment ||
      request.preprocessor.simpleSignals.pain ||
      request.preprocessor.simpleSignals.fatigue ||
      request.preprocessor.simpleSignals.sleep
    ) {
      selectedDomains.push({
        domain: "health",
        confidence: 0.65,
        intentHints: [],
        toolHints: [],
        signalHints: ["wellness_check_in"],
      });
    }

    // Fallback: if nothing matched, route to workout as a conservative default
    if (selectedDomains.length === 0) {
      selectedDomains.push({
        domain: "workout",
        confidence: 0.45,
        intentHints: ["general"],
        toolHints: [],
        signalHints: [],
      });
    }

    const safetyFlags: RouterDecisionOutputInput["safetyFlags"] = [];

    if (request.preprocessor.simpleSignals.fatigue) {
      safetyFlags.push("fatigue");
    }

    if (request.preprocessor.simpleSignals.pain) {
      safetyFlags.push("pain");
    }

    if (request.preprocessor.simpleSignals.sleep) {
      safetyFlags.push("sleep_issue");
    }

    return {
      selectedDomains: selectedDomains.slice(0, 3),
      contextNeeds: [],
      safetyFlags,
      confidence: selectedDomains[0]?.confidence ?? 0.45,
    };
  }

  async generateDomainStep(request: DomainLlmStepRequest): Promise<DomainLlmStepOutputInput> {
    const normalized = request.userMessage.toLowerCase();

    if (request.domain === "workout") {
      // Build a stub workout candidate proposal matching the keyword routing in generateCoachResponse
      const candidateProposals: Record<string, unknown>[] = [];

      if (normalized.includes("reduce") || normalized.includes("easier") || normalized.includes("lighter")) {
        candidateProposals.push({
          intent: "adapt_workout_plan",
          targetDomain: "workout",
          title: "Reduce load for this week",
          reason: "This lowers recommended load while keeping your weekly structure intact.",
          proposedChanges: stubReducedLoadWorkoutPlan,
        });
      } else if (normalized.includes("swap") || normalized.includes("replace")) {
        candidateProposals.push({
          intent: "adapt_workout_plan",
          targetDomain: "workout",
          title: "Swap a pulling exercise",
          reason: "This keeps pulling work available with minimal equipment.",
          proposedChanges: stubSwapExerciseWorkoutPlan,
        });
      } else if (normalized.includes("remove")) {
        candidateProposals.push({
          intent: "adapt_workout_plan",
          targetDomain: "workout",
          title: "Remove a conditioning exercise",
          reason: "This keeps the weekly structure while simplifying Wednesday work.",
          proposedChanges: stubRemoveExerciseWorkoutPlan,
        });
      } else {
        candidateProposals.push({
          intent: "create_workout_plan",
          targetDomain: "workout",
          title: "Start a three day strength plan",
          reason: "This gives you a repeatable weekly structure to build consistency.",
          proposedChanges: stubStructuredWorkoutPlan,
        });
      }

      return {
        kind: "domain_answer",
        domain: "workout",
        summary:
          "Reviewed your workout context and drafted a candidate plan adjustment for your consideration.",
        candidateProposals,
        domainSignals: ["workout_plan_present"],
        workoutCalorieEstimate: 280,
      };
    }

    if (request.domain === "nutrition") {
      // Step 7b: when a food_photo attachment is present in the bounded attachment
      // context, the nutrition domain LLM analyzes it directly and returns a nutrition
      // incident proposal with approximate calories/macros. This REPLACES the old
      // FoodPhotoAnalysisService path.
      const foodPhotoItem = request.attachmentContext?.items.find(
        (item) => item.category === "food_photo",
      );

      if (foodPhotoItem) {
        return {
          kind: "domain_answer",
          domain: "nutrition",
          summary:
            "Analyzed the food photo and prepared a nutrition incident log with approximate estimates. Review and adjust before saving.",
          candidateProposals: [
            {
              intent: "log_nutrition_incident",
              targetDomain: "nutrition",
              title: "Log meal from photo",
              reason: "Approximate calorie and macro estimates from the food photo you shared.",
              proposedChanges: {
                incidentDateTime: new Date().toISOString(),
                items: [
                  {
                    name: "Meal from photo",
                    quantity: "1 serving",
                    calories: 520,
                  },
                ],
                estimatedCalories: 520,
                estimatedMacros: {
                  proteinGrams: 32,
                  carbsGrams: 55,
                  fatGrams: 18,
                },
                confidence: "medium",
                provenance: {
                  source: "vision_llm_estimate",
                  providerId: "nutrition_domain_llm",
                },
                imageRefs: [{ id: foodPhotoItem.attachmentRefId }],
              },
            },
          ],
          domainSignals: ["food_photo_present"],
        };
      }

      const candidateProposals: Record<string, unknown>[] = [];

      if (normalized.includes("recipe")) {
        candidateProposals.push({
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
        });
      } else {
        candidateProposals.push({
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
        });
      }

      return {
        kind: "domain_answer",
        domain: "nutrition",
        summary: "Reviewed your nutrition context and prepared candidate suggestions.",
        candidateProposals,
        domainSignals: ["nutrition_plan_present"],
      };
    }

    // health domain — context-only, no proposals, consent-gated
    return {
      kind: "domain_answer",
      domain: "health",
      summary:
        "Health context noted. No structured changes are proposed without explicit consent.",
      candidateProposals: [],
      domainSignals: [],
    };
  }

  async generateFinalDecision(request: FinalDecisionRequest): Promise<FinalDecisionOutputInput> {
    // Collect all candidate proposals from domain outputs
    const allProposals = request.domainOutputs.flatMap((d) => d.candidateProposals);

    // Build a reply from domain summaries
    const summaries = request.domainOutputs
      .filter((d) => d.summary.trim().length > 0)
      .map((d) => d.summary);

    if (summaries.length === 0) {
      const fallback = createFallbackFinalDecision();

      return {
        reply: fallback.reply,
        selectedAction: null,
        proposals: allProposals,
        consentRequired: false,
      };
    }

    const reply =
      summaries.length === 1
        ? (summaries[0] ?? SAFE_DEFAULT_REPLY)
        : `Here is what I found across your wellness domains: ${summaries.join(" ")}`;

    return {
      reply,
      selectedAction: null,
      proposals: allProposals.slice(0, 5),
      consentRequired: request.domainOutputs.some((d) => d.domain === "health"),
    };
  }
}
