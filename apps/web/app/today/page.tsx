import { auth } from "@clerk/nextjs/server";
import { redirectToAppSignIn } from "../../src/lib/auth-redirect";
import { AppLayout } from "../../src/components/app-layout";
import { PageContent, PageHeader } from "../../src/components/ui";
import { TodayWorkspace } from "../../src/components/today/today-workspace";

export default async function TodayPage() {
  const { isAuthenticated } = await auth();

  if (!isAuthenticated) {
    redirectToAppSignIn("/today");
  }

  return (
    <AppLayout>
      <PageHeader
        title="Today"
        description="Your daily command center — plan, check-ins, and optional coaching feedback."
      />
      <PageContent>
        <TodayWorkspace />
      </PageContent>
    </AppLayout>
  );
}
