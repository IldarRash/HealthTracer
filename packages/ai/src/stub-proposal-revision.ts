import type { AiStructuredOutputInput, ProposalIntent, RawAiProposal } from "@health/types";
import { stubAdaptHabitPlan } from "./stub-habit-plan.js";
import {
  stubProgressAdaptedWorkoutPlan,
  stubReducedLoadWorkoutPlan,
  stubRemoveExerciseWorkoutPlan,
  stubStructuredWorkoutPlan,
  stubSwapExerciseWorkoutPlan,
} from "./stub-workout-plan.js";

export interface StubProposalRevisionContext {
  readonly supersededProposalId: string;
  readonly originalProposal: RawAiProposal;
  readonly modificationFeedback: string;
}

const REVISION_REPLY =
  "I revised the proposal based on your feedback. Review the updated draft before anything changes.";

export function parseStubProposalRevisionContext(
  coachingContext: Record<string, unknown>,
): StubProposalRevisionContext | null {
  const raw = coachingContext.proposalRevision;
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const revision = raw as Record<string, unknown>;
  if (typeof revision.supersededProposalId !== "string") {
    return null;
  }

  if (typeof revision.modificationFeedback !== "string" || !revision.modificationFeedback.trim()) {
    return null;
  }

  const originalProposal = revision.originalProposal;
  if (!originalProposal || typeof originalProposal !== "object") {
    return null;
  }

  const original = originalProposal as Record<string, unknown>;
  if (
    typeof original.intent !== "string" ||
    typeof original.targetDomain !== "string" ||
    typeof original.title !== "string" ||
    typeof original.reason !== "string"
  ) {
    return null;
  }

  return {
    supersededProposalId: revision.supersededProposalId,
    originalProposal: originalProposal as RawAiProposal,
    modificationFeedback: revision.modificationFeedback.trim(),
  };
}

function revisedTitle(originalTitle: string): string {
  const suffix = " (revised)";
  const maxLength = 160;
  if (originalTitle.length + suffix.length <= maxLength) {
    return `${originalTitle}${suffix}`;
  }

  return `${originalTitle.slice(0, maxLength - suffix.length)}${suffix}`;
}

function revisedReason(originalReason: string, modificationFeedback: string): string {
  const combined = `${originalReason} Updated per your feedback: ${modificationFeedback}`;
  return combined.length <= 1000 ? combined : combined.slice(0, 997) + "...";
}

function selectWorkoutRevisionPlan(
  intent: ProposalIntent,
  normalizedFeedback: string,
): Record<string, unknown> {
  if (intent === "adapt_workout_plan_from_progress") {
    return stubProgressAdaptedWorkoutPlan;
  }

  if (normalizedFeedback.includes("remove")) {
    return stubRemoveExerciseWorkoutPlan;
  }

  if (normalizedFeedback.includes("swap") || normalizedFeedback.includes("replace")) {
    return stubSwapExerciseWorkoutPlan;
  }

  if (
    normalizedFeedback.includes("one strength") ||
    normalizedFeedback.includes("keep one") ||
    normalizedFeedback.includes("single strength")
  ) {
    const monday = stubReducedLoadWorkoutPlan.days[0];
    return {
      title: stubReducedLoadWorkoutPlan.title,
      summary: "Focused on one strength exercise per your revision request.",
      days: monday
        ? [{ ...monday, exercises: monday.exercises.slice(0, 1) }]
        : stubReducedLoadWorkoutPlan.days,
      notes: ["Single strength focus session based on your feedback."],
    };
  }

  if (
    normalizedFeedback.includes("reduce") ||
    normalizedFeedback.includes("easier") ||
    normalizedFeedback.includes("lighter") ||
    normalizedFeedback.includes("adapt")
  ) {
    return stubReducedLoadWorkoutPlan;
  }

  if (intent === "create_workout_plan") {
    return stubStructuredWorkoutPlan;
  }

  return stubReducedLoadWorkoutPlan;
}

function buildNutritionRevisionChanges(
  original: RawAiProposal,
  normalizedFeedback: string,
  modificationFeedback: string,
): Record<string, unknown> {
  const base =
    original.proposedChanges && typeof original.proposedChanges === "object"
      ? (original.proposedChanges as Record<string, unknown>)
      : {
          title: "Balanced daily nutrition base",
          summary: "A moderate starting point focused on consistency.",
          caloriesPerDay: 2200,
          proteinGrams: 140,
          carbsGrams: 220,
          fatGrams: 70,
          hydrationLiters: 2.5,
          mealStructure: [{ label: "Breakfast", timingHint: null }],
          notes: ["Prioritize whole foods and regular meal timing."],
        };

  const existingNotes = Array.isArray(base.notes)
    ? base.notes.filter((note): note is string => typeof note === "string")
    : [];

  const caloriesPerDay =
    typeof base.caloriesPerDay === "number" ? base.caloriesPerDay : 2200;
  const adjustedCalories =
    normalizedFeedback.includes("lower") ||
    normalizedFeedback.includes("less") ||
    normalizedFeedback.includes("reduce")
      ? Math.max(1600, caloriesPerDay - 150)
      : normalizedFeedback.includes("more") || normalizedFeedback.includes("higher")
        ? caloriesPerDay + 150
        : caloriesPerDay;

  return {
    ...base,
    caloriesPerDay: adjustedCalories,
    notes: [...existingNotes, `Revision note: ${modificationFeedback}`],
  };
}

function buildHabitRevisionChanges(
  normalizedFeedback: string,
  coachingContext: Record<string, unknown>,
): Record<string, unknown> {
  return stubAdaptHabitPlan(normalizedFeedback, coachingContext);
}

function buildRevisedProposal(
  revision: StubProposalRevisionContext,
  coachingContext: Record<string, unknown>,
): RawAiProposal {
  const { originalProposal, modificationFeedback } = revision;
  const normalizedFeedback = modificationFeedback.toLowerCase();
  const title = revisedTitle(originalProposal.title);
  const reason = revisedReason(originalProposal.reason, modificationFeedback);

  switch (originalProposal.intent) {
    case "create_workout_plan":
    case "adapt_workout_plan":
    case "adapt_workout_plan_from_progress":
      return {
        intent: originalProposal.intent,
        targetDomain: "workout",
        title,
        reason,
        proposedChanges: selectWorkoutRevisionPlan(originalProposal.intent, normalizedFeedback),
      } as RawAiProposal;
    case "create_nutrition_plan":
    case "adjust_nutrition_plan":
      return {
        intent: originalProposal.intent,
        targetDomain: "nutrition",
        title,
        reason,
        proposedChanges: buildNutritionRevisionChanges(
          originalProposal,
          normalizedFeedback,
          modificationFeedback,
        ),
      } as RawAiProposal;
    case "create_habit_plan":
    case "adapt_habit_plan":
      return {
        intent: originalProposal.intent,
        targetDomain: originalProposal.targetDomain,
        title,
        reason,
        proposedChanges: buildHabitRevisionChanges(normalizedFeedback, coachingContext),
      } as RawAiProposal;
    case "create_today_checklist":
      return {
        intent: "create_today_checklist",
        targetDomain: "today",
        title,
        reason,
        proposedChanges: {
          date: new Date().toISOString().slice(0, 10),
          items: [
            { label: "Drink water", kind: "hydration", completed: false },
            { label: "Move for 20 minutes", kind: "workout", completed: false },
          ],
        },
      } as RawAiProposal;
    default:
      return {
        ...originalProposal,
        title,
        reason,
      };
  }
}

export function buildStubProposalRevisionOutput(
  revision: StubProposalRevisionContext,
  coachingContext: Record<string, unknown>,
): AiStructuredOutputInput {
  return {
    reply: REVISION_REPLY,
    proposals: [buildRevisedProposal(revision, coachingContext)],
  };
}
