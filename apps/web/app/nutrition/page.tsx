import { AppLayout } from "../../src/components/app-layout";
import { NutritionWorkspace } from "../../src/components/nutrition/nutrition-workspace";
import { PageContent, PageHeader } from "../../src/components/ui";

export default function NutritionPage() {
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
