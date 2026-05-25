import { auth } from "@clerk/nextjs/server";
import { redirectToAppSignIn } from "../../src/lib/auth-redirect";
import { AppLayout } from "../../src/components/app-layout";
import { PageContent, PageHeader } from "../../src/components/ui";
import { TrainingWorkspace } from "../../src/components/training/training-workspace";

export default async function TrainingPage() {
  const { isAuthenticated } = await auth();

  if (!isAuthenticated) {
    redirectToAppSignIn("/training");
  }

  return (
    <AppLayout>
      <PageHeader
        title="Workouts"
        description="Read-only view of your active workout program, revision history, and weekly progress."
      />
      <PageContent>
        <TrainingWorkspace />
      </PageContent>
    </AppLayout>
  );
}
