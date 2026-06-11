import { AppLayout } from "../../src/components/app-layout";
import { OnboardingWorkspace } from "../../src/components/onboarding/onboarding-workspace";

export default function OnboardingPage() {
  return (
    <AppLayout variant="dashboard">
      <OnboardingWorkspace />
    </AppLayout>
  );
}
