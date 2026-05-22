import { auth } from "@clerk/nextjs/server";
import { AppLayout } from "../../src/components/app-layout";
import { GoalsWorkspace } from "../../src/components/goals/goals-workspace";
import { PageContent, PageHeader } from "../../src/components/ui";

export default async function GoalsPage() {
  const { isAuthenticated, redirectToSignIn } = await auth();

  if (!isAuthenticated) {
    return redirectToSignIn();
  }

  return (
    <AppLayout>
      <PageHeader
        title="Goals"
        description="Track active wellness goals and progress your coach helps you refine."
      />
      <PageContent>
        <GoalsWorkspace />
      </PageContent>
    </AppLayout>
  );
}
