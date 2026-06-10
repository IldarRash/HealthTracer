import { AppLayout } from "../../src/components/app-layout";
import { LongevityDashboard } from "../../src/components/longevity/longevity-dashboard";
import { LongevityPageHeader } from "../../src/components/longevity/longevity-page-header";

export default function LongevityPage() {
  return (
    <AppLayout variant="dashboard">
      <LongevityPageHeader />
      <LongevityDashboard />
    </AppLayout>
  );
}
