import { describe, expect, it } from "vitest";
import type { AiProposal } from "@health/types";
import {
  canAcceptProposal,
  canDecideProposal,
  formatHabitProposalValidationError,
  formatHabitProposalValidationErrors,
  formatProposalValidationErrors,
  getAcceptDisabledReason,
  getHabitProposalAppliedMessage,
  getProposalDomainLabel,
  getProposalDomainPillClass,
  getProposalDomainRoute,
  getProposalIntentRoute,
  getProposalNavigationRoute,
  getProposalIntentLabel,
  getProposalRejectedMessage,
  getProposalStatusBadgeTone,
  getProposalStatusLabel,
  getProposalSupersededMessage,
  INLINE_PROPOSAL_VALIDATION_HEADING,
  isHabitPlanProposalIntent,
  mergeProposalsById,
  shouldShowInlineProposalIntentLabel,
  shouldShowInvalidValidationNotice,
} from "./proposal-ui-state.js";

describe("proposal UI state", () => {
  it("allows reject for any pending proposal", () => {
    expect(
      canDecideProposal({
        status: "pending",
        validationStatus: "valid",
      }),
    ).toBe(true);

    expect(
      canDecideProposal({
        status: "pending",
        validationStatus: "invalid",
      }),
    ).toBe(true);

    expect(
      canDecideProposal({
        status: "accepted",
        validationStatus: "valid",
      }),
    ).toBe(false);
  });

  it("deduplicates merged proposals by id with local precedence", () => {
    const server = [
      { id: "a", title: "Server A" },
      { id: "b", title: "Server B" },
    ] as AiProposal[];
    const local = [
      { id: "a", title: "Local A" },
      { id: "c", title: "Local C" },
    ] as AiProposal[];

    const merged = mergeProposalsById(server, local);

    expect(merged).toHaveLength(3);
    expect(merged.find((proposal) => proposal.id === "a")?.title).toBe("Local A");
    expect(merged.find((proposal) => proposal.id === "b")?.title).toBe("Server B");
    expect(merged.find((proposal) => proposal.id === "c")?.title).toBe("Local C");
  });

  it("explains why invalid pending proposals cannot be applied", () => {
    expect(
      getAcceptDisabledReason({
        status: "pending",
        validationStatus: "invalid",
        validationErrors: ["Calories must be within a safe range."],
        intent: "adjust_nutrition_plan",
      }),
    ).toContain("validation issues");

    expect(
      getAcceptDisabledReason({
        status: "pending",
        validationStatus: "invalid",
        validationErrors: ["Calories must be within a safe range."],
        intent: "adjust_nutrition_plan",
      }),
    ).toContain("Modify");

    expect(
      getAcceptDisabledReason({
        status: "pending",
        validationStatus: "valid",
        validationErrors: [],
        intent: "adjust_nutrition_plan",
      }),
    ).toBeNull();
  });

  it("allows accept only for pending valid proposals", () => {
    expect(
      canAcceptProposal({
        status: "pending",
        validationStatus: "valid",
      }),
    ).toBe(true);

    expect(
      canAcceptProposal({
        status: "pending",
        validationStatus: "invalid",
      }),
    ).toBe(false);

    expect(
      canAcceptProposal({
        status: "rejected",
        validationStatus: "valid",
      }),
    ).toBe(false);

    expect(
      canAcceptProposal({
        status: "superseded",
        validationStatus: "valid",
      }),
    ).toBe(false);
  });

  it("hides decision actions for rejected and superseded proposals", () => {
    expect(
      canDecideProposal({
        status: "rejected",
        validationStatus: "valid",
      }),
    ).toBe(false);

    expect(
      canDecideProposal({
        status: "superseded",
        validationStatus: "valid",
      }),
    ).toBe(false);

    expect(
      getAcceptDisabledReason({
        status: "superseded",
        validationStatus: "valid",
        validationErrors: [],
        intent: "adapt_workout_plan",
      }),
    ).toBeNull();
  });

  it("maps proposal domains to user-facing labels and routes", () => {
    expect(getProposalDomainLabel("workout")).toBe("Workout");
    expect(getProposalDomainLabel("goal")).toBe("Goal");
    expect(getProposalDomainLabel("recipe")).toBe("Recipe");
    expect(getProposalDomainRoute("workout")).toBe("/training");
    expect(getProposalDomainRoute("goal")).toBe("/profile#goals");
    expect(getProposalDomainRoute("nutrition")).toBe("/nutrition");
    expect(getProposalDomainRoute("recipe")).toBe("/nutrition");
    expect(getProposalDomainRoute("today")).toBe("/today");
    expect(getProposalDomainRoute("general")).toBeNull();
    expect(
      getProposalNavigationRoute({
        intent: "adapt_workout_plan",
        targetDomain: "workout",
      }),
    ).toBe("/training");
    expect(
      getProposalNavigationRoute({
        intent: "adjust_nutrition_plan",
        targetDomain: "nutrition",
      }),
    ).toBe("/nutrition");
    expect(
      getProposalNavigationRoute({
        intent: "recommend_recipes",
        targetDomain: "recipe",
      }),
    ).toBe("/nutrition");
    expect(getProposalStatusLabel("pending")).toBe("Pending review");
    expect(getProposalDomainPillClass("profile")).toBe("proposal-domain-pill--profile");
    expect(getProposalDomainPillClass("recipe")).toBe("proposal-domain-pill--recipe");
  });

  it("labels progress-derived workout adaptation intents", () => {
    expect(getProposalIntentLabel("adapt_workout_plan_from_progress")).toContain(
      "Progress-based",
    );
    expect(
      getProposalIntentLabel("adjust_nutrition_plan", {
        sourceSummaryId: "14a08176-64a7-4a2d-8a44-581807368394",
        sourceTrendObservationIds: [],
        plan: {
          title: "Balanced week",
          summary: "Adjusted targets based on weekly adherence patterns.",
          caloriesPerDay: 2200,
          proteinGrams: null,
          carbsGrams: null,
          fatGrams: null,
          hydrationLiters: null,
          mealStructure: [{ label: "Breakfast" }],
        },
      }),
    ).toContain("Progress-based nutrition");
  });

  it("labels habit plan intents", () => {
    expect(getProposalIntentLabel("create_habit_plan")).toContain("habit plan");
    expect(getProposalIntentLabel("adapt_habit_plan")).toContain("Habit");
    expect(getProposalIntentLabel("recommend_recipes")).toContain("Recipe");
    expect(isHabitPlanProposalIntent("create_habit_plan")).toBe(true);
    expect(isHabitPlanProposalIntent("adapt_habit_plan")).toBe(true);
    expect(isHabitPlanProposalIntent("create_goal")).toBe(false);
  });

  it("routes habit proposals to Today and formats create-vs-adapt validation copy", () => {
    expect(getProposalIntentRoute("create_habit_plan")).toBe("/today");
    expect(getProposalIntentRoute("adapt_habit_plan")).toBe("/today");
    expect(
      getProposalNavigationRoute({
        intent: "adapt_habit_plan",
        targetDomain: "general",
      }),
    ).toBe("/today");

    expect(
      formatHabitProposalValidationError(
        "proposedChanges: create_habit_plan requires no active habit plan; use adapt_habit_plan to revise the current plan.",
      ),
    ).toContain("already have an active habit plan");

    expect(
      formatHabitProposalValidationError(
        "proposedChanges: adapt_habit_plan requires an active habit plan; use create_habit_plan to start one.",
      ),
    ).toContain("no habit plan to adjust");

    expect(
      formatHabitProposalValidationError(
        'habits: adaptation must include habitDefinitionId "a1000001-0000-4000-8000-000000000001" ("Morning hydration") or mark it removed to preserve continuity.',
      ),
    ).toContain("Morning hydration");

    expect(
      formatHabitProposalValidationError(
        "proposedChanges: adapt_habit_plan requires an active habit plan revision.",
      ),
    ).toContain("could not be read");

    expect(getHabitProposalAppliedMessage("create_habit_plan")).toContain("Today");
    expect(getHabitProposalAppliedMessage("adapt_habit_plan")).toContain("history");

    expect(
      formatProposalValidationErrors({
        intent: "create_habit_plan",
        validationErrors: [
          "proposedChanges: create_habit_plan requires no active habit plan; use adapt_habit_plan to revise the current plan.",
        ],
      }),
    ).toEqual([
      "You already have an active habit plan. Ask the coach to adjust your current plan instead of proposing a new one.",
    ]);

    expect(
      formatHabitProposalValidationErrors([
        "proposedChanges: create_habit_plan requires no active habit plan; use adapt_habit_plan to revise the current plan.",
        "proposedChanges: adapt_habit_plan requires an active habit plan; use create_habit_plan to start one.",
      ]),
    ).toHaveLength(2);
  });

  it("labels wellbeing and nutrition incident intents", () => {
    expect(getProposalIntentLabel("capture_wellbeing_checkin")).toBe("Wellbeing check-in");
    expect(getProposalIntentLabel("log_nutrition_incident")).toBe("Nutrition note");
    // C10: log_workout_activity returns user-facing "Log activity" label
    expect(getProposalIntentLabel("log_workout_activity")).toBe("Log activity");
    expect(
      getProposalNavigationRoute({
        intent: "capture_wellbeing_checkin",
        targetDomain: "general",
      }),
    ).toBe("/today");
    expect(
      getProposalRejectedMessage({
        intent: "log_nutrition_incident",
        targetDomain: "nutrition",
      }),
    ).toContain("not logged");
  });

  it("uses habit-specific apply disabled guidance", () => {
    expect(
      getAcceptDisabledReason({
        status: "pending",
        validationStatus: "invalid",
        validationErrors: ["proposedChanges: adapt_habit_plan requires an active habit plan; use create_habit_plan to start one."],
        intent: "adapt_habit_plan",
      }),
    ).toContain("habit proposal");
  });

  it("maps lifecycle states to inline copy and badge tones", () => {
    expect(getProposalStatusLabel("accepted")).toBe("Applied");
    expect(getProposalStatusLabel("rejected")).toBe("Rejected");
    expect(getProposalStatusLabel("superseded")).toBe("Revised");

    expect(getProposalStatusBadgeTone("pending")).toBe("pending");
    expect(getProposalStatusBadgeTone("accepted")).toBe("success");
    expect(getProposalStatusBadgeTone("rejected")).toBe("error");
    expect(getProposalStatusBadgeTone("superseded")).toBe("neutral");
  });

  it("explains rejected proposals without implying plan changes", () => {
    expect(
      getProposalRejectedMessage({
        targetDomain: "workout",
        intent: "adapt_workout_plan",
      }),
    ).toContain("No changes were made");

    expect(
      getProposalRejectedMessage({
        targetDomain: "general",
        intent: "create_habit_plan",
      }),
    ).toContain("habit plan stays as is");

    expect(getProposalSupersededMessage()).toContain("updated proposal");
  });

  it("uses user-facing inline proposal validation heading and intent visibility", () => {
    expect(INLINE_PROPOSAL_VALIDATION_HEADING).toBe("Needs attention");
    expect(shouldShowInlineProposalIntentLabel("create_goal")).toBe(false);
    expect(shouldShowInlineProposalIntentLabel("adapt_workout_plan_from_progress")).toBe(
      true,
    );
  });

  it("shows the human invalid notice for non-habit invalid proposals, not for habit or valid ones", () => {
    // Non-habit proposal with invalid status → show human notice (suppress raw Zod paths)
    expect(
      shouldShowInvalidValidationNotice({
        validationStatus: "invalid",
        intent: "adapt_workout_plan",
      }),
    ).toBe(true);

    expect(
      shouldShowInvalidValidationNotice({
        validationStatus: "invalid",
        intent: "adjust_nutrition_plan",
      }),
    ).toBe(true);

    // Valid proposal → no notice
    expect(
      shouldShowInvalidValidationNotice({
        validationStatus: "valid",
        intent: "adapt_workout_plan",
      }),
    ).toBe(false);

    // Habit proposals with invalid status → keep formatted error list, not the blanket notice
    expect(
      shouldShowInvalidValidationNotice({
        validationStatus: "invalid",
        intent: "create_habit_plan",
      }),
    ).toBe(false);

    expect(
      shouldShowInvalidValidationNotice({
        validationStatus: "invalid",
        intent: "adapt_habit_plan",
      }),
    ).toBe(false);
  });
});
