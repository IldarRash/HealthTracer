import { auth } from "@clerk/nextjs/server";
import { redirectToAppSignIn } from "../../src/lib/auth-redirect";
import { AppLayout } from "../../src/components/app-layout";
import { PageContent, PageHeader } from "../../src/components/ui";
import { RecipesWorkspace } from "../../src/components/recipes/recipes-workspace";

export default async function RecipesPage() {
  const { isAuthenticated } = await auth();

  if (!isAuthenticated) {
    redirectToAppSignIn("/recipes");
  }

  return (
    <AppLayout>
      <PageHeader
        title="Recipes"
        description="Browse the catalog and find meals that fit your active nutrition plan."
      />
      <PageContent>
        <RecipesWorkspace />
      </PageContent>
    </AppLayout>
  );
}
