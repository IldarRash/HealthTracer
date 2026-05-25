"use client";

import { useAuth } from "@clerk/nextjs";
import type { WellnessCorrelationInsight } from "@health/types";
import { useQuery } from "@tanstack/react-query";
import { apiQueryKeys, previewCorrelationInsights } from "../../lib/api";
import {
  coachingDomainLabel,
  correlationConfidenceLabel,
  correlationDataStatusLabel,
  evidenceRefTypeLabel,
  formatDocumentTimestamp,
} from "../../lib/documents-ui-state";
import { Badge, EmptyState, ErrorState, LoadingState } from "../ui";

export function CorrelationPreviewSection() {
  const { getToken } = useAuth();

  const previewQuery = useQuery({
    queryKey: apiQueryKeys.correlationPreview,
    queryFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await previewCorrelationInsights(token);
      if (result.error || !result.data) {
        throw new Error(result.error ?? "Correlation preview could not be loaded.");
      }

      return result.data;
    },
  });

  return (
    <section className="panel panel-secondary panel-wide documents-correlation-section">
      <p className="section-label">Coaching pattern preview</p>
      <h2>Wellness correlations</h2>
      <p className="muted-text">
        Bounded coaching patterns from approved document signals, metrics, and progress summaries.
        These are wellness observations—not diagnoses or medical conclusions.
      </p>

      <div aria-live="polite" aria-busy={previewQuery.isFetching}>
        {previewQuery.isLoading ? (
          <LoadingState title="Loading coaching pattern preview…" />
        ) : previewQuery.isError ? (
          <ErrorState
            title="Preview unavailable"
            description={
              previewQuery.error instanceof Error
                ? previewQuery.error.message
                : "Coaching pattern preview could not be loaded."
            }
          />
        ) : previewQuery.data ? (
          <CorrelationPreviewContent preview={previewQuery.data} />
        ) : null}
      </div>
    </section>
  );
}

type CorrelationPreviewContentProps = {
  preview: {
    insights: WellnessCorrelationInsight[];
    generatedAt: string;
    dataStatus: "sufficient" | "partial" | "insufficient";
  };
};

function CorrelationPreviewContent({ preview }: CorrelationPreviewContentProps) {
  return (
    <>
      <p className="muted-text">
        {correlationDataStatusLabel(preview.dataStatus)} · generated{" "}
        {formatDocumentTimestamp(preview.generatedAt)}
      </p>

      {preview.insights.length === 0 ? (
        <EmptyState
          title={
            preview.dataStatus === "insufficient"
              ? "Not enough approved data yet"
              : "No coaching patterns detected yet"
          }
          description={
            preview.dataStatus === "insufficient"
              ? "Upload a lab document, approve extracted signals, and sync metrics to unlock correlation previews."
              : "Approved signals and recent metrics have not produced a wellness-safe pattern yet. Check back after more check-ins."
          }
        />
      ) : (
        <ul className="documents-correlation-list">
          {preview.insights.map((insight) => (
            <li key={insight.id} className="nested-card documents-correlation-card">
              <CorrelationInsightCard insight={insight} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function CorrelationInsightCard({ insight }: { insight: WellnessCorrelationInsight }) {
  return (
    <>
      <div className="documents-correlation-card-header">
        <div>
          <Badge tone="info">{coachingDomainLabel(insight.coachingDomain)}</Badge>
          <h3>{insight.headline}</h3>
        </div>
        <Badge tone="neutral">{correlationConfidenceLabel(insight.confidence)}</Badge>
      </div>
      <p>{insight.summary}</p>
      <div className="documents-evidence-list">
        <p className="section-label">Evidence references</p>
        <ul>
          {insight.evidenceRefs.map((ref) => (
            <li key={`${ref.type}-${ref.id}`}>
              <span className="documents-evidence-type">{evidenceRefTypeLabel(ref.type)}</span>
              <span>{ref.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
