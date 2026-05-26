import type {
  ActivityLevel,
  CoachingHierarchySummary,
  CurrentUserState,
  GoalType,
  OnboardingInput,
  TodayChecklistItemSourceRef,
  TrainingExperience,
} from "@health/types";
import { getTodayIsoDateInTimezone, isCalendarValidIsoDate } from "@health/types";

export const ONBOARDING_PATH = "/onboarding";
export const ONBOARDING_DRAFT_STORAGE_KEY = "health-tracer-onboarding-draft";

export const ONBOARDING_HEIGHT_CM_MIN = 50;
export const ONBOARDING_HEIGHT_CM_MAX = 260;
export const ONBOARDING_WEIGHT_KG_MIN = 20;
export const ONBOARDING_WEIGHT_KG_MAX = 500;
export const ONBOARDING_MIN_AGE_YEARS = 13;
export const ONBOARDING_MAX_AGE_YEARS = 120;

export type OnboardingWizardStep =
  | "account"
  | "profile"
  | "direction"
  | "quarterly"
  | "preferences";

export const ONBOARDING_WIZARD_STEPS: readonly OnboardingWizardStep[] = [
  "account",
  "profile",
  "direction",
  "quarterly",
  "preferences",
] as const;

export type OnboardingGoalPresetKey =
  | "stronger"
  | "live_longer"
  | "endurance"
  | "lose_fat"
  | "consistency"
  | "custom";

export type OnboardingGoalPreset = {
  key: OnboardingGoalPresetKey;
  label: string;
  description: string;
  quarterlyType: GoalType;
  quarterlyTitle: string;
  longevityStatement: string;
  longevityTags: string;
};

export const ONBOARDING_GOAL_PRESETS: readonly OnboardingGoalPreset[] = [
  {
    key: "stronger",
    label: "Become stronger",
    description: "Build strength and power with structured training.",
    quarterlyType: "muscle_gain",
    quarterlyTitle: "Build consistent strength training three times per week",
    longevityStatement: "Stay strong, capable, and energized as the years go by.",
    longevityTags: "strength, mobility",
  },
  {
    key: "live_longer",
    label: "Live longer",
    description: "Invest in habits that support long-term vitality.",
    quarterlyType: "general_wellness",
    quarterlyTitle: "Establish daily movement and recovery habits",
    longevityStatement: "Stay active, resilient, and engaged for decades ahead.",
    longevityTags: "longevity, movement, recovery",
  },
  {
    key: "endurance",
    label: "Improve endurance",
    description: "Grow stamina for the activities you care about.",
    quarterlyType: "endurance",
    quarterlyTitle: "Build aerobic capacity with regular cardio sessions",
    longevityStatement: "Keep my heart, lungs, and stamina ready for what I love.",
    longevityTags: "endurance, cardio",
  },
  {
    key: "lose_fat",
    label: "Lose fat",
    description: "Shape a sustainable routine focused on body composition.",
    quarterlyType: "fat_loss",
    quarterlyTitle: "Create a sustainable nutrition and training rhythm this quarter",
    longevityStatement: "Feel lighter, move better, and keep energy steady.",
    longevityTags: "nutrition, consistency",
  },
  {
    key: "consistency",
    label: "Build consistency",
    description: "Make showing up the main win this quarter.",
    quarterlyType: "general_wellness",
    quarterlyTitle: "Show up for planned workouts at least eighty percent of weeks",
    longevityStatement: "Make fitness a reliable part of my routine.",
    longevityTags: "consistency, habits",
  },
  {
    key: "custom",
    label: "Custom goal",
    description: "Define your own quarterly coaching objective.",
    quarterlyType: "general_wellness",
    quarterlyTitle: "",
    longevityStatement: "",
    longevityTags: "",
  },
] as const;

export type OnboardingDraft = {
  step: OnboardingWizardStep;
  displayName: string;
  timezone: string;
  birthDate: string;
  heightCm: string;
  baselineWeightKg: string;
  activityLevel: ActivityLevel | "";
  trainingExperience: TrainingExperience | "";
  longevityStatement: string;
  longevityTags: string;
  quarterlyTitle: string;
  quarterlyType: GoalType;
  goalPresetKey: OnboardingGoalPresetKey | "";
  preferences: string;
  constraints: string;
};

export const COMMON_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
] as const;

export function detectDefaultTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function createDefaultOnboardingDraft(
  overrides: Partial<OnboardingDraft> = {},
): OnboardingDraft {
  return {
    step: "account",
    displayName: "",
    timezone: detectDefaultTimezone(),
    birthDate: "",
    heightCm: "",
    baselineWeightKg: "",
    activityLevel: "",
    trainingExperience: "",
    longevityStatement: "",
    longevityTags: "",
    quarterlyTitle: "",
    quarterlyType: "general_wellness",
    goalPresetKey: "",
    preferences: "",
    constraints: "",
    ...overrides,
  };
}

export function getOnboardingGoalPreset(
  key: OnboardingGoalPresetKey,
): OnboardingGoalPreset | undefined {
  return ONBOARDING_GOAL_PRESETS.find((preset) => preset.key === key);
}

export function applyOnboardingGoalPreset(
  draft: OnboardingDraft,
  presetKey: OnboardingGoalPresetKey,
): OnboardingDraft {
  const preset = getOnboardingGoalPreset(presetKey);
  if (!preset) {
    return draft;
  }

  if (presetKey === "custom") {
    return {
      ...draft,
      goalPresetKey: "custom",
      quarterlyType: "general_wellness",
    };
  }

  return {
    ...draft,
    goalPresetKey: presetKey,
    quarterlyType: preset.quarterlyType,
    quarterlyTitle: preset.quarterlyTitle,
    longevityStatement: draft.longevityStatement.trim()
      ? draft.longevityStatement
      : preset.longevityStatement,
    longevityTags: draft.longevityTags.trim() ? draft.longevityTags : preset.longevityTags,
  };
}

export function onboardingStepLabel(step: OnboardingWizardStep): string {
  switch (step) {
    case "account":
      return "Account";
    case "profile":
      return "Profile basics";
    case "direction":
      return "Longevity direction";
    case "quarterly":
      return "Quarterly objective";
    case "preferences":
      return "Preferences";
  }
}

export function onboardingStepIndex(step: OnboardingWizardStep): number {
  return ONBOARDING_WIZARD_STEPS.indexOf(step);
}

export function getNextOnboardingStep(
  step: OnboardingWizardStep,
): OnboardingWizardStep | null {
  const index = onboardingStepIndex(step);
  return ONBOARDING_WIZARD_STEPS[index + 1] ?? null;
}

export function getPreviousOnboardingStep(
  step: OnboardingWizardStep,
): OnboardingWizardStep | null {
  const index = onboardingStepIndex(step);
  return index > 0 ? ONBOARDING_WIZARD_STEPS[index - 1]! : null;
}

export function parseCommaSeparatedList(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function joinCommaSeparatedList(values: readonly string[]): string {
  return values.join(", ");
}

export function parseOnboardingHeightCm(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (
    !Number.isInteger(parsed) ||
    parsed < ONBOARDING_HEIGHT_CM_MIN ||
    parsed > ONBOARDING_HEIGHT_CM_MAX
  ) {
    return null;
  }

  return parsed;
}

export function parseOnboardingBaselineWeightKg(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number.parseFloat(trimmed);
  if (
    !Number.isFinite(parsed) ||
    parsed < ONBOARDING_WEIGHT_KG_MIN ||
    parsed > ONBOARDING_WEIGHT_KG_MAX
  ) {
    return null;
  }

  return parsed;
}

function getAgeFromBirthDate(birthDate: string, today = new Date()): number | null {
  if (!isCalendarValidIsoDate(birthDate)) {
    return null;
  }

  const [year, month, day] = birthDate.split("-").map((part) => Number.parseInt(part, 10));
  const birthUtc = Date.UTC(year!, month! - 1, day!);
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());

  if (birthUtc > todayUtc) {
    return null;
  }

  let age = today.getUTCFullYear() - year!;
  const monthDiff = today.getUTCMonth() - (month! - 1);
  const dayDiff = today.getUTCDate() - day!;

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }

  return age;
}

export function validateOnboardingBirthDate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return "Date of birth is required.";
  }

  if (!isCalendarValidIsoDate(trimmed)) {
    return "Enter a valid date of birth (YYYY-MM-DD).";
  }

  const age = getAgeFromBirthDate(trimmed);
  if (age == null) {
    return "Date of birth cannot be in the future.";
  }

  if (age < ONBOARDING_MIN_AGE_YEARS) {
    return `You must be at least ${ONBOARDING_MIN_AGE_YEARS} years old to use this coach.`;
  }

  if (age > ONBOARDING_MAX_AGE_YEARS) {
    return "Enter a valid date of birth.";
  }

  return null;
}

export function validateOnboardingHeightCm(value: string): string | null {
  if (!value.trim()) {
    return "Height is required.";
  }

  if (parseOnboardingHeightCm(value) == null) {
    return `Enter height as a whole number between ${ONBOARDING_HEIGHT_CM_MIN} and ${ONBOARDING_HEIGHT_CM_MAX} cm.`;
  }

  return null;
}

export function validateOnboardingBaselineWeightKg(value: string): string | null {
  if (!value.trim()) {
    return "Weight is required.";
  }

  if (parseOnboardingBaselineWeightKg(value) == null) {
    return `Enter weight between ${ONBOARDING_WEIGHT_KG_MIN} and ${ONBOARDING_WEIGHT_KG_MAX} kg.`;
  }

  return null;
}

export function getCurrentQuarterDateRange(
  timezone: string,
  now = new Date(),
): { startDate: string; targetDate: string } {
  const todayIso = getTodayIsoDateInTimezone(timezone || "UTC", now);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(todayIso);
  if (!match) {
    throw new Error(`Expected ISO date, received "${todayIso}".`);
  }

  const year = Number.parseInt(match[1]!, 10);
  const month = Number.parseInt(match[2]!, 10);
  const quarterStartMonth = Math.floor((month - 1) / 3) * 3 + 1;
  const quarterEndMonth = quarterStartMonth + 2;
  const quarterEndDay = new Date(Date.UTC(year, quarterEndMonth, 0)).getUTCDate();

  const startDate = `${year}-${String(quarterStartMonth).padStart(2, "0")}-01`;
  const targetDate = `${year}-${String(quarterEndMonth).padStart(2, "0")}-${String(quarterEndDay).padStart(2, "0")}`;

  return { startDate, targetDate };
}

export function validateOnboardingStep(
  step: OnboardingWizardStep,
  draft: OnboardingDraft,
): string[] {
  switch (step) {
    case "account": {
      const errors: string[] = [];
      if (!draft.displayName.trim()) {
        errors.push("Display name is required.");
      }
      if (!draft.timezone.trim()) {
        errors.push("Timezone is required.");
      }
      return errors;
    }
    case "profile": {
      const errors: string[] = [];
      const birthDateError = validateOnboardingBirthDate(draft.birthDate);
      const heightError = validateOnboardingHeightCm(draft.heightCm);
      const weightError = validateOnboardingBaselineWeightKg(draft.baselineWeightKg);

      if (birthDateError) {
        errors.push(birthDateError);
      }
      if (heightError) {
        errors.push(heightError);
      }
      if (weightError) {
        errors.push(weightError);
      }

      return errors;
    }
    case "direction":
      return draft.longevityStatement.trim()
        ? []
        : ["Describe your long-term wellness direction."];
    case "quarterly":
      return draft.quarterlyTitle.trim()
        ? []
        : ["Add a measurable objective for this quarter."];
    case "preferences":
      return [];
  }
}

export function buildOnboardingPayload(draft: OnboardingDraft): OnboardingInput {
  const quarterDates = getCurrentQuarterDateRange(draft.timezone);
  const heightCm = parseOnboardingHeightCm(draft.heightCm);
  const baselineWeightKg = parseOnboardingBaselineWeightKg(draft.baselineWeightKg);

  if (heightCm == null || baselineWeightKg == null) {
    throw new Error("Profile baseline measurements are incomplete.");
  }

  const birthDateError = validateOnboardingBirthDate(draft.birthDate);
  if (birthDateError) {
    throw new Error(birthDateError);
  }

  return {
    user: {
      displayName: draft.displayName.trim(),
      timezone: draft.timezone.trim(),
    },
    profile: {
      birthDate: draft.birthDate.trim(),
      heightCm,
      baselineWeightKg,
      activityLevel: draft.activityLevel || null,
      trainingExperience: draft.trainingExperience || null,
      preferences: parseCommaSeparatedList(draft.preferences),
      constraints: parseCommaSeparatedList(draft.constraints),
      longevityDirection: {
        statement: draft.longevityStatement.trim(),
        tags: parseCommaSeparatedList(draft.longevityTags),
      },
    },
    quarterlyGoal: {
      type: draft.quarterlyType,
      title: draft.quarterlyTitle.trim(),
      startDate: quarterDates.startDate,
      targetDate: quarterDates.targetDate,
      priority: "primary",
      horizon: "quarterly",
      target: {},
    },
  };
}

export function isOnboardingPath(pathname: string): boolean {
  return pathname === ONBOARDING_PATH || pathname.startsWith(`${ONBOARDING_PATH}/`);
}

export function shouldRedirectToOnboarding(
  pathname: string,
  onboardingCompleted: boolean,
): boolean {
  return !onboardingCompleted && !isOnboardingPath(pathname);
}

export function shouldRedirectFromOnboarding(
  pathname: string,
  onboardingCompleted: boolean,
): boolean {
  return onboardingCompleted && isOnboardingPath(pathname);
}

export function shouldHidePrimaryNavDuringOnboarding(
  onboardingCompleted: boolean | undefined,
): boolean {
  return onboardingCompleted !== true;
}

export function readOnboardingDraftFromStorage(): OnboardingDraft | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(ONBOARDING_DRAFT_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<OnboardingDraft>;
    return createDefaultOnboardingDraft(parsed);
  } catch {
    return null;
  }
}

export function writeOnboardingDraftToStorage(draft: OnboardingDraft): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(ONBOARDING_DRAFT_STORAGE_KEY, JSON.stringify(draft));
}

export function clearOnboardingDraftFromStorage(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(ONBOARDING_DRAFT_STORAGE_KEY);
}

export function mergeOnboardingDraftWithUserState(
  draft: OnboardingDraft,
  state: CurrentUserState | null | undefined,
): OnboardingDraft {
  if (!state) {
    return draft;
  }

  const hasUserEditedAccount = Boolean(draft.displayName.trim());

  return createDefaultOnboardingDraft({
    ...draft,
    displayName: draft.displayName || state.user.displayName || "",
    timezone: hasUserEditedAccount
      ? draft.timezone
      : state.user.timezone || draft.timezone,
    birthDate: draft.birthDate || state.profile?.birthDate || "",
    heightCm:
      draft.heightCm ||
      (state.profile?.heightCm != null ? String(state.profile.heightCm) : ""),
    baselineWeightKg:
      draft.baselineWeightKg ||
      (state.profile?.baselineWeightKg != null
        ? String(state.profile.baselineWeightKg)
        : ""),
    activityLevel: draft.activityLevel || state.profile?.activityLevel || "",
    trainingExperience: draft.trainingExperience || state.profile?.trainingExperience || "",
    longevityStatement:
      draft.longevityStatement || state.profile?.longevityDirection?.statement || "",
    longevityTags:
      draft.longevityTags ||
      joinCommaSeparatedList(state.profile?.longevityDirection?.tags ?? []),
    preferences:
      draft.preferences || joinCommaSeparatedList(state.profile?.preferences ?? []),
    constraints:
      draft.constraints || joinCommaSeparatedList(state.profile?.constraints ?? []),
  });
}

export function formatHierarchyDirection(
  hierarchy: CoachingHierarchySummary,
): string | null {
  return hierarchy.direction?.statement ?? null;
}

export function hasCoachingHierarchySummary(hierarchy: CoachingHierarchySummary): boolean {
  return Boolean(
    hierarchy.direction ||
      hierarchy.activeQuarterlyGoal ||
      hierarchy.weeklyFocus.length > 0,
  );
}

export function formatTodayHierarchySourceRef(
  source: TodayChecklistItemSourceRef,
): string | null {
  switch (source.type) {
    case "weekly_focus":
      return "Linked to this week's focus";
    case "goal":
      return "Linked to your quarterly objective";
    default:
      return null;
  }
}

export function activityLevelLabel(level: ActivityLevel): string {
  switch (level) {
    case "sedentary":
      return "Mostly sedentary";
    case "lightly_active":
      return "Lightly active";
    case "moderately_active":
      return "Moderately active";
    case "very_active":
      return "Very active";
    case "athlete":
      return "Athlete";
  }
}

export function trainingExperienceLabel(experience: TrainingExperience): string {
  switch (experience) {
    case "beginner":
      return "Beginner";
    case "intermediate":
      return "Intermediate";
    case "advanced":
      return "Advanced";
  }
}

export function quarterlyGoalTypeLabel(type: GoalType): string {
  switch (type) {
    case "fat_loss":
      return "Fat loss";
    case "muscle_gain":
      return "Muscle gain";
    case "maintenance":
      return "Maintenance";
    case "endurance":
      return "Endurance";
    case "general_wellness":
      return "General wellness";
  }
}
