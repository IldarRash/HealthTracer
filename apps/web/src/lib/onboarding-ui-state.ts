import type {
  ActivityLevel,
  CoachingHierarchySummary,
  CurrentUserState,
  GoalType,
  OnboardingInput,
  TodayChecklistItemSourceRef,
  TrainingExperience,
} from "@health/types";
import { getTodayIsoDateInTimezone } from "@health/types";

export const ONBOARDING_PATH = "/onboarding";
export const ONBOARDING_DRAFT_STORAGE_KEY = "health-tracer-onboarding-draft";

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

export type OnboardingDraft = {
  step: OnboardingWizardStep;
  displayName: string;
  timezone: string;
  activityLevel: ActivityLevel | "";
  trainingExperience: TrainingExperience | "";
  longevityStatement: string;
  longevityTags: string;
  quarterlyTitle: string;
  quarterlyType: GoalType;
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
    activityLevel: "",
    trainingExperience: "",
    longevityStatement: "",
    longevityTags: "",
    quarterlyTitle: "",
    quarterlyType: "general_wellness",
    preferences: "",
    constraints: "",
    ...overrides,
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
    case "profile":
      return [];
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

  return {
    user: {
      displayName: draft.displayName.trim(),
      timezone: draft.timezone.trim(),
    },
    profile: {
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
