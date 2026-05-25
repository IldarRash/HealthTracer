import type { AiStructuredOutputInput } from "@health/types";
import { isWeeklyReviewChatMessage } from "@health/types";
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
}

export interface CoachAiProvider {
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
  async generateCoachResponse(request: CoachAiRequest): Promise<AiStructuredOutputInput> {
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

    return stubCoachOutput({
      reply: SAFE_DEFAULT_REPLY,
      proposals: [],
    });
  }
}
