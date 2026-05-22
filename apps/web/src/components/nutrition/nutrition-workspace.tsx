"use client";

import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  apiQueryKeys,
  getActiveNutritionPlan,
  listNutritionRevisions,
} from "../../lib/api";
import { EmptyState, ErrorState, LoadingState } from "../ui";

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function NutritionWorkspace() {
  const { getToken } = useAuth();

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
      <EmptyState
        title="No active nutrition plan yet"
        description="Accept a nutrition proposal in Chat to create your first plan revision."
        action={
          <Link href="/chat" className="confirmation-card__link">
            Open Chat →
          </Link>
        }
      />
    );
  }

  return (
    <div className="training-workspace">
      <div className="training-layout">
        <section className="panel panel-prominent training-plan-panel">
          <p className="section-label">Active revision</p>
          <h2>{payload.title}</h2>
          <p>{payload.summary}</p>

          <dl className="training-meta">
            <dt>Revision</dt>
            <dd>#{activeRevision.revisionNumber}</dd>
            <dt>Updated</dt>
            <dd>{formatTimestamp(activeRevision.createdAt)}</dd>
            <dt>Why this revision</dt>
            <dd>{activeRevision.reason}</dd>
            {payload.caloriesPerDay != null ? (
              <>
                <dt>Daily calories</dt>
                <dd>{payload.caloriesPerDay}</dd>
              </>
            ) : null}
            {payload.proteinGrams != null ? (
              <>
                <dt>Protein (g)</dt>
                <dd>{payload.proteinGrams}</dd>
              </>
            ) : null}
            {payload.hydrationLiters != null ? (
              <>
                <dt>Hydration (L)</dt>
                <dd>{payload.hydrationLiters}</dd>
              </>
            ) : null}
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
        </section>

        <section className="panel panel-secondary panel-wide training-history-panel">
          <p className="section-label">Past revisions</p>
          <h2>Revision history</h2>
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
