import { auth } from "@clerk/nextjs/server";
import { redirectToAppSignIn } from "../../../src/lib/auth-redirect";
import { AppLayout } from "../../../src/components/app-layout";
import { GroceryListScreen } from "../../../src/components/nutrition/grocery-list-screen";
import { PageContent, PageHeader } from "../../../src/components/ui";

export default async function GroceryListPage() {
  const { isAuthenticated } = await auth();

  if (!isAuthenticated) {
    redirectToAppSignIn("/nutrition/grocery-list");
  }

  return (
    <AppLayout>
      <PageHeader
        title="Закупка на неделю"
        description="Список сформирован из недельного рациона. Отмечайте купленное — это не меняет план."
      />
      <PageContent>
        <GroceryListScreen />
      </PageContent>
    </AppLayout>
  );
}
