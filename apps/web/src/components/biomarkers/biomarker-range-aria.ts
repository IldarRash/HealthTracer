import type { BiomarkerRange } from "@health/types";
import { formatBiomarkerValue } from "../../lib/biomarkers-ui-state";

type RangeTranslator = (
  key: "range.reference" | "range.optimal",
  values: { low: string; high: string; unit: string },
) => string;

/**
 * Builds the single descriptive aria-label for the two-zone range bar, naming
 * the value, status, and (when present) both the reference and optimal bands.
 * Shared by the dashboard card and the detail header so the announcement stays
 * consistent. `t` is the next-intl Biomarkers translator.
 */
export function buildRangeBarAriaLabel(input: {
  t: RangeTranslator;
  label: string;
  valueLabel: string;
  unitLabel: string;
  statusLabel: string;
  reference: BiomarkerRange | null;
  optimal: BiomarkerRange | null;
}): string {
  const { t, label, valueLabel, unitLabel, statusLabel, reference, optimal } = input;

  const parts = [`${label}: ${valueLabel} ${unitLabel} — ${statusLabel}`];

  if (reference) {
    parts.push(
      t("range.reference", {
        low: formatBiomarkerValue(reference.low),
        high: formatBiomarkerValue(reference.high),
        unit: reference.unit,
      }),
    );
  }

  if (optimal) {
    parts.push(
      t("range.optimal", {
        low: formatBiomarkerValue(optimal.low),
        high: formatBiomarkerValue(optimal.high),
        unit: optimal.unit,
      }),
    );
  }

  return parts.join(", ");
}
