import { auth } from "@clerk/nextjs/server";
import { redirectToAppSignIn } from "../../src/lib/auth-redirect";
import { AppLayout } from "../../src/components/app-layout";
import { LongevityDashboard } from "../../src/components/longevity/longevity-dashboard";
import { LongevityPageHeader } from "../../src/components/longevity/longevity-page-header";

export default async function LongevityPage() {
  const { isAuthenticated } = await auth();

  if (!isAuthenticated) {
    redirectToAppSignIn("/longevity");
  }

  return (
    <AppLayout variant="dashboard">
      <LongevityPageHeader />
      <LongevityDashboard />
    </AppLayout>
  );
}
