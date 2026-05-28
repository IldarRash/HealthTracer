import type {
  AgentLoopOutputInput,
  AgentToolCallResult,
  AiStructuredOutputInput,
  IntentCatalogEntry,
  MessageUnderstandingOutputInput,
  MessageUnderstandingRequest,
  MessageUnderstandingSignal,
  TurnDecisionOutputInput,
  TurnDecisionRequest,
} from "@health/types";
import type { AgentSafetyFlag, CatalogIntentId } from "@health/types";
import {
  isWeeklyReviewChatMessage,
  mapTurnDecisionOutputFromMessageUnderstanding,
  messageUnderstandingOutputSchema,
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
  generateMessageUnderstanding(
    request: MessageUnderstandingRequest,
  ): Promise<MessageUnderstandingOutputInput>;
  generateTurnDecision(request: TurnDecisionRequest): Promise<TurnDecisionOutputInput>;
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

export class StubCoachAiProvider implements CoachAiProvider {
  async generateTurnDecision(request: TurnDecisionRequest): Promise<TurnDecisionOutputInput> {
    const messageUnderstandingRequest: MessageUnderstandingRequest = {
      originalText: request.originalText,
      normalizedText: request.normalizedText,
      preprocessor: request.preprocessor,
      attachmentContextSummaries: request.attachmentContextSummaries.map((summary) => ({
        attachmentRefId: summary.attachmentRefId,
        category: summary.category,
        status: summary.status,
        routingCapabilityId: summary.routingCapabilityId,
        contextHint: summary.contextHint,
        recognitionPresent: summary.recognitionPresent,
      })),
      recentMessageHints: request.recentMessageHints,
      catalogHints: request.catalogHints,
    };
    const understandingOutput = messageUnderstandingOutputSchema.parse(
      await this.generateMessageUnderstanding(messageUnderstandingRequest),
    );
    const mapped = mapTurnDecisionOutputFromMessageUnderstanding(understandingOutput, request);
    const toolNeeds: TurnDecisionOutputInput["toolNeeds"] = [...(mapped.toolNeeds ?? [])];

    if (
      understandingOutput.needsContext.includes("weekly_progress") ||
      request.normalizedText.toLowerCase().includes("weekly")
    ) {
      if (request.availableTools.includes("getWeeklyProgressContext")) {
        toolNeeds.push({
          tool: "getWeeklyProgressContext",
          rationale: "Weekly progress may inform routing.",
        });
      }
    }

    return {
      ...mapped,
      toolNeeds: toolNeeds.slice(0, 5),
    };
  }

  async generateMessageUnderstanding(
    request: MessageUnderstandingRequest,
  ): Promise<MessageUnderstandingOutputInput> {
    const { preprocessor, normalizedText, attachmentContextSummaries } = request;
    const signals = new Set<MessageUnderstandingSignal>();
    const capabilityHints: Array<{ capabilityId: CatalogIntentId; confidence: number }> = [];
    const safetyFlags = new Set<AgentSafetyFlag>();

    if (preprocessor.simpleSignals.fatigue) {
      safetyFlags.add("fatigue");
    }

    if (preprocessor.simpleSignals.pain) {
      safetyFlags.add("pain");
    }

    if (preprocessor.simpleSignals.sleep) {
      safetyFlags.add("sleep_issue");
    }

    if (preprocessor.directPathCandidate) {
      signals.add("command_like");

      return {
        signals: [...signals],
        entities: [],
        capabilityHints: [{ capabilityId: "general", confidence: 0.7 }],
        complexity: "simple",
        directCommand: {
          detected: true,
          kind: preprocessor.directPathCandidate.kind,
          confidence: 0.85,
        },
        safetyFlags: [...safetyFlags],
        needsContext:
          preprocessor.directPathCandidate.kind === "today_summary_read"
            ? ["today_summary"]
            : ["today_summary", "active_workout_plan"],
        confidence: 0.85,
      };
    }

    if (/\?/.test(normalizedText)) {
      signals.add("question");
    }

    if (attachmentContextSummaries.length > 0) {
      signals.add("attachment_reference");
    }

    if (preprocessor.simpleSignals.workout) {
      signals.add("request_change");
      capabilityHints.push({ capabilityId: "adjust_workout", confidence: 0.72 });
    }

    if (preprocessor.simpleSignals.nutrition) {
      signals.add("request_change");
      capabilityHints.push({ capabilityId: "adjust_nutrition", confidence: 0.72 });
    }

    if (preprocessor.simpleSignals.today) {
      capabilityHints.push({ capabilityId: "ask_about_today", confidence: 0.68 });
    }

    if (isWeeklyReviewChatMessage(request.originalText)) {
      capabilityHints.push({ capabilityId: "review_progress", confidence: 0.8 });
      signals.add("progress_update");
    }

    for (const summary of attachmentContextSummaries) {
      if (!summary.routingCapabilityId) {
        continue;
      }

      if (summary.routingCapabilityId === "attachment_workout") {
        capabilityHints.push({ capabilityId: "attachment_workout", confidence: 0.78 });
      }

      if (summary.routingCapabilityId === "attachment_food_photo") {
        capabilityHints.push({ capabilityId: "attachment_food_photo", confidence: 0.78 });
      }

      if (summary.routingCapabilityId === "attachment_medical_document") {
        capabilityHints.push({ capabilityId: "attachment_medical_document", confidence: 0.78 });
      }
    }

    if (
      preprocessor.simpleSignals.fatigue ||
      preprocessor.simpleSignals.pain ||
      preprocessor.simpleSignals.sleep
    ) {
      signals.add("wellness_check_in");
    }

    if (capabilityHints.length === 0) {
      capabilityHints.push({ capabilityId: "general", confidence: 0.65 });
    }

    return {
      signals: [...signals],
      entities: [],
      capabilityHints: capabilityHints.slice(0, 5),
      complexity: signals.size > 2 ? "moderate" : "simple",
      directCommand: { detected: false },
      safetyFlags: [...safetyFlags],
      needsContext:
        attachmentContextSummaries.length > 0
          ? ["attachment_context"]
          : request.recentMessageHints.length > 0
            ? ["recent_conversation"]
            : [],
      confidence: 0.72,
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
