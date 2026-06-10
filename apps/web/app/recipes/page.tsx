import { auth } from "@clerk/nextjs/server";
import { redirectToAppSignIn } from "../../src/lib/auth-redirect";
import { RecipesWorkspace } from "../../src/components/recipes/recipes-workspace";

export default async function RecipesPage() {
  const { isAuthenticated } = await auth();

  if (!isAuthenticated) {
    redirectToAppSignIn("/recipes");
  }

  return <RecipesWorkspace />;
}
