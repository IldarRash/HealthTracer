import { auth } from "@clerk/nextjs/server";
import { AppLayout } from "../../src/components/app-layout";
import { ProfileDashboard } from "../../src/components/profile/profile-dashboard";
import { PageHeader } from "../../src/components/ui";

export default async function ProfilePage() {
  const { isAuthenticated, redirectToSignIn } = await auth();

  if (!isAuthenticated) {
    return redirectToSignIn();
  }

  return (
    <AppLayout variant="dashboard">
      <PageHeader
        title="Profile"
        description="Your wellness coaching snapshot, habits, and structured plan progress."
      />
      <ProfileDashboard />
    </AppLayout>
  );
}
