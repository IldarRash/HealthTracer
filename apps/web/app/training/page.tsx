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
        title="Workouts & Training"
        description="Schedule sessions, review your active plan, and track weekly workout progress in one place."
      />
      <PageContent>
        <TrainingWorkspace />
      </PageContent>
    </AppLayout>
  );
}
