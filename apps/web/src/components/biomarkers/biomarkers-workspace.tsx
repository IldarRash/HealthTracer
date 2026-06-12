"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  apiQueryKeys,
  getBiomarkersDashboard,
  listLabReports,
} from "../../lib/api";
import {
  buildBiomarkersHeroView,
  countTrackedMarkers,
  groupDashboardAreas,
  hasProcessingLabReports,
} from "../../lib/biomarkers-ui-state";
import {
  Button,
  ErrorState,
  LoadingScreen,
  MedicalNote,
  PartialBanner,
} from "../ui";
import { BiomarkerCategorySection } from "./biomarker-category-section";
import { BiomarkersEmptyState } from "./biomarkers-empty-state";
import { BiomarkersHero } from "./biomarkers-hero";
import { LabReportsSection } from "./lab-reports-section";

/** While any report is processing, poll so extraction results appear promptly. */
const PROCESSING_REFETCH_INTERVAL_MS = 4_000;

export function BiomarkersWorkspace() {
  const t = useTranslations("Biomarkers");
  const tCommon = useTranslations("Common");
  const { getToken } = useAuth();
  const [uploadOpen, setUploadOpen] = useState(false);

  const dashboardQuery = useQuery({
    queryKey: apiQueryKeys.biomarkersDashboard,
    queryFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await getBiomarkersDashboard(token);
      if (result.error || !result.data) {
        throw new Error(result.error ?? t("errorTitle"));
      }

      return result.data;
    },
  });

  const reportsQuery = useQuery({
    queryKey: apiQueryKeys.labReports,
    queryFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await listLabReports(token);
      if (result.error) {
        throw new Error(result.error);
      }

      return result.data ?? [];
    },
    refetchInterval: (query) =>
      hasProcessingLabReports(query.state.data ?? [])
        ? PROCESSING_REFETCH_INTERVAL_MS
        : false,
  });

  if (dashboardQuery.isLoading || reportsQuery.isLoading) {
    return <LoadingScreen label={t("loading")} layout="longevity" />;
  }

  if (dashboardQuery.isError && reportsQuery.isError) {
    return (
      <ErrorState
        title={t("errorTitle")}
        description={
          dashboardQuery.error instanceof Error ? dashboardQuery.error.message : undefined
        }
        action={
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              void dashboardQuery.refetch();
              void reportsQuery.refetch();
            }}
          >
            {tCommon("retry")}
          </Button>
        }
      />
    );
  }

  const dashboard = dashboardQuery.data ?? null;
  const reports = reportsQuery.data ?? [];
  const isPartial = dashboardQuery.isError || reportsQuery.isError;

  const isEmpty =
    !isPartial &&
    dashboard !== null &&
    countTrackedMarkers(dashboard) === 0 &&
    reports.length === 0;

  if (isEmpty) {
    return (
      <div className="page-content">
        <BiomarkersEmptyState />
      </div>
    );
  }

  const areas = dashboard ? groupDashboardAreas(dashboard) : [];
  const hero = dashboard ? buildBiomarkersHeroView(dashboard, reports) : null;

  return (
    <div className="page-content" style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {isPartial ? (
        <div role="status">
          <PartialBanner
            onRetry={() => {
              void dashboardQuery.refetch();
              void reportsQuery.refetch();
            }}
          >
            {t("partialBanner")}
          </PartialBanner>
        </div>
      ) : null}

      {hero ? <BiomarkersHero hero={hero} onUploadClick={() => setUploadOpen(true)} /> : null}

      {areas.map((area) => (
        <BiomarkerCategorySection key={area.area} area={area} />
      ))}

      {!reportsQuery.isError ? (
        <LabReportsSection
          reports={reports}
          uploadOpen={uploadOpen}
          onUploadOpenChange={setUploadOpen}
        />
      ) : null}

      <MedicalNote>{t("wellnessNote")}</MedicalNote>
    </div>
  );
}
