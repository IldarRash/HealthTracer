import type { ReactElement } from "react";
import type { BiomarkerRangeBarModel } from "../../lib/biomarkers-ui-state";

const OUTSIDE_ZONE_COLOR = "rgba(255,255,255,0.08)";
const IN_RANGE_ZONE_COLOR =
  "color-mix(in srgb, var(--color-metric-green) 22%, transparent)";

export type BiomarkerRangeBarProps = {
  /** Geometry from computeRangeBarModel; null renders the no-reference variant. */
  model: BiomarkerRangeBarModel | null;
  /** Dot color from biomarkerStatusColor. */
  toneColor: string;
  /** Full text alternative, e.g. "Vitamin D 20 ng/mL — below typical range 30–100 ng/mL". */
  ariaLabel: string;
  /** Caption for the no-reference variant (pre-translated). */
  noReferenceLabel: string;
};

/**
 * Presentational reference-range bar: muted outside zones, dim-green in-range
 * zone, and a status-toned position dot. Announced as a single image with a
 * full text alternative.
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

  return (
    <div role="img" aria-label={ariaLabel}>
      <div style={{ position: "relative", padding: "4px 0" }} aria-hidden="true">
        {/* Track with zone segments */}
        <div
          style={{
            display: "flex",
            height: 6,
            borderRadius: 3,
            overflow: "hidden",
          }}
        >
          <div
            style={{ width: `${model.rangeStartPct}%`, background: OUTSIDE_ZONE_COLOR }}
          />
          <div
            style={{
              width: `${model.rangeEndPct - model.rangeStartPct}%`,
              background: IN_RANGE_ZONE_COLOR,
            }}
          />
          <div style={{ flex: 1, background: OUTSIDE_ZONE_COLOR }} />
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

      {/* Low/high tick labels under the zone boundaries */}
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
            left: `${model.rangeStartPct}%`,
            transform: "translateX(-50%)",
          }}
        >
          {model.lowLabel}
        </span>
        <span
          style={{
            position: "absolute",
            left: `${model.rangeEndPct}%`,
            transform: "translateX(-50%)",
          }}
        >
          {model.highLabel}
        </span>
      </div>
    </div>
  );
}
