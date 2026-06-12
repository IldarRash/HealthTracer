"use client";

import { useAuth } from "@clerk/nextjs";
import type { LabReport } from "@health/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  apiQueryKeys,
  deleteLabReport,
  extractLabReport,
  getBiomarkersRefreshQueryKeys,
  updateLabReportConsent,
} from "../../lib/api";
import {
  canRetryLabReportExtraction,
  failureCodeMessageKey,
  hasCoachContextConsent,
  labReportStatusBadgeTone,
  labReportStatusLabelKey,
} from "../../lib/biomarkers-ui-state";
import { formatDateMedium } from "../../lib/date-format";
import { Badge, Button, Toggle } from "../ui";
import { LabReportUploadPanel } from "./lab-report-upload-panel";

export type LabReportsSectionProps = {
  reports: readonly LabReport[];
  uploadOpen: boolean;
  onUploadOpenChange: (open: boolean) => void;
};

/** Uploaded lab reports: status, failure messages with Retry, consent toggle, delete. */
export function LabReportsSection({
  reports,
  uploadOpen,
  onUploadOpenChange,
}: LabReportsSectionProps) {
  const t = useTranslations("Biomarkers");
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const requireToken = async (): Promise<string> => {
    const token = await getToken();
    if (!token) {
      throw new Error("Clerk session token is unavailable.");
    }
    return token;
  };

  const invalidateAfterReadingsChange = async () => {
    for (const queryKey of getBiomarkersRefreshQueryKeys()) {
      await queryClient.invalidateQueries({ queryKey });
    }
  };

  const retryMutation = useMutation({
    mutationFn: async (reportId: string) => {
      const token = await requireToken();
      const result = await extractLabReport(token, reportId);
      if (result.error) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onMutate: () => setActionError(null),
    onSettled: invalidateAfterReadingsChange,
    onError: (error) =>
      setActionError(error instanceof Error ? error.message : t("errorTitle")),
  });

  const consentMutation = useMutation({
    mutationFn: async (input: { reportId: string; coachChat: boolean }) => {
      const token = await requireToken();
      const result = await updateLabReportConsent(token, input.reportId, {
        coachChat: input.coachChat,
      });
      if (result.error || !result.data) {
        throw new Error(result.error ?? t("errorTitle"));
      }
      return result.data;
    },
    onMutate: () => setActionError(null),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: apiQueryKeys.labReports });
    },
    onError: (error) =>
      setActionError(error instanceof Error ? error.message : t("errorTitle")),
  });

  const deleteMutation = useMutation({
    mutationFn: async (reportId: string) => {
      const token = await requireToken();
      const result = await deleteLabReport(token, reportId);
      if (result.error || !result.data) {
        throw new Error(result.error ?? t("errorTitle"));
      }
      return result.data;
    },
    onMutate: () => {
      setActionError(null);
      setConfirmDeleteId(null);
    },
    onSuccess: invalidateAfterReadingsChange,
    onError: (error) =>
      setActionError(error instanceof Error ? error.message : t("errorTitle")),
  });

  return (
    <section
      aria-label={t("reports.sectionTitle")}
      style={{ display: "flex", flexDirection: "column", gap: 12 }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <h2
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 1.2,
            textTransform: "uppercase",
            color: "var(--color-text-muted)",
            margin: 0,
          }}
        >
          {t("reports.sectionTitle")}
        </h2>
        {!uploadOpen ? (
          <LabReportUploadPanel open={false} onOpenChange={onUploadOpenChange} />
        ) : null}
      </div>

      {uploadOpen ? (
        <LabReportUploadPanel open onOpenChange={onUploadOpenChange} />
      ) : null}

      {actionError ? (
        <p className="form-error" role="alert">
          {actionError}
        </p>
      ) : null}

      {reports.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: 0 }}>
          {t("reports.empty")}
        </p>
      ) : (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {reports.map((report) => (
            <li
              key={report.id}
              style={{
                background: "var(--color-surface-card)",
                border: "1px solid var(--color-border-default)",
                borderRadius: 16,
                padding: 18,
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <strong style={{ fontSize: 14, color: "var(--color-text-primary)", flex: 1 }}>
                  {report.title}
                </strong>
                <Badge tone={labReportStatusBadgeTone(report.status)} dark>
                  {t(labReportStatusLabelKey(report.status))}
                </Badge>
              </div>

              <p style={{ fontSize: 12.5, color: "var(--color-text-muted)", margin: 0 }}>
                {t("reports.uploadedOn", { date: formatDateMedium(report.uploadedAt) })}
              </p>

              {report.status === "failed" && report.failureCode ? (
                <p className="form-error" role="status">
                  {t(failureCodeMessageKey(report.failureCode))}
                </p>
              ) : null}

              {report.unmappedMarkerCount > 0 ? (
                <p style={{ fontSize: 12.5, color: "var(--color-text-muted)", margin: 0 }}>
                  {t("reports.unmappedNote", { count: report.unmappedMarkerCount })}
                </p>
              ) : null}

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <Toggle
                  checked={hasCoachContextConsent(report)}
                  disabled={consentMutation.isPending}
                  onChange={(checked) =>
                    consentMutation.mutate({ reportId: report.id, coachChat: checked })
                  }
                  label={t("reports.coachContextToggle")}
                />

                <span style={{ flex: 1 }} />

                {canRetryLabReportExtraction(report) ? (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={retryMutation.isPending}
                    onClick={() => retryMutation.mutate(report.id)}
                  >
                    {t("reports.retry")}
                  </Button>
                ) : null}

                {confirmDeleteId === report.id ? (
                  <>
                    <span style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>
                      {t("reports.deleteConfirm")}
                    </span>
                    <Button
                      type="button"
                      variant="danger"
                      disabled={deleteMutation.isPending}
                      onClick={() => deleteMutation.mutate(report.id)}
                    >
                      {t("reports.delete")}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={deleteMutation.isPending}
                      onClick={() => setConfirmDeleteId(null)}
                    >
                      {t("readings.cancel")}
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    variant="danger"
                    disabled={deleteMutation.isPending}
                    onClick={() => setConfirmDeleteId(report.id)}
                  >
                    {t("reports.delete")}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
