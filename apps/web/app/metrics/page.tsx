import { auth } from "@clerk/nextjs/server";
import { redirectToAppSignIn } from "../../src/lib/auth-redirect";
import { redirect } from "next/navigation";

export default async function MetricsPage() {
  const { isAuthenticated } = await auth();

  if (!isAuthenticated) {
    redirectToAppSignIn("/metrics");
  }

  redirect("/profile#data-consent");
}
