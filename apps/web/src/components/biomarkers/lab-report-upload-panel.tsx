"use client";

import { useAuth } from "@clerk/nextjs";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRef, useState, type DragEvent } from "react";
import {
  apiQueryKeys,
  createLabReport,
  extractLabReport,
  getBiomarkersRefreshQueryKeys,
} from "../../lib/api";
import { canSubmitLabReportUpload } from "../../lib/biomarkers-ui-state";
import {
  buildCreateLabReportPayload,
  LAB_REPORT_UPLOAD_ACCEPT,
  validateSelectedLabReportFile,
} from "../../lib/lab-report-upload";
import { formatFileSize } from "../../lib/file-upload";
import { Button, FileInputTrigger } from "../ui";

export type LabReportUploadPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When false (empty state) the panel is always expanded with no toggle. */
  collapsible?: boolean;
};

type UploadPhase = "idle" | "uploading" | "extracting";

/**
 * Upload expander: title + drag-drop/file-picker + the structurally required
 * "store & parse" consent. The mutation chains create → extract; the report
 * row reflects processing/extracted/failed state afterwards.
 */
export function LabReportUploadPanel({
  open,
  onOpenChange,
  collapsible = true,
}: LabReportUploadPanelProps) {
  const t = useTranslations("Biomarkers");
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [consentStoreParse, setConsentStoreParse] = useState(false);
  const [coachContext, setCoachContext] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [dragActive, setDragActive] = useState(false);

  const resetForm = () => {
    setTitle("");
    setSelectedFile(null);
    setFileError(null);
    setConsentStoreParse(false);
    setCoachContext(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const acceptFile = (file: File | null) => {
    setFormError(null);
    setSelectedFile(file);

    if (!file) {
      setFileError(null);
      return;
    }

    const validation = validateSelectedLabReportFile(file);
    setFileError(validation.ok ? null : t(validation.errorKey));
  };

  const uploadMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const payloadResult = await buildCreateLabReportPayload({
        title,
        selectedFile,
        coachChat: coachContext,
      });

      if (!payloadResult.ok) {
        throw new Error(t(payloadResult.errorKey));
      }

      setPhase("uploading");
      const created = await createLabReport(token, payloadResult.payload);
      if (created.error || !created.data) {
        throw new Error(created.error ?? t("errorTitle"));
      }

      // Show the new row (uploaded/processing) while extraction runs.
      await queryClient.invalidateQueries({ queryKey: apiQueryKeys.labReports });

      setPhase("extracting");
      // Synchronous extraction; failures surface as a typed failureCode on the
      // report row (with Retry) after the invalidation below — never as prose.
      await extractLabReport(token, created.data.id);

      return created.data;
    },
    onMutate: () => {
      setFormError(null);
    },
    onSuccess: async () => {
      resetForm();
      if (collapsible) {
        onOpenChange(false);
      }
      for (const queryKey of getBiomarkersRefreshQueryKeys()) {
        await queryClient.invalidateQueries({ queryKey });
      }
    },
    onError: async (error) => {
      setFormError(error instanceof Error ? error.message : t("errorTitle"));
      // The report may exist with a failed/uploaded status — refresh rows.
      for (const queryKey of getBiomarkersRefreshQueryKeys()) {
        await queryClient.invalidateQueries({ queryKey });
      }
    },
    onSettled: () => {
      setPhase("idle");
    },
  });

  const canSubmit = canSubmitLabReportUpload({
    title,
    selectedFile,
    fileValidationError: fileError,
    consentStoreParse,
  });

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    acceptFile(event.dataTransfer.files?.[0] ?? null);
  };

  if (collapsible && !open) {
    return (
      <Button type="button" variant="secondary" onClick={() => onOpenChange(true)}>
        {t("upload.title")}
      </Button>
    );
  }

  return (
    <section
      aria-label={t("upload.title")}
      style={{
        background: "var(--color-surface-card)",
        border: "1px solid var(--color-border-default)",
        borderRadius: 16,
        padding: 18,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)", margin: 0 }}>
          {t("upload.title")}
        </h3>
        {collapsible ? (
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            {t("readings.cancel")}
          </Button>
        ) : null}
      </div>

      <form
        style={{ display: "flex", flexDirection: "column", gap: 14 }}
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSubmit || uploadMutation.isPending) {
            return;
          }
          uploadMutation.mutate();
        }}
      >
        <label className="form-field" htmlFor="lab-report-title">
          {t("upload.titleLabel")}
          <input
            id="lab-report-title"
            name="lab-report-title"
            type="text"
            value={title}
            maxLength={160}
            autoComplete="off"
            onChange={(event) => setTitle(event.target.value)}
          />
          <span className="form-help">{t("upload.titleHelp")}</span>
        </label>

        {/* Drag-drop zone (pointer) + FileInputTrigger (keyboard path) */}
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={onDrop}
          style={{
            border: `1px dashed ${dragActive ? "var(--color-metric-green)" : "var(--color-border-strong)"}`,
            borderRadius: 12,
            padding: 18,
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: 10,
          }}
        >
          <p style={{ fontSize: 12.5, color: "var(--color-text-muted)", margin: 0 }}>
            {t("upload.dropHint")}
          </p>
          <FileInputTrigger
            inputId="lab-report-file"
            accept={LAB_REPORT_UPLOAD_ACCEPT}
            labelText={t("upload.title")}
            buttonLabel={t("upload.browseLabel")}
            inputRef={fileInputRef}
            disabled={uploadMutation.isPending}
            onChange={(event) => acceptFile(event.target.files?.[0] ?? null)}
          />
          {selectedFile ? (
            <p style={{ fontSize: 12.5, color: "var(--color-text-secondary)", margin: 0 }}>
              {t("upload.selected", {
                name: selectedFile.name,
                size: formatFileSize(selectedFile.size),
              })}
            </p>
          ) : null}
        </div>

        {fileError ? (
          <p className="form-error" role="alert">
            {fileError}
          </p>
        ) : null}

        {/* Consent: store & parse is structurally required; coach context optional */}
        <label
          htmlFor="lab-report-consent-store-parse"
          style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 13, color: "var(--color-text-secondary)" }}
        >
          <input
            id="lab-report-consent-store-parse"
            type="checkbox"
            checked={consentStoreParse}
            onChange={(event) => setConsentStoreParse(event.target.checked)}
          />
          <span>{t("upload.consentStoreParse")}</span>
        </label>

        <label
          htmlFor="lab-report-consent-coach-context"
          style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 13, color: "var(--color-text-secondary)" }}
        >
          <input
            id="lab-report-consent-coach-context"
            type="checkbox"
            checked={coachContext}
            onChange={(event) => setCoachContext(event.target.checked)}
          />
          <span>{t("upload.consentCoachContext")}</span>
        </label>

        {formError ? (
          <p className="form-error" role="alert">
            {formError}
          </p>
        ) : null}

        <div aria-live="polite" aria-busy={uploadMutation.isPending}>
          {phase === "uploading" ? (
            <p style={{ fontSize: 12.5, color: "var(--color-text-muted)", margin: 0 }}>
              {t("upload.submitPending")}
            </p>
          ) : null}
          {phase === "extracting" ? (
            <p style={{ fontSize: 12.5, color: "var(--color-text-muted)", margin: 0 }}>
              {t("upload.extracting")}
            </p>
          ) : null}
        </div>

        <div>
          <Button type="submit" disabled={!canSubmit || uploadMutation.isPending}>
            {t("upload.submit")}
          </Button>
        </div>
      </form>
    </section>
  );
}
