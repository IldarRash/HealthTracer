import { getTranslations } from "next-intl/server";
import { AppLayout } from "../../src/components/app-layout";
import { SleepWorkspace } from "../../src/components/sleep/sleep-workspace";
import { PageContent, PageHeader } from "../../src/components/ui";

export default async function SleepPage() {
  const t = await getTranslations("Sleep");

  return (
    <AppLayout>
      <PageHeader title={t("title")} description={t("description")} />
      <PageContent>
        <SleepWorkspace />
      </PageContent>
    </AppLayout>
  );
}
