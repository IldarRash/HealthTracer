import { auth } from "@clerk/nextjs/server";
import { AppLayout } from "../../src/components/app-layout";
import { ProgressWorkspace } from "../../src/components/progress/progress-workspace";
import { PageContent, PageHeader } from "../../src/components/ui";

export default async function ProgressPage() {
  const { isAuthenticated, redirectToSignIn } = await auth();

  if (!isAuthenticated) {
    return redirectToSignIn();
  }

  return (
    <AppLayout variant="dashboard">
      <PageHeader
        title="Progress"
        description="Review your weekly workout summary, simple trends, and what is still deferred in this coaching pass."
      />
      <PageContent>
        <ProgressWorkspace />
      </PageContent>
    </AppLayout>
  );
}
