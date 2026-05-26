import { auth } from "@clerk/nextjs/server";
import { redirectToAppSignIn } from "../../src/lib/auth-redirect";
import { AppLayout } from "../../src/components/app-layout";
import { OnboardingWorkspace } from "../../src/components/onboarding/onboarding-workspace";

export default async function OnboardingPage() {
  const { isAuthenticated } = await auth();

  if (!isAuthenticated) {
    redirectToAppSignIn("/onboarding");
  }

  return (
    <AppLayout variant="dashboard">
      <OnboardingWorkspace />
    </AppLayout>
  );
}
