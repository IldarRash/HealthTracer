/**
 * BodyAnalysisCard — shared by chat result (inline proposal) and profile section.
 *
 * SAFETY FLOORS enforced here:
 * 1. Wellness-not-medical: the visual-estimate disclaimer is ALWAYS rendered
 *    via MedicalNote. If the `disclaimer` prop is omitted the default copy
 *    is used. The card must never render with an empty disclaimer.
 * 2. No image bytes: this atom accepts only numbers/structured estimates.
 *    No photo data in props.
 *
 * Chat use: the `footer` slot holds the proposal Accept/Modify/Reject actions
 * provided by the proposal-card-shell. This card owns NO mutation logic.
 * Profile use: the `footer` slot holds a "Сохранено · Открыть →" strip.
 */

import React, { type ReactElement, type ReactNode, type HTMLAttributes } from "react";
import { cn } from "../../lib/utils";
import { tokens } from "@health/ui";
import { Icon } from "./icon";
import { MedicalNote } from "./dark-primitives";
import { Stat } from "./stat";

// ── Types ─────────────────────────────────────────────────────────

export type BodyAnalysisMetric = {
  value: string;
  unit?: string;
  label: string;
  tone: "amber" | "green" | "ink";
};

export type BodyAnalysisZone = {
  kind: "strong" | "growth";
  text: string;
};

export type BodyAnalysisCardProps = HTMLAttributes<HTMLElement> & {
  metrics: readonly BodyAnalysisMetric[];
  zones: readonly BodyAnalysisZone[];
  chipLabel?: string;
  title?: string;
  /** Disclaimer content. Default: verbatim ±3–4% copy. NEVER rendered empty. */
  disclaimer?: ReactNode;
  /** Slot for actions (chat) or provenance strip (profile). */
  footer?: ReactNode;
};

// Verbatim disclaimer — content floor
const DEFAULT_DISCLAIMER =
  "Это визуальная оценка по фото с погрешностью ±3–4%, а не замер состава тела. *Вес — со слов, не измеряется по фото. Не медицинская диагностика.";

function metricToneColor(tone: BodyAnalysisMetric["tone"], dark: boolean): string {
  if (tone === "amber") return tokens.color.metric.amber;
  if (tone === "green") return tokens.color.metric.green;
  return dark ? tokens.color.dark.ink : tokens.color.light.ink;
}

// ── Component ─────────────────────────────────────────────────────

export function BodyAnalysisCard({
  metrics,
  zones,
  chipLabel = "по 3 фото",
  title = "Примерный анализ тела",
  disclaimer,
  footer,
  className,
  ...props
}: BodyAnalysisCardProps): ReactElement {
  const strongZones = zones.filter((z) => z.kind === "strong");
  const growthZones = zones.filter((z) => z.kind === "growth");

  return (
    <article
      className={cn("body-analysis-card", className)}
      aria-label={title}
      {...props}
    >
      {/* Header */}
      <div className="body-analysis-card__header">
        <div className="body-analysis-card__header-left">
          <Icon name="profile" size={18} stroke={tokens.color.metric.amber} aria-hidden />
          <span className="body-analysis-card__title">{title}</span>
        </div>
        <span className="body-analysis-card__chip">{chipLabel}</span>
      </div>

      {/* Metrics row */}
      <div className="body-analysis-card__metrics" role="list" aria-label="Основные показатели">
        {metrics.map((m, i) => (
          <div key={i} className="body-analysis-card__metric-cell" role="listitem">
            <Stat
              value={m.value}
              unit={m.unit}
              label={m.label}
              dark={true}
              style={{ "--stat-value-color": metricToneColor(m.tone, true) } as React.CSSProperties}
              className="body-analysis-card__stat"
            />
          </div>
        ))}
      </div>

      {/* Zone blocks */}
      <div className="body-analysis-card__zones">
        {strongZones.length > 0 ? (
          <div
            className="body-analysis-card__zone body-analysis-card__zone--strong"
            style={{ background: tokens.color.metric.greenDim }}
          >
            <span className="body-analysis-card__zone-label">Сильные зоны</span>
            {strongZones.map((z, i) => (
              <p key={i} className="body-analysis-card__zone-text">{z.text}</p>
            ))}
          </div>
        ) : null}
        {growthZones.length > 0 ? (
          <div
            className="body-analysis-card__zone body-analysis-card__zone--growth"
            style={{ background: tokens.color.metric.redDim }}
          >
            <span className="body-analysis-card__zone-label">Зоны роста</span>
            {growthZones.map((z, i) => (
              <p key={i} className="body-analysis-card__zone-text">{z.text}</p>
            ))}
          </div>
        ) : null}
      </div>

      {/* Disclaimer — CONTENT FLOOR: always rendered, never empty */}
      <MedicalNote className="body-analysis-card__disclaimer">
        {disclaimer ?? DEFAULT_DISCLAIMER}
      </MedicalNote>

      {/* Footer slot (proposal actions / provenance strip) */}
      {footer != null ? (
        <div className="body-analysis-card__footer">{footer}</div>
      ) : null}
    </article>
  );
}
