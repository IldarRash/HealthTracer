import { auth } from "@clerk/nextjs/server";
import { AppLayout } from "../../src/components/app-layout";
import { RecipesWorkspace } from "../../src/components/recipes/recipes-workspace";
import { PageContent, PageHeader } from "../../src/components/ui";

export default async function RecipesPage() {
  const { isAuthenticated, redirectToSignIn } = await auth();

  if (!isAuthenticated) {
    return redirectToSignIn();
  }

  return (
    <AppLayout>
      <PageHeader
        title="Recipes"
        description="Browse meal ideas and save plan-fit recommendations without changing your nutrition targets."
      />
      <PageContent>
        <RecipesWorkspace />
      </PageContent>
    </AppLayout>
  );
}
