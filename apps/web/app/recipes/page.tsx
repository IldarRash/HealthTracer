import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function RecipesPage() {
  const { isAuthenticated, redirectToSignIn } = await auth();

  if (!isAuthenticated) {
    return redirectToSignIn();
  }

  redirect("/nutrition");
}
