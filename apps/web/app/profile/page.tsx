import { AppLayout } from "../../src/components/app-layout";
import { ProfileWorkspace } from "../../src/components/profile/profile-workspace";

export default function ProfilePage() {
  return (
    <AppLayout variant="dashboard">
      <ProfileWorkspace />
    </AppLayout>
  );
}
