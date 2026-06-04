import { auth } from "@clerk/nextjs/server";
import { redirectToAppSignIn } from "../../src/lib/auth-redirect";
import { AppLayout } from "../../src/components/app-layout";
import { BillingDashboard } from "../../src/components/billing/billing-dashboard";
import { PageHeader } from "../../src/components/ui";

export default async function BillingPage() {
  const { isAuthenticated } = await auth();

  if (!isAuthenticated) {
    redirectToAppSignIn("/billing");
  }

  return (
    <AppLayout variant="dashboard">
      <PageHeader
        title="Billing"
        description="Manage your subscription and view your AI usage."
      />
      <BillingDashboard />
    </AppLayout>
  );
}
