"use client";

import { useAuth } from "@clerk/nextjs";
import type { BiomarkerKey, UpdateBiomarkerReadingInput } from "@health/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import {
  apiQueryKeys,
  createBiomarkerReading,
  deleteBiomarkerReading,
  getBiomarkerHistory,
  getBiomarkersRefreshQueryKeys,
  updateBiomarkerReading,
} from "../../lib/api";
import {
  biomarkerStatusColor,
  biomarkerStatusLabelKey,
  biomarkerStatusTone,
  buildTrendStripDays,
  computeRangeBarModel,
  deriveBiomarkerReadingStatus,
  formatReadingValue,
} from "../../lib/biomarkers-ui-state";
import {
  Badge,
  Button,
  DsTrendStrip,
  EmptyState,
  ErrorState,
  LoadingScreen,
  MedicalNote,
} from "../ui";
import { BiomarkerRangeBar } from "./biomarker-range-bar";
import { BiomarkerReadingRow } from "./biomarker-reading-row";

export type BiomarkerDetailWorkspaceProps = {
  markerKey: BiomarkerKey;
};

/** History page for one marker: latest + wide range bar, trend strip, editable readings, manual add. */
export function BiomarkerDetailWorkspace({ markerKey }: BiomarkerDetailWorkspaceProps) {
  const t = useTranslations("Biomarkers");
  const tCommon = useTranslations("Common");
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const [addOpen, setAddOpen] = useState(false);
  const [valueDraft, setValueDraft] = useState("");
  const [unitDraft, setUnitDraft] = useState<string | null>(null);
  const [dateDraft, setDateDraft] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  const requireToken = async (): Promise<string> => {
    const token = await getToken();
    if (!token) {
      throw new Error("Clerk session token is unavailable.");
    }
    return token;
  };

  const historyQuery = useQuery({
    queryKey: apiQueryKeys.biomarkerHistory(markerKey),
    queryFn: async () => {
      const token = await requireToken();
      const result = await getBiomarkerHistory(token, markerKey);
      if (result.error || !result.data) {
        throw new Error(result.error ?? t("errorTitle"));
      }
      return result.data;
    },
  });

  const invalidate = async () => {
    for (const queryKey of getBiomarkersRefreshQueryKeys()) {
      await queryClient.invalidateQueries({ queryKey });
    }
  };

  const updateMutation = useMutation({
    mutationFn: async (input: { readingId: string; changes: UpdateBiomarkerReadingInput }) => {
      const token = await requireToken();
      const result = await updateBiomarkerReading(token, input.readingId, input.changes);
      if (result.error || !result.data) {
        throw new Error(result.error ?? t("errorTitle"));
      }
      return result.data;
    },
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: async (readingId: string) => {
      const token = await requireToken();
      const result = await deleteBiomarkerReading(token, readingId);
      if (result.error || !result.data) {
        throw new Error(result.error ?? t("errorTitle"));
      }
      return result.data;
    },
    onSuccess: invalidate,
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const parsed = Number(valueDraft.trim());
      if (valueDraft.trim().length === 0 || !Number.isFinite(parsed)) {
        throw new Error(t("readings.invalidValue"));
      }

      const unit = (unitDraft ?? historyQuery.data?.canonicalUnit ?? "").trim();
      const token = await requireToken();
      const result = await createBiomarkerReading(token, {
        biomarkerKey: markerKey,
        value: parsed,
        unit,
        ...(dateDraft.trim().length > 0 ? { observedAt: dateDraft } : {}),
      });

      if (result.error || !result.data) {
        throw new Error(result.error ?? t("errorTitle"));
      }
      return result.data;
    },
    onMutate: () => setAddError(null),
    onSuccess: async () => {
      setAddOpen(false);
      setValueDraft("");
      setUnitDraft(null);
      setDateDraft("");
      await invalidate();
    },
    onError: (error) =>
      setAddError(error instanceof Error ? error.message : t("errorTitle")),
  });

  if (historyQuery.isLoading) {
    return <LoadingScreen label={t("loading")} layout="longevity" />;
  }

  if (historyQuery.isError || !historyQuery.data) {
    return (
      <ErrorState
        title={t("errorTitle")}
        description={
          historyQuery.error instanceof Error ? historyQuery.error.message : undefined
        }
        action={
          <Button type="button" variant="secondary" onClick={() => void historyQuery.refetch()}>
            {tCommon("retry")}
          </Button>
        }
      />
    );
  }

  const history = historyQuery.data;
  const latest = history.readings[0] ?? null;
  const status = deriveBiomarkerReadingStatus(latest, history.typicalRange);
  const statusLabel = t(biomarkerStatusLabelKey(status));
  const rangeModel =
    status === "no_reference"
      ? null
      : computeRangeBarModel(latest?.value ?? null, history.typicalRange);
  const trendDays = buildTrendStripDays(history.readings);
  const isBusy = updateMutation.isPending || deleteMutation.isPending;

  const onUpdateReading = async (
    readingId: string,
    changes: UpdateBiomarkerReadingInput,
  ): Promise<string | null> => {
    try {
      await updateMutation.mutateAsync({ readingId, changes });
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : t("errorTitle");
    }
  };

  const onDeleteReading = async (readingId: string): Promise<string | null> => {
    try {
      await deleteMutation.mutateAsync(readingId);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : t("errorTitle");
    }
  };

  return (
    <div className="page-content" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <Link
        href="/biomarkers"
        style={{
          fontSize: 12.5,
          fontWeight: 600,
          color: "var(--color-text-muted)",
          textDecoration: "none",
        }}
      >
        ← {t("detail.back")}
      </Link>

      {/* Header card: latest value + wide range bar */}
      <section
        aria-label={history.displayLabel}
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
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h2
            style={{
              fontSize: 17,
              fontWeight: 700,
              color: "var(--color-text-primary)",
              letterSpacing: -0.3,
              margin: 0,
              flex: 1,
            }}
          >
            {history.displayLabel}
          </h2>
          <Badge tone={biomarkerStatusTone(status)} dark>
            {statusLabel}
          </Badge>
        </div>

        {latest ? (
          <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
            <span
              style={{
                fontSize: 27,
                fontWeight: 700,
                letterSpacing: -0.6,
                fontVariantNumeric: "tabular-nums",
                color: "var(--color-text-primary)",
              }}
            >
              {formatReadingValue(latest)}
            </span>
            <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>{latest.unit}</span>
            <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
              · {t("detail.latestLabel")}
            </span>
          </div>
        ) : (
          <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: 0 }}>
            {t("readings.empty")}
          </p>
        )}

        {latest ? (
          <BiomarkerRangeBar
            model={rangeModel}
            toneColor={biomarkerStatusColor(status)}
            ariaLabel={
              history.typicalRange
                ? `${history.displayLabel}: ${formatReadingValue(latest)} ${latest.unit} — ${statusLabel} ${history.typicalRange.low}–${history.typicalRange.high} ${history.typicalRange.unit}`
                : `${history.displayLabel}: ${formatReadingValue(latest)} ${latest.unit} — ${statusLabel}`
            }
            noReferenceLabel={t("status.noReference")}
          />
        ) : null}
      </section>

      {/* Trend across reports */}
      {trendDays.length >= 2 ? (
        <section
          aria-label={t("detail.trendTitle")}
          style={{
            background: "var(--color-surface-card)",
            border: "1px solid var(--color-border-default)",
            borderRadius: 16,
            padding: 18,
          }}
        >
          <h3
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              color: "var(--color-text-muted)",
              margin: "0 0 4px",
            }}
          >
            {t("detail.trendTitle")}
          </h3>
          <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "0 0 14px" }}>
            {t("detail.trendHint")}
          </p>
          <DsTrendStrip
            days={trendDays}
            maxH={72}
            barColor="var(--color-metric-green)"
            ariaLabel={`${history.displayLabel} — ${t("detail.trendTitle")}`}
          />
        </section>
      ) : null}

      {/* Readings list + manual add */}
      <section
        aria-label={t("readings.sectionTitle")}
        style={{
          background: "var(--color-surface-card)",
          border: "1px solid var(--color-border-default)",
          borderRadius: 16,
          padding: 18,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            marginBottom: 6,
          }}
        >
          <h3
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              color: "var(--color-text-muted)",
              margin: 0,
            }}
          >
            {t("readings.sectionTitle")}
          </h3>
          {!addOpen ? (
            <Button type="button" variant="secondary" onClick={() => setAddOpen(true)}>
              {t("readings.addReading")}
            </Button>
          ) : null}
        </div>

        {addOpen ? (
          <form
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 10,
              flexWrap: "wrap",
              padding: "10px 0",
              borderBottom: "1px solid var(--color-border-default)",
            }}
            onSubmit={(event) => {
              event.preventDefault();
              if (!addMutation.isPending) {
                addMutation.mutate();
              }
            }}
          >
            <label className="form-field" htmlFor="add-reading-value" style={{ margin: 0 }}>
              {t("readings.valueLabel")}
              <input
                id="add-reading-value"
                type="text"
                inputMode="decimal"
                value={valueDraft}
                autoFocus
                onChange={(event) => setValueDraft(event.target.value)}
                style={{ width: 110 }}
              />
            </label>

            <label className="form-field" htmlFor="add-reading-unit" style={{ margin: 0 }}>
              {t("readings.unitLabel")}
              <input
                id="add-reading-unit"
                type="text"
                value={unitDraft ?? history.canonicalUnit}
                maxLength={40}
                onChange={(event) => setUnitDraft(event.target.value)}
                style={{ width: 110 }}
              />
            </label>

            <label className="form-field" htmlFor="add-reading-date" style={{ margin: 0 }}>
              {t("readings.dateLabel")}
              <input
                id="add-reading-date"
                type="date"
                value={dateDraft}
                onChange={(event) => setDateDraft(event.target.value)}
              />
            </label>

            <Button type="submit" disabled={addMutation.isPending}>
              {addMutation.isPending ? t("readings.addPending") : t("readings.save")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={addMutation.isPending}
              onClick={() => {
                setAddOpen(false);
                setAddError(null);
              }}
            >
              {t("readings.cancel")}
            </Button>
          </form>
        ) : null}

        <div aria-live="polite">
          {addError ? (
            <p className="form-error" role="alert">
              {addError}
            </p>
          ) : null}
        </div>

        {history.readings.length === 0 ? (
          <EmptyState title={t("readings.empty")} />
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {history.readings.map((reading) => (
              <BiomarkerReadingRow
                key={reading.id}
                reading={reading}
                onUpdate={onUpdateReading}
                onDelete={onDeleteReading}
                busy={isBusy}
              />
            ))}
          </ul>
        )}
      </section>

      <MedicalNote>{t("wellnessNote")}</MedicalNote>
    </div>
  );
}
