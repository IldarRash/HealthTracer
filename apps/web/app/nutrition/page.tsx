import { auth } from "@clerk/nextjs/server";
import { AppLayout } from "../../src/components/app-layout";
import { NutritionWorkspace } from "../../src/components/nutrition/nutrition-workspace";
import { PageContent, PageHeader } from "../../src/components/ui";

export default async function NutritionPage() {
  const { isAuthenticated, redirectToSignIn } = await auth();

  if (!isAuthenticated) {
    return redirectToSignIn();
  }

  return (
    <AppLayout>
      <PageHeader
        title="Nutrition"
        description="Review your active nutrition plan revision and meal structure guidance."
      />
      <PageContent>
        <NutritionWorkspace />
      </PageContent>
    </AppLayout>
  );
}
