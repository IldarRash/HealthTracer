"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import {
  apiQueryKeys,
  getActiveWorkoutPlan,
  listWorkoutRevisions,
} from "../../lib/api";
import {
  buildTrainingWeekStripView,
  formatLocalIsoDate,
  getWorkoutPlanDayKey,
  getWorkoutPlanDayLabel,
  hasActiveWorkoutPlan,
} from "../../lib/training-ui-state";
import { TrainingPlanExerciseItem } from "./training-plan-exercise-item";
import {
  formatPlanRevisionSource,
  formatPlanRevisionTimestamp,
  formatRevisionHistoryMeta,
} from "../../lib/plan-view-ui-state";
import {
  ChangeViaChatNotice,
  EmptyState,
  ErrorState,
  LoadingState,
  PlanDetailCard,
  PlanDetailCardHeader,
  PlanDetailList,
  PlanExecutionCallout,
  PlanFacts,
  PlanHeader,
  PlanSection,
  PlanViewCtaLink,
  PlanViewGrid,
  PlanViewLayout,
  PlanViewPanel,
  PlanWeekStrip,
  RevisionHistoryCollapsible,
  RevisionHistoryItem,
  RevisionHistoryList,
} from "../ui";
import { TrainingProgressPanel } from "./training-progress-panel";

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
  const sessions = active?.sessions ?? [];
  const showPlan = active ? hasActiveWorkoutPlan(active) : false;
  const todayLabel = formatLocalIsoDate(new Date());
  const weekStrip = buildTrainingWeekStripView(sessions);

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
      <PlanViewLayout>
        <EmptyState
          title="No active workout plan yet"
          description="Accept a workout proposal in Chat to create your first plan revision. Training updates only after you approve a change."
          action={
            <PlanViewCtaLink href="/chat" variant="primary">
              Open Chat →
            </PlanViewCtaLink>
          }
        />
        <section id="progress" className="training-progress-section" aria-label="Weekly progress">
          <TrainingProgressPanel />
        </section>
      </PlanViewLayout>
    );
  }

  return (
    <PlanViewLayout>
      <ChangeViaChatNotice />

      <PlanViewGrid>
        <PlanViewPanel variant="prominent">
          <PlanHeader
            label="Active plan"
            title={payload.title}
            summary={payload.summary}
            revisionNumber={activeRevision.revisionNumber}
            weekStrip={
              <PlanWeekStrip
                title="This week"
                dayLabels={weekStrip.dayLabels}
                trend={weekStrip.trend}
                sparse={weekStrip.sparse}
                ariaLabel={weekStrip.ariaLabel}
              />
            }
          />

          <PlanExecutionCallout
            label="Daily execution"
            title="Run workouts from Today"
            description={`Your day-by-day program lives here. Start and log each workout from the Today screen for ${todayLabel} and any other date.`}
            action={
              <PlanViewCtaLink href="/today">Open Today →</PlanViewCtaLink>
            }
          />

          <PlanFacts
            items={[
              { term: "Revision", description: `#${activeRevision.revisionNumber}` },
              { term: "Source", description: formatPlanRevisionSource(activeRevision.source) },
              {
                term: "Updated",
                description: formatPlanRevisionTimestamp(activeRevision.createdAt),
              },
              { term: "Why this revision", description: activeRevision.reason },
            ]}
          />

          {payload.notes.length > 0 ? (
            <PlanSection title="Coach notes">
              <ul>
                {payload.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </PlanSection>
          ) : null}

          <PlanSection title="Training days">
            <PlanDetailList>
              {payload.days.map((day) => (
                <PlanDetailCard key={getWorkoutPlanDayKey(day)} className="training-day-card">
                  <PlanDetailCardHeader
                    title={getWorkoutPlanDayLabel(day)}
                    meta={day.focus}
                  />
                  {day.exercises.length > 0 ? (
                    <ul className="training-exercise-list">
                      {day.exercises.map((exercise, index) => (
                        <TrainingPlanExerciseItem
                          key={getWorkoutPlanDayKey(day, index)}
                          exercise={exercise}
                        />
                      ))}
                    </ul>
                  ) : (
                    <p className="muted-text">No exercises listed for this day.</p>
                  )}
                </PlanDetailCard>
              ))}
            </PlanDetailList>
          </PlanSection>
        </PlanViewPanel>

        <PlanViewPanel
          label="Revision context"
          title="Revision history"
          titleId="training-revision-history"
          intro="Earlier revisions stay on record. Workouts you log in Today stay tied to the revision that was active when you ran them."
        >
          <RevisionHistoryCollapsible
            count={revisions.length}
            activeRevisionNumber={activeRevision.revisionNumber}
            emptyState={<p className="muted-text">No earlier revisions yet.</p>}
          >
            <RevisionHistoryList>
              {revisions.map((revision) => (
                <RevisionHistoryItem
                  key={revision.id}
                  revisionNumber={revision.revisionNumber}
                  title={revision.payload.title}
                  reason={revision.reason}
                  meta={formatRevisionHistoryMeta(revision.source, revision.createdAt)}
                  active={revision.id === activeRevision.id}
                />
              ))}
            </RevisionHistoryList>
          </RevisionHistoryCollapsible>
        </PlanViewPanel>
      </PlanViewGrid>

      <section id="progress" className="training-progress-section" aria-label="Weekly progress">
        <TrainingProgressPanel />
      </section>
    </PlanViewLayout>
  );
}
