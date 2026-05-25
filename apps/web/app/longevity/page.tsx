import { auth } from "@clerk/nextjs/server";
import { AppLayout } from "../../src/components/app-layout";
import { LongevityDashboard } from "../../src/components/longevity/longevity-dashboard";
import { PageHeader } from "../../src/components/ui";

export default async function LongevityPage() {
  const { isAuthenticated, redirectToSignIn } = await auth();

  if (!isAuthenticated) {
    return redirectToSignIn();
  }

  return (
    <AppLayout variant="dashboard">
      <PageHeader
        title="Longevity"
        description="Your weekly wellness overview across Today, training, nutrition, goals, and logged signals."
      />
      <LongevityDashboard />
    </AppLayout>
  );
}
