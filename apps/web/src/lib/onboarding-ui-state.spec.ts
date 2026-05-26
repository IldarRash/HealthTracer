import { describe, expect, it } from "vitest";
import {
  applyOnboardingGoalPreset,
  buildOnboardingPayload,
  createDefaultOnboardingDraft,
  formatHierarchyDirection,
  formatTodayHierarchySourceRef,
  getCurrentQuarterDateRange,
  hasCoachingHierarchySummary,
  isOnboardingPath,
  mergeOnboardingDraftWithUserState,
  shouldHidePrimaryNavDuringOnboarding,
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
        birthDate: "1990-06-15",
        heightCm: "178",
        baselineWeightKg: "75",
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
    expect(payload.profile.birthDate).toBe("1990-06-15");
    expect(payload.profile.heightCm).toBe(178);
    expect(payload.profile.baselineWeightKg).toBe(75);
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
    expect(validateOnboardingStep("profile", draft)).toEqual([
      "Date of birth is required.",
      "Height is required.",
      "Weight is required.",
    ]);
    expect(validateOnboardingStep("direction", draft)).toEqual([
      "Describe your long-term wellness direction.",
    ]);
    expect(validateOnboardingStep("quarterly", draft)).toEqual([
      "Add a measurable objective for this quarter.",
    ]);
  });

  it("keeps custom preset selection without overwriting manual quarterly fields", () => {
    const seeded = createDefaultOnboardingDraft({
      quarterlyTitle: "Train for a spring 10K",
      quarterlyType: "endurance",
      longevityStatement: "Keep running enjoyable for years.",
      longevityTags: "running",
    });

    const customDraft = applyOnboardingGoalPreset(seeded, "custom");

    expect(customDraft.goalPresetKey).toBe("custom");
    expect(customDraft.quarterlyTitle).toBe("Train for a spring 10K");
    expect(customDraft.quarterlyType).toBe("general_wellness");
    expect(customDraft.longevityStatement).toBe("Keep running enjoyable for years.");
    expect(customDraft.longevityTags).toBe("running");
  });

  it("preserves an existing longevity statement when applying a preset", () => {
    const draft = createDefaultOnboardingDraft({
      longevityStatement: "My own coaching direction.",
      longevityTags: "balance",
    });

    const presetDraft = applyOnboardingGoalPreset(draft, "lose_fat");

    expect(presetDraft.quarterlyType).toBe("fat_loss");
    expect(presetDraft.longevityStatement).toBe("My own coaching direction.");
    expect(presetDraft.longevityTags).toBe("balance");
  });

  it("validates birth date, height, and weight bounds on the profile step", () => {
    const draft = createDefaultOnboardingDraft({
      birthDate: "2099-01-01",
      heightCm: "400",
      baselineWeightKg: "0",
    });

    expect(validateOnboardingStep("profile", draft)).toEqual(
      expect.arrayContaining([
        "Date of birth cannot be in the future.",
        expect.stringContaining("Enter height as a whole number"),
        expect.stringContaining("Enter weight between"),
      ]),
    );
  });

  it("throws when building a payload without baseline measurements", () => {
    expect(() =>
      buildOnboardingPayload(
        createDefaultOnboardingDraft({
          displayName: "Alex",
          timezone: "UTC",
          longevityStatement: "Stay consistent.",
          quarterlyTitle: "Move three times per week",
        }),
      ),
    ).toThrow();
  });

  it("maps preset goals into existing onboarding fields without preset ids", () => {
    const presetDraft = applyOnboardingGoalPreset(createDefaultOnboardingDraft(), "stronger");

    expect(presetDraft.goalPresetKey).toBe("stronger");
    expect(presetDraft.quarterlyType).toBe("muscle_gain");
    expect(presetDraft.quarterlyTitle).toContain("strength training");
    expect(presetDraft.longevityStatement).toContain("strong");

    const payload = buildOnboardingPayload({
      ...presetDraft,
      displayName: "Alex",
      timezone: "UTC",
      birthDate: "1990-06-15",
      heightCm: "178",
      baselineWeightKg: "75",
      longevityStatement: presetDraft.longevityStatement,
    });

    expect(payload.quarterlyGoal.type).toBe("muscle_gain");
    expect(payload.profile.longevityDirection?.tags).toContain("strength");
  });

  it("hides primary nav until onboarding is complete", () => {
    expect(shouldHidePrimaryNavDuringOnboarding(false)).toBe(true);
    expect(shouldHidePrimaryNavDuringOnboarding(undefined)).toBe(true);
    expect(shouldHidePrimaryNavDuringOnboarding(true)).toBe(false);
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

  it("merges baseline profile fields from saved user state", () => {
    const merged = mergeOnboardingDraftWithUserState(createDefaultOnboardingDraft(), {
      user: {
        id: "11111111-1111-4111-8111-111111111111",
        email: "alex@example.com",
        displayName: "Alex",
        timezone: "UTC",
        onboardingCompletedAt: null,
        createdAt: "2026-05-25T12:00:00.000Z",
        updatedAt: "2026-05-25T12:00:00.000Z",
      },
      profile: {
        id: "22222222-2222-4222-8222-222222222222",
        userId: "11111111-1111-4111-8111-111111111111",
        birthDate: "1988-03-10",
        heightCm: 182,
        baselineWeightKg: 79.5,
        activityLevel: null,
        trainingExperience: null,
        preferences: [],
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

    expect(merged.birthDate).toBe("1988-03-10");
    expect(merged.heightCm).toBe("182");
    expect(merged.baselineWeightKg).toBe("79.5");
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
