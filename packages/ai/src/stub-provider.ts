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
  deriveActivityCalories,
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

/**
 * Detect past-tense activity logging messages in the stub.
 *
 * Trigger pattern: a past-tense physical activity verb combined with a duration
 * ("90 minutes", "for 1 hour", "1h30", etc.) or a standalone past-tense activity
 * report without a future/plan framing.
 *
 * Matches:  "I played volleyball for 90 minutes"
 *           "ran 5k for 1 hour"
 *           "just finished a swim, 45 minutes"
 *           "I went for a 30 min jog"
 *           "cycled for 1.5 hours"
 *
 * Does NOT match plan requests ("make me a plan", "create a workout", "design …").
 * Kept deterministic — no external calls.
 */
function isPastActivityLoggingMessage(normalized: string): boolean {
  // Past-tense / completed-activity verbs
  const activityVerbPattern =
    /\b(played|ran|did|went for|finished|completed|jogged|swam|cycled|walked|hiked|climbed|rowed|trained|worked out|exercised|lifted|danced|skated|skied|surfed|paddled|jumped|sprinted|stretched)\b/i;

  // Duration indicators
  const durationPattern =
    /\b(\d+(\.\d+)?\s*(minutes?|mins?|hours?|hrs?|h)\b|\d+h\d*m?\b|for \d)/i;

  // Explicit "just did" / "just finished" / "already did" short forms
  const shortFormPattern = /\b(just (did|finished|completed|went|ran|played)|already (did|finished|completed))\b/i;

  // Exclude plan/design/create requests — these should go to create_workout_plan
  const planRequestPattern = /\b(make|create|design|build|suggest|give me|start|plan|set up)\b.*\b(plan|workout|program|routine|schedule|training)\b/i;

  if (planRequestPattern.test(normalized)) {
    return false;
  }

  return (
    shortFormPattern.test(normalized) ||
    (activityVerbPattern.test(normalized) && durationPattern.test(normalized))
  );
}

/**
 * Parse a simple duration in minutes from a past-activity message.
 * Returns a default of 60 when no duration can be parsed.
 */
function parseDurationMinutesFromMessage(normalized: string): number {
  // "90 minutes" / "90 min" / "90 mins"
  const minuteMatch = /(\d+)\s*(?:minutes?|mins?)/i.exec(normalized);
  if (minuteMatch) {
    const val = parseInt(minuteMatch[1]!, 10);
    if (val > 0 && val <= 600) return val;
  }

  // "1.5 hours" / "2 hours" / "1 hr"
  const hourMatch = /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i.exec(normalized);
  if (hourMatch) {
    const val = parseFloat(hourMatch[1]!);
    const mins = Math.round(val * 60);
    if (mins > 0 && mins <= 600) return mins;
  }

  // "1h30" / "1h30m"
  const hhmMatch = /(\d+)h(\d+)m?/i.exec(normalized);
  if (hhmMatch) {
    const h = parseInt(hhmMatch[1]!, 10);
    const m = parseInt(hhmMatch[2]!, 10);
    const mins = h * 60 + m;
    if (mins > 0 && mins <= 600) return mins;
  }

  return 60;
}

/**
 * Derive a simple activity type label from the message for the stub.
 */
function parseActivityTypeFromMessage(normalized: string): string {
  if (/\bvolleyball\b/i.test(normalized)) return "volleyball";
  if (/\bbasketball\b/i.test(normalized)) return "basketball";
  if (/\bfootball\b|soccer/i.test(normalized)) return "football";
  if (/\btennis\b/i.test(normalized)) return "tennis";
  if (/\bswim|swimming|swam\b/i.test(normalized)) return "swimming";
  if (/\bcycl|biking|bike\b/i.test(normalized)) return "cycling";
  if (/\bran|running|jog\b/i.test(normalized)) return "running";
  if (/\bwalk|hiking|hike\b/i.test(normalized)) return "walking";
  if (/\byoga\b/i.test(normalized)) return "yoga";
  if (/\bdanc\b/i.test(normalized)) return "dancing";
  return "general activity";
}

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

    // Past-activity logging: checked BEFORE the generic workout/training branch so that
    // "I played volleyball for 90 minutes" goes to log_workout_activity, not create_workout_plan.
    if (isPastActivityLoggingMessage(normalized)) {
      const STUB_LOG_RATE = 300;
      const durationMinutes = parseDurationMinutesFromMessage(normalized);
      const activityType = parseActivityTypeFromMessage(normalized);
      const estimatedCalories = deriveActivityCalories(STUB_LOG_RATE, durationMinutes);
      const performedAt = new Date().toISOString();

      return stubCoachOutput({
        reply:
          "Got it — I logged that activity for you to review. Adjust the duration or confirm to save it.",
        proposals: [
          {
            intent: "log_workout_activity",
            targetDomain: "workout",
            title: `${activityType.charAt(0).toUpperCase() + activityType.slice(1)} session`,
            reason: `Logged from your message as an ad-hoc activity (${durationMinutes} min).`,
            proposedChanges: {
              activityType,
              title: `${activityType.charAt(0).toUpperCase() + activityType.slice(1)} session`,
              durationMinutes,
              performedAt,
              ratePerHour: STUB_LOG_RATE,
              estimatedCalories,
              displayContract: {
                version: 1,
                title: "Activity log",
                fields: [
                  {
                    key: "ratePerHour",
                    label: "Burn rate",
                    kind: "readonly",
                    unit: "kcal/hour",
                    value: STUB_LOG_RATE,
                    editable: false,
                  },
                  {
                    key: "durationMinutes",
                    label: "Duration",
                    kind: "slider",
                    unit: "min",
                    value: durationMinutes,
                    min: 1,
                    max: 600,
                    step: 5,
                    editable: true,
                  },
                ],
                derived: [
                  {
                    target: "totalCalories",
                    label: "Estimated calories",
                    unit: "kcal",
                    op: "rate_per_hour",
                    inputs: ["ratePerHour", "durationMinutes"],
                    isPrimaryTotal: true,
                  },
                ],
              },
            },
          },
        ],
      });
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
      // Past-activity logging: emit log_workout_activity for "what I did" turns.
      // Checked before plan branches so activity reports don't become plan proposals.
      if (isPastActivityLoggingMessage(normalized)) {
        const STUB_LOG_RATE = 300;
        const durationMinutes = parseDurationMinutesFromMessage(normalized);
        const activityType = parseActivityTypeFromMessage(normalized);
        const estimatedCalories = deriveActivityCalories(STUB_LOG_RATE, durationMinutes);
        const performedAt = new Date().toISOString();

        return {
          kind: "domain_answer",
          domain: "workout",
          summary: `Logged ${activityType} (${durationMinutes} min) as an ad-hoc session — review before saving.`,
          candidateProposals: [
            {
              intent: "log_workout_activity",
              targetDomain: "workout",
              title: `${activityType.charAt(0).toUpperCase() + activityType.slice(1)} session`,
              reason: `Logged from your message as an ad-hoc activity (${durationMinutes} min).`,
              proposedChanges: {
                activityType,
                title: `${activityType.charAt(0).toUpperCase() + activityType.slice(1)} session`,
                durationMinutes,
                performedAt,
                ratePerHour: STUB_LOG_RATE,
                estimatedCalories,
                displayContract: {
                  version: 1,
                  title: "Activity log",
                  fields: [
                    {
                      key: "ratePerHour",
                      label: "Burn rate",
                      kind: "readonly",
                      unit: "kcal/hour",
                      value: STUB_LOG_RATE,
                      editable: false,
                    },
                    {
                      key: "durationMinutes",
                      label: "Duration",
                      kind: "slider",
                      unit: "min",
                      value: durationMinutes,
                      min: 1,
                      max: 600,
                      step: 5,
                      editable: true,
                    },
                  ],
                  derived: [
                    {
                      target: "totalCalories",
                      label: "Estimated calories",
                      unit: "kcal",
                      op: "rate_per_hour",
                      inputs: ["ratePerHour", "durationMinutes"],
                      isPrimaryTotal: true,
                    },
                  ],
                },
              },
            },
          ],
          domainSignals: ["activity_logged"],
          workoutCalorieEstimate: estimatedCalories,
          workoutCaloriePerHourRate: STUB_LOG_RATE,
        };
      }

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

      // Attach a displayContract to the first candidate proposal so the local/test path
      // renders the duration slider deterministically.
      // caloriePerHourRate=280 matches workoutCaloriePerHourRate below.
      const STUB_RATE = 280;
      const STUB_DURATION_MINUTES = 60;
      const stubDisplayContract = {
        version: 1 as const,
        title: "Workout session",
        fields: [
          {
            key: "caloriePerHourRate",
            label: "Burn rate",
            kind: "readonly" as const,
            unit: "kcal/hour",
            value: STUB_RATE,
            editable: false,
          },
          {
            key: "durationMinutes",
            label: "Duration",
            kind: "slider" as const,
            unit: "min",
            value: STUB_DURATION_MINUTES,
            min: 1,
            max: 600,
            step: 5,
            editable: true,
          },
        ],
        derived: [
          {
            target: "totalCalories",
            label: "Estimated calories",
            unit: "kcal",
            op: "rate_per_hour" as const,
            inputs: ["caloriePerHourRate", "durationMinutes"],
            isPrimaryTotal: true,
          },
        ],
      };

      if (candidateProposals.length > 0 && candidateProposals[0]) {
        const first = candidateProposals[0];
        const existingChanges = first.proposedChanges as Record<string, unknown>;
        (first as Record<string, unknown>).proposedChanges = {
          ...existingChanges,
          displayContract: stubDisplayContract,
        };
      }

      return {
        kind: "domain_answer",
        domain: "workout",
        summary:
          "Reviewed your workout context and drafted a candidate plan adjustment for your consideration.",
        candidateProposals,
        domainSignals: ["workout_plan_present"],
        workoutCalorieEstimate: Math.round(STUB_RATE * (STUB_DURATION_MINUTES / 60)),
        workoutCaloriePerHourRate: STUB_RATE,
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
