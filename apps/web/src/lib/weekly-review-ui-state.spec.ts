import { describe, expect, it } from "vitest";
import type { WeeklyProgressSummaryResponse, WeeklyReviewResponse } from "@health/types";
import {
  WEEKLY_REVIEW_CANDIDATE_NOTICE,
  WEEKLY_REVIEW_CHAT_ACTION_NOTICE,
  WEEKLY_REVIEW_CHAT_PROMPT,
  WEEKLY_REVIEW_READ_ONLY_NOTICE,
  blockedLaneReasonLabel,
  buildChatWeeklyReviewPackView,
  buildCrossDomainAggregateViews,
  buildLongevityCrossDomainHeadline,
  buildWeeklyReviewChatRoute,
  buildWeeklyReviewPackView,
  domainSufficiencyLabel,
  droppedLaneReasonLabel,
  explanationOnlyLaneDetail,
  getProgressLinkedProposalIntentLabel,
  isProgressLinkedProposal,
  parseChatWeeklyReviewMetadata,
  weeklyReviewLaneLabel,
} from "./weekly-review-ui-state.js";

const userId = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";

function sampleProgress(): WeeklyProgressSummaryResponse {
  return {
    summary: {
      id: "14a08176-64a7-4a2d-8a44-581807368394",
      userId,
      weekStart: "2026-05-19",
      weekEnd: "2026-05-25",
      generatedAt: "2026-05-22T12:00:00.000Z",
      dataStatus: "partial",
      sourceAggregates: {
        workout: {
          plannedCount: 3,
          completedCount: 2,
          skippedCount: 0,
          adherencePercent: 67,
          activeDays: 2,
          sessionIds: ["78d40655-b4b5-47b3-b28e-470192e05f04"],
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
        today: {
          daysWithChecklist: 4,
          averageAdherencePercent: 72,
          completedRequiredItems: 12,
          totalRequiredItems: 16,
          habitItemCompletionPercent: 68,
          dataSufficiency: "partial",
          message: "Today checklists were logged on four days this week.",
        },
        nutrition: {
          hasActivePlan: true,
          daysWithAdherenceLogged: 3,
          averageTargetCompletionPercent: 55,
          dataSufficiency: "partial",
          message: "Nutrition adherence was logged on three days.",
        },
      },
      deferredDomains: [
        {
          domain: "recovery",
          reason: "insufficient_data",
          message: "Recovery context was sparse this week.",
        },
      ],
      userMessage: "This is a partial cross-domain weekly review.",
      supersededById: null,
      createdAt: "2026-05-22T12:00:00.000Z",
    },
    trends: [],
  };
}

describe("weekly review UI state", () => {
  it("labels lanes, sufficiency, and blocked reasons with wellness-safe copy", () => {
    expect(weeklyReviewLaneLabel("workout")).toBe("Workout plan");
    expect(weeklyReviewLaneLabel("habits_recovery")).toBe("Habits & recovery");
    expect(domainSufficiencyLabel("deferred")).toContain("Deferred");
    expect(blockedLaneReasonLabel("pending_proposal_in_domain_family")).toContain("pending");
    expect(droppedLaneReasonLabel("global_cap_reached")).toContain("maximum");
  });

  it("builds cross-domain aggregate views and headline without score framing", () => {
    const progress = sampleProgress();
    const aggregates = buildCrossDomainAggregateViews(progress.summary.sourceAggregates);
    const headline = buildLongevityCrossDomainHeadline(progress);

    expect(aggregates.map((entry) => entry.domain)).toEqual([
      "Workouts",
      "Today checklist",
      "Nutrition",
    ]);
    expect(headline.headline).toContain("Cross-domain review");
    expect(headline.detail.toLowerCase()).not.toContain("readiness score");
    expect(headline.detail.toLowerCase()).not.toContain("health score");
  });

  it("maps weekly review pack previews as non-persisted candidates", () => {
    const review: WeeklyReviewResponse = {
      summary: sampleProgress(),
      laneOutcomes: [
        {
          lane: "workout",
          eligible: true,
          blockedReason: null,
          confidence: 0.8,
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
      packMeta: {
        selectedLanes: ["workout"],
        droppedLanes: [{ lane: "nutrition", reason: "no_candidate_proposal" }],
        adaptationMessage:
          "This weekly review includes up to 1 typed adaptation suggestion you can approve individually. Nothing changes until you accept a proposal.",
      },
      candidateProposals: [
        {
          lane: "workout",
          intent: "adapt_workout_plan_from_progress",
          targetDomain: "workout",
          title: "Lighten next week",
          reason: "Completion dipped mid-week.",
          proposedChanges: {
            plan: {
              title: "Lighter week",
              summary: "Adjusted volume based on weekly completion patterns.",
              days: [{ weekday: "monday", focus: "Recovery", exercises: [{ name: "Walk" }] }],
            },
            sourceSummaryId: sampleProgress().summary.id,
            sourceTrendObservationIds: [],
          },
          confidence: 0.8,
        },
      ],
    };

    const pack = buildWeeklyReviewPackView(review);

    expect(pack.hasPersistedCandidates).toBe(false);
    expect(pack.candidates[0]?.intentLabel).toContain("Progress-based workout");
    expect(pack.lanes[0]?.statusLabel).toBe("Eligible for adaptation");
    expect(WEEKLY_REVIEW_CANDIDATE_NOTICE).toContain("not saved");
    expect(WEEKLY_REVIEW_READ_ONLY_NOTICE).toContain("read-only");
  });

  it("detects progress-linked proposal intents for chat rendering", () => {
    expect(
      getProgressLinkedProposalIntentLabel(
        "adjust_nutrition_plan",
        {
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
        },
      ),
    ).toContain("Progress-based nutrition");

    expect(
      isProgressLinkedProposal({
        intent: "adapt_habit_plan",
        proposedChanges: {
          sourceSummaryId: "14a08176-64a7-4a2d-8a44-581807368394",
          sourceTrendObservationIds: [],
          plan: {
            habits: [
              {
                habitDefinitionId: "a1000001-0000-4000-8000-000000000001",
                title: "Morning hydration",
                category: "hydration",
                status: "active",
                schedule: { type: "daily" },
                target: { type: "boolean" },
                required: true,
                displayOrder: 0,
              },
            ],
          },
        },
      }),
    ).toBe(true);
  });

  it("exposes stable chat route and weekly review prompt copy", () => {
    expect(buildWeeklyReviewChatRoute()).toBe("/chat");
    expect(WEEKLY_REVIEW_CHAT_PROMPT.toLowerCase()).toContain("approve individually");
    expect(WEEKLY_REVIEW_CHAT_PROMPT.toLowerCase()).not.toContain("automatically");
  });

  it("builds summary-only pack views when no candidates are packaged", () => {
    const review: WeeklyReviewResponse = {
      summary: sampleProgress(),
      laneOutcomes: [
        {
          lane: "workout",
          eligible: false,
          blockedReason: "pending_proposal_in_domain_family",
          confidence: 0,
          explanationOnly: false,
        },
        {
          lane: "nutrition",
          eligible: false,
          blockedReason: "insufficient_nutrition_data",
          confidence: 0,
          explanationOnly: false,
        },
        {
          lane: "habits_recovery",
          eligible: false,
          blockedReason: "insufficient_habits_recovery_data",
          confidence: 0,
          explanationOnly: false,
        },
      ],
      packMeta: {
        selectedLanes: [],
        droppedLanes: [],
        adaptationMessage:
          "No safe adaptation was packaged for this weekly review based on the data and eligibility checks available. You can still use the summary observations above.",
      },
      candidateProposals: [],
    };

    const pack = buildWeeklyReviewPackView(review);

    expect(pack.candidates).toEqual([]);
    expect(pack.adaptationMessage).toContain("No safe adaptation");
    expect(pack.lanes.every((lane) => lane.statusLabel === "Not eligible")).toBe(true);
    expect(pack.lanes[0]?.detail).toContain("pending");
  });

  it("sanitizes unsafe candidate reasons and adaptation copy", () => {
    const review: WeeklyReviewResponse = {
      summary: sampleProgress(),
      laneOutcomes: [
        {
          lane: "workout",
          eligible: true,
          blockedReason: null,
          confidence: 0.8,
          explanationOnly: false,
        },
      ],
      packMeta: {
        selectedLanes: ["workout"],
        droppedLanes: [],
        adaptationMessage:
          "This weekly review includes typed suggestions. Your readiness score dropped this week.",
      },
      candidateProposals: [
        {
          lane: "workout",
          intent: "adapt_workout_plan_from_progress",
          targetDomain: "workout",
          title: "Lighten next week",
          reason: "Your readiness score suggests reducing load this week.",
          proposedChanges: {
            plan: {
              title: "Lighter week",
              summary: "Adjusted volume.",
              days: [{ weekday: "monday", focus: "Recovery", exercises: [{ name: "Walk" }] }],
            },
            sourceSummaryId: sampleProgress().summary.id,
            sourceTrendObservationIds: [],
          },
          confidence: 0.8,
        },
      ],
    };

    const pack = buildWeeklyReviewPackView(review);

    expect(pack.adaptationMessage.toLowerCase()).not.toContain("readiness score");
    expect(pack.candidates[0]?.reason.toLowerCase()).not.toContain("readiness score");
  });

  it("parses chat weekly review metadata and builds chat pack views without candidates", () => {
    const metadata = {
      weeklyReview: {
        summaryId: sampleProgress().summary.id,
        laneOutcomes: [
          {
            lane: "workout",
            eligible: true,
            blockedReason: null,
            confidence: 0.8,
            explanationOnly: false,
          },
          {
            lane: "habits_recovery",
            eligible: true,
            blockedReason: null,
            confidence: 0.6,
            explanationOnly: true,
          },
        ],
        packMeta: {
          selectedLanes: ["workout"],
          droppedLanes: [{ lane: "habits_recovery", reason: "conflict_downgraded" }],
          adaptationMessage:
            "This weekly review includes typed suggestions you can approve individually.",
        },
      },
    };

    const parsed = parseChatWeeklyReviewMetadata(metadata);
    expect(parsed?.summaryId).toBe(sampleProgress().summary.id);

    const pack = buildChatWeeklyReviewPackView(parsed!);

    expect(pack.lanes[1]?.statusLabel).toBe("Explanation only");
    expect(pack.lanes[1]?.detail).toBe(explanationOnlyLaneDetail());
    expect(pack.droppedLanes[0]?.reason).toContain("conflict");
    expect(WEEKLY_REVIEW_CHAT_ACTION_NOTICE).toContain("proposal cards");
    expect("candidates" in pack).toBe(false);
  });

  it("returns null for malformed chat weekly review metadata", () => {
    expect(parseChatWeeklyReviewMetadata({})).toBeNull();
    expect(parseChatWeeklyReviewMetadata({ weeklyReview: { summaryId: "bad" } })).toBeNull();
  });
});
