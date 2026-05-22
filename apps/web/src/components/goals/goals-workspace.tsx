"use client";

import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { apiQueryKeys, listGoals } from "../../lib/api";
import { goalStatusLabel, goalTypeLabel } from "../../lib/dashboard-ui-state";
import { EmptyState, ErrorState, LoadingState } from "../ui";

export function GoalsWorkspace() {
  const { getToken } = useAuth();

  const goalsQuery = useQuery({
    queryKey: apiQueryKeys.goals,
    queryFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await listGoals(token);
      if (result.error) {
        throw new Error(result.error);
      }

      return result.data ?? [];
    },
  });

  if (goalsQuery.isLoading) {
    return <LoadingState title="Loading your goals…" />;
  }

  if (goalsQuery.isError) {
    return (
      <ErrorState
        title="Goals unavailable"
        description={
          goalsQuery.error instanceof Error
            ? goalsQuery.error.message
            : "Your goals could not be loaded."
        }
      />
    );
  }

  const goals = goalsQuery.data ?? [];

  if (goals.length === 0) {
    return (
      <EmptyState
        title="No goals yet"
        description="Ask your coach in Chat to help you define a wellness goal."
        action={
          <Link href="/chat" className="confirmation-card__link">
            Open Chat →
          </Link>
        }
      />
    );
  }

  return (
    <ul className="goals goals-list">
      {goals.map((goal) => (
        <li key={goal.id} className="dashboard-card">
          <p className="dashboard-card__label">{goalTypeLabel(goal.type)}</p>
          <h3 className="dashboard-card__title">{goal.title}</h3>
          <p className="dashboard-card__hint">
            {goalStatusLabel(goal.status)} · {goal.priority} priority
          </p>
        </li>
      ))}
    </ul>
  );
}
