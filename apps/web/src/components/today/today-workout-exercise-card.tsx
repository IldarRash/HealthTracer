"use client";

import type { WorkoutSessionExercise } from "@health/types";
import { useEffect, useState } from "react";
import {
  buildExerciseExecutionUpdatePayload,
  canSubmitExerciseExecutionUpdate,
  exerciseFeedbackToFormState,
  formatExerciseFeedbackSummary,
  resolveSessionExerciseCatalogMetadata,
  type ExerciseFeedbackFormState,
} from "../../lib/exercise-catalog-ui-state";
import {
  canUpdateSessionExercise,
  formatSessionExerciseDetailLines,
  formatSessionExercisePrescription,
  sessionExerciseStatusBadgeClass,
  sessionExerciseStatusLabel,
} from "../../lib/training-ui-state";
import { DetailLineList, ExerciseCatalogDetails, StatusBadge } from "../ui";

type TodayWorkoutExerciseCardProps = {
  exercise: WorkoutSessionExercise;
  disabled: boolean;
  isUpdating: boolean;
  onStatusChange: (
    exerciseId: string,
    status: "completed" | "skipped" | "adjusted",
    form: ExerciseFeedbackFormState,
  ) => void;
};

function updateFeedbackField<K extends keyof ExerciseFeedbackFormState>(
  current: ExerciseFeedbackFormState,
  key: K,
  value: ExerciseFeedbackFormState[K],
): ExerciseFeedbackFormState {
  return { ...current, [key]: value };
}

export function TodayWorkoutExerciseCard({
  exercise,
  disabled,
  isUpdating,
  onStatusChange,
}: TodayWorkoutExerciseCardProps) {
  const [feedbackForm, setFeedbackForm] = useState(() =>
    exerciseFeedbackToFormState(exercise.execution),
  );
  const catalog = resolveSessionExerciseCatalogMetadata(exercise);
  const detailLines = formatSessionExerciseDetailLines(exercise);
  const executionSummary = formatExerciseFeedbackSummary(exercise.execution);
  const canUpdate = canUpdateSessionExercise(exercise);
  const cardStatus =
    exercise.execution.status === "adjusted" ? "planned" : exercise.execution.status;

  useEffect(() => {
    setFeedbackForm(exerciseFeedbackToFormState(exercise.execution));
  }, [exercise]);

  const handleStatus = (status: "completed" | "skipped" | "adjusted") => {
    if (
      !canSubmitExerciseExecutionUpdate({
        form: feedbackForm,
        status,
      })
    ) {
      return;
    }

    onStatusChange(exercise.id, status, feedbackForm);
  };

  return (
    <li
      className={`today-workout-exercise nested-card training-session-card--${cardStatus}`}
    >
      <div className="today-workout-exercise-header">
        <strong>{formatSessionExercisePrescription(exercise)}</strong>
        <StatusBadge
          className={sessionExerciseStatusBadgeClass(exercise.execution.status)}
          aria-label={`Exercise status: ${sessionExerciseStatusLabel(exercise.execution.status)}`}
        >
          {sessionExerciseStatusLabel(exercise.execution.status)}
        </StatusBadge>
      </div>

      <ExerciseCatalogDetails catalog={catalog} className="today-workout-exercise-catalog" />

      <DetailLineList lines={detailLines} className="today-workout-exercise-details" />

      {canUpdate ? (
        <fieldset className="today-workout-exercise-feedback" disabled={disabled || isUpdating}>
          <legend className="section-label">Session feedback</legend>
          <p className="muted-text">
            Optional coaching signals for this exercise — not a medical assessment.
          </p>

          <div className="training-schedule-fields">
            <div className="training-schedule-field">
              <label htmlFor={`exercise-effort-${exercise.id}`}>Perceived effort (1–10)</label>
              <input
                id={`exercise-effort-${exercise.id}`}
                className="training-schedule-input"
                type="number"
                min={1}
                max={10}
                inputMode="numeric"
                placeholder="Optional"
                value={feedbackForm.perceivedEffort}
                disabled={disabled || isUpdating}
                onChange={(event) =>
                  setFeedbackForm((current) =>
                    updateFeedbackField(current, "perceivedEffort", event.target.value),
                  )
                }
              />
            </div>

            <div className="training-schedule-field">
              <label htmlFor={`exercise-difficulty-${exercise.id}`}>
                Perceived difficulty (1–10)
              </label>
              <input
                id={`exercise-difficulty-${exercise.id}`}
                className="training-schedule-input"
                type="number"
                min={1}
                max={10}
                inputMode="numeric"
                placeholder="Optional"
                value={feedbackForm.perceivedDifficulty}
                disabled={disabled || isUpdating}
                onChange={(event) =>
                  setFeedbackForm((current) =>
                    updateFeedbackField(current, "perceivedDifficulty", event.target.value),
                  )
                }
              />
            </div>
          </div>

          <div className="training-schedule-field">
            <label htmlFor={`exercise-notes-${exercise.id}`}>Notes</label>
            <textarea
              id={`exercise-notes-${exercise.id}`}
              rows={2}
              className="form-textarea training-notes-input"
              placeholder="Form cues, pacing, or adjustments…"
              value={feedbackForm.notes}
              disabled={disabled || isUpdating}
              maxLength={500}
              onChange={(event) =>
                setFeedbackForm((current) =>
                  updateFeedbackField(current, "notes", event.target.value),
                )
              }
            />
          </div>

          <div className="training-schedule-fields">
            <div className="training-schedule-field">
              <label htmlFor={`exercise-reps-${exercise.id}`}>Actual reps</label>
              <input
                id={`exercise-reps-${exercise.id}`}
                className="training-schedule-input"
                type="text"
                placeholder="Optional"
                value={feedbackForm.actualReps}
                disabled={disabled || isUpdating}
                maxLength={80}
                onChange={(event) =>
                  setFeedbackForm((current) =>
                    updateFeedbackField(current, "actualReps", event.target.value),
                  )
                }
              />
            </div>

            <div className="training-schedule-field">
              <label htmlFor={`exercise-weight-${exercise.id}`}>Actual load (kg)</label>
              <input
                id={`exercise-weight-${exercise.id}`}
                className="training-schedule-input"
                type="number"
                min={0}
                step="0.5"
                inputMode="decimal"
                placeholder="Optional"
                value={feedbackForm.actualWeightKg}
                disabled={disabled || isUpdating}
                onChange={(event) =>
                  setFeedbackForm((current) =>
                    updateFeedbackField(current, "actualWeightKg", event.target.value),
                  )
                }
              />
            </div>
          </div>

          <div className="training-schedule-field">
            <label htmlFor={`exercise-adjustment-${exercise.id}`}>Load adjustment notes</label>
            <input
              id={`exercise-adjustment-${exercise.id}`}
              className="training-schedule-input"
              type="text"
              placeholder="Optional"
              value={feedbackForm.loadAdjustmentNotes}
              disabled={disabled || isUpdating}
              maxLength={240}
              onChange={(event) =>
                setFeedbackForm((current) =>
                  updateFeedbackField(current, "loadAdjustmentNotes", event.target.value),
                )
              }
            />
          </div>

          <label className="today-workout-discomfort-flag" htmlFor={`exercise-discomfort-${exercise.id}`}>
            <input
              id={`exercise-discomfort-${exercise.id}`}
              type="checkbox"
              checked={feedbackForm.discomfortFlag}
              disabled={disabled || isUpdating}
              onChange={(event) =>
                setFeedbackForm((current) =>
                  updateFeedbackField(current, "discomfortFlag", event.target.checked),
                )
              }
            />
            Noted discomfort during this exercise
          </label>

          <div className="action-row proposal-actions today-item-actions">
            <button
              type="button"
              className="button button-primary"
              disabled={disabled || isUpdating}
              aria-busy={isUpdating}
              onClick={() => handleStatus("completed")}
            >
              {isUpdating ? "Saving…" : "Complete"}
            </button>
            <button
              type="button"
              className="button button-secondary"
              disabled={disabled || isUpdating}
              aria-busy={isUpdating}
              onClick={() => handleStatus("skipped")}
            >
              Skip
            </button>
            <button
              type="button"
              className="button button-secondary"
              disabled={disabled || isUpdating}
              aria-busy={isUpdating}
              onClick={() => handleStatus("adjusted")}
            >
              Adjusted
            </button>
          </div>
        </fieldset>
      ) : (
        <>
          {executionSummary ? (
            <p className="muted-text today-workout-exercise-log">{executionSummary}</p>
          ) : (
            <p className="muted-text">Exercise logged for this session.</p>
          )}
        </>
      )}
    </li>
  );
}
