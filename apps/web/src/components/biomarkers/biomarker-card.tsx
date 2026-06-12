"use client";

import type { BiomarkersDashboardMarker } from "@health/types";
import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  biomarkerStatusColor,
  biomarkerStatusLabelKey,
  biomarkerStatusTone,
  computeRangeBarModel,
  deriveBiomarkerReadingStatus,
  formatReadingObservedDate,
  formatReadingValue,
} from "../../lib/biomarkers-ui-state";
import { Badge } from "../ui";
import { BiomarkerRangeBar } from "./biomarker-range-bar";

export type BiomarkerCardProps = {
  marker: BiomarkersDashboardMarker;
};

/**
 * One marker on the dashboard: name, typical-range status badge, latest value,
 * and the reference-range bar. Trend strips live on the detail page — the
 * dashboard payload only carries the latest reading per marker.
 */
export function BiomarkerCard({ marker }: BiomarkerCardProps) {
  const t = useTranslations("Biomarkers");

  const reading = marker.latestReading;
  const status = deriveBiomarkerReadingStatus(reading, marker.typicalRange);
  const statusLabel = t(biomarkerStatusLabelKey(status));
  const rangeModel =
    status === "no_reference"
      ? null
      : computeRangeBarModel(reading?.value ?? null, marker.typicalRange);

  const valueLabel = reading ? formatReadingValue(reading) : null;
  const unitLabel = reading?.unit ?? marker.canonicalUnit;
  const rangeAriaLabel = marker.typicalRange
    ? `${marker.displayLabel}: ${valueLabel ?? "—"} ${unitLabel} — ${statusLabel} ${marker.typicalRange.low}–${marker.typicalRange.high} ${marker.typicalRange.unit}`
    : `${marker.displayLabel}: ${valueLabel ?? "—"} ${unitLabel} — ${statusLabel}`;

  return (
    <article
      style={{
        background: "var(--color-surface-card)",
        border: "1px solid var(--color-border-default)",
        borderRadius: 16,
        padding: 18,
        display: "flex",
        flexDirection: "column",
        gap: 11,
      }}
    >
      {/* Header: name + status badge */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "var(--color-text-secondary)",
          }}
        >
          {marker.displayLabel}
        </span>
        <Badge tone={biomarkerStatusTone(status)} dark>
          {statusLabel}
        </Badge>
      </div>

      {/* Latest value */}
      {reading ? (
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span
            style={{
              fontSize: 27,
              fontWeight: 700,
              letterSpacing: -0.6,
              fontVariantNumeric: "tabular-nums",
              lineHeight: 1.1,
              color: "var(--color-text-primary)",
            }}
          >
            {valueLabel}
          </span>
          <span style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>
            {unitLabel}
          </span>
        </div>
      ) : (
        <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: 0 }}>
          {t("card.noReadings")}
        </p>
      )}

      {/* Reference-range bar */}
      {reading ? (
        <BiomarkerRangeBar
          model={rangeModel}
          toneColor={biomarkerStatusColor(status)}
          ariaLabel={rangeAriaLabel}
          noReferenceLabel={t("status.noReference")}
        />
      ) : null}

      {/* Footer: observed date + history link */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          marginTop: "auto",
        }}
      >
        <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
          {reading
            ? t("card.observed", { date: formatReadingObservedDate(reading) })
            : t("card.readingCount", { count: marker.readingCount })}
        </span>
        <Link
          href={`/biomarkers/${marker.key}`}
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--color-metric-green)",
            textDecoration: "none",
          }}
        >
          {t("card.viewHistory")} →
        </Link>
      </div>
    </article>
  );
}
