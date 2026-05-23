import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function DocumentsPage() {
  const { isAuthenticated, redirectToSignIn } = await auth();

  if (!isAuthenticated) {
    return redirectToSignIn();
  }

  redirect("/profile#documents");
}
