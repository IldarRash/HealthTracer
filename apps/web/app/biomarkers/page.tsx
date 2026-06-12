import { getTranslations } from "next-intl/server";
import { AppLayout } from "../../src/components/app-layout";
import { BiomarkersWorkspace } from "../../src/components/biomarkers/biomarkers-workspace";
import { PageContent, PageHeader } from "../../src/components/ui";

export default async function BiomarkersPage() {
  const t = await getTranslations("Biomarkers");

  return (
    <AppLayout>
      <PageHeader title={t("title")} description={t("description")} />
      <PageContent>
        <BiomarkersWorkspace />
      </PageContent>
    </AppLayout>
  );
}
