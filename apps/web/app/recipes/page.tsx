import { AppLayout } from "../../src/components/app-layout";
import { PageContent, PageHeader } from "../../src/components/ui";
import { RecipesWorkspace } from "../../src/components/recipes/recipes-workspace";

export default function RecipesPage() {
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
