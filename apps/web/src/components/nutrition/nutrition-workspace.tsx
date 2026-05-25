"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  apiQueryKeys,
  getActiveNutritionPlan,
  getTodayNutritionAdherence,
  listNutritionRevisions,
} from "../../lib/api";
import {
  buildAdherenceState,
  buildNutritionPlanAdherenceFacts,
  formatLocalIsoDate,
  summarizeNutritionTargets,
} from "../../lib/nutrition-ui-state";
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
  PlanExecutionCallout,
  PlanFacts,
  PlanHeader,
  PlanSection,
  PlanViewCtaLink,
  PlanViewGrid,
  PlanViewLayout,
  PlanViewPanel,
  RevisionHistoryCollapsible,
  RevisionHistoryItem,
  RevisionHistoryList,
} from "../ui";

function formatList(values: readonly string[], emptyLabel: string): string {
  return values.length > 0 ? values.join(", ") : emptyLabel;
}

export function NutritionWorkspace() {
  const { getToken } = useAuth();
  const today = useMemo(() => formatLocalIsoDate(new Date()), []);

  const activePlanQuery = useQuery({
    queryKey: apiQueryKeys.nutritionActive,
    queryFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await getActiveNutritionPlan(token);
      if (result.error) {
        throw new Error(result.error);
      }

      return result.data ?? { plan: null, activeRevision: null };
    },
  });

  const revisionsQuery = useQuery({
    queryKey: apiQueryKeys.nutritionRevisions,
    queryFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await listNutritionRevisions(token);
      if (result.error) {
        throw new Error(result.error);
      }

      return result.data ?? [];
    },
  });

  const adherenceQuery = useQuery({
    queryKey: apiQueryKeys.nutritionAdherenceToday,
    queryFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await getTodayNutritionAdherence(token);
      if (result.error) {
        throw new Error(result.error);
      }

      return result.data ?? { adherence: null };
    },
    enabled: Boolean(activePlanQuery.data?.activeRevision),
  });

  if (activePlanQuery.isLoading || revisionsQuery.isLoading) {
    return <LoadingState title="Loading your nutrition plan…" />;
  }

  if (activePlanQuery.isError) {
    return (
      <ErrorState
        title="Nutrition plan unavailable"
        description={
          activePlanQuery.error instanceof Error
            ? activePlanQuery.error.message
            : "Your nutrition plan could not be loaded."
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
            : "Nutrition revision history could not be loaded."
        }
      />
    );
  }

  const activeRevision = activePlanQuery.data?.activeRevision ?? null;
  const payload = activeRevision?.payload ?? null;
  const revisions = revisionsQuery.data ?? [];

  if (!activeRevision || !payload) {
    return (
      <PlanViewLayout>
        <EmptyState
          title="No active nutrition plan yet"
          description="Accept a nutrition proposal in Chat to create your first plan revision."
          action={
            <PlanViewCtaLink href="/chat" variant="primary">
              Open Chat →
            </PlanViewCtaLink>
          }
        />
      </PlanViewLayout>
    );
  }

  const adherenceRecord = adherenceQuery.data?.adherence ?? null;
  const adherenceDate = adherenceRecord?.date ?? today;
  const adherenceState = buildAdherenceState({
    date: adherenceDate,
    payload,
    record: adherenceRecord,
  });
  const targetSummary = summarizeNutritionTargets(payload);
  const adherenceFacts = buildNutritionPlanAdherenceFacts({ adherenceState, payload });

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
          />

          <PlanExecutionCallout
            label="Daily execution"
            title="Log meals and hydration on Today"
            description={`Meal check-ins, hydration, and target follow-through belong on the Today screen for ${adherenceDate} and any other date.`}
            action={
              <PlanViewCtaLink href="/today">Log on Today →</PlanViewCtaLink>
            }
          />

          <PlanFacts
            items={[
              { term: "Revision", description: `#${activeRevision.revisionNumber}` },
              {
                term: "Updated",
                description: formatPlanRevisionTimestamp(activeRevision.createdAt),
              },
              {
                term: "Source",
                description: formatPlanRevisionSource(activeRevision.source),
              },
              { term: "Why this revision", description: activeRevision.reason },
            ]}
          />

          {targetSummary.length > 0 ? (
            <PlanSection title="Daily targets">
              <ul>
                {targetSummary.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </PlanSection>
          ) : null}

          {payload.mealStructure.length > 0 ? (
            <PlanSection title="Meal structure">
              <ul>
                {payload.mealStructure.map((meal) => (
                  <li key={meal.label}>
                    <strong>{meal.label}</strong>
                    {meal.timingHint ? ` · ${meal.timingHint}` : null}
                  </li>
                ))}
              </ul>
            </PlanSection>
          ) : null}

          <PlanFacts
            items={[
              { term: "Preferences", description: formatList(payload.preferences, "None listed") },
              { term: "Restrictions", description: formatList(payload.restrictions, "None listed") },
              {
                term: "Allergies to note",
                description: formatList(payload.allergies, "None listed"),
              },
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
        </PlanViewPanel>

        <PlanViewPanel
          variant="wide"
          label="Today's follow-through"
          title="What you've logged today"
          titleId="nutrition-adherence-panel"
          intro={`Read-only summary for ${adherenceDate}. Update meals, hydration, and notes on Today.`}
        >
          {adherenceQuery.isLoading ? <p className="muted-text">Loading adherence…</p> : null}
          {adherenceQuery.isError ? (
            <p className="form-error" role="alert">
              {adherenceQuery.error instanceof Error
                ? adherenceQuery.error.message
                : "Today's adherence could not be loaded."}
            </p>
          ) : null}

          {!adherenceQuery.isLoading && !adherenceQuery.isError ? (
            <>
              {adherenceFacts.length > 0 ? (
                <PlanFacts items={adherenceFacts} />
              ) : (
                <p className="muted-text">No adherence logged for today yet.</p>
              )}

              <p>
                <PlanViewCtaLink href="/today">Log on Today →</PlanViewCtaLink>
              </p>
            </>
          ) : null}
        </PlanViewPanel>

        <PlanViewPanel
          label="Revision context"
          title="Revision history"
          titleId="nutrition-revision-history"
          intro="Earlier revisions stay on record. Logged meals and hydration stay tied to the revision that was active when you logged them."
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
    </PlanViewLayout>
  );
}
