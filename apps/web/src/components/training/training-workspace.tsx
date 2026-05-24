"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  apiQueryKeys,
  getActiveWorkoutPlan,
  listWorkoutRevisions,
} from "../../lib/api";
import {
  formatExerciseLabel,
  formatLocalIsoDate,
  getWorkoutPlanDayKey,
  getWorkoutPlanDayLabel,
  hasActiveWorkoutPlan,
} from "../../lib/training-ui-state";
import { EmptyState, ErrorState, LoadingState } from "../ui";
import { TrainingProgressPanel } from "./training-progress-panel";

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function TrainingWorkspace() {
  const { getToken } = useAuth();

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

  const active = activePlanQuery.data;
  const activeRevision = active?.activeRevision ?? null;
  const payload = activeRevision?.payload ?? null;
  const revisions = revisionsQuery.data ?? [];
  const showPlan = active ? hasActiveWorkoutPlan(active) : false;
  const todayLabel = formatLocalIsoDate(new Date());

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
      <div className="training-workspace">
        <EmptyState
          title="No active workout plan yet"
          description="Accept a workout proposal in Chat to create your first plan revision. Training updates only after you approve a change."
          action={
            <Link href="/chat" className="confirmation-card__link">
              Open Chat →
            </Link>
          }
        />
        <section id="progress" className="training-progress-section" aria-label="Weekly progress">
          <TrainingProgressPanel />
        </section>
      </div>
    );
  }

  return (
    <div className="training-workspace">
      <div className="training-layout">
        <section className="panel panel-prominent training-plan-panel">
          <p className="section-label">Active program</p>
          <h2>{payload.title}</h2>
          <p>{payload.summary}</p>

          <div className="training-execution-callout nested-card">
            <p className="section-label">Daily execution</p>
            <h3>Run workouts from Today</h3>
            <p className="muted-text">
              Your day-by-day program lives here. Start and log each workout from the Today
              screen for {todayLabel} and any other date.
            </p>
            <Link href="/today" className="confirmation-card__link">
              Open Today →
            </Link>
          </div>

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
              <li key={getWorkoutPlanDayKey(day)} className="training-day-card nested-card">
                <div className="training-day-header">
                  <strong>{getWorkoutPlanDayLabel(day)}</strong>
                  <span>{day.focus}</span>
                </div>
                {day.exercises.length > 0 ? (
                  <ul className="training-exercise-list">
                    {day.exercises.map((exercise, index) => (
                      <li key={getWorkoutPlanDayKey(day, index)}>
                        {formatExerciseLabel(exercise)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted-text">No exercises listed for this day.</p>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className="panel panel-secondary training-history-panel">
          <p className="section-label">Revision context</p>
          <h2>Revision history</h2>
          <p className="muted-text">
            Earlier revisions stay on record. Workouts you log in Today stay tied to the
            revision that was active when you ran them.
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

      <section id="progress" className="training-progress-section" aria-label="Weekly progress">
        <TrainingProgressPanel />
      </section>
    </div>
  );
}
