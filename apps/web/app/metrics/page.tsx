import { auth } from "@clerk/nextjs/server";
import { AppLayout } from "../../src/components/app-layout";
import { MetricsWorkspace } from "../../src/components/metrics/metrics-workspace";
import { PageContent, PageHeader } from "../../src/components/ui";

export default async function MetricsPage() {
  const { isAuthenticated, redirectToSignIn } = await auth();

  if (!isAuthenticated) {
    return redirectToSignIn();
  }

  return (
    <AppLayout>
      <PageHeader
        title="Metrics"
        description="Inspect device connection status, normalized wellness metrics, and coach AI context boundaries."
      />
      <PageContent>
        <MetricsWorkspace />
      </PageContent>
    </AppLayout>
  );
}
