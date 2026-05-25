import { auth } from "@clerk/nextjs/server";
import { redirectToAppSignIn } from "../../src/lib/auth-redirect";
import { redirect } from "next/navigation";

export default async function DocumentsPage() {
  const { isAuthenticated } = await auth();

  if (!isAuthenticated) {
    redirectToAppSignIn("/documents");
  }

  redirect("/profile#documents");
}
