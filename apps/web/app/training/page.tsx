import { auth } from "@clerk/nextjs/server";
import { AppLayout } from "../../src/components/app-layout";
import { PageContent, PageHeader } from "../../src/components/ui";
import { TrainingWorkspace } from "../../src/components/training/training-workspace";

export default async function TrainingPage() {
  const { isAuthenticated, redirectToSignIn } = await auth();

  if (!isAuthenticated) {
    return redirectToSignIn();
  }

  return (
    <AppLayout>
      <PageHeader
        title="Workouts"
        description="Review your active workout revision, scheduled sessions, and revision history."
      />
      <PageContent>
        <TrainingWorkspace />
      </PageContent>
    </AppLayout>
  );
}
