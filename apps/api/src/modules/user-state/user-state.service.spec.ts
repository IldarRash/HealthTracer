import { getTodayIsoDateInTimezone, getWeekStartIsoDate } from "@health/types";
import { describe, expect, it } from "vitest";
import { UserStateService } from "./user-state.service.js";

const auth = {
  clerkUserId: "user_123",
  displayName: "Alex",
  email: "alex@example.com",
};

const userId = "11111111-1111-4111-8111-111111111111";
const currentWeekStart = getWeekStartIsoDate(getTodayIsoDateInTimezone("UTC"));

describe("UserStateService", () => {
  it("returns onboarding state with the active hierarchy summary", async () => {
    const service = new UserStateService(
      {
        resolveFromAuth: async () => ({
          id: userId,
          email: auth.email,
          displayName: auth.displayName,
          timezone: "UTC",
          onboardingCompletedAt: "2026-05-25T12:00:00.000Z",
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-25T12:00:00.000Z",
        }),
      } as never,
      {
        getCurrentProfile: async () => ({
          id: "22222222-2222-4222-8222-222222222222",
          userId,
          birthDate: null,
          heightCm: null,
          baselineWeightKg: null,
          activityLevel: "moderately_active",
          trainingExperience: "intermediate",
          preferences: ["morning workouts"],
          constraints: [],
          longevityDirection: {
            statement: "Stay strong and mobile.",
            tags: ["strength"],
          },
          longevityDirectionTags: ["strength"],
          coachingNotes: [],
          createdAt: "2026-05-25T12:00:00.000Z",
          updatedAt: "2026-05-25T12:00:00.000Z",
        }),
      } as never,
      {
        listCurrentGoals: async () => [
          {
            id: "33333333-3333-4333-8333-333333333333",
            userId,
            type: "general_wellness",
            status: "active",
            priority: "primary",
            title: "Complete 36 workouts this quarter",
            target: {},
            horizon: "quarterly",
            parentGoalId: null,
            weekStart: null,
            startDate: "2026-04-01",
            targetDate: "2026-06-30",
            createdAt: "2026-05-01T00:00:00.000Z",
            updatedAt: "2026-05-25T12:00:00.000Z",
          },
          {
            id: "44444444-4444-4444-8444-444444444444",
            userId,
            type: "general_wellness",
            status: "active",
            priority: "secondary",
            title: "Mobility focus this week",
            target: {},
            horizon: "weekly",
            parentGoalId: "33333333-3333-4333-8333-333333333333",
            weekStart: currentWeekStart,
            startDate: currentWeekStart,
            targetDate: null,
            createdAt: "2026-05-25T00:00:00.000Z",
            updatedAt: "2026-05-25T00:00:00.000Z",
          },
          {
            id: "55555555-5555-4555-8555-555555555555",
            userId,
            type: "general_wellness",
            status: "active",
            priority: "secondary",
            title: "Previous weekly focus",
            target: {},
            horizon: "weekly",
            parentGoalId: "33333333-3333-4333-8333-333333333333",
            weekStart: "2026-05-18",
            startDate: "2026-05-18",
            targetDate: null,
            createdAt: "2026-05-18T00:00:00.000Z",
            updatedAt: "2026-05-18T00:00:00.000Z",
          },
        ],
      } as never,
    );

    const state = await service.getCurrentUserState(auth);

    expect(state.onboardingCompleted).toBe(true);
    expect(state.profile?.birthDate).toBeNull();
    expect(state.profile?.heightCm).toBeNull();
    expect(state.profile?.baselineWeightKg).toBeNull();
    expect(state.hierarchy.direction?.statement).toBe("Stay strong and mobile.");
    expect(state.hierarchy.activeQuarterlyGoal?.title).toBe(
      "Complete 36 workouts this quarter",
    );
    expect(state.hierarchy.weeklyFocus).toHaveLength(1);
    expect(state.hierarchy.weeklyFocus[0]?.title).toBe("Mobility focus this week");
  });

  it("treats saved onboarding structure as completed when the timestamp is missing", async () => {
    const service = new UserStateService(
      {
        resolveFromAuth: async () => ({
          id: userId,
          email: auth.email,
          displayName: auth.displayName,
          timezone: "UTC",
          onboardingCompletedAt: null,
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-25T12:00:00.000Z",
        }),
      } as never,
      {
        getCurrentProfile: async () => ({
          id: "22222222-2222-4222-8222-222222222222",
          userId,
          birthDate: null,
          heightCm: null,
          baselineWeightKg: null,
          activityLevel: "moderately_active",
          trainingExperience: "intermediate",
          preferences: ["morning workouts"],
          constraints: [],
          longevityDirection: {
            statement: "Stay strong and mobile.",
            tags: ["strength"],
          },
          longevityDirectionTags: ["strength"],
          coachingNotes: [],
          createdAt: "2026-05-25T12:00:00.000Z",
          updatedAt: "2026-05-25T12:00:00.000Z",
        }),
      } as never,
      {
        listCurrentGoals: async () => [
          {
            id: "33333333-3333-4333-8333-333333333333",
            userId,
            type: "general_wellness",
            status: "active",
            priority: "primary",
            title: "Complete 36 workouts this quarter",
            target: {},
            horizon: "quarterly",
            parentGoalId: null,
            weekStart: null,
            startDate: "2026-04-01",
            targetDate: "2026-06-30",
            createdAt: "2026-05-01T00:00:00.000Z",
            updatedAt: "2026-05-25T12:00:00.000Z",
          },
        ],
      } as never,
    );

    const state = await service.getCurrentUserState(auth);

    expect(state.onboardingCompleted).toBe(true);
  });

  it("grandfathers users with onboardingCompletedAt even when baseline profile fields are null", async () => {
    const service = new UserStateService(
      {
        resolveFromAuth: async () => ({
          id: userId,
          email: auth.email,
          displayName: auth.displayName,
          timezone: "UTC",
          onboardingCompletedAt: "2026-05-25T12:00:00.000Z",
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-25T12:00:00.000Z",
        }),
      } as never,
      {
        getCurrentProfile: async () => ({
          id: "22222222-2222-4222-8222-222222222222",
          userId,
          birthDate: null,
          heightCm: null,
          baselineWeightKg: null,
          activityLevel: null,
          trainingExperience: null,
          preferences: [],
          constraints: [],
          longevityDirection: null,
          longevityDirectionTags: [],
          coachingNotes: [],
          createdAt: "2026-05-25T12:00:00.000Z",
          updatedAt: "2026-05-25T12:00:00.000Z",
        }),
      } as never,
      {
        listCurrentGoals: async () => [],
      } as never,
    );

    const state = await service.getCurrentUserState(auth);

    expect(state.onboardingCompleted).toBe(true);
  });
});
