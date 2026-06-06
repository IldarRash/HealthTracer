import { auth } from "@clerk/nextjs/server";
import { redirectToAppSignIn } from "../../src/lib/auth-redirect";
import { AppLayout } from "../../src/components/app-layout";
import { ProfileWorkspace } from "../../src/components/profile/profile-workspace";

export default async function ProfilePage() {
  const { isAuthenticated } = await auth();

  if (!isAuthenticated) {
    redirectToAppSignIn("/profile");
  }

  return (
    <AppLayout variant="dashboard">
      <ProfileWorkspace />
    </AppLayout>
  );
}
