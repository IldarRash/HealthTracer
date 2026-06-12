"use client";

import type { BiomarkerReading, UpdateBiomarkerReadingInput } from "@health/types";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import {
  buildReadingProvenanceView,
  formatReadingObservedDate,
  formatReadingValue,
} from "../../lib/biomarkers-ui-state";
import { Button } from "../ui";

export type BiomarkerReadingRowProps = {
  reading: BiomarkerReading;
  /** Returns an error message to show inline, or null on success. */
  onUpdate: (readingId: string, input: UpdateBiomarkerReadingInput) => Promise<string | null>;
  onDelete: (readingId: string) => Promise<string | null>;
  busy: boolean;
};

/**
 * One reading in the detail history: value, date, provenance, edit-in-place
 * (Enter saves, Escape cancels and refocuses the trigger), two-step delete.
 */
export function BiomarkerReadingRow({
  reading,
  onUpdate,
  onDelete,
  busy,
}: BiomarkerReadingRowProps) {
  const t = useTranslations("Biomarkers");
  const editTriggerRef = useRef<HTMLButtonElement>(null);

  const [editing, setEditing] = useState(false);
  const [valueDraft, setValueDraft] = useState("");
  const [dateDraft, setDateDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const startEditing = () => {
    setValueDraft(reading.value != null ? String(reading.value) : reading.valueText ?? "");
    setDateDraft(reading.observedAt ?? "");
    setError(null);
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setError(null);
    editTriggerRef.current?.focus();
  };

  const save = async () => {
    const input: UpdateBiomarkerReadingInput = {};

    if (reading.value != null) {
      const parsed = Number(valueDraft.trim());
      if (valueDraft.trim().length === 0 || !Number.isFinite(parsed)) {
        setError(t("readings.invalidValue"));
        return;
      }
      if (parsed !== reading.value) {
        input.value = parsed;
      }
    } else {
      const text = valueDraft.trim();
      if (text.length === 0) {
        setError(t("readings.invalidValue"));
        return;
      }
      if (text !== reading.valueText) {
        input.valueText = text;
      }
    }

    const nextObservedAt = dateDraft.trim().length > 0 ? dateDraft : null;
    if (nextObservedAt !== reading.observedAt) {
      input.observedAt = nextObservedAt;
    }

    if (Object.keys(input).length === 0) {
      cancelEditing();
      return;
    }

    const updateError = await onUpdate(reading.id, input);
    if (updateError) {
      setError(updateError);
      return;
    }

    setEditing(false);
    editTriggerRef.current?.focus();
  };

  const provenance = buildReadingProvenanceView(reading);
  const provenanceLabel =
    provenance.kind === "extracted"
      ? t("readings.extractedConfidence", { percent: provenance.percent })
      : provenance.kind === "extracted_no_confidence"
        ? t("readings.extracted")
        : provenance.kind === "edited"
          ? t("readings.editedByYou")
          : t("readings.manualEntry");

  return (
    <li
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "12px 0",
        borderBottom: "1px solid var(--color-border-default)",
      }}
    >
      {editing ? (
        <form
          style={{ display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap" }}
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy) {
              void save();
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              cancelEditing();
            }
          }}
        >
          <label
            className="form-field"
            htmlFor={`reading-value-${reading.id}`}
            style={{ margin: 0 }}
          >
            {t("readings.valueLabel")}
            <input
              id={`reading-value-${reading.id}`}
              type="text"
              inputMode="decimal"
              value={valueDraft}
              autoFocus
              onChange={(event) => setValueDraft(event.target.value)}
              style={{ width: 110 }}
            />
          </label>

          <label
            className="form-field"
            htmlFor={`reading-date-${reading.id}`}
            style={{ margin: 0 }}
          >
            {t("readings.dateLabel")}
            <input
              id={`reading-date-${reading.id}`}
              type="date"
              value={dateDraft}
              onChange={(event) => setDateDraft(event.target.value)}
            />
          </label>

          <Button type="submit" disabled={busy}>
            {t("readings.save")}
          </Button>
          <Button type="button" variant="secondary" disabled={busy} onClick={cancelEditing}>
            {t("readings.cancel")}
          </Button>
        </form>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: 16,
              fontWeight: 700,
              fontVariantNumeric: "tabular-nums",
              color: "var(--color-text-primary)",
            }}
          >
            {formatReadingValue(reading)}{" "}
            <span style={{ fontSize: 12, fontWeight: 400, color: "var(--color-text-muted)" }}>
              {reading.unit}
            </span>
          </span>

          <span style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>
            {formatReadingObservedDate(reading)}
          </span>

          <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            {provenanceLabel}
          </span>

          <span style={{ flex: 1 }} />

          <Button
            ref={editTriggerRef}
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={startEditing}
          >
            {t("readings.edit")}
          </Button>

          {confirmingDelete ? (
            <>
              <span style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>
                {t("readings.deleteConfirm")}
              </span>
              <Button
                type="button"
                variant="danger"
                disabled={busy}
                onClick={async () => {
                  const deleteError = await onDelete(reading.id);
                  if (deleteError) {
                    setError(deleteError);
                  }
                  setConfirmingDelete(false);
                }}
              >
                {t("readings.delete")}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => setConfirmingDelete(false)}
              >
                {t("readings.cancel")}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="danger"
              disabled={busy}
              onClick={() => setConfirmingDelete(true)}
            >
              {t("readings.delete")}
            </Button>
          )}
        </div>
      )}

      <div aria-live="polite">
        {error ? (
          <p className="form-error" style={{ margin: 0 }}>
            {error}
          </p>
        ) : null}
      </div>
    </li>
  );
}
