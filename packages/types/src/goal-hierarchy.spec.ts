import { describe, expect, it } from "vitest";
import {
  buildCoachingHierarchySummary,
  getActiveHierarchyLimitErrors,
  getGoalHierarchyFieldErrors,
  getGoalHierarchyValidationErrors,
  getGoalParentReferenceErrors,
  getWeekStartIsoDate,
  hasCompletedOnboardingState,
  mergeGoalHierarchyState,
  onboardingQuarterlyGoalSchema,
} from "./goal-hierarchy.js";
import { onboardingSchema as onboardingContractSchema } from "./index.js";

describe("goal hierarchy helpers", () => {
  it("requires weekStart for weekly goals", () => {
    expect(getGoalHierarchyFieldErrors({ horizon: "weekly", weekStart: null })).toEqual([
      "goal: weekStart is required when horizon is weekly.",
      "goal: parentGoalId is required when horizon is weekly.",
    ]);
  });

  it("rejects weekStart on non-weekly goals", () => {
    expect(
      getGoalHierarchyFieldErrors({
        horizon: "quarterly",
        weekStart: "2026-05-19",
      }),
    ).toEqual(["goal: weekStart is only allowed when horizon is weekly."]);
  });

  it("validates parent linkage rules by horizon", () => {
    expect(
      getGoalHierarchyFieldErrors({
        horizon: "quarterly",
        parentGoalId: "11111111-1111-4111-8111-111111111111",
      }),
    ).toEqual(["goal: parentGoalId is not allowed for quarterly goals."]);
    expect(getGoalHierarchyFieldErrors({ horizon: "daily", parentGoalId: null })).toEqual([
      "goal: parentGoalId is required when horizon is daily.",
    ]);
    expect(
      getGoalHierarchyFieldErrors({
        horizon: "weekly",
        weekStart: "2026-05-19",
        parentGoalId: null,
      }),
    ).toEqual(["goal: parentGoalId is required when horizon is weekly."]);
  });

  it("merges partial hierarchy patches against persisted state", () => {
    expect(
      mergeGoalHierarchyState(
        {
          horizon: "weekly",
          parentGoalId: null,
          weekStart: "2026-05-19",
          status: "active",
        },
        { weekStart: null },
      ),
    ).toMatchObject({
      horizon: "weekly",
      weekStart: null,
    });
  });

  it("rejects weekly goals with invalid parent references", () => {
    expect(
      getGoalParentReferenceErrors("weekly", "11111111-1111-4111-8111-111111111111", null),
    ).toEqual(["goal: parentGoalId was not found for this user."]);
    expect(
      getGoalParentReferenceErrors("weekly", "11111111-1111-4111-8111-111111111111", {
        id: "11111111-1111-4111-8111-111111111111",
        horizon: "weekly",
        status: "active",
      }),
    ).toEqual(["goal: weekly goals must reference an active quarterly parent goal."]);
  });

  it("validates merged hierarchy state for partial updates", () => {
    expect(
      getGoalHierarchyValidationErrors({
        merged: mergeGoalHierarchyState(
          {
            horizon: "weekly",
            parentGoalId: null,
            weekStart: "2026-05-19",
            status: "active",
          },
          { weekStart: null },
        ),
        existingGoals: [{ id: "1", status: "active", horizon: "weekly" }],
        goalId: "1",
      }),
    ).toContain("goal: weekStart is required when horizon is weekly.");
  });

  it("limits active quarterly and weekly goals", () => {
    const errors = getActiveHierarchyLimitErrors(
      [
        { id: "1", status: "active", horizon: "quarterly" },
        { id: "2", status: "active", horizon: "weekly" },
        { id: "3", status: "active", horizon: "weekly" },
        { id: "4", status: "active", horizon: "weekly" },
      ],
      { id: "5", status: "active", horizon: "weekly" },
    );

    expect(errors).toContain("goal: At most 3 active weekly focus goals are allowed.");
    expect(errors.some((error) => error.includes("quarterly"))).toBe(false);
  });

  it("treats candidate updates as replacements for active caps", () => {
    expect(
      getActiveHierarchyLimitErrors(
        [{ id: "1", status: "active", horizon: "quarterly" }],
        { id: "1", status: "active", horizon: "quarterly" },
      ),
    ).toEqual([]);
    expect(
      getActiveHierarchyLimitErrors(
        [{ id: "1", status: "active", horizon: "quarterly" }],
        { id: "2", status: "active", horizon: "quarterly" },
      ),
    ).toEqual(["goal: At most 1 active quarterly goal is allowed."]);
  });

  it("computes monday-based week start dates", () => {
    expect(getWeekStartIsoDate("2026-05-25")).toBe("2026-05-25");
    expect(getWeekStartIsoDate("2026-05-27")).toBe("2026-05-25");
  });

  it("builds hierarchy summary from profile and goals", () => {
    const summary = buildCoachingHierarchySummary(
      {
        longevityDirection: {
          statement: "Stay strong and mobile for decades.",
          tags: ["strength"],
        },
      },
      [
        {
          id: "q1",
          status: "active",
          horizon: "quarterly",
          weekStart: null,
        },
        {
          id: "w1",
          status: "active",
          horizon: "weekly",
          weekStart: "2026-05-19",
        },
      ],
      "2026-05-19",
    );

    expect(summary.direction?.statement).toContain("Stay strong");
    expect(summary.activeQuarterlyGoal?.id).toBe("q1");
    expect(summary.weeklyFocus).toHaveLength(1);
  });

  it("detects completed onboarding from saved direction and active quarterly goal", () => {
    expect(
      hasCompletedOnboardingState(
        {
          longevityDirection: {
            statement: "Stay strong and mobile for decades.",
            tags: ["strength"],
          },
        },
        [{ id: "q1", status: "active", horizon: "quarterly", weekStart: null }],
      ),
    ).toBe(true);

    expect(
      hasCompletedOnboardingState(
        { longevityDirection: null },
        [{ id: "q1", status: "active", horizon: "quarterly", weekStart: null }],
      ),
    ).toBe(false);
  });
});

const validOnboardingPayload = {
  user: {
    displayName: "Alex",
    timezone: "UTC",
  },
  profile: {
    birthDate: "1992-04-12",
    heightCm: 180,
    baselineWeightKg: 82.5,
    activityLevel: "moderately_active" as const,
    longevityDirection: {
      statement: "Build durable fitness habits.",
      tags: ["consistency"],
    },
  },
  quarterlyGoal: {
    type: "general_wellness" as const,
    title: "Complete 36 workouts this quarter",
    startDate: "2026-05-01",
    targetDate: "2026-07-31",
  },
};

describe("onboarding contracts", () => {
  it("requires user, baseline profile fields, direction, and quarterly goal", () => {
    expect(() => onboardingContractSchema.parse(validOnboardingPayload)).not.toThrow();
  });

  it("rejects onboarding payloads without longevity direction", () => {
    expect(() =>
      onboardingContractSchema.parse({
        ...validOnboardingPayload,
        profile: {
          birthDate: "1992-04-12",
          heightCm: 180,
          baselineWeightKg: 82.5,
          activityLevel: "moderately_active",
        },
        quarterlyGoal: onboardingQuarterlyGoalSchema.parse({
          type: "general_wellness",
          title: "Complete 36 workouts this quarter",
          startDate: "2026-05-01",
          targetDate: "2026-07-31",
        }),
      }),
    ).toThrow();
  });

  it("rejects onboarding payloads missing birthDate", () => {
    expect(() =>
      onboardingContractSchema.parse({
        ...validOnboardingPayload,
        profile: {
          heightCm: 180,
          baselineWeightKg: 82.5,
          longevityDirection: validOnboardingPayload.profile.longevityDirection,
        },
      }),
    ).toThrow();
  });

  it("rejects onboarding payloads missing heightCm", () => {
    expect(() =>
      onboardingContractSchema.parse({
        ...validOnboardingPayload,
        profile: {
          birthDate: "1992-04-12",
          baselineWeightKg: 82.5,
          longevityDirection: validOnboardingPayload.profile.longevityDirection,
        },
      }),
    ).toThrow();
  });

  it("rejects onboarding payloads missing baselineWeightKg", () => {
    expect(() =>
      onboardingContractSchema.parse({
        ...validOnboardingPayload,
        profile: {
          birthDate: "1992-04-12",
          heightCm: 180,
          longevityDirection: validOnboardingPayload.profile.longevityDirection,
        },
      }),
    ).toThrow();
  });
});
