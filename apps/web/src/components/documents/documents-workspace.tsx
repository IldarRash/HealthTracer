"use client";

import { useAuth } from "@clerk/nextjs";
import type { DocumentConsentScope, DocumentType, HealthDocument, HealthDocumentDetail } from "@health/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  apiQueryKeys,
  createDocument,
  deleteDocument,
  getDocument,
  listDocuments,
  parseDocument,
  reviewDocumentSummary,
  searchDocuments,
  updateDocumentConsent,
} from "../../lib/api";
import {
  buildDocumentConsentScopeItems,
  canParseDocument,
  canReviewSummary,
  canSearchDocuments,
  canSubmitDocumentUpload,
  DEFAULT_DOCUMENT_CONSENT_SCOPES,
  DOCUMENT_CONSENT_SCOPE_OPTIONS,
  DOCUMENT_CONSENT_VERSION,
  DOCUMENT_TYPE_OPTIONS,
  documentTypeLabel,
  formatDocumentTimestamp,
  isDocumentRevoked,
  parseStatusBadgeTone,
  parseStatusLabel,
  reviewStatusBadgeTone,
  reviewStatusLabel,
} from "../../lib/documents-ui-state";
import {
  Badge,
  Button,
  ConsentScopeList,
  EmptyState,
  ErrorState,
  LoadingState,
  PrivacyBoundaryNote,
  RevocationState,
} from "../ui";

function toggleConsentScope(
  scopes: readonly DocumentConsentScope[],
  scope: DocumentConsentScope,
): DocumentConsentScope[] {
  if (scope === "upload_storage") {
    return scopes.includes(scope)
      ? scopes.filter((item) => item !== scope)
      : [...scopes, scope];
  }

  if (scopes.includes(scope)) {
    return scopes.filter((item) => item !== scope);
  }

  return [...scopes, scope];
}

export function DocumentsWorkspace() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [documentType, setDocumentType] = useState<DocumentType>("other");
  const [sampleText, setSampleText] = useState("");
  const [consentScopes, setConsentScopes] = useState<DocumentConsentScope[]>([
    ...DEFAULT_DOCUMENT_CONSENT_SCOPES,
  ]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [submittedSearchQuery, setSubmittedSearchQuery] = useState("");
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const documentsQuery = useQuery({
    queryKey: apiQueryKeys.documents,
    queryFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await listDocuments(token);
      if (result.error) {
        throw new Error(result.error);
      }

      return result.data ?? [];
    },
  });

  const selectedDocumentIdResolved = useMemo(() => {
    const documents = documentsQuery.data ?? [];
    if (selectedDocumentId && documents.some((document) => document.id === selectedDocumentId)) {
      return selectedDocumentId;
    }

    return documents[0]?.id ?? null;
  }, [documentsQuery.data, selectedDocumentId]);

  const documentDetailQuery = useQuery({
    queryKey: selectedDocumentIdResolved
      ? apiQueryKeys.documentDetail(selectedDocumentIdResolved)
      : ["document-detail", "none"],
    enabled: selectedDocumentIdResolved !== null,
    queryFn: async () => {
      const token = await getToken();
      if (!token || !selectedDocumentIdResolved) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await getDocument(token, selectedDocumentIdResolved);
      if (result.error) {
        throw new Error(result.error);
      }

      if (!result.data) {
        throw new Error("Document details could not be loaded.");
      }

      return result.data;
    },
  });

  const searchQueryEnabled = canSearchDocuments(submittedSearchQuery);

  const searchResultsQuery = useQuery({
    queryKey: apiQueryKeys.documentSearch(submittedSearchQuery),
    enabled: searchQueryEnabled,
    queryFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await searchDocuments(token, submittedSearchQuery.trim());
      if (result.error) {
        throw new Error(result.error);
      }

      return result.data?.results ?? [];
    },
  });

  const invalidateDocuments = async (documentId?: string) => {
    await queryClient.invalidateQueries({ queryKey: apiQueryKeys.documents });
    if (documentId) {
      await queryClient.invalidateQueries({ queryKey: apiQueryKeys.documentDetail(documentId) });
    }
    if (submittedSearchQuery.trim()) {
      await queryClient.invalidateQueries({
        queryKey: apiQueryKeys.documentSearch(submittedSearchQuery),
      });
    }
  };

  const uploadMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await createDocument(token, {
        title: title.trim(),
        documentType,
        consentScopes: [...consentScopes],
        consentVersion: DOCUMENT_CONSENT_VERSION,
        mimeType: "text/plain",
        sampleText: sampleText.trim(),
      });

      if (result.error || !result.data) {
        throw new Error(result.error ?? "Document upload failed.");
      }

      return result.data;
    },
    onMutate: () => {
      setUploadError(null);
    },
    onSuccess: async (detail) => {
      setSelectedDocumentId(detail.id);
      await invalidateDocuments(detail.id);
    },
    onError: (error) => {
      setUploadError(error instanceof Error ? error.message : "Document upload failed.");
    },
  });

  const parseMutation = useMutation({
    mutationFn: async (documentId: string) => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await parseDocument(token, documentId);
      if (result.error || !result.data) {
        throw new Error(result.error ?? "Document processing failed.");
      }

      return result.data;
    },
    onMutate: () => {
      setActionError(null);
    },
    onSuccess: async (detail) => {
      await invalidateDocuments(detail.id);
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Document processing failed.");
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async (input: { documentId: string; reviewStatus: "approved" | "rejected" }) => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await reviewDocumentSummary(token, input.documentId, {
        reviewStatus: input.reviewStatus,
      });

      if (result.error || !result.data) {
        throw new Error(result.error ?? "Summary review failed.");
      }

      return result.data;
    },
    onMutate: () => {
      setActionError(null);
    },
    onSuccess: async (_summary, variables) => {
      await invalidateDocuments(variables.documentId);
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Summary review failed.");
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (documentId: string) => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await updateDocumentConsent(token, documentId, { revoke: true });
      if (result.error || !result.data) {
        throw new Error(result.error ?? "Consent revocation failed.");
      }

      return result.data;
    },
    onMutate: () => {
      setActionError(null);
      setConfirmRevokeId(null);
    },
    onSuccess: async (document) => {
      await invalidateDocuments(document.id);
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Consent revocation failed.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (documentId: string) => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await deleteDocument(token, documentId);
      if (result.error || !result.data) {
        throw new Error(result.error ?? "Document deletion failed.");
      }

      return result.data;
    },
    onMutate: () => {
      setActionError(null);
      setConfirmDeleteId(null);
    },
    onSuccess: async (document) => {
      if (selectedDocumentIdResolved === document.id) {
        setSelectedDocumentId(null);
      }
      await invalidateDocuments();
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Document deletion failed.");
    },
  });

  const canUpload = canSubmitDocumentUpload({ title, sampleText, consentScopes });
  const documents = documentsQuery.data ?? [];
  const selectedDetail = documentDetailQuery.data ?? null;
  const isDetailBusy =
    documentDetailQuery.isFetching ||
    parseMutation.isPending ||
    reviewMutation.isPending ||
    revokeMutation.isPending ||
    deleteMutation.isPending;

  if (documentsQuery.isLoading) {
    return <LoadingState title="Loading your documents…" />;
  }

  if (documentsQuery.isError) {
    return (
      <ErrorState
        title="Documents unavailable"
        description={
          documentsQuery.error instanceof Error
            ? documentsQuery.error.message
            : "Your documents could not be loaded."
        }
      />
    );
  }

  return (
    <div className="documents-workspace">
      <section className="notice">
        <p className="section-label">Consent-first handling</p>
        <h2>Health documents stay under your control</h2>
        <p>
          Uploads are used for wellness coaching context only. Summaries are cautious,
          non-diagnostic, and never apply plan changes automatically. Any coaching updates
          derived from document context appear as proposals you must review and accept.
        </p>
      </section>

      <PrivacyBoundaryNote title="Document privacy boundary">
        Raw document files are stored outside the database. The UI shows metadata, parse
        status, and reviewed summaries—not full document text. Revoking consent or deleting a
        document stops future search and coach context use for that source.
      </PrivacyBoundaryNote>

      <div className="documents-layout">
        <section className="panel panel-prominent">
          <p className="section-label">Document upload</p>
          <h2>Add document text</h2>
          <p className="muted-text">
            Paste text only when you want it stored for wellness coaching context. You can revoke
            consent or delete the document later.
          </p>

          <form
            className="documents-upload-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!canUpload || uploadMutation.isPending) {
                return;
              }
              uploadMutation.mutate();
            }}
          >
            <label className="form-field" htmlFor="document-title">
              Document title
              <input
                id="document-title"
                name="document-title"
                type="text"
                value={title}
                maxLength={160}
                onChange={(event) => setTitle(event.target.value)}
                autoComplete="off"
              />
              <span className="form-help">A short label you will recognize later.</span>
            </label>

            <label className="form-field" htmlFor="document-type">
              Document type
              <select
                id="document-type"
                name="document-type"
                value={documentType}
                onChange={(event) => setDocumentType(event.target.value as DocumentType)}
              >
                {DOCUMENT_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <fieldset className="form-field">
              <legend>Consent scopes</legend>
              <p className="form-help">
                Choose what this document may be used for. Upload storage is required.
              </p>
              <ul className="documents-consent-options">
                {DOCUMENT_CONSENT_SCOPE_OPTIONS.map((option) => {
                  const checked = consentScopes.includes(option.scope);
                  const inputId = `consent-${option.scope}`;

                  return (
                    <li key={option.scope}>
                      <label htmlFor={inputId}>
                        <input
                          id={inputId}
                          type="checkbox"
                          checked={checked}
                          disabled={option.required}
                          onChange={() =>
                            setConsentScopes(toggleConsentScope(consentScopes, option.scope))
                          }
                        />
                        <span>
                          <strong>{option.label}</strong>
                          {option.required ? " (required)" : null}
                          <span className="form-help">{option.description}</span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>

            <label className="form-field" htmlFor="document-sample-text">
              Document text
              <textarea
                id="document-sample-text"
                name="document-sample-text"
                rows={6}
                value={sampleText}
                maxLength={5000}
                onChange={(event) => setSampleText(event.target.value)}
              />
              <span className="form-help">
                Keep only the portions you consent to store and summarize for coaching context.
              </span>
            </label>

            {uploadError ? (
              <p className="form-error" role="alert">
                {uploadError}
              </p>
            ) : null}

            <div
              className="documents-status-region"
              aria-live="polite"
              aria-busy={uploadMutation.isPending}
            >
              {uploadMutation.isPending ? (
                <p className="muted-text">Uploading document…</p>
              ) : null}
            </div>

            <Button type="submit" disabled={!canUpload || uploadMutation.isPending}>
              Upload document
            </Button>
          </form>
        </section>

        <section className="panel panel-secondary panel-wide">
          <p className="section-label">Your documents</p>
          <h2>Status and review</h2>

          {documents.length === 0 ? (
            <EmptyState
              title="No documents yet"
              description="Upload document text with consent to start parsing, review, and approved-summary search."
            />
          ) : (
            <ul className="documents-list">
              {documents.map((document) => (
                <li key={document.id}>
                  <DocumentListItem
                    document={document}
                    selected={document.id === selectedDocumentIdResolved}
                    onSelect={() => setSelectedDocumentId(document.id)}
                  />
                </li>
              ))}
            </ul>
          )}

          {selectedDetail ? (
            <DocumentDetailPanel
              detail={selectedDetail}
              isBusy={isDetailBusy}
              actionError={actionError}
              confirmRevokeId={confirmRevokeId}
              confirmDeleteId={confirmDeleteId}
              onRequestRevoke={() => setConfirmRevokeId(selectedDetail.id)}
              onCancelRevoke={() => setConfirmRevokeId(null)}
              onRequestDelete={() => setConfirmDeleteId(selectedDetail.id)}
              onCancelDelete={() => setConfirmDeleteId(null)}
              onParse={() => parseMutation.mutate(selectedDetail.id)}
              onApproveSummary={() =>
                reviewMutation.mutate({ documentId: selectedDetail.id, reviewStatus: "approved" })
              }
              onRejectSummary={() =>
                reviewMutation.mutate({ documentId: selectedDetail.id, reviewStatus: "rejected" })
              }
              onConfirmRevoke={() => revokeMutation.mutate(selectedDetail.id)}
              onConfirmDelete={() => deleteMutation.mutate(selectedDetail.id)}
              parsePending={parseMutation.isPending}
              reviewPending={reviewMutation.isPending}
              revokePending={revokeMutation.isPending}
              deletePending={deleteMutation.isPending}
            />
          ) : documentDetailQuery.isLoading && selectedDocumentIdResolved ? (
            <LoadingState title="Loading document details…" />
          ) : documentDetailQuery.isError ? (
            <ErrorState
              title="Document details unavailable"
              description={
                documentDetailQuery.error instanceof Error
                  ? documentDetailQuery.error.message
                  : "This document could not be loaded."
              }
            />
          ) : null}
        </section>
      </div>

      <section className="panel panel-secondary panel-wide">
        <p className="section-label">Search approved summaries</p>
        <h2>Find document context</h2>
        <p className="muted-text">
          Search returns approved summary snippets only, with source document references. Raw
          document text is not shown.
        </p>

        <form
          className="documents-search-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSearchDocuments(searchQuery)) {
              return;
            }
            setSubmittedSearchQuery(searchQuery.trim());
          }}
        >
          <label className="form-field" htmlFor="document-search-query">
            Search query
            <input
              id="document-search-query"
              name="document-search-query"
              type="search"
              value={searchQuery}
              maxLength={200}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="wellness, cardio, hydration…"
            />
            <span className="form-help">
              Matches approved summaries that remain indexed after consent review.
            </span>
          </label>
          <Button type="submit" variant="secondary" disabled={!canSearchDocuments(searchQuery)}>
            Search summaries
          </Button>
        </form>

        <div aria-live="polite" aria-busy={searchResultsQuery.isFetching}>
          {!searchQueryEnabled ? (
            <p className="muted-text">Enter a query to search approved document summaries.</p>
          ) : searchResultsQuery.isLoading ? (
            <LoadingState title="Searching approved summaries…" />
          ) : searchResultsQuery.isError ? (
            <ErrorState
              title="Search failed"
              description={
                searchResultsQuery.error instanceof Error
                  ? searchResultsQuery.error.message
                  : "Document search could not be completed."
              }
            />
          ) : (searchResultsQuery.data ?? []).length === 0 ? (
            <EmptyState
              title="No matching summaries"
              description="Try another query after a summary is approved and indexed."
            />
          ) : (
            <ul className="documents-search-results">
              {(searchResultsQuery.data ?? []).map((result) => (
                <li key={`${result.documentId}-${result.summaryId}`} className="nested-card">
                  <div className="documents-search-result-header">
                    <strong>{result.title}</strong>
                    <Badge tone="info">{documentTypeLabel(result.documentType)}</Badge>
                  </div>
                  <p>{result.summarySnippet}</p>
                  <p className="muted-text">
                    Source document · generated {formatDocumentTimestamp(result.generatedAt)}
                  </p>
                  {result.extractedConstraints.length > 0 ? (
                    <ul className="documents-constraints">
                      {result.extractedConstraints.map((constraint) => (
                        <li key={constraint}>{constraint}</li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

type DocumentListItemProps = {
  document: HealthDocument;
  selected: boolean;
  onSelect: () => void;
};

function DocumentListItem({ document, selected, onSelect }: DocumentListItemProps) {
  return (
    <button
      type="button"
      className={selected ? "nested-card documents-list-item active" : "nested-card documents-list-item"}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <div className="documents-list-item-header">
        <strong>{document.title}</strong>
        <Badge tone={parseStatusBadgeTone(document.parseStatus)}>
          {parseStatusLabel(document.parseStatus)}
        </Badge>
      </div>
      <p className="muted-text">
        {documentTypeLabel(document.documentType)} · uploaded{" "}
        {formatDocumentTimestamp(document.uploadedAt)}
      </p>
    </button>
  );
}

type DocumentDetailPanelProps = {
  detail: HealthDocumentDetail;
  isBusy: boolean;
  actionError: string | null;
  confirmRevokeId: string | null;
  confirmDeleteId: string | null;
  onRequestRevoke: () => void;
  onCancelRevoke: () => void;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onParse: () => void;
  onApproveSummary: () => void;
  onRejectSummary: () => void;
  onConfirmRevoke: () => void;
  onConfirmDelete: () => void;
  parsePending: boolean;
  reviewPending: boolean;
  revokePending: boolean;
  deletePending: boolean;
};

function DocumentDetailPanel({
  detail,
  isBusy,
  actionError,
  confirmRevokeId,
  confirmDeleteId,
  onRequestRevoke,
  onCancelRevoke,
  onRequestDelete,
  onCancelDelete,
  onParse,
  onApproveSummary,
  onRejectSummary,
  onConfirmRevoke,
  onConfirmDelete,
  parsePending,
  reviewPending,
  revokePending,
  deletePending,
}: DocumentDetailPanelProps) {
  const revoked = isDocumentRevoked(detail);
  const canParse = canParseDocument(detail);
  const canReview = canReviewSummary(detail);

  return (
    <section
      className="panel nested-card documents-detail-panel"
      aria-live="polite"
      aria-busy={isBusy}
    >
      <div className="documents-detail-header">
        <div>
          <p className="section-label">Selected document</p>
          <h3>{detail.title}</h3>
        </div>
        <Badge tone={parseStatusBadgeTone(detail.parseStatus)}>
          {parseStatusLabel(detail.parseStatus)}
        </Badge>
      </div>

      <dl className="training-meta">
        <dt>Type</dt>
        <dd>{documentTypeLabel(detail.documentType)}</dd>
        <dt>Uploaded</dt>
        <dd>{formatDocumentTimestamp(detail.uploadedAt)}</dd>
        <dt>Consent version</dt>
        <dd>{detail.consentVersion}</dd>
      </dl>

      <ConsentScopeList
        scopes={buildDocumentConsentScopeItems(detail.consentScopes)}
        emptyMessage="No consent scopes recorded."
      />

      {detail.parseFailureReason ? (
        <div className="notice notice-inline" role="alert">
          {detail.parseFailureReason}
        </div>
      ) : null}

      {revoked ? (
        <RevocationState
          providerName={detail.title}
          revokedAt={detail.revokedAt ? formatDocumentTimestamp(detail.revokedAt) : undefined}
        >
          This document is revoked. Future search and coach context use are stopped. Coaching
          changes still require explicit proposal approval.
        </RevocationState>
      ) : null}

      {!revoked ? (
        <div className="action-row documents-detail-actions">
          <Button type="button" onClick={onParse} disabled={!canParse || parsePending}>
            {parsePending ? "Processing…" : "Parse and summarize"}
          </Button>
        </div>
      ) : null}

      {detail.summary ? (
        <article className="card card-flat documents-summary-card">
          <div className="documents-detail-header">
            <h4>Structured summary</h4>
            <Badge tone={reviewStatusBadgeTone(detail.summary.reviewStatus)}>
              {reviewStatusLabel(detail.summary.reviewStatus)}
            </Badge>
          </div>
          <p className="notice notice-inline">
            This summary is wellness-oriented and not a medical interpretation. Discuss clinical
            details with a qualified professional.
          </p>
          <p>{detail.summary.summaryText}</p>
          <p className="muted-text">
            Source reference · document {detail.id.slice(0, 8)}… · generated{" "}
            {formatDocumentTimestamp(detail.summary.generatedAt)}
          </p>
          {detail.summary.extractedConstraints.length > 0 ? (
            <ul className="documents-constraints">
              {detail.summary.extractedConstraints.map((constraint) => (
                <li key={constraint}>{constraint}</li>
              ))}
            </ul>
          ) : null}
          {canReview ? (
            <div className="action-row">
              <Button type="button" onClick={onApproveSummary} disabled={reviewPending}>
                Approve summary for search and coach context
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={onRejectSummary}
                disabled={reviewPending}
              >
                Reject summary
              </Button>
            </div>
          ) : null}
          {detail.summary.reviewStatus === "approved" ? (
            <p className="muted-text">
              Approved summaries may appear in search and coach responses with source references.
              They do not automatically change your plans or profile.
            </p>
          ) : null}
        </article>
      ) : null}

      {actionError ? (
        <p className="form-error" role="alert">
          {actionError}
        </p>
      ) : null}

      <div className="action-row documents-destructive-actions">
        {confirmRevokeId === detail.id ? (
          <>
            <p className="form-help">
              Revoke consent to stop future search and coach context use for this document.
            </p>
            <Button type="button" variant="danger" onClick={onConfirmRevoke} disabled={revokePending}>
              Confirm revoke consent
            </Button>
            <Button type="button" variant="secondary" onClick={onCancelRevoke} disabled={revokePending}>
              Cancel
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="danger"
            onClick={onRequestRevoke}
            disabled={revoked || revokePending || deletePending}
          >
            Revoke consent
          </Button>
        )}

        {confirmDeleteId === detail.id ? (
          <>
            <p className="form-help">
              Permanently delete this document, its storage reference, and indexed summaries.
            </p>
            <Button type="button" variant="danger" onClick={onConfirmDelete} disabled={deletePending}>
              Confirm delete document
            </Button>
            <Button type="button" variant="secondary" onClick={onCancelDelete} disabled={deletePending}>
              Cancel
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="danger"
            onClick={onRequestDelete}
            disabled={deletePending || revokePending}
          >
            Delete document
          </Button>
        )}
      </div>
    </section>
  );
}
