import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function GoalsPage() {
  const { isAuthenticated, redirectToSignIn } = await auth();

  if (!isAuthenticated) {
    return redirectToSignIn();
  }

  redirect("/profile#goals");
}
