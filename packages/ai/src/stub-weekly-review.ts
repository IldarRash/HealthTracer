import { stubAdaptHabitPlan } from "./stub-habit-plan.js";
import { stubProgressAdaptedWorkoutPlan } from "./stub-workout-plan.js";

const stubWeeklyNutritionAdjustment = {
  plan: {
    title: "Balanced weekly nutrition",
    summary: "Adjusted targets based on weekly adherence patterns from your structured entries.",
    caloriesPerDay: 2100,
    proteinGrams: 135,
    carbsGrams: 210,
    fatGrams: 68,
    hydrationLiters: 2.5,
    mealStructure: [{ label: "Breakfast", timingHint: null }],
    preferences: [],
    restrictions: [],
    allergies: [],
    notes: ["Targets reflect this week's logged adherence patterns."],
  },
};

export function buildStubWeeklyReviewCoachOutput(coachingContext: Record<string, unknown>) {
  const proposals = [
    {
      intent: "adapt_workout_plan_from_progress" as const,
      targetDomain: "workout" as const,
      title: "Adjust training load from weekly progress",
      reason:
        "Your recent workout completion pattern suggests a lighter revision could support consistency next week.",
      proposedChanges: stubProgressAdaptedWorkoutPlan,
    },
    {
      intent: "adjust_nutrition_plan" as const,
      targetDomain: "nutrition" as const,
      title: "Refine nutrition targets from weekly adherence",
      reason:
        "Weekly nutrition adherence patterns suggest a modest target adjustment for the coming week.",
      proposedChanges: stubWeeklyNutritionAdjustment,
    },
    {
      intent: "adapt_habit_plan" as const,
      targetDomain: "general" as const,
      title: "Simplify recovery-focused habits",
      reason:
        "Add rest and recovery habits that complement this week's execution patterns without overloading your plan.",
      proposedChanges: stubAdaptHabitPlan("simplify recovery habits", coachingContext),
    },
  ];

  return {
    reply:
      "I reviewed your cross-domain weekly summary and packaged typed adaptation suggestions you can approve individually. Nothing changes until you accept a proposal.",
    proposals,
  };
}
