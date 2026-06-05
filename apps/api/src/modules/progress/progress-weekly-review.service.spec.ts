import type { RawAiProposal, WeeklyProgressSummaryResponse } from "@health/types";
import { describe, expect, it } from "vitest";
import { ProgressWeeklyReviewService } from "./progress-weekly-review.service.js";

const userId = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";
const summaryId = "14a08176-64a7-4a2d-8a44-581807368394";
const trendId = "24b19287-75b8-4a3e-9c10-691908479405";

function sampleSummary(): WeeklyProgressSummaryResponse {
  return {
    summary: {
      id: summaryId,
      userId,
      weekStart: "2026-05-18",
      weekEnd: "2026-05-24",
      generatedAt: "2026-05-22T12:00:00.000Z",
      dataStatus: "partial",
      sourceAggregates: {
        workout: {
          plannedCount: 3,
          completedCount: 2,
          skippedCount: 0,
          adherencePercent: 67,
          activeDays: 2,
          sessionIds: [],
          averageFatigue: null,
          exercisePlannedCount: 0,
          exerciseCompletedCount: 0,
          exerciseSkippedCount: 0,
          exerciseAdjustedCount: 0,
          exerciseCompletionPercent: null,
          partialSessionCount: 0,
          adHocCompletedCount: 0,
          plannedCompletedCount: 0,
        },
        nutrition: {
          hasActivePlan: true,
          daysWithAdherenceLogged: 4,
          averageTargetCompletionPercent: 75,
          dataSufficiency: "sufficient",
          message: "Nutrition adherence was logged on 4 days.",
        },
        habits: {
          activeHabitCount: 2,
          scheduledDays: 4,
          completedCount: 3,
          missedCount: 1,
          skippedCount: 0,
          adherencePercent: 75,
          dataSufficiency: "sufficient",
          message: "Habit completions were tracked across 4 days.",
        },
      },
      deferredDomains: [],
      userMessage: "Partial cross-domain weekly review.",
      supersededById: null,
      createdAt: "2026-05-22T12:00:00.000Z",
    },
    trends: [
      {
        id: trendId,
        userId,
        summaryId,
        weekStart: "2026-05-18",
        weekEnd: "2026-05-24",
        domain: "workout",
        trendType: "completion_rate",
        direction: "up",
        dataSufficiency: "partial",
        supportingAggregate: {},
        message: "Workout completion improved this week.",
        createdAt: "2026-05-22T12:00:00.000Z",
      },
    ],
  };
}

function createService(pendingIntents: readonly string[] = []) {
  return new ProgressWeeklyReviewService(
    {} as never,
    {
      findPendingIntentsByUserId: async () => [...pendingIntents],
    } as never,
    {} as never,
  );
}

describe("ProgressWeeklyReviewService", () => {
  it("blocks workout lane eligibility when a pending proposal exists in the lane family", async () => {
    const service = createService(["adapt_workout_plan_from_progress"]);
    const outcomes = await service.evaluateLaneOutcomes(userId, sampleSummary());
    const workout = outcomes.find((outcome) => outcome.lane === "workout");

    expect(workout?.eligible).toBe(false);
    expect(workout?.blockedReason).toBe("pending_proposal_in_domain_family");
  });

  it("blocks nutrition lane eligibility when adjust_nutrition_plan is pending", async () => {
    const service = createService(["adjust_nutrition_plan"]);
    const outcomes = await service.evaluateLaneOutcomes(userId, sampleSummary());
    const nutrition = outcomes.find((outcome) => outcome.lane === "nutrition");

    expect(nutrition?.eligible).toBe(false);
    expect(nutrition?.blockedReason).toBe("pending_proposal_in_domain_family");
  });

  it("attaches progress provenance when packing nutrition and habit candidates", () => {
    const service = createService();
    const summary = sampleSummary();
    const laneOutcomes = [
      {
        lane: "workout" as const,
        eligible: true,
        blockedReason: null,
        confidence: 0.85,
        explanationOnly: false,
      },
      {
        lane: "nutrition" as const,
        eligible: true,
        blockedReason: null,
        confidence: 0.8,
        explanationOnly: false,
      },
      {
        lane: "habits_recovery" as const,
        eligible: true,
        blockedReason: null,
        confidence: 0.75,
        explanationOnly: false,
      },
    ];

    const packed = service.filterBoundedProposals(summary, laneOutcomes, [
      {
        intent: "adjust_nutrition_plan",
        targetDomain: "nutrition",
        title: "Adjust nutrition targets",
        reason: "Weekly adherence dipped mid-week.",
        proposedChanges: {
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
        },
      },
      {
        intent: "adapt_habit_plan",
        targetDomain: "general",
        title: "Simplify recovery habits",
        reason: "Add rest-focused habits for next week.",
        proposedChanges: {
          plan: {
            habits: [
              {
                habitDefinitionId: "a1000001-0000-4000-8000-000000000001",
                title: "Evening wind-down",
                category: "sleep_routine",
                status: "active",
                schedule: { type: "daily" },
                target: { type: "boolean" },
                required: true,
                displayOrder: 0,
              },
            ],
          },
        },
      },
    ] as RawAiProposal[]);

    expect(packed.packed).toHaveLength(2);
    expect(packed.packed[0]?.proposedChanges).toMatchObject({
      sourceSummaryId: summaryId,
      sourceTrendObservationIds: [trendId],
    });
    expect(packed.packed[1]?.proposedChanges).toMatchObject({
      sourceSummaryId: summaryId,
      sourceTrendObservationIds: [trendId],
    });
    expect(packed.packed.length).toBeLessThanOrEqual(3);
  });

  it("excludes candidates from ineligible lanes during packing", () => {
    const service = createService();
    const summary = sampleSummary();

    const packed = service.filterBoundedProposals(
      summary,
      [
        {
          lane: "workout",
          eligible: true,
          blockedReason: null,
          confidence: 0.85,
          explanationOnly: false,
        },
        {
          lane: "nutrition",
          eligible: false,
          blockedReason: "insufficient_nutrition_data",
          confidence: 0,
          explanationOnly: false,
        },
      ],
      [
        {
          intent: "adapt_workout_plan_from_progress",
          targetDomain: "workout",
          title: "Lighten next week",
          reason: "Completion dipped mid-week.",
          proposedChanges: {
            plan: {
              title: "Lighter week",
              summary: "Adjusted volume based on weekly completion patterns.",
              days: [{ weekday: "monday" as const, focus: "Recovery", exercises: [{ name: "Walk" }] }],
            },
          },
        },
        {
          intent: "adjust_nutrition_plan",
          targetDomain: "nutrition",
          title: "Adjust nutrition targets",
          reason: "Should be filtered out.",
          proposedChanges: {
            plan: {
              title: "Balanced week",
              summary: "Adjusted targets.",
            caloriesPerDay: 2200,
            proteinGrams: null,
            carbsGrams: null,
            fatGrams: null,
            hydrationLiters: null,
            mealStructure: [{ label: "Breakfast" }],
            },
          },
        },
      ] as RawAiProposal[],
    );

    expect(packed.packed.map((proposal) => proposal.lane)).toEqual(["workout"]);
    expect(packed.meta.adaptationMessage).toContain("approve individually");
  });

  it("ignores unsupported intents when mapping raw proposals to candidates", () => {
    const service = createService();
    const summary = sampleSummary();

    const packed = service.filterBoundedProposals(
      summary,
      [
        {
          lane: "workout",
          eligible: true,
          blockedReason: null,
          confidence: 0.85,
          explanationOnly: false,
        },
      ],
      [
        {
          intent: "summarize_progress",
          targetDomain: "general",
          title: "Weekly summary",
          reason: "Not an adaptation lane.",
          proposedChanges: {},
        },
      ] as RawAiProposal[],
    );

    expect(packed.packed).toEqual([]);
    expect(packed.meta.adaptationMessage).toContain("No safe adaptation");
  });
});
