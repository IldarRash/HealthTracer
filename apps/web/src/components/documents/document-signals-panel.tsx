"use client";

import { useAuth } from "@clerk/nextjs";
import type { DocumentSignal, HealthDocumentDetail } from "@health/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  apiQueryKeys,
  extractDocumentSignals,
  getDocumentsRefreshQueryKeys,
  listDocumentSignals,
  reviewDocumentSignal,
} from "../../lib/api";
import {
  canExtractDocumentSignals,
  canReviewDocumentSignal,
  formatDocumentTimestamp,
  formatSignalConfidence,
  isDocumentRevoked,
  isSignalLowConfidence,
  partitionDocumentSignals,
  signalExtractionBadgeTone,
  signalExtractionStatusLabel,
  signalReviewStatusBadgeTone,
  signalReviewStatusLabel,
} from "../../lib/documents-ui-state";
import { Badge, Button, EmptyState, ErrorState, LoadingState } from "../ui";

type DocumentSignalsPanelProps = {
  detail: HealthDocumentDetail;
  onActionError: (message: string | null) => void;
};

export function DocumentSignalsPanel({
  detail,
  onActionError,
}: DocumentSignalsPanelProps) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const revoked = isDocumentRevoked(detail);
  const canExtract = canExtractDocumentSignals(detail);

  const signalsQuery = useQuery({
    queryKey: apiQueryKeys.documentSignals(detail.id),
    enabled: !revoked && detail.signalExtractionStatus !== "not_started",
    queryFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await listDocumentSignals(token, detail.id);
      if (result.error || !result.data) {
        throw new Error(result.error ?? "Document signals could not be loaded.");
      }

      return result.data;
    },
  });

  const invalidateSignals = async () => {
    for (const queryKey of getDocumentsRefreshQueryKeys()) {
      await queryClient.invalidateQueries({ queryKey });
    }
    await queryClient.invalidateQueries({ queryKey: apiQueryKeys.documentDetail(detail.id) });
    await queryClient.invalidateQueries({ queryKey: apiQueryKeys.documentSignals(detail.id) });
  };

  const extractMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await extractDocumentSignals(token, detail.id);
      if (result.error || !result.data) {
        throw new Error(result.error ?? "Signal extraction failed.");
      }

      return result.data;
    },
    onMutate: () => {
      onActionError(null);
    },
    onSuccess: async () => {
      await invalidateSignals();
    },
    onError: (error) => {
      onActionError(error instanceof Error ? error.message : "Signal extraction failed.");
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async (input: {
      signalId: string;
      reviewStatus: "approved" | "rejected" | "ignored";
    }) => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await reviewDocumentSignal(token, detail.id, input.signalId, {
        reviewStatus: input.reviewStatus,
        ignoredReason:
          input.reviewStatus === "ignored"
            ? "Excluded from coaching context by user."
            : undefined,
      });

      if (result.error || !result.data) {
        throw new Error(result.error ?? "Signal review failed.");
      }

      return result.data;
    },
    onMutate: () => {
      onActionError(null);
    },
    onSuccess: async () => {
      await invalidateSignals();
    },
    onError: (error) => {
      onActionError(error instanceof Error ? error.message : "Signal review failed.");
    },
  });

  const extractionStatus = detail.signalExtractionStatus;
  const isExtracting = extractionStatus === "processing" || extractMutation.isPending;
  const signalResponse = signalsQuery.data;
  const signals = signalResponse?.signals ?? [];
  const partitioned = partitionDocumentSignals(signals);

  return (
    <article className="card card-flat documents-signals-card">
      <div className="documents-detail-header">
        <div>
          <h4>Wellness signal extraction</h4>
          <p className="muted-text">
            Structured fields extracted for coaching context. Values are not medical
            interpretations—review before approving.
          </p>
        </div>
        <Badge tone={signalExtractionBadgeTone(extractionStatus)}>
          {signalExtractionStatusLabel(extractionStatus)}
        </Badge>
      </div>

      <p className="notice notice-inline">
        Approved signals may inform wellness coaching patterns. They do not diagnose conditions
        or recommend treatment. Discuss clinical details with a qualified professional.
      </p>

      {revoked || extractionStatus === "revoked" ? (
        <p className="muted-text" role="status">
          Signal extraction is stopped for this revoked document. Previously approved signals are
          excluded from future coaching context.
        </p>
      ) : null}

      {!revoked && extractionStatus === "not_started" ? (
        <div className="documents-signals-empty">
          {canExtract ? (
            <>
              <p className="muted-text">
                Extract allowlisted wellness-relevant fields from this document. Only fields you
                approve can be used for coaching context.
              </p>
              <Button
                type="button"
                onClick={() => extractMutation.mutate()}
                disabled={isExtracting}
              >
                {isExtracting ? "Extracting signals…" : "Extract wellness signals"}
              </Button>
            </>
          ) : (
            <p className="muted-text">
              Enable parse and coach chat context consent to extract wellness signals from this
              document.
            </p>
          )}
        </div>
      ) : null}

      {!revoked && extractionStatus === "failed" ? (
        <div className="notice notice-inline" role="alert">
          {detail.signalExtractionFailureReason ??
            "Signal extraction failed. You can retry after checking the document text."}
          {canExtract ? (
            <div className="action-row documents-signals-retry">
              <Button
                type="button"
                variant="secondary"
                onClick={() => extractMutation.mutate()}
                disabled={isExtracting}
              >
                {isExtracting ? "Retrying…" : "Retry extraction"}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {isExtracting && extractionStatus !== "not_started" ? (
        <LoadingState title="Extracting wellness signals…" />
      ) : null}

      {!revoked &&
      extractionStatus !== "not_started" &&
      !isExtracting &&
      signalsQuery.isLoading ? (
        <LoadingState title="Loading extracted signals…" />
      ) : null}

      {!revoked && signalsQuery.isError ? (
        <ErrorState
          title="Signals unavailable"
          description={
            signalsQuery.error instanceof Error
              ? signalsQuery.error.message
              : "Extracted signals could not be loaded."
          }
        />
      ) : null}

      {!revoked &&
      extractionStatus === "ready" &&
      !signalsQuery.isLoading &&
      !signalsQuery.isError ? (
        <>
          {signalResponse?.extractedAt ? (
            <p className="muted-text">
              Last extracted {formatDocumentTimestamp(signalResponse.extractedAt)}
            </p>
          ) : null}

          {signalResponse?.ignoredContentExplanation ? (
            <div className="notice notice-inline" role="status">
              {signalResponse.ignoredContentExplanation}
            </div>
          ) : null}

          {signals.length === 0 ? (
            <EmptyState
              title="No allowlisted signals found"
              description="Only wellness-relevant allowlisted fields appear here. Raw document text stays outside coaching context."
            />
          ) : (
            <>
              {partitioned.pending.length > 0 ? (
                <SignalGroup
                  title="Pending your review"
                  description="Approve signals you want used in coaching context, or ignore ones that are not relevant."
                  signals={partitioned.pending}
                  detail={detail}
                  reviewPending={reviewMutation.isPending}
                  onApprove={(signalId) =>
                    reviewMutation.mutate({ signalId, reviewStatus: "approved" })
                  }
                  onIgnore={(signalId) =>
                    reviewMutation.mutate({ signalId, reviewStatus: "ignored" })
                  }
                />
              ) : null}

              {partitioned.approved.length > 0 ? (
                <SignalGroup
                  title="Approved for coaching"
                  description="These signals may appear in correlation previews and coaching proposals with source references."
                  signals={partitioned.approved}
                  detail={detail}
                  reviewPending={false}
                />
              ) : null}

              {partitioned.hidden.length > 0 ? (
                <SignalGroup
                  title="Ignored or rejected"
                  description="These signals are excluded from coaching context and correlation previews."
                  signals={partitioned.hidden}
                  detail={detail}
                  reviewPending={false}
                />
              ) : null}
            </>
          )}

          {canExtract ? (
            <div className="action-row documents-signals-retry">
              <Button
                type="button"
                variant="secondary"
                onClick={() => extractMutation.mutate()}
                disabled={isExtracting || reviewMutation.isPending}
              >
                Re-extract signals
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
    </article>
  );
}

type SignalGroupProps = {
  title: string;
  description: string;
  signals: DocumentSignal[];
  detail: HealthDocumentDetail;
  reviewPending: boolean;
  onApprove?: (signalId: string) => void;
  onIgnore?: (signalId: string) => void;
};

function SignalGroup({
  title,
  description,
  signals,
  detail,
  reviewPending,
  onApprove,
  onIgnore,
}: SignalGroupProps) {
  return (
    <section className="documents-signal-group">
      <h5>{title}</h5>
      <p className="muted-text">{description}</p>
      <ul className="documents-signal-list">
        {signals.map((signal) => (
          <li key={signal.id} className="nested-card documents-signal-item">
            <DocumentSignalItem
              signal={signal}
              detail={detail}
              reviewPending={reviewPending}
              onApprove={onApprove ? () => onApprove(signal.id) : undefined}
              onIgnore={onIgnore ? () => onIgnore(signal.id) : undefined}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

type DocumentSignalItemProps = {
  signal: DocumentSignal;
  detail: HealthDocumentDetail;
  reviewPending: boolean;
  onApprove?: () => void;
  onIgnore?: () => void;
};

function DocumentSignalItem({
  signal,
  detail,
  reviewPending,
  onApprove,
  onIgnore,
}: DocumentSignalItemProps) {
  const canReview = canReviewDocumentSignal(detail, signal);
  const lowConfidence = isSignalLowConfidence(signal);

  return (
    <>
      <div className="documents-signal-item-header">
        <strong>{signal.displayLabel}</strong>
        <Badge tone={signalReviewStatusBadgeTone(signal.reviewStatus)}>
          {signalReviewStatusLabel(signal.reviewStatus)}
        </Badge>
      </div>

      <dl className="training-meta documents-signal-meta">
        <dt>Value</dt>
        <dd>
          {signal.valueText} {signal.unit}
        </dd>
        <dt>Source section</dt>
        <dd>{signal.sourceSection}</dd>
        {signal.observedAt ? (
          <>
            <dt>Observed date</dt>
            <dd>{signal.observedAt}</dd>
          </>
        ) : null}
        <dt>Confidence</dt>
        <dd>{formatSignalConfidence(signal.confidenceScore)}</dd>
        {signal.referenceRangeText ? (
          <>
            <dt>Reference text from document</dt>
            <dd>{signal.referenceRangeText}</dd>
          </>
        ) : null}
      </dl>

      {lowConfidence ? (
        <p className="muted-text">
          Lower confidence extraction — approve only if the value looks correct to you.
        </p>
      ) : null}

      {signal.ignoredReason ? (
        <p className="muted-text">Ignored: {signal.ignoredReason}</p>
      ) : null}

      {canReview && onApprove && onIgnore ? (
        <div className="action-row">
          <Button type="button" onClick={onApprove} disabled={reviewPending}>
            Approve for coaching
          </Button>
          <Button type="button" variant="secondary" onClick={onIgnore} disabled={reviewPending}>
            Ignore signal
          </Button>
        </div>
      ) : null}
    </>
  );
}
