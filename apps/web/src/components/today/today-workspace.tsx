"use client";

import { useAuth } from "@clerk/nextjs";
import type { TodayDailyFeedback, TodayWorkoutDetail, WellbeingCrisisEvaluation } from "@health/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  apiQueryKeys,
  getRecoveryContext,
  getTodayDay,
  getTodayHistory,
  getTodayItemStatusRefreshQueryKeys,
  getWellbeingCheckIn,
  startTodayWorkout,
  updateTodayFeedback,
  updateTodayItemStatus,
  updateWorkoutSessionExercise,
} from "../../lib/api";
import { resolveTodayNutritionMealAction } from "../../lib/today-nutrition-ui-state";
import {
  buildFeedbackPayload,
  canExecuteTodayWorkout,
  canStartTodayWorkout,
  canSubmitTodayFeedback,
  canUpdateTodayItem,
  formatAdherenceSummary,
  formatDisplayDate,
  formatHistoryTaskCountBadge,
  formatLocalIsoDate,
  formatTaskCountChip,
  formatTodayHierarchySourceRef,
  formatTodayHabitItemSourceLabel,
  hasTodayWorkoutExecutionStarted,
  historyEntrySummaryLabel,
  isTodayHabitItem,
  mergeTodayHistoryWithCurrentDay,
  resolveTodayNextAction,
  buildTodayDisclosureResetKey,
  sessionStatusLabel,
  shouldExpandTodayCheckInsSection,
  shouldExpandTodayDetailsSection,
  shouldExpandTodayPlanSection,
  todayItemCardClass,
  todayItemClosedMessage,
  todayItemKindLabel,
  todayItemStatusBadgeClass,
  todayItemStatusLabel,
  todayWorkoutStatusBadgeClass,
  todayWorkoutSummaryLabel,
} from "../../lib/today-ui-state";
import { wellbeingCheckInIndicatesCrisisSupport } from "../../lib/wellbeing-ui-state";
import {
  buildExerciseExecutionUpdatePayload,
  type ExerciseFeedbackFormState,
} from "../../lib/exercise-catalog-ui-state";
import { groupSessionExercisesByCircuit, isTerminalSessionStatus } from "../../lib/training-ui-state";
import {
  ActionPriorityCard,
  CanvasEmptyState,
  CanvasErrorState,
  CanvasLoadingState,
  CommandCenterLayout,
  CompactDomainCard,
  ProgressiveDisclosure,
  SectionNav,
  StatusBadge,
} from "../ui";
import { CrisisSupportPanel } from "../wellbeing/crisis-support-panel";
import { RecoveryCheckInCard } from "./recovery-check-in-card";
import { TodayNutritionCard } from "./today-nutrition-card";
import { TodayWorkoutExerciseCard } from "./today-workout-exercise-card";
import { WellbeingCheckInCard } from "./wellbeing-check-in-card";

const HISTORY_LIMIT = 7;

const TODAY_SECTIONS = [
  { id: "today-plan", label: "Plan" },
  { id: "today-check-ins", label: "Check-ins" },
  { id: "today-details", label: "Details" },
] as const;

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
      feedbackForm,
    }: {
      exerciseId: string;
      status: "completed" | "skipped" | "adjusted";
      feedbackForm: ExerciseFeedbackFormState;
    }) => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const body = buildExerciseExecutionUpdatePayload({ form: feedbackForm, status });
      if (!body) {
        throw new Error("Exercise feedback could not be prepared.");
      }

      const result = await updateWorkoutSessionExercise(
        token,
        workout.sessionId,
        exerciseId,
        body,
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
    feedbackForm: ExerciseFeedbackFormState,
  ) => {
    if (updateExerciseMutation.isPending) {
      return;
    }

    updateExerciseMutation.mutate({ exerciseId, status, feedbackForm });
  };

  return (
    <CompactDomainCard
      className={`today-workout-panel training-session-card training-session-card--${workout.status}`}
      label="Today&apos;s workout"
      title={workout.title}
      titleId="today-workout-heading"
      summary={todayWorkoutSummaryLabel(workout)}
      badge={
        <StatusBadge className={todayWorkoutStatusBadgeClass(workout.status)}>
          {sessionStatusLabel(workout.status)}
        </StatusBadge>
      }
      actions={
        <div className="today-workout-links">
          <Link href="/training" className="confirmation-card__link">
            Open Workouts →
          </Link>
        </div>
      }
    >
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
        <ProgressiveDisclosure
          className="today-workout-exercises"
          summary="Exercise list"
          defaultOpen
        >
          {exerciseGroups.map((group, groupIndex) => (
            <div key={`${group.circuitLabel ?? "standalone"}-${groupIndex}`} className="today-workout-group">
              {group.circuitLabel ? (
                <p className="section-label today-workout-circuit-label">{group.circuitLabel}</p>
              ) : null}
              <ul className="training-exercise-list today-workout-exercise-list">
                {group.exercises.map((exercise) => (
                  <TodayWorkoutExerciseCard
                    key={exercise.id}
                    exercise={exercise}
                    disabled={workoutBusy}
                    isUpdating={
                      updatingExerciseId === exercise.id && updateExerciseMutation.isPending
                    }
                    onStatusChange={handleExerciseStatus}
                  />
                ))}
              </ul>
            </div>
          ))}
        </ProgressiveDisclosure>
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
    </CompactDomainCard>
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
  const [activeCrisisSupport, setActiveCrisisSupport] = useState<WellbeingCrisisEvaluation | null>(
    null,
  );

  useEffect(() => {
    setActiveCrisisSupport(null);
  }, [selectedDate]);

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

  const wellbeingQuery = useQuery({
    queryKey: apiQueryKeys.wellbeingCheckIn(selectedDate),
    queryFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await getWellbeingCheckIn(token, selectedDate);
      if (result.error) {
        throw new Error(result.error);
      }

      return result.data?.checkIn ?? null;
    },
  });

  const recoveryQuery = useQuery({
    queryKey: apiQueryKeys.recoveryContext(selectedDate),
    queryFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await getRecoveryContext(token, selectedDate);
      if (result.error || !result.data) {
        throw new Error(result.error ?? "Recovery context could not be loaded.");
      }

      return result.data;
    },
  });

  useEffect(() => {
    const formState = feedbackToFormState(dayQuery.data?.feedback ?? null);
    setFeedbackNotes(formState.notes);
    setFeedbackEnergy(formState.energy);
    setFeedbackDifficulty(formState.difficulty);
  }, [dayQuery.data?.feedback, selectedDate]);

  const invalidateTodayQueries = () => {
    for (const queryKey of getTodayItemStatusRefreshQueryKeys()) {
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
    return <CanvasLoadingState title="Loading your day…" />;
  }

  if (dayQuery.isError) {
    return (
      <CanvasErrorState
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
  const nutritionMealAction = resolveTodayNutritionMealAction(day?.nutrition ?? null);
  const hasWellbeingCheckIn =
    wellbeingQuery.isLoading || wellbeingQuery.isError
      ? null
      : wellbeingQuery.data != null;
  const hasRecoveryCheckIn =
    recoveryQuery.isLoading || recoveryQuery.isError ? null : recoveryQuery.data?.checkIn != null;
  const wellbeingIndicatesCrisisSupport =
    wellbeingQuery.isLoading || wellbeingQuery.isError
      ? null
      : wellbeingCheckInIndicatesCrisisSupport(wellbeingQuery.data ?? null);
  const nextAction = resolveTodayNextAction({
    items,
    workout: day?.workout ?? null,
    hasWellbeingCheckIn,
    hasRecoveryCheckIn,
    hasPendingNutritionMeal: nutritionMealAction.hasPendingMeal,
    pendingNutritionMealLabel: nutritionMealAction.pendingMealLabel,
    existingFeedback: day?.feedback ?? null,
  });
  const expandMovement = shouldExpandTodayPlanSection("movement", {
    nextAction,
    workout: day?.workout ?? null,
    items,
    hasPendingNutritionMeal: nutritionMealAction.hasPendingMeal,
  });
  const expandNutrition = shouldExpandTodayPlanSection("nutrition", {
    nextAction,
    workout: day?.workout ?? null,
    items,
    hasPendingNutritionMeal: nutritionMealAction.hasPendingMeal,
  });
  const expandHabits = shouldExpandTodayPlanSection("habits", {
    nextAction,
    workout: day?.workout ?? null,
    items,
    hasPendingNutritionMeal: nutritionMealAction.hasPendingMeal,
  });
  const expandCheckIns = shouldExpandTodayCheckInsSection({
    nextAction,
    hasWellbeingCheckIn,
    hasRecoveryCheckIn,
    wellbeingIndicatesCrisisSupport,
  });
  const expandDetails = shouldExpandTodayDetailsSection(nextAction);

  return (
    <CommandCenterLayout
      className="training-workspace today-workspace"
      aria-busy={isBusy || undefined}
    >
      <SectionNav sections={TODAY_SECTIONS} ariaLabel="Today sections" />
      <div className="training-layout command-center__layout">
        <ActionPriorityCard
          id="today-hero-heading"
          className="today-hero"
          label="Today"
          title={formatDisplayDate(selectedDate)}
          hint={formatAdherenceSummary(adherence)}
        >
          <div className="today-hero-meta">
            <StatusBadge className="badge badge-info today-progress-chip">
              {formatTaskCountChip(adherence)}
            </StatusBadge>
            {adherence.completedOptional > 0 || adherence.skippedOptional > 0 ? (
              <span className="muted-text today-adherence-optional">
                Optional: {adherence.completedOptional} completed
                {adherence.skippedOptional > 0 ? ` · ${adherence.skippedOptional} skipped` : ""}
              </span>
            ) : null}
          </div>

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

          <p className="muted-text today-longevity-link">
            Habit consistency trends live on{" "}
            <Link href="/longevity" className="confirmation-card__link">
              Longevity →
            </Link>
          </p>
        </ActionPriorityCard>

        <ActionPriorityCard
          className="today-next-action"
          label="Next up"
          title={nextAction.title}
          hint={nextAction.description}
          headingLevel={3}
          footer={
            <a href={`#${nextAction.anchorId}`} className="confirmation-card__link">
              {nextAction.ctaLabel} →
            </a>
          }
        />

        <section
          id="today-plan"
          className="panel panel-prominent training-sessions-panel today-plan-panel"
          aria-labelledby="today-plan-heading"
        >
          <p className="section-label">Today&apos;s plan</p>
          <h2 id="today-plan-heading">Movement, nutrition, and tasks</h2>

          <ProgressiveDisclosure
            key={buildTodayDisclosureResetKey("movement", selectedDate, expandMovement)}
            id="today-movement"
            className="today-plan-section"
            summary="Movement"
            defaultOpen={expandMovement}
          >
            {day?.workout ? (
              <TodayWorkoutPanel
                workout={day.workout}
                selectedDate={selectedDate}
                isBusy={isBusy}
                onRefresh={invalidateTodayQueries}
              />
            ) : (
              <CanvasEmptyState
                compact
                title="No workout scheduled"
                description="Schedule a session in Workouts or ask the coach in Chat."
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
            )}
          </ProgressiveDisclosure>

          <ProgressiveDisclosure
            key={buildTodayDisclosureResetKey("nutrition", selectedDate, expandNutrition)}
            id="today-nutrition"
            className="today-plan-section"
            summary="Nutrition"
            defaultOpen={expandNutrition}
          >
            <TodayNutritionCard
              nutrition={day?.nutrition ?? null}
              selectedDate={selectedDate}
              isBusy={isBusy}
              onRefresh={invalidateTodayQueries}
            />
          </ProgressiveDisclosure>

          <ProgressiveDisclosure
            key={buildTodayDisclosureResetKey("habits", selectedDate, expandHabits)}
            id="today-habits"
            className="today-plan-section"
            summary="Habits & tasks"
            defaultOpen={expandHabits}
          >
            {items.length === 0 ? (
              <CanvasEmptyState
                compact
                title="No tasks for this day"
                description="Accept a habit plan in Chat or accept a Today checklist proposal to build your daily plan."
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
                  const isHabitItem = isTodayHabitItem(item);

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
                        <StatusBadge className={todayItemStatusBadgeClass(item.status)}>
                          {todayItemStatusLabel(item.status)}
                        </StatusBadge>
                      </div>

                      {isHabitItem ? (
                        <p className="muted-text today-item-source">
                          {formatTodayHabitItemSourceLabel()}
                        </p>
                      ) : null}

                      {!isHabitItem && hierarchySourceLabel ? (
                        <p className="muted-text today-item-source">{hierarchySourceLabel}</p>
                      ) : null}

                      {!isHabitItem && item.source.type === "workout_session" ? (
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
                              : isHabitItem
                                ? "Mark habit complete"
                                : "Mark complete"}
                          </button>
                          <button
                            type="button"
                            className="button button-secondary"
                            disabled={updateItemMutation.isPending}
                            onClick={() => handleItemStatus(item.id, "skipped")}
                          >
                            {isHabitItem ? "Skip habit today" : "Skip for now"}
                          </button>
                        </div>
                      ) : (
                        <p className="muted-text">{todayItemClosedMessage(item)}</p>
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
          </ProgressiveDisclosure>
        </section>

        <section
          id="today-check-ins"
          className="panel panel-plan today-check-ins-panel"
          aria-labelledby="today-check-ins-heading"
        >
          {activeCrisisSupport?.shouldShowCrisisSupport && activeCrisisSupport.copy ? (
            <CrisisSupportPanel
              copy={activeCrisisSupport.copy}
              titleId="today-crisis-support-title"
            />
          ) : null}

          <p className="section-label">Check-ins</p>
          <h2 id="today-check-ins-heading">Recovery and wellbeing</h2>
          <p className="muted-text">
            Recovery and wellbeing snapshots for coaching — not medical assessments.
          </p>

          <ProgressiveDisclosure
            key={buildTodayDisclosureResetKey("check-ins", selectedDate, expandCheckIns)}
            className="today-check-ins-disclosure"
            summary="Wellbeing and recovery forms"
            defaultOpen={expandCheckIns}
          >
            <div className="today-check-ins-content">
              <WellbeingCheckInCard
                selectedDate={selectedDate}
                onCrisisSupportChange={setActiveCrisisSupport}
              />
              <RecoveryCheckInCard selectedDate={selectedDate} />
            </div>
          </ProgressiveDisclosure>
        </section>

        <section
          id="today-details"
          className="panel panel-secondary panel-wide today-details-panel"
          aria-labelledby="today-details-heading"
        >
          <p className="section-label">Details</p>
          <h2 id="today-details-heading">Reflection and recent history</h2>

          <ProgressiveDisclosure
            key={buildTodayDisclosureResetKey("details", selectedDate, expandDetails)}
            className="today-details-disclosure"
            summary="Daily reflection and history"
            defaultOpen={expandDetails}
          >
            <div className="today-details-content">
              <div
                id="today-reflection"
                className="today-feedback-panel"
                aria-labelledby="today-reflection-heading"
              >
                <p className="section-label">Daily reflection</p>
                <h3 id="today-reflection-heading">How did today go?</h3>
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
              </div>

              <div
                id="today-history"
                className="training-history-panel"
                aria-labelledby="today-history-heading"
              >
                <p className="section-label">Recent days</p>
                <h3 id="today-history-heading">Past 7 days</h3>

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
                          <StatusBadge className="badge badge-info">
                            {formatHistoryTaskCountBadge(entry)}
                          </StatusBadge>
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
              </div>
            </div>
          </ProgressiveDisclosure>
        </section>
      </div>
    </CommandCenterLayout>
  );
}
