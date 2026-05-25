import { auth } from "@clerk/nextjs/server";
import { AppLayout } from "../../src/components/app-layout";
import { OnboardingWorkspace } from "../../src/components/onboarding/onboarding-workspace";
import { PageHeader } from "../../src/components/ui";

export default async function OnboardingPage() {
  const { isAuthenticated, redirectToSignIn } = await auth();

  if (!isAuthenticated) {
    return redirectToSignIn();
  }

  return (
    <AppLayout variant="dashboard">
      <PageHeader
        title="Welcome"
        description="Set up your coaching context before you open Chat or Today."
      />
      <OnboardingWorkspace />
    </AppLayout>
  );
}
