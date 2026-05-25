"use client";

import { useAuth } from "@clerk/nextjs";
import type { CoachingHierarchySummary } from "@health/types";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { apiQueryKeys, getCurrentUserState } from "../../lib/api";
import { goalStatusLabel, goalTypeLabel } from "../../lib/dashboard-ui-state";
import {
  formatHierarchyDirection,
  hasCoachingHierarchySummary,
  joinCommaSeparatedList,
} from "../../lib/onboarding-ui-state";
import {
  CompactGoalHierarchyPanel,
  DashboardCard,
  EmptyState,
  ErrorState,
  LoadingState,
} from "../ui";

function WeeklyFocusList({
  weeklyFocus,
}: {
  weeklyFocus: CoachingHierarchySummary["weeklyFocus"];
}) {
  if (weeklyFocus.length === 0) {
    return null;
  }

  return (
    <div className="coaching-hierarchy__section">
      <p className="section-label">This week&apos;s focus</p>
      <ul className="goals">
        {weeklyFocus.map((focus) => (
          <li key={focus.id}>
            <strong>{focus.title}</strong>
            <span>
              {goalTypeLabel(focus.type)} · {goalStatusLabel(focus.status)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CoachingHierarchySummaryPanel() {
  const { getToken } = useAuth();

  const stateQuery = useQuery({
    queryKey: apiQueryKeys.currentUserState,
    queryFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await getCurrentUserState(token);
      if (result.error || !result.data) {
        throw new Error(result.error ?? "Coaching hierarchy could not be loaded.");
      }

      return result.data;
    },
  });

  if (stateQuery.isLoading) {
    return <LoadingState title="Loading coaching hierarchy…" />;
  }

  if (stateQuery.isError) {
    return (
      <ErrorState
        title="Coaching hierarchy unavailable"
        description={
          stateQuery.error instanceof Error
            ? stateQuery.error.message
            : "Your coaching direction could not be loaded."
        }
      />
    );
  }

  const state = stateQuery.data;
  if (!state) {
    return null;
  }

  const { hierarchy } = state;
  const direction = formatHierarchyDirection(hierarchy);

  if (!state.onboardingCompleted && !hasCoachingHierarchySummary(hierarchy)) {
    return (
      <EmptyState
        title="Finish onboarding to set your direction"
        description="Complete the first-run setup to define your longevity direction and quarterly objective."
        action={
          <Link href="/onboarding" className="confirmation-card__link">
            Continue onboarding →
          </Link>
        }
      />
    );
  }

  return (
    <CompactGoalHierarchyPanel hint="Structured coaching context visible to you and your coach.">
      <DashboardCard
        className="dashboard-card--span-12 coaching-hierarchy__card"
        label="Coaching direction"
        title="Your goal hierarchy"
        hint="Longevity direction, quarterly objective, and weekly focus."
      >
        {direction ? (
          <div className="coaching-hierarchy__section">
            <p className="section-label">Longevity direction</p>
            <p className="coaching-hierarchy__statement">{direction}</p>
            {hierarchy.direction?.tags.length ? (
              <p className="muted-text">
                Tags: {joinCommaSeparatedList(hierarchy.direction.tags)}
              </p>
            ) : null}
          </div>
        ) : (
          <EmptyState
            title="No longevity direction yet"
            description="Add your long-term wellness direction from onboarding or Profile."
          />
        )}

        {hierarchy.activeQuarterlyGoal ? (
          <div className="coaching-hierarchy__section">
            <p className="section-label">Quarterly objective</p>
            <strong>{hierarchy.activeQuarterlyGoal.title}</strong>
            <p className="muted-text">
              {goalTypeLabel(hierarchy.activeQuarterlyGoal.type)} ·{" "}
              {goalStatusLabel(hierarchy.activeQuarterlyGoal.status)}
              {hierarchy.activeQuarterlyGoal.targetDate
                ? ` · Target ${hierarchy.activeQuarterlyGoal.targetDate}`
                : ""}
            </p>
          </div>
        ) : (
          <EmptyState
            title="No active quarterly objective"
            description="Your coach can help you set a measurable 90-day outcome."
          />
        )}

        <WeeklyFocusList weeklyFocus={hierarchy.weeklyFocus} />
      </DashboardCard>
    </CompactGoalHierarchyPanel>
  );
}
