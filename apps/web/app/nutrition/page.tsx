import { auth } from "@clerk/nextjs/server";
import { redirectToAppSignIn } from "../../src/lib/auth-redirect";
import { AppLayout } from "../../src/components/app-layout";
import { NutritionWorkspace } from "../../src/components/nutrition/nutrition-workspace";
import { PageContent, PageHeader } from "../../src/components/ui";

export default async function NutritionPage() {
  const { isAuthenticated } = await auth();

  if (!isAuthenticated) {
    redirectToAppSignIn("/nutrition");
  }

  return (
    <AppLayout>
      <PageHeader
        title="Nutrition"
        description="Read-only view of your active nutrition plan, meal structure, and today's logged follow-through."
      />
      <PageContent>
        <NutritionWorkspace />
      </PageContent>
    </AppLayout>
  );
}
