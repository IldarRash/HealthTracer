import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { OnboardingService } from "./onboarding.service.js";

const auth = {
  clerkUserId: "user_123",
  displayName: "Test User",
  email: "test@example.com",
};

const user = {
  id: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
  email: "test@example.com",
  displayName: "Test User",
  timezone: "UTC",
  onboardingCompletedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const onboardingInput = {
  user: {
    displayName: "Test User",
    timezone: "UTC",
  },
  profile: {
    activityLevel: "moderately_active" as const,
    longevityDirection: {
      statement: "Stay active and resilient.",
      tags: ["mobility"],
    },
  },
  quarterlyGoal: {
    type: "general_wellness" as const,
    title: "Move consistently this quarter",
    startDate: "2026-05-01",
    targetDate: "2026-07-31",
    horizon: "quarterly" as const,
    priority: "primary" as const,
    target: {},
  },
};

describe("OnboardingService", () => {
  it("completes onboarding and returns current user state", async () => {
    const service = new OnboardingService(
      {
        completeOnboarding: async () => ({
          user: {
            ...user,
            onboardingCompletedAt: new Date("2026-05-25T12:00:00.000Z"),
          },
          profile: {
            id: "profile-1",
            userId: user.id,
            birthDate: null,
            heightCm: null,
            baselineWeightKg: null,
            activityLevel: "moderately_active",
            trainingExperience: null,
            preferences: [],
            constraints: [],
            longevityDirection: onboardingInput.profile.longevityDirection,
            longevityDirectionTags: ["mobility"],
            coachingNotes: [],
            createdAt: new Date("2026-05-25T12:00:00.000Z"),
            updatedAt: new Date("2026-05-25T12:00:00.000Z"),
          },
          quarterlyGoal: {
            id: "goal-1",
            userId: user.id,
            type: "general_wellness",
            status: "active",
            priority: "primary",
            title: onboardingInput.quarterlyGoal.title,
            target: {},
            horizon: "quarterly",
            parentGoalId: null,
            weekStart: null,
            startDate: "2026-05-01",
            targetDate: "2026-07-31",
            createdAt: new Date("2026-05-25T12:00:00.000Z"),
            updatedAt: new Date("2026-05-25T12:00:00.000Z"),
          },
        }),
      } as never,
      {
        resolveFromAuth: async () => user,
      } as never,
      {
        listByUserId: async () => [],
      } as never,
      {
        getCurrentUserState: async () => ({
          user: {
            ...user,
            onboardingCompletedAt: "2026-05-25T12:00:00.000Z",
          },
          profile: null,
          goals: [],
          onboardingCompleted: true,
          hierarchy: {
            direction: onboardingInput.profile.longevityDirection,
            activeQuarterlyGoal: null,
            weeklyFocus: [],
          },
        }),
      } as never,
    );

    await expect(service.completeOnboarding(auth, onboardingInput)).resolves.toMatchObject({
      onboardingCompleted: true,
    });
  });

  it("rejects onboarding when an active quarterly goal already exists", async () => {
    const completeOnboarding = vi.fn();
    const service = new OnboardingService(
      {
        completeOnboarding,
      } as never,
      {
        resolveFromAuth: async () => user,
      } as never,
      {
        listByUserId: async () => [
          {
            id: "existing-quarterly",
            userId: user.id,
            type: "general_wellness",
            status: "active",
            priority: "primary",
            title: "Existing quarterly goal",
            target: {},
            horizon: "quarterly",
            parentGoalId: null,
            weekStart: null,
            startDate: "2026-05-01",
            targetDate: "2026-07-31",
            createdAt: new Date("2026-05-01T00:00:00.000Z"),
            updatedAt: new Date("2026-05-01T00:00:00.000Z"),
          },
        ],
      } as never,
      {
        getCurrentUserState: async () => {
          throw new Error("Should not load state when onboarding is rejected.");
        },
      } as never,
    );

    const result = service.completeOnboarding(auth, onboardingInput);

    await expect(result).rejects.toMatchObject({
      response: {
        message: "goal: At most 1 active quarterly goal is allowed.",
      },
    });
    await expect(result).rejects.toBeInstanceOf(BadRequestException);
    expect(completeOnboarding).not.toHaveBeenCalled();
  });
});
