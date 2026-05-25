import { describe, expect, it } from "vitest";
import {
  buildOnboardingPayload,
  createDefaultOnboardingDraft,
  formatHierarchyDirection,
  formatTodayHierarchySourceRef,
  getCurrentQuarterDateRange,
  hasCoachingHierarchySummary,
  isOnboardingPath,
  mergeOnboardingDraftWithUserState,
  shouldRedirectFromOnboarding,
  shouldRedirectToOnboarding,
  validateOnboardingStep,
} from "./onboarding-ui-state.js";

describe("onboarding UI state", () => {
  it("builds onboarding payload from wizard draft", () => {
    const payload = buildOnboardingPayload(
      createDefaultOnboardingDraft({
        displayName: "Alex",
        timezone: "UTC",
        activityLevel: "moderately_active",
        trainingExperience: "intermediate",
        longevityStatement: "Stay strong and mobile for decades.",
        longevityTags: "strength, mobility",
        quarterlyTitle: "Complete 36 workouts this quarter",
        quarterlyType: "general_wellness",
        preferences: "Morning workouts",
        constraints: "No high-impact jumping",
      }),
    );

    expect(payload.user.displayName).toBe("Alex");
    expect(payload.profile.longevityDirection?.statement).toContain("Stay strong");
    expect(payload.profile.preferences).toEqual(["Morning workouts"]);
    expect(payload.quarterlyGoal.title).toBe("Complete 36 workouts this quarter");
    expect(payload.quarterlyGoal.horizon).toBe("quarterly");
  });

  it("validates required wizard steps", () => {
    const draft = createDefaultOnboardingDraft();

    expect(validateOnboardingStep("account", draft)).toEqual([
      "Display name is required.",
    ]);
    expect(validateOnboardingStep("direction", draft)).toEqual([
      "Describe your long-term wellness direction.",
    ]);
    expect(validateOnboardingStep("quarterly", draft)).toEqual([
      "Add a measurable objective for this quarter.",
    ]);
  });

  it("computes current quarter date range", () => {
    const range = getCurrentQuarterDateRange("UTC", new Date("2026-05-25T12:00:00.000Z"));
    expect(range.startDate).toBe("2026-04-01");
    expect(range.targetDate).toBe("2026-06-30");
  });

  it("routes incomplete users to onboarding and completed users away", () => {
    expect(isOnboardingPath("/onboarding")).toBe(true);
    expect(isOnboardingPath("/onboarding/profile")).toBe(true);
    expect(shouldRedirectToOnboarding("/chat", false)).toBe(true);
    expect(shouldRedirectToOnboarding("/onboarding", false)).toBe(false);
    expect(shouldRedirectFromOnboarding("/onboarding", true)).toBe(true);
    expect(shouldRedirectFromOnboarding("/onboarding/profile", true)).toBe(true);
    expect(shouldRedirectFromOnboarding("/chat", true)).toBe(false);
  });

  it("merges saved user state into a local draft", () => {
    const merged = mergeOnboardingDraftWithUserState(createDefaultOnboardingDraft(), {
      user: {
        id: "11111111-1111-4111-8111-111111111111",
        email: "alex@example.com",
        displayName: "Alex",
        timezone: "America/New_York",
        onboardingCompletedAt: null,
        createdAt: "2026-05-25T12:00:00.000Z",
        updatedAt: "2026-05-25T12:00:00.000Z",
      },
      profile: {
        id: "22222222-2222-4222-8222-222222222222",
        userId: "11111111-1111-4111-8111-111111111111",
        birthDate: null,
        heightCm: null,
        baselineWeightKg: null,
        activityLevel: "moderately_active",
        trainingExperience: "beginner",
        preferences: ["Morning workouts"],
        constraints: [],
        longevityDirection: null,
        longevityDirectionTags: [],
        coachingNotes: [],
        createdAt: "2026-05-25T12:00:00.000Z",
        updatedAt: "2026-05-25T12:00:00.000Z",
      },
      goals: [],
      onboardingCompleted: false,
      hierarchy: {
        direction: null,
        activeQuarterlyGoal: null,
        weeklyFocus: [],
      },
    });

    expect(merged.displayName).toBe("Alex");
    expect(merged.timezone).toBe("America/New_York");
    expect(merged.activityLevel).toBe("moderately_active");
    expect(merged.preferences).toBe("Morning workouts");
  });

  it("summarizes hierarchy display state for Profile", () => {
    const emptyHierarchy = {
      direction: null,
      activeQuarterlyGoal: null,
      weeklyFocus: [],
    };
    const hierarchy = {
      direction: {
        statement: "Stay strong and mobile.",
        tags: ["strength"],
      },
      activeQuarterlyGoal: null,
      weeklyFocus: [],
    };

    expect(hasCoachingHierarchySummary(emptyHierarchy)).toBe(false);
    expect(formatHierarchyDirection(emptyHierarchy)).toBeNull();
    expect(hasCoachingHierarchySummary(hierarchy)).toBe(true);
    expect(formatHierarchyDirection(hierarchy)).toBe("Stay strong and mobile.");
  });

  it("formats Today hierarchy source labels", () => {
    expect(
      formatTodayHierarchySourceRef({
        type: "weekly_focus",
        id: "33333333-3333-4333-8333-333333333333",
      }),
    ).toBe("Linked to this week's focus");
    expect(
      formatTodayHierarchySourceRef({
        type: "goal",
        id: "44444444-4444-4444-8444-444444444444",
      }),
    ).toBe("Linked to your quarterly objective");
    expect(formatTodayHierarchySourceRef({ type: "custom" })).toBeNull();
  });
});
