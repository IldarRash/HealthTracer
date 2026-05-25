import { describe, expect, it } from "vitest";
import {
  aggregateHabitsProgressWeek,
  aggregateNutritionAdherenceWeek,
  aggregateRecipesActivityWeek,
  aggregateTodayChecklists,
  countSufficientDomains,
  detectCrossDomainProposalConflict,
  evaluateWeeklyReviewLaneEligibility,
  isWeeklyReviewChatMessage,
  markExplanationOnlyLanes,
  packWeeklyReviewProposals,
  WEEKLY_REVIEW_CHAT_PROMPT,
  WEEKLY_REVIEW_MAX_PROPOSALS,
  WEEKLY_REVIEW_TARGET_PROPOSALS,
} from "./progress-cross-domain.js";

describe("progress cross-domain helpers", () => {
  it("aggregates today checklists with sufficiency metadata", () => {
    const aggregate = aggregateTodayChecklists([
      {
        date: "2026-05-18",
        items: [
          { id: "1", label: "Walk", kind: "habit", status: "completed", required: true, source: { type: "generated" } },
        ],
      },
      {
        date: "2026-05-19",
        items: [
          { id: "2", label: "Walk", kind: "habit", status: "completed", required: true, source: { type: "generated" } },
        ],
      },
      {
        date: "2026-05-20",
        items: [
          { id: "3", label: "Walk", kind: "habit", status: "completed", required: true, source: { type: "generated" } },
        ],
      },
      {
        date: "2026-05-21",
        items: [
          { id: "4", label: "Walk", kind: "habit", status: "skipped", required: true, source: { type: "generated" } },
        ],
      },
    ]);

    expect(aggregate.daysWithChecklist).toBe(4);
    expect(aggregate.dataSufficiency).toBe("sufficient");
  });

  it("defers nutrition when no adherence rows exist", () => {
    const aggregate = aggregateNutritionAdherenceWeek({
      hasActivePlan: true,
      adherenceRows: [],
    });

    expect(aggregate.dataSufficiency).toBe("deferred");
  });

  it("packs at most one proposal per lane and three overall", () => {
    const laneOutcomes = [
      evaluateWeeklyReviewLaneEligibility({
        lane: "workout",
        aggregates: { workout: { plannedCount: 3, completedCount: 2 } },
        hasPendingProposalInLaneFamily: false,
      }),
      evaluateWeeklyReviewLaneEligibility({
        lane: "nutrition",
        aggregates: {
          nutrition: {
            hasActivePlan: true,
            daysWithAdherenceLogged: 3,
            averageTargetCompletionPercent: 70,
            dataSufficiency: "sufficient",
            message: "Nutrition adherence was logged on 3 days this week.",
          },
        },
        hasPendingProposalInLaneFamily: false,
      }),
      evaluateWeeklyReviewLaneEligibility({
        lane: "habits_recovery",
        aggregates: {
          habits: aggregateHabitsProgressWeek({
            activeHabitCount: 2,
            completionRows: [
              { habitDefinitionId: "a1000001-0000-4000-8000-000000000001", date: "2026-05-18", status: "completed" },
              { habitDefinitionId: "a1000001-0000-4000-8000-000000000001", date: "2026-05-19", status: "completed" },
              { habitDefinitionId: "a1000001-0000-4000-8000-000000000001", date: "2026-05-20", status: "completed" },
              { habitDefinitionId: "a1000001-0000-4000-8000-000000000001", date: "2026-05-21", status: "completed" },
            ],
          }),
        },
        hasPendingProposalInLaneFamily: false,
      }),
    ];

    const packed = packWeeklyReviewProposals({
      laneOutcomes,
      candidates: [
        {
          lane: "workout",
          intent: "adapt_workout_plan_from_progress",
          targetDomain: "workout",
          title: "Workout A",
          reason: "Reduce load",
          proposedChanges: {},
          confidence: 0.9,
        },
        {
          lane: "workout",
          intent: "adapt_workout_plan_from_progress",
          targetDomain: "workout",
          title: "Workout B",
          reason: "Reduce load again",
          proposedChanges: {},
          confidence: 0.4,
        },
        {
          lane: "nutrition",
          intent: "adjust_nutrition_plan",
          targetDomain: "nutrition",
          title: "Nutrition A",
          reason: "Adjust targets",
          proposedChanges: {},
          confidence: 0.8,
        },
        {
          lane: "habits_recovery",
          intent: "adapt_habit_plan",
          targetDomain: "general",
          title: "Habits A",
          reason: "Simplify recovery habits",
          proposedChanges: {},
          confidence: 0.7,
        },
      ],
    });

    expect(packed.packed.length).toBeLessThanOrEqual(WEEKLY_REVIEW_MAX_PROPOSALS);
    expect(new Set(packed.packed.map((proposal) => proposal.lane)).size).toBe(packed.packed.length);
    expect(packed.meta.selectedLanes).toEqual(["workout", "nutrition", "habits_recovery"]);
  });

  it("detects workout volume and recovery habit conflicts", () => {
    expect(
      detectCrossDomainProposalConflict(
        {
          lane: "workout",
          intent: "adapt_workout_plan_from_progress",
          targetDomain: "workout",
          title: "Increase training volume",
          reason: "Add more load this week",
          proposedChanges: {},
          confidence: 0.8,
        },
        {
          lane: "habits_recovery",
          intent: "adapt_habit_plan",
          targetDomain: "general",
          title: "Prioritize recovery",
          reason: "Add rest and sleep habits",
          proposedChanges: {},
          confidence: 0.7,
        },
      ),
    ).toBe(true);
  });

  it("blocks lane eligibility when a pending proposal exists in the domain family", () => {
    const outcome = evaluateWeeklyReviewLaneEligibility({
      lane: "nutrition",
      aggregates: {
        nutrition: {
          hasActivePlan: true,
          daysWithAdherenceLogged: 4,
          averageTargetCompletionPercent: 80,
          dataSufficiency: "sufficient",
          message: "Nutrition adherence was logged on 4 days this week.",
        },
      },
      hasPendingProposalInLaneFamily: true,
    });

    expect(outcome.eligible).toBe(false);
    expect(outcome.blockedReason).toBe("pending_proposal_in_domain_family");
    expect(outcome.confidence).toBe(0);
  });

  it("counts sufficient domains across workout, today, nutrition, habits, and recovery", () => {
    expect(
      countSufficientDomains({
        workout: { plannedCount: 3 },
        today: {
          daysWithChecklist: 4,
          averageAdherencePercent: 75,
          completedRequiredItems: 6,
          totalRequiredItems: 8,
          habitItemCompletionPercent: 70,
          dataSufficiency: "sufficient",
          message: "Today checklists were logged on 4 days.",
        },
        nutrition: {
          hasActivePlan: true,
          daysWithAdherenceLogged: 4,
          averageTargetCompletionPercent: 80,
          dataSufficiency: "sufficient",
          message: "Nutrition adherence was logged on 4 days.",
        },
        habits: aggregateHabitsProgressWeek({
          activeHabitCount: 2,
          completionRows: [
            { habitDefinitionId: "a1000001-0000-4000-8000-000000000001", date: "2026-05-18", status: "completed" },
            { habitDefinitionId: "a1000001-0000-4000-8000-000000000001", date: "2026-05-19", status: "completed" },
            { habitDefinitionId: "a1000001-0000-4000-8000-000000000001", date: "2026-05-20", status: "completed" },
            { habitDefinitionId: "a1000001-0000-4000-8000-000000000001", date: "2026-05-21", status: "completed" },
          ],
        }),
        recovery: {
          daysWithContext: 3,
          dataSufficiency: "partial",
        },
      }),
    ).toBe(5);
  });

  it("defers habits and recipes when no activity exists", () => {
    expect(
      aggregateHabitsProgressWeek({ activeHabitCount: 0, completionRows: [] }).dataSufficiency,
    ).toBe("deferred");
    expect(
      aggregateRecipesActivityWeek({ recommendationCount: 0, savedCount: 0 }).dataSufficiency,
    ).toBe("deferred");
  });

  it("returns summary-only adaptation copy when no lane is eligible", () => {
    const packed = packWeeklyReviewProposals({
      laneOutcomes: [
        evaluateWeeklyReviewLaneEligibility({
          lane: "workout",
          aggregates: { workout: { plannedCount: 1, completedCount: 0 } },
          hasPendingProposalInLaneFamily: false,
        }),
        evaluateWeeklyReviewLaneEligibility({
          lane: "nutrition",
          aggregates: { nutrition: null },
          hasPendingProposalInLaneFamily: false,
        }),
        evaluateWeeklyReviewLaneEligibility({
          lane: "habits_recovery",
          aggregates: {},
          hasPendingProposalInLaneFamily: false,
        }),
      ],
      candidates: [],
    });

    expect(packed.packed).toEqual([]);
    expect(packed.meta.adaptationMessage).toContain("No safe adaptation");
  });

  it("keeps the higher-confidence lane when a cross-domain conflict is detected", () => {
    const laneOutcomes = [
      evaluateWeeklyReviewLaneEligibility({
        lane: "workout",
        aggregates: { workout: { plannedCount: 3, completedCount: 2 } },
        hasPendingProposalInLaneFamily: false,
      }),
      evaluateWeeklyReviewLaneEligibility({
        lane: "habits_recovery",
        aggregates: {
          habits: aggregateHabitsProgressWeek({
            activeHabitCount: 2,
            completionRows: [
              { habitDefinitionId: "a1000001-0000-4000-8000-000000000001", date: "2026-05-18", status: "completed" },
              { habitDefinitionId: "a1000001-0000-4000-8000-000000000001", date: "2026-05-19", status: "completed" },
              { habitDefinitionId: "a1000001-0000-4000-8000-000000000001", date: "2026-05-20", status: "completed" },
              { habitDefinitionId: "a1000001-0000-4000-8000-000000000001", date: "2026-05-21", status: "completed" },
            ],
          }),
        },
        hasPendingProposalInLaneFamily: false,
      }),
    ];

    const packed = packWeeklyReviewProposals({
      laneOutcomes,
      candidates: [
        {
          lane: "workout",
          intent: "adapt_workout_plan_from_progress",
          targetDomain: "workout",
          title: "Increase training volume",
          reason: "Add more load this week",
          proposedChanges: {},
          confidence: 0.9,
        },
        {
          lane: "habits_recovery",
          intent: "adapt_habit_plan",
          targetDomain: "general",
          title: "Prioritize recovery",
          reason: "Add rest and simplify habits",
          proposedChanges: {},
          confidence: 0.6,
        },
      ],
    });

    expect(packed.packed.map((proposal) => proposal.lane)).toEqual(["workout"]);
    expect(packed.meta.droppedLanes).toEqual([
      { lane: "habits_recovery", reason: "conflict_downgraded" },
    ]);
    expect(packed.explanationOnlyLanes).toEqual(["habits_recovery"]);
    expect(
      markExplanationOnlyLanes(laneOutcomes, packed.explanationOnlyLanes).find(
        (lane) => lane.lane === "habits_recovery",
      )?.explanationOnly,
    ).toBe(true);
  });

  it("documents the soft target as a readability preference below the hard cap", () => {
    expect(WEEKLY_REVIEW_TARGET_PROPOSALS).toBeLessThan(WEEKLY_REVIEW_MAX_PROPOSALS);
  });

  it("drops candidates beyond the global cap of three", () => {
    const eligibleOutcome = (lane: "workout" | "nutrition" | "habits_recovery") =>
      evaluateWeeklyReviewLaneEligibility({
        lane,
        aggregates: {
          workout: { plannedCount: 3, completedCount: 2 },
          nutrition: {
            hasActivePlan: true,
            daysWithAdherenceLogged: 4,
            averageTargetCompletionPercent: 80,
            dataSufficiency: "sufficient",
            message: "Nutrition adherence was logged on 4 days.",
          },
          habits: aggregateHabitsProgressWeek({
            activeHabitCount: 2,
            completionRows: [
              { habitDefinitionId: "a1000001-0000-4000-8000-000000000001", date: "2026-05-18", status: "completed" },
              { habitDefinitionId: "a1000001-0000-4000-8000-000000000001", date: "2026-05-19", status: "completed" },
              { habitDefinitionId: "a1000001-0000-4000-8000-000000000001", date: "2026-05-20", status: "completed" },
              { habitDefinitionId: "a1000001-0000-4000-8000-000000000001", date: "2026-05-21", status: "completed" },
            ],
          }),
        },
        hasPendingProposalInLaneFamily: false,
      });

    const packed = packWeeklyReviewProposals({
      laneOutcomes: [
        eligibleOutcome("workout"),
        eligibleOutcome("nutrition"),
        eligibleOutcome("habits_recovery"),
      ],
      candidates: [
        {
          lane: "workout",
          intent: "adapt_workout_plan_from_progress",
          targetDomain: "workout",
          title: "Workout A",
          reason: "Reduce load",
          proposedChanges: {},
          confidence: 0.95,
        },
        {
          lane: "nutrition",
          intent: "adjust_nutrition_plan",
          targetDomain: "nutrition",
          title: "Nutrition A",
          reason: "Adjust targets",
          proposedChanges: {},
          confidence: 0.85,
        },
        {
          lane: "habits_recovery",
          intent: "adapt_habit_plan",
          targetDomain: "general",
          title: "Habits A",
          reason: "Simplify recovery habits",
          proposedChanges: {},
          confidence: 0.75,
        },
        {
          lane: "workout",
          intent: "adapt_workout_plan_from_progress",
          targetDomain: "workout",
          title: "Workout overflow",
          reason: "Should never pack",
          proposedChanges: {},
          confidence: 0.1,
        },
      ],
    });

    expect(packed.packed.length).toBe(WEEKLY_REVIEW_MAX_PROPOSALS);
    expect(packed.meta.droppedLanes.some((entry) => entry.reason === "global_cap_reached")).toBe(
      true,
    );
  });

  it("detects the canonical weekly review chat prompt", () => {
    expect(isWeeklyReviewChatMessage(WEEKLY_REVIEW_CHAT_PROMPT)).toBe(true);
    expect(isWeeklyReviewChatMessage("Suggest a workout plan")).toBe(false);
  });
});
