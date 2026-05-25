import { auth } from "@clerk/nextjs/server";
import { redirectToAppSignIn } from "../../src/lib/auth-redirect";
import { AppLayout } from "../../src/components/app-layout";
import { OnboardingWorkspace } from "../../src/components/onboarding/onboarding-workspace";
import { PageHeader } from "../../src/components/ui";

export default async function OnboardingPage() {
  const { isAuthenticated } = await auth();

  if (!isAuthenticated) {
    redirectToAppSignIn("/onboarding");
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
