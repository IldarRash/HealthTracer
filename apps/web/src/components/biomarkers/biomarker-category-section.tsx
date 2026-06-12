"use client";

import type { BiomarkersDashboardArea } from "@health/types";
import { useTranslations } from "next-intl";
import { DashboardGrid } from "../ui";
import { BiomarkerCard } from "./biomarker-card";

export type BiomarkerCategorySectionProps = {
  area: BiomarkersDashboardArea;
};

/** One catalog area: uppercase label + a grid of marker cards. */
export function BiomarkerCategorySection({ area }: BiomarkerCategorySectionProps) {
  const t = useTranslations("Biomarkers");
  const areaLabel = t(`areas.${area.area}`);

  return (
    <section aria-label={areaLabel}>
      <h2
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: "var(--color-text-muted)",
          margin: "0 0 10px",
        }}
      >
        {areaLabel}
      </h2>
      <DashboardGrid>
        {area.markers.map((marker) => (
          <div key={marker.key} className="dashboard-card--span-4">
            <BiomarkerCard marker={marker} />
          </div>
        ))}
      </DashboardGrid>
    </section>
  );
}
