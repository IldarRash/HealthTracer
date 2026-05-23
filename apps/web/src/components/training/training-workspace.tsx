"use client";

import { useAuth } from "@clerk/nextjs";
import type { WorkoutSession } from "@health/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  apiQueryKeys,
  completeWorkoutSession,
  getActiveWorkoutPlan,
  listWorkoutRevisions,
  scheduleWorkoutSession,
} from "../../lib/api";
import {
  buildSessionTitleFromDay,
  canCompleteSession,
  canSubmitScheduleForm,
  formatExerciseLabel,
  formatLocalIsoDate,
  getSessionRevisionNote,
  hasActiveWorkoutPlan,
  isTerminalSessionStatus,
  sessionStatusLabel,
  sortSessionsByPlannedDate,
} from "../../lib/training-ui-state";
import { EmptyState, ErrorState, LoadingState } from "../ui";

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

function sessionBadgeClass(status: WorkoutSession["status"]): string {
  return `badge badge-session-${status}`;
}

function sessionCardClass(status: WorkoutSession["status"]): string {
  return `training-session-card nested-card training-session-card--${status}`;
}

export function TrainingWorkspace() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [feedbackNotes, setFeedbackNotes] = useState<Record<string, string>>({});
  const [plannedDate, setPlannedDate] = useState(() => formatLocalIsoDate(new Date()));
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);

  const activePlanQuery = useQuery({
    queryKey: apiQueryKeys.workoutActive,
    queryFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await getActiveWorkoutPlan(token);
      if (result.error) {
        throw new Error(result.error);
      }

      return result.data ?? { plan: null, activeRevision: null, sessions: [] };
    },
  });

  const revisionsQuery = useQuery({
    queryKey: apiQueryKeys.workoutRevisions,
    queryFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await listWorkoutRevisions(token);
      if (result.error) {
        throw new Error(result.error);
      }

      return result.data ?? [];
    },
  });

  const invalidateAfterSessionChange = () => {
    void queryClient.invalidateQueries({ queryKey: apiQueryKeys.workoutActive });
    void queryClient.invalidateQueries({ queryKey: apiQueryKeys.workoutRevisions });
    void queryClient.invalidateQueries({ queryKey: apiQueryKeys.todayDayPrefix });
    void queryClient.invalidateQueries({ queryKey: apiQueryKeys.todayHistoryPrefix });
  };

  const scheduleSessionMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const revision = activePlanQuery.data?.activeRevision;
      const planPayload = revision?.payload;
      if (!revision || !planPayload) {
        throw new Error("Active workout revision is unavailable.");
      }

      const day = planPayload.days[selectedDayIndex];
      if (!day) {
        throw new Error("Select a training day from your active plan.");
      }

      const result = await scheduleWorkoutSession(token, {
        workoutPlanRevisionId: revision.id,
        plannedDate,
        title: buildSessionTitleFromDay(day),
        exercises: day.exercises,
      });

      if (result.error || !result.data) {
        throw new Error(result.error ?? "Session could not be scheduled.");
      }

      return result.data;
    },
    onSuccess: () => {
      setPlannedDate(formatLocalIsoDate(new Date()));
      invalidateAfterSessionChange();
    },
  });

  const completeSessionMutation = useMutation({
    mutationFn: async ({
      sessionId,
      status,
      notes,
    }: {
      sessionId: string;
      status: "completed" | "skipped";
      notes?: string;
    }) => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const trimmedNotes = notes?.trim();
      const result = await completeWorkoutSession(token, sessionId, {
        status,
        feedback: trimmedNotes ? { notes: trimmedNotes } : {},
      });

      if (result.error || !result.data) {
        throw new Error(result.error ?? "Session could not be updated.");
      }

      return result.data;
    },
    onSuccess: () => {
      invalidateAfterSessionChange();
    },
  });

  const active = activePlanQuery.data;
  const activeRevision = active?.activeRevision ?? null;
  const payload = activeRevision?.payload ?? null;
  const sessions = useMemo(
    () => sortSessionsByPlannedDate(active?.sessions ?? []),
    [active?.sessions],
  );
  const revisions = revisionsQuery.data ?? [];
  const showPlan = active ? hasActiveWorkoutPlan(active) : false;
  const selectedDay = payload?.days[selectedDayIndex] ?? null;
  const canSchedule =
    showPlan &&
    payload != null &&
    canSubmitScheduleForm({
      plannedDate,
      dayIndex: selectedDayIndex,
      daysCount: payload.days.length,
    });
  const isBusy =
    scheduleSessionMutation.isPending || completeSessionMutation.isPending;

  const handleSchedule = () => {
    if (!canSchedule || scheduleSessionMutation.isPending) {
      return;
    }

    scheduleSessionMutation.mutate();
  };

  const handleComplete = (sessionId: string, status: "completed" | "skipped") => {
    if (completeSessionMutation.isPending) {
      return;
    }

    completeSessionMutation.mutate({
      sessionId,
      status,
      notes: feedbackNotes[sessionId],
    });
  };

  if (activePlanQuery.isLoading || revisionsQuery.isLoading) {
    return <LoadingState title="Loading your training plan…" />;
  }

  if (activePlanQuery.isError) {
    return (
      <ErrorState
        title="Workout plan unavailable"
        description={
          activePlanQuery.error instanceof Error
            ? activePlanQuery.error.message
            : "Your active workout plan could not be loaded."
        }
      />
    );
  }

  if (revisionsQuery.isError) {
    return (
      <ErrorState
        title="Revision history unavailable"
        description={
          revisionsQuery.error instanceof Error
            ? revisionsQuery.error.message
            : "Revision history could not be loaded."
        }
      />
    );
  }

  if (!showPlan || !activeRevision || !payload) {
    return (
      <EmptyState
        title="No active workout plan yet"
        description="Accept a workout proposal in Chat to create your first plan revision. Training updates only after you approve a change."
        action={
          <Link href="/chat" className="confirmation-card__link">
            Open Chat →
          </Link>
        }
      />
    );
  }

  return (
    <div className="training-workspace" aria-busy={isBusy || undefined}>
      <div className="training-layout">
        <section className="panel panel-prominent training-sessions-panel">
          <p className="section-label">Today and upcoming</p>
          <h2>Your sessions</h2>

          <div className="training-schedule-form nested-card">
            <div className="training-schedule-intro">
              <p className="section-label">Schedule</p>
              <h3>Schedule a session</h3>
              <p className="muted-text">
                Choose a training day from revision #{activeRevision.revisionNumber} and
                add it to your calendar.
              </p>
            </div>

            <div className="training-schedule-fields">
              <div className="training-schedule-field">
                <label htmlFor="session-planned-date">Planned date</label>
                <input
                  id="session-planned-date"
                  className="training-schedule-input"
                  type="date"
                  value={plannedDate}
                  disabled={scheduleSessionMutation.isPending}
                  onChange={(event) => setPlannedDate(event.target.value)}
                />
              </div>

              <div className="training-schedule-field">
                <label htmlFor="session-training-day">Training day</label>
                <select
                  id="session-training-day"
                  className="training-schedule-input"
                  value={selectedDayIndex}
                  disabled={scheduleSessionMutation.isPending}
                  onChange={(event) => setSelectedDayIndex(Number(event.target.value))}
                >
                  {payload.days.map((day, index) => (
                    <option key={`${day.day}-${day.focus}`} value={index}>
                      {buildSessionTitleFromDay(day)}
                    </option>
                  ))}
                </select>
              </div>

              {selectedDay ? (
                <div className="training-schedule-preview" aria-live="polite">
                  <p className="section-label">Session preview</p>
                  <div className="training-schedule-preview-header">
                    <strong>{buildSessionTitleFromDay(selectedDay)}</strong>
                  </div>
                  {selectedDay.exercises.length > 0 ? (
                    <ul className="training-exercise-list training-schedule-preview-exercises">
                      {selectedDay.exercises.map((exercise, index) => (
                        <li key={`schedule-${selectedDayIndex}-${index}`}>
                          {formatExerciseLabel(exercise)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted-text training-schedule-preview-empty">
                      No exercises listed for this day.
                    </p>
                  )}
                </div>
              ) : null}
            </div>

            <div className="training-schedule-actions action-row proposal-actions">
              <button
                type="button"
                className="button button-primary"
                disabled={!canSchedule || scheduleSessionMutation.isPending}
                onClick={handleSchedule}
              >
                {scheduleSessionMutation.isPending ? "Scheduling…" : "Schedule session"}
              </button>
            </div>

            {scheduleSessionMutation.isError ? (
              <p className="form-error training-schedule-error" role="alert">
                {scheduleSessionMutation.error instanceof Error
                  ? scheduleSessionMutation.error.message
                  : "Session could not be scheduled."}
              </p>
            ) : null}
          </div>

          {sessions.length === 0 ? (
            <p className="muted-text">
              No sessions on the calendar yet. They appear here when scheduled against
              your active revision.
            </p>
          ) : (
            <ul className="training-session-list">
              {sessions.map((session) => {
                const revisionNote = getSessionRevisionNote({
                  session,
                  activeRevisionId: activeRevision.id,
                  revisions,
                });

                return (
                  <li key={session.id} className={sessionCardClass(session.status)}>
                    <div className="training-session-header">
                      <div>
                        <strong>{session.title}</strong>
                        <p className="muted-text">{formatDate(session.plannedDate)}</p>
                      </div>
                      <span className={sessionBadgeClass(session.status)}>
                        {sessionStatusLabel(session.status)}
                      </span>
                    </div>

                    {revisionNote ? (
                      <p className="muted-text training-session-revision-note">{revisionNote}</p>
                    ) : null}

                    {session.exercises.length > 0 ? (
                      <ul className="training-exercise-list">
                        {session.exercises.map((exercise, index) => (
                          <li key={`${session.id}-${index}`}>
                            {formatExerciseLabel(exercise)}
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    {session.feedback.notes ? (
                      <div className="training-feedback-callout">
                        <span className="training-feedback-label">Session note</span>
                        <p>{session.feedback.notes}</p>
                      </div>
                    ) : null}

                    {session.completedAt ? (
                      <p className="muted-text">
                        {isTerminalSessionStatus(session.status)
                          ? "Logged"
                          : "Updated"}{" "}
                        {formatTimestamp(session.completedAt)}
                      </p>
                    ) : null}

                    {isTerminalSessionStatus(session.status) ? (
                      <p className="muted-text">
                        This session is closed. It stays linked to the revision it was
                        scheduled from.
                      </p>
                    ) : null}

                    {canCompleteSession(session) ? (
                      <div className="training-session-actions">
                        <label className="sr-only" htmlFor={`session-notes-${session.id}`}>
                          Session notes
                        </label>
                        <textarea
                          id={`session-notes-${session.id}`}
                          rows={2}
                          className="form-textarea training-notes-input"
                          placeholder="Optional note (how it felt, adjustments you made)…"
                          value={feedbackNotes[session.id] ?? ""}
                          disabled={completeSessionMutation.isPending}
                          onChange={(event) =>
                            setFeedbackNotes((current) => ({
                              ...current,
                              [session.id]: event.target.value,
                            }))
                          }
                        />
                        <div className="action-row proposal-actions">
                          <button
                            type="button"
                            className="button button-primary"
                            disabled={completeSessionMutation.isPending}
                            onClick={() => handleComplete(session.id, "completed")}
                          >
                            {completeSessionMutation.isPending ? "Saving…" : "Mark complete"}
                          </button>
                          <button
                            type="button"
                            className="button button-secondary"
                            disabled={completeSessionMutation.isPending}
                            onClick={() => handleComplete(session.id, "skipped")}
                          >
                            Skip for now
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}

          {completeSessionMutation.isError ? (
            <p className="form-error" role="alert">
              {completeSessionMutation.error instanceof Error
                ? completeSessionMutation.error.message
                : "Session could not be updated."}
            </p>
          ) : null}
        </section>

        <section className="panel panel-plan training-plan-panel">
          <p className="section-label">Active revision</p>
          <h2>{payload.title}</h2>
          <p>{payload.summary}</p>

          <dl className="training-meta">
            <dt>Revision</dt>
            <dd>#{activeRevision.revisionNumber}</dd>
            <dt>Source</dt>
            <dd>{activeRevision.source}</dd>
            <dt>Updated</dt>
            <dd>{formatTimestamp(activeRevision.createdAt)}</dd>
            <dt>Why this revision</dt>
            <dd>{activeRevision.reason}</dd>
          </dl>

          {payload.notes.length > 0 ? (
            <div className="training-notes">
              <h3>Coach notes</h3>
              <ul>
                {payload.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <h3>Training days</h3>
          <ul className="training-day-list">
            {payload.days.map((day) => (
              <li key={`${day.day}-${day.focus}`} className="training-day-card nested-card">
                <div className="training-day-header">
                  <strong>{day.day}</strong>
                  <span>{day.focus}</span>
                </div>
                {day.exercises.length > 0 ? (
                  <ul className="training-exercise-list">
                    {day.exercises.map((exercise, index) => (
                      <li key={`${day.day}-${index}`}>{formatExerciseLabel(exercise)}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted-text">No exercises listed for this day.</p>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className="panel panel-secondary panel-wide training-history-panel">
          <p className="section-label">Past revisions</p>
          <h2>Revision history</h2>
          <p className="muted-text">
            Earlier revisions stay on record. Sessions you already scheduled keep their
            original revision even after you adapt your plan.
          </p>
          {revisions.length === 0 ? (
            <p className="muted-text">No earlier revisions yet.</p>
          ) : (
            <ul className="training-revision-list">
              {revisions.map((revision) => (
                <li
                  key={revision.id}
                  className={
                    revision.id === activeRevision.id
                      ? "training-revision-card nested-card active"
                      : "training-revision-card nested-card"
                  }
                >
                  <div className="training-revision-header">
                    <strong>
                      #{revision.revisionNumber} · {revision.payload.title}
                    </strong>
                    {revision.id === activeRevision.id ? (
                      <span className="badge badge-valid">Active</span>
                    ) : null}
                  </div>
                  <p className="muted-text">{revision.reason}</p>
                  <p className="muted-text">
                    {revision.source} · {formatTimestamp(revision.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
