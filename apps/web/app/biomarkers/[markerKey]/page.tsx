import { biomarkerKeySchema, getBiomarkerCatalogEntry } from "@health/types";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { AppLayout } from "../../../src/components/app-layout";
import { BiomarkerDetailWorkspace } from "../../../src/components/biomarkers/biomarker-detail-workspace";
import { EmptyState, PageContent, PageHeader } from "../../../src/components/ui";

type BiomarkerDetailPageProps = {
  params: Promise<{ markerKey: string }>;
};

export default async function BiomarkerDetailPage({ params }: BiomarkerDetailPageProps) {
  const { markerKey } = await params;
  const t = await getTranslations("Biomarkers");
  const parsedKey = biomarkerKeySchema.safeParse(markerKey);
  const catalogEntry = parsedKey.success
    ? getBiomarkerCatalogEntry(parsedKey.data)
    : undefined;

  if (!parsedKey.success || !catalogEntry) {
    return (
      <AppLayout>
        <PageContent>
          <EmptyState
            title={t("detail.unknownTitle")}
            description={t("detail.unknownDescription")}
            action={<Link href="/biomarkers">← {t("detail.back")}</Link>}
          />
        </PageContent>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageHeader title={catalogEntry.displayLabel} description={t("description")} />
      <PageContent>
        <BiomarkerDetailWorkspace markerKey={parsedKey.data} />
      </PageContent>
    </AppLayout>
  );
}
