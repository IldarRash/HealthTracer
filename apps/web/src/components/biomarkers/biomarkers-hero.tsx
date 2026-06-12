"use client";

import { useTranslations } from "next-intl";
import type { BiomarkersHeroView } from "../../lib/biomarkers-ui-state";
import { Icon, OverviewHeroCard, Stat } from "../ui";

export type BiomarkersHeroProps = {
  hero: BiomarkersHeroView;
  onUploadClick: () => void;
};

/** Dashboard hero: tracked / outside-typical-range / last-report stats + upload CTA. */
export function BiomarkersHero({ hero, onUploadClick }: BiomarkersHeroProps) {
  const t = useTranslations("Biomarkers");

  return (
    <OverviewHeroCard fullWidth>
      <div
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 24,
          padding: 24,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: 36, flex: 1, flexWrap: "wrap" }}>
          <Stat value={hero.trackedCount} label={t("hero.tracked")} />
          <Stat
            value={hero.outsideRangeCount}
            label={t("hero.outsideRange")}
            subTone={hero.outsideRangeCount === 0 ? "good" : "muted"}
          />
          <Stat
            value={hero.lastReportLabel ?? t("hero.lastReportEmpty")}
            label={t("hero.lastReport")}
          />
        </div>

        <button
          type="button"
          onClick={onUploadClick}
          style={{
            padding: "9px 16px",
            borderRadius: 10,
            border: "none",
            background: "var(--color-metric-green)",
            color: "#04130c",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
          }}
        >
          <Icon name="drop" size={15} stroke="#04130c" />
          {t("hero.uploadCta")}
        </button>
      </div>
    </OverviewHeroCard>
  );
}
