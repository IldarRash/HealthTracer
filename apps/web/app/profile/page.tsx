import { auth } from "@clerk/nextjs/server";
import { redirectToAppSignIn } from "../../src/lib/auth-redirect";
import { AppLayout } from "../../src/components/app-layout";
import { ProfileDashboard } from "../../src/components/profile/profile-dashboard";
import { PageHeader } from "../../src/components/ui";

export default async function ProfilePage() {
  const { isAuthenticated } = await auth();

  if (!isAuthenticated) {
    redirectToAppSignIn("/profile");
  }

  return (
    <AppLayout variant="dashboard">
      <PageHeader
        title="Profile"
        description="Your account, coaching profile, goals, device data and consent, and health documents in one hub."
      />
      <ProfileDashboard />
    </AppLayout>
  );
}
