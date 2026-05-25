import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { redirectToAppSignIn } from "../src/lib/auth-redirect";

export default async function HomePage() {
  const { isAuthenticated } = await auth();

  if (!isAuthenticated) {
    redirectToAppSignIn("/chat");
  }

  redirect("/chat");
}
