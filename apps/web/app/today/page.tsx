import { auth } from "@clerk/nextjs/server";
import { redirectToAppSignIn } from "../../src/lib/auth-redirect";
import { AppLayout } from "../../src/components/app-layout";
import { AppShellMain } from "../../src/components/ui";
import { TodayWorkspace } from "../../src/components/today/today-workspace";

export default async function TodayPage() {
  const { isAuthenticated } = await auth();

  if (!isAuthenticated) {
    redirectToAppSignIn("/today");
  }

  return (
    <AppLayout>
      <AppShellMain>
        <div
          style={{
            padding: "0 34px",
            maxWidth: "80rem",
            margin: "0 auto",
            height: "100%",
            boxSizing: "border-box",
          }}
        >
          <TodayWorkspace />
        </div>
      </AppShellMain>
    </AppLayout>
  );
}
