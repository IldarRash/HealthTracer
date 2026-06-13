import type { ReactElement } from "react";
import type { BiomarkerMultiZoneRangeBarModel } from "../../lib/biomarkers-ui-state";

const OUTSIDE_ZONE_COLOR = "rgba(255,255,255,0.08)";
const REFERENCE_ZONE_COLOR =
  "color-mix(in srgb, var(--color-metric-green) 22%, transparent)";
const OPTIMAL_ZONE_COLOR =
  "color-mix(in srgb, var(--color-metric-green) 45%, transparent)";

export type BiomarkerRangeBarProps = {
  /** Geometry from computeMultiZoneRangeBarModel; null renders the no-reference variant. */
  model: BiomarkerMultiZoneRangeBarModel | null;
  /** Dot color from biomarkerStatusColor. */
  toneColor: string;
  /**
   * Full text alternative mentioning both the reference band and (when present)
   * the optimal band, e.g. "Vitamin D 20 ng/mL — below typical range 30–100,
   * optimal 40–60 ng/mL".
   */
  ariaLabel: string;
  /** Caption for the no-reference variant (pre-translated). */
  noReferenceLabel: string;
};

/**
 * Presentational two-zone reference bar: muted outside zones, a dim-green
 * reference zone, a stronger optimal overlay zone, and a status-toned position
 * dot. Announced as a single image with a full text alternative.
 */
export function BiomarkerRangeBar({
  model,
  toneColor,
  ariaLabel,
  noReferenceLabel,
}: BiomarkerRangeBarProps): ReactElement {
  if (!model) {
    return (
      <p style={{ fontSize: 11, color: "var(--color-text-muted)", margin: 0 }}>
        {noReferenceLabel}
      </p>
    );
  }

  const hasOptimal = model.optimalStartPct !== null && model.optimalEndPct !== null;

  return (
    <div role="img" aria-label={ariaLabel}>
      <div style={{ position: "relative", padding: "4px 0" }} aria-hidden="true">
        {/* Track with reference zone segments */}
        <div
          style={{
            position: "relative",
            display: "flex",
            height: 6,
            borderRadius: 3,
            overflow: "hidden",
          }}
        >
          <div
            style={{ width: `${model.referenceStartPct}%`, background: OUTSIDE_ZONE_COLOR }}
          />
          <div
            style={{
              width: `${model.referenceEndPct - model.referenceStartPct}%`,
              background: REFERENCE_ZONE_COLOR,
            }}
          />
          <div style={{ flex: 1, background: OUTSIDE_ZONE_COLOR }} />

          {/* Optimal overlay zone, absolutely positioned over the track */}
          {hasOptimal ? (
            <div
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: `${model.optimalStartPct}%`,
                width: `${model.optimalEndPct! - model.optimalStartPct!}%`,
                background: OPTIMAL_ZONE_COLOR,
              }}
            />
          ) : null}
        </div>

        {/* Position dot */}
        <span
          style={{
            position: "absolute",
            left: `${model.positionPct}%`,
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: toneColor,
            border: "2px solid var(--color-border-default)",
          }}
        />
      </div>

      {/* Low/high tick labels under the reference-zone boundaries */}
      <div
        aria-hidden="true"
        style={{
          position: "relative",
          height: 14,
          fontSize: 11,
          color: "var(--color-text-muted)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <span
          style={{
            position: "absolute",
            left: `${model.referenceStartPct}%`,
            transform: "translateX(-50%)",
          }}
        >
          {model.lowLabel}
        </span>
        <span
          style={{
            position: "absolute",
            left: `${model.referenceEndPct}%`,
            transform: "translateX(-50%)",
          }}
        >
          {model.highLabel}
        </span>
      </div>
    </div>
  );
}
