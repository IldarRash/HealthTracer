"use client";

import { useTranslations } from "next-intl";
import { Icon, MedicalNote } from "../ui";
import { LabReportUploadPanel } from "./lab-report-upload-panel";

/** Onboarding card for first use: dashed invite + wellness note + open upload form. */
export function BiomarkersEmptyState() {
  const t = useTranslations("Biomarkers");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <section
        aria-label={t("empty.title")}
        style={{
          border: "1px dashed var(--color-border-strong)",
          borderRadius: 16,
          padding: 24,
          display: "flex",
          alignItems: "center",
          gap: 20,
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            flexShrink: 0,
            border: "2px dashed var(--color-border-strong)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="drop" size={24} stroke="var(--color-metric-green)" sw={1.6} />
        </div>
        <div>
          <p
            style={{
              fontSize: 17,
              fontWeight: 700,
              color: "var(--color-text-primary)",
              letterSpacing: -0.3,
              margin: 0,
            }}
          >
            {t("empty.title")}
          </p>
          <p
            style={{
              fontSize: 13.5,
              color: "var(--color-text-muted)",
              marginTop: 7,
              lineHeight: 1.5,
              maxWidth: 520,
            }}
          >
            {t("empty.description")}
          </p>
          <MedicalNote>{t("wellnessNote")}</MedicalNote>
        </div>
      </section>

      <LabReportUploadPanel open onOpenChange={() => undefined} collapsible={false} />
    </div>
  );
}
