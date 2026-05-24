"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { apiQueryKeys, getHabitAdherence } from "../../lib/api";
import { buildHabitAdherenceSummaryView } from "../../lib/habit-ui-state";

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
      <div className="today-adherence-summary nested-card" aria-busy="true">
        <p className="section-label">Habit consistency</p>
        <p className="muted-text">Loading recent habit consistency…</p>
      </div>
    );
  }

  if (adherenceQuery.isError) {
    return (
      <div className="today-adherence-summary nested-card">
        <p className="section-label">Habit consistency</p>
        <p className="form-error" role="alert">
          {adherenceQuery.error instanceof Error
            ? adherenceQuery.error.message
            : "Habit consistency could not be loaded."}
        </p>
      </div>
    );
  }

  const summary = buildHabitAdherenceSummaryView(adherenceQuery.data);

  if (summary.status === "empty") {
    return (
      <div className="today-adherence-summary nested-card">
        <p className="section-label">Habit consistency</p>
        <p className="muted-text">
          No habit plan yet. Ask the coach in Chat to suggest daily habits.
        </p>
      </div>
    );
  }

  return (
    <div className="today-adherence-summary nested-card">
      <p className="section-label">Habit consistency</p>
      <div className="today-adherence-header">
        <strong className="today-adherence-score">{summary.requiredCompletionRate}</strong>
        <p className="muted-text">7-day required completion rate</p>
      </div>
      <p className="muted-text today-adherence-optional">
        <strong>{summary.streakTitle}</strong> · {summary.streakDetail}
      </p>
    </div>
  );
}
