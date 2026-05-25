"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { apiQueryKeys, getHabitAdherence } from "../../lib/api";
import { buildHabitAdherenceSummaryView } from "../../lib/habit-ui-state";
import { ActionPriorityCard, CanvasErrorState, CanvasLoadingState } from "../ui";

export function HabitAdherenceSummary() {
  const { getToken } = useAuth();

  const adherenceQuery = useQuery({
    queryKey: apiQueryKeys.habitAdherence(7),
    queryFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await getHabitAdherence(token, 7);
      if (result.error) {
        throw new Error(result.error);
      }

      return result.data ?? null;
    },
  });

  if (adherenceQuery.isLoading) {
    return (
      <ActionPriorityCard
        className="today-adherence-summary"
        label="Habit consistency"
        title="Recent habit consistency"
        aria-busy="true"
      >
        <CanvasLoadingState
          compact
          title="Loading recent habit consistency…"
        />
      </ActionPriorityCard>
    );
  }

  if (adherenceQuery.isError) {
    return (
      <ActionPriorityCard className="today-adherence-summary" label="Habit consistency" title="Habit consistency">
        <CanvasErrorState
          compact
          title="Habit consistency unavailable"
          description={
            adherenceQuery.error instanceof Error
              ? adherenceQuery.error.message
              : "Habit consistency could not be loaded."
          }
        />
      </ActionPriorityCard>
    );
  }

  const summary = buildHabitAdherenceSummaryView(adherenceQuery.data);

  if (summary.status === "empty") {
    return (
      <ActionPriorityCard
        className="today-adherence-summary"
        label="Habit consistency"
        title="Habit consistency"
        hint="No habit plan yet. Ask the coach in Chat to suggest daily habits."
      />
    );
  }

  return (
    <ActionPriorityCard
      className="today-adherence-summary"
      label="Habit consistency"
      title="7-day required completion rate"
      metric={summary.requiredCompletionRate}
      hint={
        <>
          <strong>{summary.streakTitle}</strong> · {summary.streakDetail}
        </>
      }
    />
  );
}
