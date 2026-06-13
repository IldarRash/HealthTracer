import { getTranslations } from "next-intl/server";
import { AppLayout } from "../../src/components/app-layout";
import { PulseWorkspace } from "../../src/components/pulse/pulse-workspace";
import { PageContent, PageHeader } from "../../src/components/ui";

export default async function PulsePage() {
  const t = await getTranslations("Pulse");

  return (
    <AppLayout>
      <PageHeader title={t("title")} description={t("description")} />
      <PageContent>
        <PulseWorkspace />
      </PageContent>
    </AppLayout>
  );
}
