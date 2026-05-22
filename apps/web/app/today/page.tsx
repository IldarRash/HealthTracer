import { auth } from "@clerk/nextjs/server";
import { AppLayout } from "../../src/components/app-layout";
import { PageContent, PageHeader } from "../../src/components/ui";
import { TodayWorkspace } from "../../src/components/today/today-workspace";

export default async function TodayPage() {
  const { isAuthenticated, redirectToSignIn } = await auth();

  if (!isAuthenticated) {
    return redirectToSignIn();
  }

  return (
    <AppLayout>
      <PageHeader
        title="Today"
        description="Run through your daily checklist, track adherence, and leave short coaching feedback."
      />
      <PageContent>
        <TodayWorkspace />
      </PageContent>
    </AppLayout>
  );
}
