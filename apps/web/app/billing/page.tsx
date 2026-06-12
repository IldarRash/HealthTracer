import { AppLayout } from "../../src/components/app-layout";
import { BillingDashboard } from "../../src/components/billing/billing-dashboard";

export default function BillingPage() {
  return (
    <AppLayout variant="dashboard">
      <BillingDashboard />
    </AppLayout>
  );
}
