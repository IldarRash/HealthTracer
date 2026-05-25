"use client";

import { useAuth } from "@clerk/nextjs";
import type { TodayDailyFeedback, TodayWorkoutDetail } from "@health/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  apiQueryKeys,
  getTodayDay,
  getTodayHistory,
  getWorkoutExecutionRefreshQueryKeys,
  startTodayWorkout,
  updateTodayFeedback,
  updateTodayItemStatus,
  updateWorkoutSessionExercise,
} from "../../lib/api";
import {
  buildFeedbackPayload,
  canExecuteTodayWorkout,
  canStartTodayWorkout,
  canSubmitTodayFeedback,
  canUpdateTodayItem,
  formatAdherenceScore,
  formatAdherenceSummary,
  formatTodayHierarchySourceRef,
  formatDisplayDate,
  formatLocalIsoDate,
  hasTodayWorkoutExecutionStarted,
  historyEntrySummaryLabel,
  mergeTodayHistoryWithCurrentDay,
  sessionStatusLabel,
  todayItemCardClass,
  todayItemKindLabel,
  todayItemStatusBadgeClass,
  todayItemStatusLabel,
  todayWorkoutStatusBadgeClass,
  todayWorkoutSummaryLabel,
} from "../../lib/today-ui-state";
import {
  canUpdateSessionExercise,
  formatSessionExerciseDetailLines,
  formatSessionExerciseExecutionSummary,
  formatSessionExercisePrescription,
  groupSessionExercisesByCircuit,
  isTerminalSessionStatus,
  sessionExerciseStatusBadgeClass,
  sessionExerciseStatusLabel,
} from "../../lib/training-ui-state";
import { EmptyState, ErrorState, LoadingState } from "../ui";
import { HabitAdherenceSummary } from "./habit-adherence-summary";
import { RecoveryCheckInCard } from "./recovery-check-in-card";
import { TodayNutritionCard } from "./today-nutrition-card";
import { WellbeingCheckInCard } from "./wellbeing-check-in-card";

const HISTORY_LIMIT = 7;

function feedbackToFormState(feedback: TodayDailyFeedback | null): {
  notes: string;
  energy: string;
  difficulty: string;
} {
  return {
    notes: feedback?.notes ?? "",
    energy: feedback?.energy != null ? String(feedback.energy) : "",
    difficulty: feedback?.difficulty != null ? String(feedback.difficulty) : "",
  };
}

type TodayWorkoutPanelProps = {
  workout: TodayWorkoutDetail;
  selectedDate: string;
  isBusy: boolean;
  onRefresh: () => void;
};

function TodayWorkoutPanel({
  workout,
  selectedDate,
  isBusy,
  onRefresh,
}: TodayWorkoutPanelProps) {
  const { getToken } = useAuth();
  const [updatingExerciseId, setUpdatingExerciseId] = useState<string | null>(null);
  const [executionVisible, setExecutionVisible] = useState(
    () => hasTodayWorkoutExecutionStarted(workout) || !canStartTodayWorkout(workout),
  );

  useEffect(() => {
    setExecutionVisible(
      hasTodayWorkoutExecutionStarted(workout) || !canStartTodayWorkout(workout),
    );
  }, [workout]);

  const startWorkoutMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await startTodayWorkout(token, selectedDate);
      if (result.error || !result.data) {
        throw new Error(result.error ?? "Workout could not be started.");
      }

      return result.data;
    },
    onSuccess: () => {
      setExecutionVisible(true);
      onRefresh();
    },
  });

  const updateExerciseMutation = useMutation({
    mutationFn: async ({
      exerciseId,
      status,
    }: {
      exerciseId: string;
      status: "completed" | "skipped" | "adjusted";
    }) => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await updateWorkoutSessionExercise(
        token,
        workout.sessionId,
        exerciseId,
        { status },
      );
      if (result.error || !result.data) {
        throw new Error(result.error ?? "Exercise could not be updated.");
      }

      return result.data;
    },
    onMutate: ({ exerciseId }) => {
      setUpdatingExerciseId(exerciseId);
    },
    onSettled: () => {
      setUpdatingExerciseId(null);
    },
    onSuccess: () => {
      onRefresh();
    },
  });

  const workoutBusy =
    isBusy || startWorkoutMutation.isPending || updateExerciseMutation.isPending;
  const exerciseGroups = groupSessionExercisesByCircuit(workout.exercises);
  const showStartAction = canStartTodayWorkout(workout) && !executionVisible;
  const showExerciseList = canExecuteTodayWorkout(workout) && executionVisible;

  const handleExerciseStatus = (
    exerciseId: string,
    status: "completed" | "skipped" | "adjusted",
  ) => {
    if (updateExerciseMutation.isPending) {
      return;
    }

    updateExerciseMutation.mutate({ exerciseId, status });
  };

  return (
    <section
      className={`today-workout-panel nested-card training-session-card training-session-card--${workout.status}`}
      aria-labelledby="today-workout-heading"
    >
      <p className="section-label">Today&apos;s workout</p>
      <div className="training-session-header">
        <div>
          <h3 id="today-workout-heading">{workout.title}</h3>
          <p className="muted-text">{todayWorkoutSummaryLabel(workout)}</p>
        </div>
        <span className={todayWorkoutStatusBadgeClass(workout.status)}>
          {sessionStatusLabel(workout.status)}
        </span>
      </div>

      <div className="action-row proposal-actions today-workout-links">
        <Link href="/training" className="confirmation-card__link">
          Open Workouts →
        </Link>
      </div>

      {workout.isRestDay ? (
        <p className="muted-text">Rest day — no structured workout to run.</p>
      ) : null}

      {!workout.isRestDay && showStartAction ? (
        <div className="today-workout-start action-row proposal-actions">
          <button
            type="button"
            className="button button-primary"
            disabled={workoutBusy}
            onClick={() => startWorkoutMutation.mutate()}
          >
            {startWorkoutMutation.isPending ? "Starting…" : "Start workout"}
          </button>
        </div>
      ) : null}

      {showExerciseList ? (
        <div className="today-workout-exercises">
          {exerciseGroups.map((group, groupIndex) => (
            <div key={`${group.circuitLabel ?? "standalone"}-${groupIndex}`} className="today-workout-group">
              {group.circuitLabel ? (
                <p className="section-label today-workout-circuit-label">{group.circuitLabel}</p>
              ) : null}
              <ul className="training-exercise-list today-workout-exercise-list">
                {group.exercises.map((exercise) => {
                  const executionSummary = formatSessionExerciseExecutionSummary(exercise);
                  const detailLines = formatSessionExerciseDetailLines(exercise);

                  return (
                    <li
                      key={exercise.id}
                      className={`today-workout-exercise nested-card training-session-card--${exercise.execution.status === "adjusted" ? "planned" : exercise.execution.status}`}
                    >
                      <div className="today-workout-exercise-header">
                        <strong>{formatSessionExercisePrescription(exercise)}</strong>
                        <span className={sessionExerciseStatusBadgeClass(exercise.execution.status)}>
                          {sessionExerciseStatusLabel(exercise.execution.status)}
                        </span>
                      </div>

                      {detailLines.length > 0 ? (
                        <ul className="today-workout-exercise-details">
                          {detailLines.map((line) => (
                            <li key={line} className="muted-text">
                              {line}
                            </li>
                          ))}
                        </ul>
                      ) : null}

                      {executionSummary ? (
                        <p className="muted-text today-workout-exercise-log">{executionSummary}</p>
                      ) : null}

                      {canUpdateSessionExercise(exercise) ? (
                        <div className="action-row proposal-actions today-item-actions">
                          <button
                            type="button"
                            className="button button-primary"
                            disabled={workoutBusy}
                            onClick={() => handleExerciseStatus(exercise.id, "completed")}
                          >
                            {updatingExerciseId === exercise.id && updateExerciseMutation.isPending
                              ? "Saving…"
                              : "Complete"}
                          </button>
                          <button
                            type="button"
                            className="button button-secondary"
                            disabled={workoutBusy}
                            onClick={() => handleExerciseStatus(exercise.id, "skipped")}
                          >
                            Skip
                          </button>
                          <button
                            type="button"
                            className="button button-secondary"
                            disabled={workoutBusy}
                            onClick={() => handleExerciseStatus(exercise.id, "adjusted")}
                          >
                            Adjusted
                          </button>
                        </div>
                      ) : (
                        <p className="muted-text">Exercise logged for this session.</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      ) : null}

      {!workout.isRestDay && isTerminalSessionStatus(workout.status) ? (
        <p className="muted-text">
          This workout is closed for the day. Review your program in{" "}
          <Link href="/training" className="confirmation-card__link">
            Workouts
          </Link>
          .
        </p>
      ) : null}

      {startWorkoutMutation.isError ? (
        <p className="form-error" role="alert">
          {startWorkoutMutation.error instanceof Error
            ? startWorkoutMutation.error.message
            : "Workout could not be started."}
        </p>
      ) : null}

      {updateExerciseMutation.isError ? (
        <p className="form-error" role="alert">
          {updateExerciseMutation.error instanceof Error
            ? updateExerciseMutation.error.message
            : "Exercise could not be updated."}
        </p>
      ) : null}
    </section>
  );
}

export function TodayWorkspace() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(() => formatLocalIsoDate(new Date()));
  const [feedbackNotes, setFeedbackNotes] = useState("");
  const [feedbackEnergy, setFeedbackEnergy] = useState("");
  const [feedbackDifficulty, setFeedbackDifficulty] = useState("");
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);

  const dayQuery = useQuery({
    queryKey: apiQueryKeys.todayDay(selectedDate),
    queryFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await getTodayDay(token, selectedDate);
      if (result.error) {
        throw new Error(result.error);
      }

      if (!result.data) {
        throw new Error("Today checklist could not be loaded.");
      }

      return result.data;
    },
  });

  const historyQuery = useQuery({
    queryKey: apiQueryKeys.todayHistory(HISTORY_LIMIT),
    queryFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await getTodayHistory(token, HISTORY_LIMIT);
      if (result.error) {
        throw new Error(result.error);
      }

      return result.data?.entries ?? [];
    },
  });

  useEffect(() => {
    const formState = feedbackToFormState(dayQuery.data?.feedback ?? null);
    setFeedbackNotes(formState.notes);
    setFeedbackEnergy(formState.energy);
    setFeedbackDifficulty(formState.difficulty);
  }, [dayQuery.data?.feedback, selectedDate]);

  const invalidateTodayQueries = () => {
    for (const queryKey of getWorkoutExecutionRefreshQueryKeys()) {
      void queryClient.invalidateQueries({ queryKey });
    }
  };

  const updateItemMutation = useMutation({
    mutationFn: async ({
      itemId,
      status,
    }: {
      itemId: string;
      status: "completed" | "skipped";
    }) => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await updateTodayItemStatus(token, selectedDate, itemId, { status });
      if (result.error || !result.data) {
        throw new Error(result.error ?? "Task could not be updated.");
      }

      return result.data;
    },
    onMutate: ({ itemId }) => {
      setUpdatingItemId(itemId);
    },
    onSettled: () => {
      setUpdatingItemId(null);
    },
    onSuccess: () => {
      invalidateTodayQueries();
    },
  });

  const updateFeedbackMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const body = buildFeedbackPayload({
        notes: feedbackNotes,
        energy: feedbackEnergy,
        difficulty: feedbackDifficulty,
      });

      const result = await updateTodayFeedback(token, selectedDate, body);
      if (result.error || !result.data) {
        throw new Error(result.error ?? "Feedback could not be saved.");
      }

      return result.data;
    },
    onSuccess: () => {
      invalidateTodayQueries();
    },
  });

  const isBusy =
    updateItemMutation.isPending ||
    updateFeedbackMutation.isPending ||
    dayQuery.isFetching;

  const existingFeedback = dayQuery.data?.feedback ?? null;
  const canSaveFeedback = canSubmitTodayFeedback({
    notes: feedbackNotes,
    energy: feedbackEnergy,
    difficulty: feedbackDifficulty,
    existingFeedback,
  });

  const handleItemStatus = (itemId: string, status: "completed" | "skipped") => {
    if (updateItemMutation.isPending) {
      return;
    }

    updateItemMutation.mutate({ itemId, status });
  };

  const handleSaveFeedback = () => {
    if (!canSaveFeedback || updateFeedbackMutation.isPending) {
      return;
    }

    updateFeedbackMutation.mutate();
  };

  if (dayQuery.isLoading) {
    return <LoadingState title="Loading your day…" />;
  }

  if (dayQuery.isError) {
    return (
      <ErrorState
        title="Today unavailable"
        description={
          dayQuery.error instanceof Error
            ? dayQuery.error.message
            : "Your checklist could not be loaded."
        }
      />
    );
  }

  const day = dayQuery.data;
  const items = day?.items ?? [];
  const adherence = day?.adherence ?? {
    score: null,
    completedRequired: 0,
    totalRequired: 0,
    completedOptional: 0,
    skippedRequired: 0,
    skippedOptional: 0,
  };
  const historyEntries = mergeTodayHistoryWithCurrentDay(historyQuery.data ?? [], day);

  return (
    <div className="training-workspace today-workspace" aria-busy={isBusy || undefined}>
      <div className="training-layout">
        <section className="panel panel-prominent training-sessions-panel">
          <p className="section-label">Daily execution</p>
          <h2>{formatDisplayDate(selectedDate)}</h2>

          <div className="training-schedule-form nested-card today-date-picker">
            <div className="training-schedule-field">
              <label htmlFor="today-selected-date">Select date</label>
              <input
                id="today-selected-date"
                className="training-schedule-input"
                type="date"
                value={selectedDate}
                disabled={isBusy}
                onChange={(event) => setSelectedDate(event.target.value)}
              />
            </div>
          </div>

          <div className="today-adherence-summary nested-card">
            <p className="section-label">Adherence</p>
            <div className="today-adherence-header">
              <strong className="today-adherence-score">{formatAdherenceScore(adherence)}</strong>
              <p className="muted-text">{formatAdherenceSummary(adherence)}</p>
            </div>
            {adherence.completedOptional > 0 || adherence.skippedOptional > 0 ? (
              <p className="muted-text today-adherence-optional">
                Optional: {adherence.completedOptional} completed
                {adherence.skippedOptional > 0
                  ? ` · ${adherence.skippedOptional} skipped`
                  : ""}
              </p>
            ) : null}
          </div>

          <HabitAdherenceSummary />

          <WellbeingCheckInCard selectedDate={selectedDate} />

          <RecoveryCheckInCard selectedDate={selectedDate} />

          {day?.workout ? (
            <TodayWorkoutPanel
              workout={day.workout}
              selectedDate={selectedDate}
              isBusy={isBusy}
              onRefresh={invalidateTodayQueries}
            />
          ) : null}

          <TodayNutritionCard
            nutrition={day?.nutrition ?? null}
            selectedDate={selectedDate}
            isBusy={isBusy}
            onRefresh={invalidateTodayQueries}
          />

          {items.length === 0 ? (
            <EmptyState
              title="No tasks for this day"
              description="Schedule a workout or accept a Today checklist proposal in Chat to build your daily plan."
              action={
                <div className="action-row proposal-actions">
                  <Link href="/training" className="confirmation-card__link">
                    Open Workouts →
                  </Link>
                  <Link href="/chat" className="confirmation-card__link">
                    Open Chat →
                  </Link>
                </div>
              }
            />
          ) : (
            <ul className="training-session-list today-item-list">
              {items.map((item) => {
                const hierarchySourceLabel = formatTodayHierarchySourceRef(item.source);

                return (
                <li key={item.id} className={todayItemCardClass(item.status)}>
                  <div className="training-session-header">
                    <div>
                      <strong>{item.label}</strong>
                      <p className="muted-text">
                        {todayItemKindLabel(item.kind)}
                        {item.required ? "" : " · Optional"}
                      </p>
                    </div>
                    <span className={todayItemStatusBadgeClass(item.status)}>
                      {todayItemStatusLabel(item.status)}
                    </span>
                  </div>

                  {hierarchySourceLabel ? (
                    <p className="muted-text today-item-source">{hierarchySourceLabel}</p>
                  ) : null}

                  {item.source.type === "workout_session" ? (
                    <p className="muted-text today-item-source">
                      Linked to a scheduled workout session.
                    </p>
                  ) : null}

                  {canUpdateTodayItem(item) ? (
                    <div className="action-row proposal-actions today-item-actions">
                      <button
                        type="button"
                        className="button button-primary"
                        disabled={updateItemMutation.isPending}
                        onClick={() => handleItemStatus(item.id, "completed")}
                      >
                        {updatingItemId === item.id && updateItemMutation.isPending
                          ? "Saving…"
                          : "Mark complete"}
                      </button>
                      <button
                        type="button"
                        className="button button-secondary"
                        disabled={updateItemMutation.isPending}
                        onClick={() => handleItemStatus(item.id, "skipped")}
                      >
                        Skip for now
                      </button>
                    </div>
                  ) : (
                    <p className="muted-text">This task is closed for the day.</p>
                  )}
                </li>
                );
              })}
            </ul>
          )}

          {updateItemMutation.isError ? (
            <p className="form-error" role="alert">
              {updateItemMutation.error instanceof Error
                ? updateItemMutation.error.message
                : "Task could not be updated."}
            </p>
          ) : null}
        </section>

        <section className="panel panel-plan today-feedback-panel">
          <p className="section-label">Daily reflection</p>
          <h2>How did today go?</h2>
          <p className="muted-text">
            Optional wellness context for your coach — energy, difficulty, or a short note.
          </p>

          <div className="today-feedback-form">
            <div className="training-schedule-field">
              <label htmlFor="today-feedback-notes">Notes</label>
              <textarea
                id="today-feedback-notes"
                rows={3}
                className="form-textarea training-notes-input"
                placeholder="What helped, what felt hard, anything to remember…"
                value={feedbackNotes}
                disabled={updateFeedbackMutation.isPending}
                maxLength={500}
                onChange={(event) => setFeedbackNotes(event.target.value)}
              />
            </div>

            <div className="training-schedule-fields">
              <div className="training-schedule-field">
                <label htmlFor="today-feedback-energy">Energy (1–10)</label>
                <input
                  id="today-feedback-energy"
                  className="training-schedule-input"
                  type="number"
                  min={1}
                  max={10}
                  inputMode="numeric"
                  placeholder="Optional"
                  value={feedbackEnergy}
                  disabled={updateFeedbackMutation.isPending}
                  onChange={(event) => setFeedbackEnergy(event.target.value)}
                />
              </div>

              <div className="training-schedule-field">
                <label htmlFor="today-feedback-difficulty">Difficulty (1–10)</label>
                <input
                  id="today-feedback-difficulty"
                  className="training-schedule-input"
                  type="number"
                  min={1}
                  max={10}
                  inputMode="numeric"
                  placeholder="Optional"
                  value={feedbackDifficulty}
                  disabled={updateFeedbackMutation.isPending}
                  onChange={(event) => setFeedbackDifficulty(event.target.value)}
                />
              </div>
            </div>

            <div className="action-row proposal-actions">
              <button
                type="button"
                className="button button-primary"
                disabled={!canSaveFeedback || updateFeedbackMutation.isPending}
                onClick={handleSaveFeedback}
              >
                {updateFeedbackMutation.isPending ? "Saving…" : "Save feedback"}
              </button>
            </div>

            {updateFeedbackMutation.isError ? (
              <p className="form-error" role="alert">
                {updateFeedbackMutation.error instanceof Error
                  ? updateFeedbackMutation.error.message
                  : "Feedback could not be saved."}
              </p>
            ) : null}

            {existingFeedback ? (
              <div className="training-feedback-callout">
                <span className="training-feedback-label">Saved feedback</span>
                <p>
                  {[
                    existingFeedback.notes,
                    existingFeedback.energy != null
                      ? `Energy ${existingFeedback.energy}/10`
                      : null,
                    existingFeedback.difficulty != null
                      ? `Difficulty ${existingFeedback.difficulty}/10`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Feedback recorded."}
                </p>
              </div>
            ) : null}
          </div>
        </section>

        <section className="panel panel-secondary panel-wide training-history-panel">
          <p className="section-label">Recent days</p>
          <h2>Daily progress history</h2>

          {historyQuery.isLoading ? (
            <p className="muted-text">Loading recent history…</p>
          ) : historyQuery.isError ? (
            <p className="form-error" role="alert">
              {historyQuery.error instanceof Error
                ? historyQuery.error.message
                : "Recent history could not be loaded."}
            </p>
          ) : historyEntries.length === 0 ? (
            <p className="muted-text">No recent daily history yet.</p>
          ) : (
            <ul className="training-revision-list today-history-list">
              {historyEntries.map((entry) => (
                <li key={entry.date} className="training-revision-card nested-card">
                  <div className="training-revision-header">
                    <strong>{formatDisplayDate(entry.date)}</strong>
                    <span className="badge badge-info">
                      {formatAdherenceScore(entry.adherence)}
                    </span>
                  </div>
                  <p className="muted-text">{historyEntrySummaryLabel(entry)}</p>
                  {entry.date !== selectedDate ? (
                    <button
                      type="button"
                      className="confirmation-card__link today-history-link"
                      onClick={() => setSelectedDate(entry.date)}
                    >
                      View this day →
                    </button>
                  ) : (
                    <p className="muted-text">Currently selected</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
