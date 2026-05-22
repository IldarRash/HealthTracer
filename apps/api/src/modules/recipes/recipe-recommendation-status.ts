import type { UserRecipeRecommendationStatus } from "@health/types";

export type RecipeRecommendationDecisionStatus = Extract<
  UserRecipeRecommendationStatus,
  "accepted" | "dismissed" | "completed"
>;

const TERMINAL_STATUSES = new Set<UserRecipeRecommendationStatus>([
  "dismissed",
  "completed",
]);

const ALLOWED_TRANSITIONS: Record<
  UserRecipeRecommendationStatus,
  ReadonlySet<RecipeRecommendationDecisionStatus>
> = {
  pending: new Set(["accepted", "dismissed", "completed"]),
  accepted: new Set(["completed", "dismissed"]),
  dismissed: new Set(),
  completed: new Set(),
};

export function canTransitionRecipeRecommendationStatus(
  current: UserRecipeRecommendationStatus,
  next: RecipeRecommendationDecisionStatus,
): boolean {
  if (current === next) {
    return true;
  }

  return ALLOWED_TRANSITIONS[current]?.has(next) ?? false;
}

export function isTerminalRecipeRecommendationStatus(
  status: UserRecipeRecommendationStatus,
): boolean {
  return TERMINAL_STATUSES.has(status);
}
